#!/usr/bin/env bash
# Speed and privacy for the main-domain WordPress sites, then a speed measurement on the server
# itself (no slow home connection in between). Run as root from the folder holding the deploy files:
#   sudo bash wordpress-tune.sh            tune and measure
#   sudo bash wordpress-tune.sh --measure  measure only
#
#   1. The logo: a 96 px WebP instead of the 512 px PNG (sharp on 2x phone screens, a few KB).
#   2. Fonts served from this server instead of Google's (one connection less, and visitors' IP
#      addresses don't go to Google: the Cookies page says "no tracking").
#   3. nginx answers bots' .php and dot-file probes with a 404 itself (nginx-some-app.conf).
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run as root (sudo)" >&2; exit 1; }
here=$(dirname "$(readlink -f "$0")")
sites=(theirl.net aiproduktion.se)
w() { local d=$1; shift; local s=${d//./-}; sudo -u "wp-$s" -- env HOME="/srv/wp/$d/tmp" WP_CLI_CACHE_DIR="/srv/wp/$d/tmp/wp-cli" wp --path="/srv/wp/$d/public" "$@"; }

if [[ ${1:-} != --measure ]]; then
  [[ -f $here/nginx-some-app.conf ]] || { echo "missing $here/nginx-some-app.conf" >&2; exit 1; }

  echo "== 1-2. Logo and fonts"
  for d in "${sites[@]}"; do
    w "$d" eval '
      require_once ABSPATH . "wp-admin/includes/image.php";
      $existing = get_posts( array( "post_type" => "attachment", "name" => "site-logo-96", "numberposts" => 1, "fields" => "ids" ) );
      if ( $existing ) {
        $id = $existing[0];
      } else {
        $editor = wp_get_image_editor( get_attached_file( (int) get_option( "site_icon" ) ) );
        if ( is_wp_error( $editor ) ) { echo "logo: ", $editor->get_error_message(), "\n"; return; }
        $editor->resize( 96, 96, true );
        $editor->set_quality( 90 );
        $dir   = wp_upload_dir();
        $saved = $editor->save( $dir["path"] . "/site-logo-96.webp", "image/webp" );
        if ( is_wp_error( $saved ) ) { echo "logo: ", $saved->get_error_message(), "\n"; return; }
        $id = wp_insert_attachment( array( "post_title" => "Site logo 96", "post_name" => "site-logo-96", "post_mime_type" => "image/webp", "post_status" => "inherit" ), $saved["path"] );
        wp_update_attachment_metadata( $id, wp_generate_attachment_metadata( $id, $saved["path"] ) );
      }
      set_theme_mod( "custom_logo", $id );
      set_theme_mod( "load_fonts_local", true );
      set_theme_mod( "preload_fonts_local", true );
      printf( "logo: %s (%d bytes); fonts: from this server\n", basename( get_attached_file( $id ) ), filesize( get_attached_file( $id ) ) );
    '
    echo "  ($d)"
  done

  echo; echo "== 3. nginx"
  stamp=$(date +%Y%m%d%H%M%S)
  cp -a /etc/nginx/snippets/some-app.conf "/etc/nginx/snippets/some-app.conf.bak-tune-$stamp"
  install -m 644 "$here/nginx-some-app.conf" /etc/nginx/snippets/some-app.conf
  if nginx -t; then
    systemctl reload nginx
  else
    cp -a "/etc/nginx/snippets/some-app.conf.bak-tune-$stamp" /etc/nginx/snippets/some-app.conf
    echo "nginx test failed: the old snippet is back, nothing was reloaded" >&2
    exit 1
  fi

  # The cached pages still name the old logo and Google's fonts: start fresh.
  find /var/cache/nginx/wp -type f -delete
  for d in "${sites[@]}"; do
    curl -s -o /dev/null --resolve "$d:443:127.0.0.1" "https://$d/"   # first visit: Kadence fetches the fonts once
  done
  sleep 2
fi

# --- Measure, on the server ------------------------------------------------------------------------------
echo; echo "== Speed on the server (time to first byte, median of 15)"
median() { sort -n | awk '{a[NR]=$1} END{print a[int((NR+1)/2)]}'; }
ttfb() { # ttfb <host> <path>
  for _ in $(seq 15); do curl -s -o /dev/null -w '%{time_starttransfer}\n' --resolve "$1:443:127.0.0.1" "https://$1$2"; done | median | awk '{printf "%.0f ms", $1*1000}'
}
for d in "${sites[@]}"; do
  for p in / /about/ /biking-stockholm /login /.env /wp-config.php; do
    printf '%-40s %s\n' "$d$p" "$(ttfb "$d" "$p")"
  done
done

echo; echo "== Many visitors at once"
# One curl sends every request, at most <parallel> at a time over shared HTTP/2 connections, as
# browsers do. (A new curl and TLS handshake per request would measure curl, not the site.)
burst() { # burst <host> <path> <requests> <parallel>
  local t0 t1 cfg
  cfg=$(mktemp)
  for _ in $(seq "$3"); do printf 'url = "https://%s%s"\noutput = "/dev/null"\n' "$1" "$2"; done > "$cfg"
  t0=$(date +%s%N)
  codes=$(curl -s --http2 --parallel --parallel-max "$4" --resolve "$1:443:127.0.0.1" -w '%{http_code}\n' -K "$cfg" | sort | uniq -c | tr '\n' ' ')
  t1=$(date +%s%N)
  rm -f "$cfg"
  awk -v n="$3" -v p="$4" -v ms="$(( (t1 - t0) / 1000000 ))" -v c="$codes" -v u="$1$2" 'BEGIN{printf "%-32s %4d requests, %2d at a time: %5d ms, %4.0f per second, answers: %s\n", u, n, p, ms, n*1000/ms, c}'
}
burst theirl.net / 2000 50
burst theirl.net /about/ 2000 50
burst theirl.net /biking-stockholm 300 20
echo; uptime
free -h | head -2

echo; echo "== Fonts and logo on the home page"
for d in "${sites[@]}"; do
  page=$(curl -s --resolve "$d:443:127.0.0.1" "https://$d/")
  echo "$d: Google font links: $(grep -c 'fonts.googleapis\|fonts.gstatic' <<< "$page" || true), logo: $(grep -o '<img[^>]*custom-logo[^>]*>' <<< "$page" | grep -o 'src="[^"]*"' | sort -u | tr '\n' ' '), site name on tablets hidden: $(grep -c 'site-title vs-md-false' <<< "$page" || true)"
done
