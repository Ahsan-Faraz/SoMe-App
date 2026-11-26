#!/usr/bin/env bash
# Puts the SoMe content into a main-domain WordPress (client guide 261123): the pages from
# deploy/wordpress/<slug>/, the menus, the header button, the footer, the site name. Run as root,
# with the page files in a folder named like the domain (theirl-net/) next to this script:
#   sudo bash apply-content.sh theirl.net
# Peter edits everything in wp-admin afterwards; running this again resets the pages to these files
# (WordPress keeps the previous version as a revision).
set -euo pipefail

domain=${1:-}
[[ $domain =~ ^[a-z0-9-]+(\.[a-z0-9-]+)+$ ]] || { echo "usage: apply-content.sh <domain>" >&2; exit 2; }
[[ $EUID -eq 0 ]] || { echo "run as root (sudo)" >&2; exit 1; }
slug=${domain//./-}
here=$(dirname "$(readlink -f "$0")")/$slug
root=/srv/wp/$domain
for f in home about pricing contact cookies; do
  [[ -f $here/$f.html ]] || { echo "missing $here/$f.html" >&2; exit 1; }
done
w() { sudo -u "wp-$slug" -- env HOME="$root/tmp" WP_CLI_CACHE_DIR="$root/tmp/wp-cli" wp --path="$root/public" "$@"; }
# The site user reads the page files from its own tmp folder.
install -d -o "wp-$slug" -g "wp-$slug" -m 700 "$root/tmp/content"
install -o "wp-$slug" -g "wp-$slug" -m 600 "$here"/*.html "$root/tmp/content/"
c=$root/tmp/content

backup=$root/backup-before-content-$(date +%Y%m%d%H%M%S).sql
w db export "$backup" --quiet
chmod 600 "$backup"
echo "Database backup: $backup"

# --- Site name ---------------------------------------------------------------------------------------
w option update blogname "$domain"
w option update blogdescription "Communities that meet in real life"

# --- Pages: found by their address, created when missing --------------------------------------------
page() { # page <path-name> <title> <file>
  local id
  id=$(w post list --post_type=page --name="$1" --post_status=any --field=ID | head -1)
  if [[ -n $id ]]; then
    w post update "$id" "$c/$3" --post_title="$2" --post_status=publish --post_excerpt= >/dev/null
  else
    id=$(w post create "$c/$3" --post_type=page --post_name="$1" --post_title="$2" --post_status=publish --porcelain)
  fi
  echo "$id"
}
home=$(page home Home home.html)
pricing=$(page pricing Pricing pricing.html)
about=$(page about About about.html)
contact=$(page contact Contact contact.html)
cookies=$(page cookies Cookies cookies.html)
w option update show_on_front page
w option update page_on_front "$home"
w option update page_for_posts 0
echo "Pages: home $home, pricing $pricing, about $about, contact $contact, cookies $cookies"

# --- Menus: rebuilt from scratch ------------------------------------------------------------------------
for m in $(w menu list --format=ids); do w menu delete "$m" >/dev/null; done
main=$(w menu create "Main" --porcelain)
w menu item add-post "$main" "$home" --title=Home >/dev/null
w menu item add-post "$main" "$pricing" --title=Pricing >/dev/null
w menu item add-post "$main" "$about" --title=About >/dev/null
w menu item add-post "$main" "$contact" --title=Contact >/dev/null
w menu item add-post "$main" "$cookies" --title=Cookies >/dev/null
footer=$(w menu create "Footer" --porcelain)
w menu item add-post "$footer" "$home" --title=Home >/dev/null
w menu item add-post "$footer" "$pricing" --title=Pricing >/dev/null
w menu item add-post "$footer" "$about" --title=About >/dev/null
w menu item add-post "$footer" "$contact" --title=Contact >/dev/null
w menu item add-post "$footer" "$cookies" --title=Cookies >/dev/null
w menu item add-custom "$footer" "Log in" /login >/dev/null
w menu location assign "$main" primary
w menu location assign "$main" mobile
w menu location assign "$footer" footer

# --- Header button and footer text (Kadence) -------------------------------------------------------------
w theme mod set header_button_label "Get started"
w theme mod set header_button_link /join
w theme mod set mobile_button_label "Get started"
w theme mod set mobile_button_link /join
w theme mod set footer_html_content '{copyright} {year} {site-title}'

# --- purposewrite leftovers: its forms, and every image except the site icon -------------------------------
forms=$(w post list --post_type=kadence_form --post_status=any --format=ids)
[[ -n $forms ]] && w post delete $forms --force --quiet
icon=$(w option get site_icon)
w theme mod set custom_logo "$icon"   # the square icon; "theirl.net" goes next to it as text
for id in $(w post list --post_type=attachment --post_status=any --format=ids); do
  [[ $id == "$icon" ]] || w post delete "$id" --force --quiet
done
w transient delete --all >/dev/null
w rewrite flush

echo; echo "== Pages"; w post list --post_type=page --post_status=any --fields=ID,post_title,post_name,post_status
echo; echo "== Menu locations"; w menu location list
echo; echo "== Images left"; w post list --post_type=attachment --format=count
du -sh "$root/public/wp-content/uploads"
