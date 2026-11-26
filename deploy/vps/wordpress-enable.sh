#!/usr/bin/env bash
# Second step after wordpress-setup.sh: installs WordPress from the command line, adds the import
# plugin, then turns on the nginx routes for WordPress's own paths (/wp-admin, /wp-login.php, ...).
# The public pages stay with the app. Run as root from the folder holding the nginx files:
#   sudo bash wordpress-enable.sh theirl.net
# If the new nginx config fails its test, the old one is put back and nginx is not reloaded.
set -euo pipefail

domain=${1:-}
[[ $domain =~ ^[a-z0-9-]+(\.[a-z0-9-]+)+$ ]] || { echo "usage: wordpress-enable.sh <domain>" >&2; exit 2; }
[[ $EUID -eq 0 ]] || { echo "run as root (sudo)" >&2; exit 1; }
here=$(dirname "$(readlink -f "$0")")
slug=${domain//./-}
user=wp-$slug
root=/srv/wp/$domain
web=$root/public
[[ -f $web/wp-config.php ]] || { echo "run wordpress-setup.sh $domain first" >&2; exit 1; }
for f in nginx-some.conf nginx-some-app.conf nginx-wp-common.conf "nginx-wp-$slug.conf"; do
  [[ -f $here/$f ]] || { echo "missing $here/$f" >&2; exit 1; }
done
[[ -f /etc/nginx/snippets/fastcgi-php.conf ]] || { echo "missing /etc/nginx/snippets/fastcgi-php.conf" >&2; exit 1; }

wpc() { sudo -u "$user" -- env HOME="$root/tmp" WP_CLI_CACHE_DIR="$root/tmp/wp-cli" wp --path="$web" "$@"; }

# --- Install (before nginx exposes anything, so nobody else can reach an install screen) --------
if ! wpc core is-installed 2>/dev/null; then
  echo "Temporary WordPress login: user 'setup', password below. The import replaces it with the"
  echo "imported site's users. Keep it to yourself; don't paste it anywhere."
  # WP-CLI makes up the password and prints it once (never on a command line, where ps would show it).
  wpc core install --url="https://$domain" --title="$domain" --admin_user=setup \
    --admin_email="wordpress@$domain" --skip-email
  echo
fi
wpc plugin is-installed all-in-one-wp-migration || wpc plugin install all-in-one-wp-migration
wpc plugin activate all-in-one-wp-migration
systemctl enable --now "wp-cron-$slug.timer"

# --- nginx, with a way back ---------------------------------------------------------------------
stamp=$(date +%Y%m%d%H%M%S)
backup=/etc/nginx/sites-available/some.bak-$stamp
cp -a /etc/nginx/sites-available/some "$backup"
for s in some-app wp-common "wp-$slug"; do
  [[ -f /etc/nginx/snippets/$s.conf ]] && cp -a "/etc/nginx/snippets/$s.conf" "/etc/nginx/snippets/$s.conf.bak-$stamp"
done
install -m 644 "$here/nginx-some-app.conf" /etc/nginx/snippets/some-app.conf
install -m 644 "$here/nginx-wp-common.conf" /etc/nginx/snippets/wp-common.conf
install -m 644 "$here/nginx-wp-$slug.conf" "/etc/nginx/snippets/wp-$slug.conf"
install -m 644 "$here/nginx-some.conf" /etc/nginx/sites-available/some
if nginx -t; then
  systemctl reload nginx
  echo "nginx reloaded; the old config is kept as $backup"
else
  cp -a "$backup" /etc/nginx/sites-available/some
  echo "nginx test failed: the old config is back, nothing was reloaded" >&2
  exit 1
fi

# --- Checks ---------------------------------------------------------------------------------------
echo
echo "Expected codes in brackets:"
check() {
  printf '%-34s %-6s %s\n' "$1" "[$2]" \
    "$(curl -s -o /dev/null -w '%{http_code}' --resolve "$domain:443:127.0.0.1" "https://$domain$1")"
}
check /                                   '307'  # the app, to the default community
check /wp-login.php                       '200'
check /wp-admin                           '301'
check /wp-admin/install.php               '403'
check /xmlrpc.php                         '403'
check /wp-content/debug.log               '403'
check /wp-content/plugins/a.php           '403'
check /wp-includes/version.php            '403'
check /wp-content/ai1wm-backups/a.wpress  '403'
# The app on the other names, as before (200 or 307, depending on the domain's own start page).
for host in aiproduktion.se www.theirl.net; do
  printf '%-34s %-6s %s\n' "$host/" '[2/307]' \
    "$(curl -s -o /dev/null -w '%{http_code}' --resolve "$host:443:127.0.0.1" "https://$host/")"
done
echo
echo "Ports open to the internet (expect only 22, 80, 443):"
ss -ltnH | awk '{print $4}' | grep -vE '^(127\.|\[::1\]|::1)' | sort -u
echo
echo "Certificate renewal still works with the new config (a test run, nothing changes):"
certbot renew --dry-run --cert-name theirl.net 2>&1 | tail -3
