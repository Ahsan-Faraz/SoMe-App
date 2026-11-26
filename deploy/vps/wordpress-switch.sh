#!/usr/bin/env bash
# The switch (client guide 261123): the main domains' public pages (/, /pricing, /about, /contact,
# /cookies) go to WordPress, with nginx page caching; every community, /login, /join and /communities
# stay with the app. Run as root from the folder holding the deploy files (flat, as copied by scp or
# from /srv/some/current/deploy):
#   sudo bash wordpress-switch.sh            switch both domains
#   sudo bash wordpress-switch.sh --undo     put the previous nginx config back (pages to the app)
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run as root (sudo)" >&2; exit 1; }
here=$(dirname "$(readlink -f "$0")")
sites=(theirl.net aiproduktion.se)
snippets=(some-app wp-common wp-page wp-theirl-net wp-aiproduktion-se)
w() { local d=$1; shift; local s=${d//./-}; sudo -u "wp-$s" -- env HOME="/srv/wp/$d/tmp" WP_CLI_CACHE_DIR="/srv/wp/$d/tmp/wp-cli" wp --path="/srv/wp/$d/public" "$@"; }

if [[ ${1:-} == --undo ]]; then
  stamp=$(ls -1 /etc/nginx/sites-available/ | sed -n 's/^some\.bak-switch-//p' | sort | tail -1)
  [[ -n $stamp ]] || { echo "no backup from a switch found" >&2; exit 1; }
  cp -a "/etc/nginx/sites-available/some.bak-switch-$stamp" /etc/nginx/sites-available/some
  for s in "${snippets[@]}"; do
    b=/etc/nginx/snippets/$s.conf.bak-switch-$stamp
    [[ -f $b ]] && cp -a "$b" "/etc/nginx/snippets/$s.conf"
  done
  nginx -t && systemctl reload nginx
  for d in "${sites[@]}"; do w "$d" option update blog_public 0 --quiet; done
  echo "Undone: the config from before the switch ($stamp) is back; search engines kept out again."
  exit 0
fi

for f in nginx-some.conf nginx-some-app.conf nginx-wp-common.conf nginx-wp-page.conf \
  nginx-wp-theirl-net.conf nginx-wp-aiproduktion-se.conf; do
  [[ -f $here/$f ]] || { echo "missing $here/$f" >&2; exit 1; }
done
for d in "${sites[@]}"; do
  [[ -f /srv/wp/$d/public/wp-config.php ]] || { echo "no WordPress for $d" >&2; exit 1; }
done

# --- 1. nginx, with a way back ----------------------------------------------------------------------
echo "== 1. nginx"
stamp=$(date +%Y%m%d%H%M%S)
cp -a /etc/nginx/sites-available/some "/etc/nginx/sites-available/some.bak-switch-$stamp"
for s in "${snippets[@]}"; do
  [[ -f /etc/nginx/snippets/$s.conf ]] && cp -a "/etc/nginx/snippets/$s.conf" "/etc/nginx/snippets/$s.conf.bak-switch-$stamp"
done
install -d -o www-data -g www-data -m 700 /var/cache/nginx/wp
install -m 644 "$here/nginx-some-app.conf" /etc/nginx/snippets/some-app.conf
install -m 644 "$here/nginx-wp-common.conf" /etc/nginx/snippets/wp-common.conf
install -m 644 "$here/nginx-wp-page.conf" /etc/nginx/snippets/wp-page.conf
install -m 644 "$here/nginx-wp-theirl-net.conf" /etc/nginx/snippets/wp-theirl-net.conf
install -m 644 "$here/nginx-wp-aiproduktion-se.conf" /etc/nginx/snippets/wp-aiproduktion-se.conf
install -m 644 "$here/nginx-some.conf" /etc/nginx/sites-available/some
if nginx -t; then
  systemctl reload nginx
  echo "nginx reloaded (undo: sudo bash $0 --undo)"
else
  cp -a "/etc/nginx/sites-available/some.bak-switch-$stamp" /etc/nginx/sites-available/some
  for s in "${snippets[@]}"; do
    [[ -f /etc/nginx/snippets/$s.conf.bak-switch-$stamp ]] && cp -a "/etc/nginx/snippets/$s.conf.bak-switch-$stamp" "/etc/nginx/snippets/$s.conf"
  done
  echo "nginx test failed: the old config is back, nothing was reloaded" >&2
  exit 1
fi

# --- 2. WordPress: public now -------------------------------------------------------------------------
echo; echo "== 2. WordPress"
for d in "${sites[@]}"; do
  w "$d" option update blog_public 1 --quiet                 # search engines welcome
  rm -f "/srv/wp/$d/public/wp-content/mu-plugins/theirl-preview.php"   # the pages are reachable now
  w "$d" rewrite flush --quiet
  w "$d" cache flush --quiet
  echo "$d: public, preview plugin removed"
done

# --- 3. Checks ------------------------------------------------------------------------------------------
echo; echo "== 3. Checks (expected in brackets)"
sleep 1
row() { # row <host> <path> <expected> [curl options...]
  local host=$1 path=$2 want=$3; shift 3
  local out
  out=$(curl -s -o /dev/null -D - --max-time 20 --resolve "$host:443:127.0.0.1" "$@" "https://$host$path" \
    | tr -d '\r' | awk '{h=tolower($1)} h ~ /^http\//{c=$2} h=="location:"{l=$2} h=="x-cache:"{x=$2} END{printf "%s%s%s", c, (l?" -> "l:""), (x?" cache "x:"")}')
  printf '%-46s %-24s %s\n' "$host$path" "[$want]" "$out"
}
for d in "${sites[@]}"; do
  row "$d" /                  '200 cache MISS/HIT'
  row "$d" /                  '200 cache HIT'
  row "$d" /about             '301 -> /about/'
  row "$d" /about/            '200'
  row "$d" /pricing/          '200'
  row "$d" /cookies/          '200'
  row "$d" /get-started       '302 -> /join'
  row "$d" /robots.txt        '200'
  row "$d" '/?utm=x'          '200 cache BYPASS'
  row "$d" /                  '200 cache BYPASS' -H 'Cookie: wordpress_logged_in_test=1'
  row "$d" /login             '200 (app)'
  row "$d" /join              '200 (app)'
  row "$d" /biking-stockholm  '200 (app)'
  row "$d" /wp-login.php      '200'
  echo "  title of /: $(curl -s --max-time 20 --resolve "$d:443:127.0.0.1" "https://$d/" | grep -o '<title>[^<]*' | head -1 | sed 's/<title>//')"
done
du -sh /var/cache/nginx/wp
