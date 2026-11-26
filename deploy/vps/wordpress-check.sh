#!/usr/bin/env bash
# Health check of the main-domain WordPress sites; changes nothing except, with --update, the two
# must-use plugins (copied from this folder after a PHP syntax check). Run as root:
#   sudo bash wordpress-check.sh [--update]
# Mail is tested in Brevo's sandbox mode: Brevo checks the key, sender and message, then drops the
# email instead of sending it.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run as root (sudo)" >&2; exit 1; }
here=$(dirname "$(readlink -f "$0")")
w() { local d=$1; shift; local s=${d//./-}; sudo -u "wp-$s" -- env HOME="/srv/wp/$d/tmp" WP_CLI_CACHE_DIR="/srv/wp/$d/tmp/wp-cli" wp --path="/srv/wp/$d/public" "$@"; }

for site in /srv/wp/*/; do
  d=$(basename "$site")
  s=${d//./-}
  [[ -f $site/public/wp-config.php ]] || continue
  if [[ ${1:-} == --update ]]; then
    for p in some-hardening.php some-mail.php; do
      php -l "$here/$p" >/dev/null || { echo "$p does not parse" >&2; exit 1; }
      install -o "wp-$s" -g "wp-$s" -m 640 "$here/$p" "$site/public/wp-content/mu-plugins/"
    done
  fi
  echo "== $d"
  echo "WordPress $(w "$d" core version), site $(w "$d" option get siteurl), search engines $( [[ $(w "$d" option get blog_public) == 1 ]] && echo allowed || echo kept out)"
  echo "mail (Brevo sandbox, nothing is sent): $(w "$d" eval 'var_export( wp_mail( "sandbox-check@'"$d"'", "Sandbox check", "Checked, not sent.", array( "X-Sib-Sandbox: drop" ) ) );')"
  echo "scheduled jobs timer: $(systemctl is-active "wp-cron-$s.timer"), last backup: $(ls -1t /srv/wp-backups/$d/db-*.sql.gz 2>/dev/null | head -1 || echo none)"
done
echo; echo "backup timer: $(systemctl is-active wordpress-backup.timer), next: $(systemctl list-timers wordpress-backup.timer --no-legend | awk '{print $1, $2, $3}')"
du -sh /srv/wp-backups/* 2>/dev/null
