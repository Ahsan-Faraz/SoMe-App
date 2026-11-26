#!/usr/bin/env bash
# The must-use plugins (hardening, mail via Brevo) and the mail settings for the WordPress sites named
# on the command line; touches nothing else (no nginx, no other site). Run as root from the folder
# holding some-hardening.php and some-mail.php:
#   sudo bash wordpress-plugins.sh theirl.net aiproduktion.se
# Run it again after a new Brevo key: it rewrites each site's secrets.php from the app's settings.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run as root (sudo)" >&2; exit 1; }
[[ $# -gt 0 ]] || { echo "usage: wordpress-plugins.sh <domain> [<domain> ...]" >&2; exit 2; }
here=$(dirname "$(readlink -f "$0")")
for d in "$@"; do
  [[ $d =~ ^[a-z0-9-]+(\.[a-z0-9-]+)+$ ]] || { echo "not a domain: $d" >&2; exit 2; }
  [[ -f /srv/wp/$d/public/wp-config.php ]] || { echo "no WordPress for $d (run wordpress-setup.sh first)" >&2; exit 1; }
done
# A must-use plugin with a syntax error would take the site down: check them before anything else.
for p in some-hardening.php some-mail.php; do
  [[ -f $here/$p ]] || { echo "missing $here/$p" >&2; exit 1; }
  php -l "$here/$p" >/dev/null || { echo "$p does not parse" >&2; exit 1; }
done
w() { local d=$1; shift; local s=${d//./-}; sudo -u "wp-$s" -- env HOME="/srv/wp/$d/tmp" WP_CLI_CACHE_DIR="/srv/wp/$d/tmp/wp-cli" wp --path="/srv/wp/$d/public" "$@"; }

key=$(sed -n 's/^BREVO_API_KEY=//p' /srv/some/shared/.env.production | tail -1 | tr -d "\"'[:space:]")
[[ $key =~ ^[A-Za-z0-9_-]{20,}$ ]] || { echo "no usable BREVO_API_KEY in the app's settings: WordPress mail stays off"; key=; }
require="if ( is_readable( dirname( __DIR__ ) . '/secrets.php' ) ) { require dirname( __DIR__ ) . '/secrets.php'; }"

for d in "$@"; do
  s=${d//./-}
  root=/srv/wp/$d
  install -d -o "wp-$s" -g www-data -m 2750 "$root/public/wp-content/mu-plugins"
  install -o "wp-$s" -g "wp-$s" -m 640 "$here/some-hardening.php" "$here/some-mail.php" "$root/public/wp-content/mu-plugins/"
  if [[ -n $key ]]; then
    # Outside the web folder; readable by root and the site's PHP only. printf is a shell builtin,
    # so the key never shows on a command line.
    printf "<?php\n// Written by deploy/vps/wordpress-plugins.sh from the app's settings. Not in git.\ndefine( 'SOME_BREVO_API_KEY', '%s' );\ndefine( 'SOME_MAIL_FROM', 'noreply@%s' );\n" "$key" "$d" > "$root/secrets.php.new"
    chown root:"wp-$s" "$root/secrets.php.new"
    chmod 640 "$root/secrets.php.new"
    mv "$root/secrets.php.new" "$root/secrets.php"
  fi
  cfg=$root/public/wp-config.php
  if ! grep -qF "secrets.php" "$cfg"; then
    awk -v line="$require" 'NR==1 { print; print line; next } 1' "$cfg" > "$cfg.new"
    chown "wp-$s:wp-$s" "$cfg.new"
    chmod 640 "$cfg.new"
    mv "$cfg.new" "$cfg"
  fi
  echo "$d: mail $(w "$d" eval 'echo ( defined( "SOME_BREVO_API_KEY" ) && SOME_BREVO_API_KEY ) ? "on, from " . SOME_MAIL_FROM : "off";'); must-use plugins: $(w "$d" plugin list --status=must-use --field=name | paste -sd, -)"
done
