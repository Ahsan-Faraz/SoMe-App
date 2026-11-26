#!/usr/bin/env bash
# Nightly backup of every WordPress under /srv/wp (main domains, client guide 261123). Installed as
# /usr/local/sbin/wordpress-backup by wordpress-finish.sh and run by wordpress-backup.timer.
#
#   Every night: the database and the uploads (small), kept 14 days.
#   Sundays:     all of wp-content (theme and plugins too: the Kadence Pro add-ons can't be
#                downloaded again without a licence), kept 4 weeks.
#
# Backups stay on this server in /srv/wp-backups (root only). Copy them off the server now and then,
# or keep the hosting's snapshots on: a broken disk would take both.
set -euo pipefail
umask 077
out=/srv/wp-backups
day=$(date +%Y%m%d)

for site in /srv/wp/*/; do
  site=${site%/}
  domain=$(basename "$site")
  slug=${domain//./-}
  [[ -f $site/public/wp-config.php ]] || continue
  dest=$out/$domain
  install -d -m 700 "$dest"

  # A consistent dump without locking the site (InnoDB).
  sudo -u "wp-$slug" -- env HOME="$site/tmp" WP_CLI_CACHE_DIR="$site/tmp/wp-cli" \
    wp --path="$site/public" db export - --single-transaction --quiet | gzip -6 > "$dest/db-$day.sql.gz.part"
  mv "$dest/db-$day.sql.gz.part" "$dest/db-$day.sql.gz"

  tar -C "$site/public" -czf "$dest/uploads-$day.tar.gz" wp-content/uploads wp-content/mu-plugins
  if [[ $(date +%u) == 7 ]]; then
    tar -C "$site/public" -czf "$dest/wp-content-$day.tar.gz" wp-content
  fi

  find "$dest" -maxdepth 1 -type f \( -name 'db-*.sql.gz' -o -name 'uploads-*.tar.gz' \) -mtime +14 -delete
  find "$dest" -maxdepth 1 -type f -name 'wp-content-*.tar.gz' -mtime +28 -delete
  find "$dest" -maxdepth 1 -type f -name '*.part' -delete
  echo "$domain: $(du -sh "$dest" | cut -f1) in $dest"
done
