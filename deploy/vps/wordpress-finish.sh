#!/usr/bin/env bash
# Everything for the main-domain WordPress sites short of handing them the public pages (/, /about,
# ...): those stay with the app until that switch is made on purpose. Run as root from the folder
# holding the deploy files (all flat, as copied by scp):
#   sudo bash wordpress-finish.sh
# Safe to run again (for instance after a new Brevo key): finished steps are skipped or redone.
#
#   1. aiproduktion.se: its own WordPress, a copy of theirl.net with the icon-only logo.
#   2. Both sites: the must-use plugins (hardening, mail via Brevo) and the mail settings.
#   3. nginx: aiproduktion.se's WordPress paths too (with a way back if the test fails).
#   4. Nightly backups of both sites.
#   5. Checks.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run as root (sudo)" >&2; exit 1; }
here=$(dirname "$(readlink -f "$0")")
sites=(theirl.net aiproduktion.se)
for f in wordpress-setup.sh wordpress-clone.sh wordpress-backup.sh wordpress-plugins.sh fix-branding.sh nginx-some.conf \
  nginx-some-app.conf nginx-wp-common.conf nginx-wp-theirl-net.conf nginx-wp-aiproduktion-se.conf \
  some-hardening.php some-mail.php; do
  [[ -f $here/$f ]] || { echo "missing $here/$f" >&2; exit 1; }
done
w() { local d=$1; shift; local s=${d//./-}; sudo -u "wp-$s" -- env HOME="/srv/wp/$d/tmp" WP_CLI_CACHE_DIR="/srv/wp/$d/tmp/wp-cli" wp --path="/srv/wp/$d/public" "$@"; }

# --- 1. aiproduktion.se ------------------------------------------------------------------------------
echo "== 1. aiproduktion.se"
[[ -f /srv/wp/aiproduktion.se/public/wp-config.php ]] || bash "$here/wordpress-setup.sh" aiproduktion.se
bash "$here/wordpress-clone.sh" theirl.net aiproduktion.se --icon-only

# --- 2. Must-use plugins and mail settings ----------------------------------------------------------------
echo; echo "== 2. Plugins and mail"
bash "$here/wordpress-plugins.sh" "${sites[@]}"
echo "(wordpress-check.sh tests the mail itself, in Brevo's sandbox mode)"

# --- 3. nginx -----------------------------------------------------------------------------------------------
echo; echo "== 3. nginx"
stamp=$(date +%Y%m%d%H%M%S)
cp -a /etc/nginx/sites-available/some "/etc/nginx/sites-available/some.bak-$stamp"
for s in some-app wp-common wp-theirl-net wp-aiproduktion-se; do
  [[ -f /etc/nginx/snippets/$s.conf ]] && cp -a "/etc/nginx/snippets/$s.conf" "/etc/nginx/snippets/$s.conf.bak-$stamp"
done
install -m 644 "$here/nginx-some-app.conf" /etc/nginx/snippets/some-app.conf
install -m 644 "$here/nginx-wp-common.conf" /etc/nginx/snippets/wp-common.conf
install -m 644 "$here/nginx-wp-theirl-net.conf" /etc/nginx/snippets/wp-theirl-net.conf
install -m 644 "$here/nginx-wp-aiproduktion-se.conf" /etc/nginx/snippets/wp-aiproduktion-se.conf
install -m 644 "$here/nginx-some.conf" /etc/nginx/sites-available/some
if nginx -t; then
  systemctl reload nginx
  echo "nginx reloaded (old config: some.bak-$stamp)"
else
  cp -a "/etc/nginx/sites-available/some.bak-$stamp" /etc/nginx/sites-available/some
  for s in some-app wp-common wp-theirl-net; do
    [[ -f /etc/nginx/snippets/$s.conf.bak-$stamp ]] && cp -a "/etc/nginx/snippets/$s.conf.bak-$stamp" "/etc/nginx/snippets/$s.conf"
  done
  echo "nginx test failed: the old config is back, nothing was reloaded" >&2
  exit 1
fi

# --- 4. Nightly backups -------------------------------------------------------------------------------------
echo; echo "== 4. Backups"
install -m 755 "$here/wordpress-backup.sh" /usr/local/sbin/wordpress-backup
cat > /etc/systemd/system/wordpress-backup.service <<'EOF'
[Unit]
Description=Nightly backup of the WordPress sites (/usr/local/sbin/wordpress-backup)
After=mariadb.service
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/wordpress-backup
Nice=15
IOSchedulingClass=idle
CPUWeight=20
EOF
cat > /etc/systemd/system/wordpress-backup.timer <<'EOF'
[Unit]
Description=Nightly backup of the WordPress sites
[Timer]
OnCalendar=*-*-* 03:30
RandomizedDelaySec=20m
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now wordpress-backup.timer
systemctl start wordpress-backup.service
journalctl -u wordpress-backup.service -n 4 --no-pager -o cat

# --- 5. Checks ------------------------------------------------------------------------------------------------
echo; echo "== 5. Checks (expected in brackets)"
check() { # check <host> <path> <expected>
  printf '%-48s %-8s %s\n' "$1$2" "[$3]" "$(curl -s -o /dev/null -w '%{http_code}' --resolve "$1:443:127.0.0.1" "https://$1$2")"
}
for d in "${sites[@]}"; do
  check "$d" /                     '200/307'
  check "$d" /wp-login.php         '200'
  check "$d" /wp-json/wp/v2/users  '404'
  check "$d" /xmlrpc.php           '403'
  check "$d" /login                '200*'
done
echo "* /login is the app's: 404 until the step 20 release (start page, main-domain login) is deployed."
echo; free -h | head -2
