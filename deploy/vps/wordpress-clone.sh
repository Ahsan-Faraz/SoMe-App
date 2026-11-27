#!/usr/bin/env bash
# Copies one main-domain WordPress to another (client guide 261123: one install per domain, same
# theme and pages). The target keeps its own database, database login, keys and PHP pool from
# wordpress-setup.sh; it gets the source's content, settings, users, theme and plugins, with the
# domain name replaced everywhere. Run as root after `wordpress-setup.sh <to>`:
#   sudo bash wordpress-clone.sh theirl.net aiproduktion.se [--icon-only] [--force]
# --icon-only: the logo is the icon without the site name (aiproduktion.se, per the guide).
# --force: copy again over an installed target (its database is backed up first).
set -euo pipefail

from=${1:-} to=${2:-}
re='^[a-z0-9-]+(\.[a-z0-9-]+)+$'
[[ $from =~ $re && $to =~ $re && $from != "$to" ]] || { echo "usage: wordpress-clone.sh <from> <to> [--icon-only] [--force]" >&2; exit 2; }
[[ $EUID -eq 0 ]] || { echo "run as root (sudo)" >&2; exit 1; }
shift 2
icon=; force=
for a in "$@"; do case $a in --icon-only) icon=--icon-only ;; --force) force=1 ;; *) echo "unknown option $a" >&2; exit 2 ;; esac; done
here=$(dirname "$(readlink -f "$0")")
fslug=${from//./-} tslug=${to//./-}
froot=/srv/wp/$from troot=/srv/wp/$to
[[ -f $froot/public/wp-config.php ]] || { echo "$from has no WordPress" >&2; exit 1; }
[[ -f $troot/public/wp-config.php ]] || { echo "run wordpress-setup.sh $to first" >&2; exit 1; }
[[ -f $here/fix-branding.sh ]] || { echo "missing $here/fix-branding.sh" >&2; exit 1; }
wf() { sudo -u "wp-$fslug" -- env HOME="$froot/tmp" WP_CLI_CACHE_DIR="$froot/tmp/wp-cli" wp --path="$froot/public" "$@"; }
wt() { sudo -u "wp-$tslug" -- env HOME="$troot/tmp" WP_CLI_CACHE_DIR="$troot/tmp/wp-cli" wp --path="$troot/public" "$@"; }

if wt core is-installed 2>/dev/null; then
  [[ -n $force ]] || { echo "$to is already installed; nothing copied (--force copies again)"; exit 0; }
  backup=$troot/backup-before-clone-$(date +%Y%m%d%H%M%S).sql
  wt db export "$backup" --quiet
  chmod 600 "$backup"
  echo "Database backup of $to: $backup"
fi

# --- Database: the source's tables, then the domain name replaced (serialized data included) -------
dump=$froot/tmp/clone-$$.sql
wf db export "$dump" --quiet
install -o "wp-$tslug" -g "wp-$tslug" -m 600 "$dump" "$troot/tmp/clone.sql"
rm -f "$dump"
wt db reset --yes --quiet
wt db import "$troot/tmp/clone.sql" --quiet
rm -f "$troot/tmp/clone.sql"
wt search-replace "https://$from" "https://$to" --all-tables-with-prefix --skip-columns=guid --quiet
wt search-replace "$from" "$to" --all-tables-with-prefix --skip-columns=guid --quiet

# --- Files: theme, plugins, uploads, must-use plugins ----------------------------------------------------
rm -rf -- "${troot:?}/public/wp-content"
cp -a "$froot/public/wp-content" "$troot/public/wp-content"
chown -R "wp-$tslug:www-data" "$troot/public/wp-content"
# The locally stored fonts (wordpress-tune.sh) are CSS files with the source's full address in them,
# which the database's search-replace doesn't reach: the target fetches its own on its first visit.
rm -rf -- "${troot:?}/public/wp-content/fonts"
wt option delete downloaded_font_files --quiet >/dev/null 2>&1 || true

# --- Its own name, logo and a clean start ------------------------------------------------------------------
wt option update blogname "$to" --quiet
bash "$here/fix-branding.sh" "$to" $icon
wt rewrite flush --quiet
wt cache flush --quiet
systemctl enable --now "wp-cron-$tslug.timer"

echo; echo "== $to"
wt option get siteurl
wt post list --post_type=page --fields=ID,post_title,post_status
wt plugin list --fields=name,status
