#!/usr/bin/env bash
# Branding after fix-layout.sh (client guide 261123): the square icon plus the site name as the logo
# on phones, tablets and desktops (aiproduktion.se: icon only, pass --icon-only), no social icons in
# the footer, and the uploads folder emptied of files no media library item owns (the removed
# plugins' and purposewrite's leftovers). Safe to run again: every library item's files stay.
#   sudo bash fix-branding.sh theirl.net [--icon-only]
set -euo pipefail
domain=${1:-}
[[ $domain =~ ^[a-z0-9-]+(\.[a-z0-9-]+)+$ ]] || { echo "usage: fix-branding.sh <domain> [--icon-only]" >&2; exit 2; }
[[ $EUID -eq 0 ]] || { echo "run as root (sudo)" >&2; exit 1; }
include=logo_title
[[ ${2:-} == --icon-only ]] && include=logo_only
slug=${domain//./-}
root=/srv/wp/$domain
up=$root/public/wp-content/uploads
w() { sudo -u "wp-$slug" -- env HOME="$root/tmp" WP_CLI_CACHE_DIR="$root/tmp/wp-cli" wp --path="$root/public" "$@"; }

# --- Logo: icon (44 px desktop, 36 px phone) with the site name next to it ------------------------------
w eval '
$layout = get_theme_mod( "logo_layout", array() );
// Every size set: left empty ("inherit"), Kadence hides the site name on tablets.
$layout["include"] = array( "mobile" => "'"$include"'", "tablet" => "'"$include"'", "desktop" => "'"$include"'" );
$layout["layout"]  = array( "mobile" => "standard", "tablet" => "standard", "desktop" => "standard" );
set_theme_mod( "logo_layout", $layout );
set_theme_mod( "logo_width", array(
  "size" => array( "mobile" => 36, "tablet" => 40, "desktop" => 44 ),
  "unit" => array( "mobile" => "px", "tablet" => "px", "desktop" => "px" ),
) );
$s = get_theme_mod( "footer_social_items", array() );
$s["items"] = array();
set_theme_mod( "footer_social_items", $s );
echo "logo: ", wp_json_encode( get_theme_mod( "logo_layout" )["include"] ), ", footer social icons removed\n";
'

# --- Uploads: what is left of the removed plugins and of purposewrite --------------------------------------
echo; echo "== Hidden folders in uploads (before)"
du -sh "$up"/.[!.]* 2>/dev/null || echo "none"
for d in rank-math kadence_ai eb-patterns uag-plugin elementor wpforms ast-block-templates-json; do
  [[ -e $up/$d ]] && rm -rf -- "${up:?}/$d" && echo "removed uploads/$d"
done
# Old media: files that no media library item owns. Each item keeps its file and its sizes
# (name-150x150.png, ...), so the site icon, the logo and anything uploaded later all stay.
keep=()
while IFS= read -r file; do
  [[ -n $file ]] && keep+=( ! -name "$(basename "${file%.*}")*" )
done < <(w db query "SELECT meta_value FROM $(w db prefix)postmeta WHERE meta_key = '_wp_attached_file'" --skip-column-names)
if compgen -G "$up/20[0-9][0-9]" >/dev/null; then
  find "$up"/20[0-9][0-9] -type f "${keep[@]}" -print -delete | wc -l | xargs echo "old media files removed:"
  find "$up"/20[0-9][0-9] -type d -empty -delete
fi
w transient delete --all >/dev/null

echo; echo "== Uploads now"
du -sh "$up"
find "$up" -type f | sed "s|$up/||" | head -40
