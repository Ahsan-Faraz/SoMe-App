#!/usr/bin/env bash
# Sets up WordPress for one main domain on the prod VPS, next to the app (client guide 261123).
# Run as root, once per domain:  sudo bash wordpress-setup.sh theirl.net
#
# It does not touch nginx: nothing public changes until the nginx routes for WordPress are added.
# Safe to run again: steps that are done are skipped, config files are rewritten.
#
#   - 2 GB swap (the VPS had none), so a memory spike slows things down instead of killing a process.
#   - PHP-FPM and MariaDB, capped in memory and CPU so they can never starve the app.
#   - Per domain: its own Linux user, PHP pool, database and database user, WordPress core,
#     and a systemd timer for WordPress's scheduled jobs (instead of running them on page views).
set -euo pipefail

domain=${1:-}
[[ $domain =~ ^[a-z0-9-]+(\.[a-z0-9-]+)+$ ]] || { echo "usage: wordpress-setup.sh <domain>" >&2; exit 2; }
[[ $EUID -eq 0 ]] || { echo "run as root (sudo)" >&2; exit 1; }

slug=${domain//./-}          # theirl-net
user=wp-$slug                # Linux user that owns the files and runs PHP
db=wp_${slug//-/_}           # database and database user
root=/srv/wp/$domain
web=$root/public

# --- Swap -------------------------------------------------------------------------------------
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
echo 'vm.swappiness=10' > /etc/sysctl.d/90-swap.conf
sysctl -q -p /etc/sysctl.d/90-swap.conf

# --- Packages ---------------------------------------------------------------------------------
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q mariadb-server php-fpm php-mysql php-curl php-gd php-imagick php-intl \
  php-mbstring php-xml php-zip php-bcmath unzip
php=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')
fpm=php$php-fpm

# --- MariaDB: local only, small memory --------------------------------------------------------
cat > /etc/mysql/mariadb.conf.d/90-some.cnf <<'EOF'
# WordPress next to the app: a few small sites, so a small server.
[mysqld]
bind-address            = 127.0.0.1
skip-name-resolve
max_connections         = 40
innodb_buffer_pool_size = 256M
innodb_log_file_size    = 64M
performance_schema      = OFF
EOF

# --- Caps: the app (some.service) always comes first ------------------------------------------
mkdir -p /etc/systemd/system/mariadb.service.d "/etc/systemd/system/$fpm.service.d"
cat > /etc/systemd/system/mariadb.service.d/limits.conf <<'EOF'
[Service]
MemoryHigh=700M
MemoryMax=1G
CPUWeight=50
EOF
cat > "/etc/systemd/system/$fpm.service.d/limits.conf" <<'EOF'
[Service]
MemoryHigh=1G
MemoryMax=1500M
CPUWeight=50
EOF
systemctl daemon-reload
systemctl restart mariadb
systemctl enable --now "$fpm"

# --- PHP: shared settings ---------------------------------------------------------------------
cat > "/etc/php/$php/fpm/conf.d/90-some.ini" <<'EOF'
expose_php = Off
opcache.enable = 1
opcache.memory_consumption = 128
opcache.max_accelerated_files = 20000
opcache.validate_timestamps = 1
opcache.revalidate_freq = 60
EOF
# The default pool is not used.
[[ -f /etc/php/$php/fpm/pool.d/www.conf ]] && mv "/etc/php/$php/fpm/pool.d/www.conf" "/etc/php/$php/fpm/pool.d/www.conf.off"

# --- WP-CLI (checked against its published SHA-512) -------------------------------------------
if [[ ! -x /usr/local/bin/wp ]]; then
  tmp=$(mktemp -d)
  base=https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar
  curl -fsSL -o "$tmp/wp-cli.phar" "$base/wp-cli.phar"
  echo "$(curl -fsSL "$base/wp-cli.phar.sha512")  $tmp/wp-cli.phar" | sha512sum -c -
  install -m 755 "$tmp/wp-cli.phar" /usr/local/bin/wp
  rm -rf "$tmp"
fi

# --- The site's user and folders --------------------------------------------------------------
id "$user" >/dev/null 2>&1 || useradd --system --home-dir "$root" --shell /usr/sbin/nologin "$user"
# nginx (www-data) reads the files; only the site user writes them.
install -d -o "$user" -g www-data -m 2750 "$root" "$web"
install -d -o "$user" -g "$user" -m 700 "$root/tmp" "$root/sessions"
install -d -o "$user" -g adm -m 750 "$root/logs"

# --- PHP pool for this site -------------------------------------------------------------------
cat > "/etc/php/$php/fpm/pool.d/$slug.conf" <<EOF
; WordPress for $domain. Starts workers only when there are requests; page caching in nginx means
; most visits never reach PHP.
[$slug]
user = $user
group = $user
listen = /run/php/$slug.sock
listen.owner = www-data
listen.group = www-data
listen.mode = 0660

pm = ondemand
pm.max_children = 6
pm.process_idle_timeout = 30s
pm.max_requests = 500
request_terminate_timeout = 300s

php_admin_value[memory_limit] = 256M
php_admin_value[max_execution_time] = 300
php_admin_value[upload_max_filesize] = 64M
php_admin_value[post_max_size] = 64M
php_admin_value[open_basedir] = $root/:/usr/share/php/:/dev/urandom
php_admin_value[upload_tmp_dir] = $root/tmp
php_admin_value[sys_temp_dir] = $root/tmp
php_admin_value[session.save_path] = $root/sessions
php_admin_value[error_log] = $root/logs/php-error.log
php_admin_flag[log_errors] = on
php_admin_flag[display_errors] = off
php_admin_value[disable_functions] = exec,passthru,shell_exec,system,proc_open,popen,pcntl_exec
EOF
systemctl reload "$fpm"

# --- Database ---------------------------------------------------------------------------------
if [[ ! -f $web/wp-config.php ]]; then
  dbpass=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-32)
  mariadb <<EOF
CREATE DATABASE IF NOT EXISTS \`$db\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$db'@'localhost' IDENTIFIED BY '$dbpass';
ALTER USER '$db'@'localhost' IDENTIFIED BY '$dbpass';
GRANT ALL PRIVILEGES ON \`$db\`.* TO '$db'@'localhost';
FLUSH PRIVILEGES;
EOF

  # --- WordPress core and wp-config.php -------------------------------------------------------
  wpc() { sudo -u "$user" -- env HOME="$root/tmp" WP_CLI_CACHE_DIR="$root/tmp/wp-cli" wp --path="$web" "$@"; }
  [[ -f $web/wp-load.php ]] || wpc core download --skip-content --locale=en_US
  wpc config create --dbname="$db" --dbuser="$db" --dbpass="$dbpass" --dbhost=localhost \
    --dbcharset=utf8mb4 --skip-check --extra-php <<'PHP'
// Set by deploy/vps/wordpress-setup.sh
define( 'DISALLOW_FILE_EDIT', true );   // no code editor in wp-admin
define( 'FORCE_SSL_ADMIN', true );
define( 'DISABLE_WP_CRON', true );      // a systemd timer runs the jobs instead of page views
define( 'WP_AUTO_UPDATE_CORE', 'minor' );
define( 'FS_METHOD', 'direct' );
define( 'WP_POST_REVISIONS', 10 );
define( 'WP_MEMORY_LIMIT', '128M' );
PHP
  chmod 640 "$web/wp-config.php"
  chgrp "$user" "$web/wp-config.php" # nginx never reads it
  install -d -o "$user" -g www-data -m 2750 "$web/wp-content" "$web/wp-content/uploads" \
    "$web/wp-content/plugins" "$web/wp-content/themes"
fi

# --- PHP error log: rotated weekly, 8 kept ------------------------------------------------------
cat > "/etc/logrotate.d/wp-$slug" <<EOF
$root/logs/*.log {
    weekly
    rotate 8
    compress
    delaycompress
    missingok
    notifempty
    su $user adm
    create 0640 $user adm
}
EOF

# --- Scheduled jobs: every 5 minutes, low priority, boxed in --------------------------------------
# WP-CLI runs PHP's command-line version, which has none of the pool's limits, so they are set here.
cat > "/etc/systemd/system/wp-cron-$slug.service" <<EOF
[Unit]
Description=WordPress scheduled jobs for $domain
After=mariadb.service
[Service]
Type=oneshot
User=$user
Group=$user
Environment=HOME=$root/tmp WP_CLI_CACHE_DIR=$root/tmp/wp-cli
Environment="WP_CLI_PHP_ARGS=-d memory_limit=256M"
ExecStart=/usr/local/bin/wp --path=$web cron event run --due-now --quiet
TimeoutStartSec=10min
Nice=10
CPUWeight=20
MemoryMax=512M
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$root
EOF
cat > "/etc/systemd/system/wp-cron-$slug.timer" <<EOF
[Unit]
Description=WordPress scheduled jobs for $domain
[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
# wordpress-enable.sh turns the timer on, once WordPress is installed.

echo
echo "Done: PHP $php, $(mariadb --version | awk '{print $1, $2, $3}')"
echo "Site files: $web   PHP pool: /run/php/$slug.sock   Database: $db"
free -h | head -2
