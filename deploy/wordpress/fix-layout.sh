#!/usr/bin/env bash
# Layout fixes after apply-content.sh: menus in their places, normal page widths with titles,
# purposewrite's footer logo and social links out. Prints the Kadence logo and social settings.
#   sudo bash fix-layout.sh theirl.net
set -euo pipefail
domain=${1:-}
[[ $domain =~ ^[a-z0-9-]+(\.[a-z0-9-]+)+$ ]] || { echo "usage: fix-layout.sh <domain>" >&2; exit 2; }
[[ $EUID -eq 0 ]] || { echo "run as root (sudo)" >&2; exit 1; }
slug=${domain//./-}
root=/srv/wp/$domain
w() { sudo -u "wp-$slug" -- env HOME="$root/tmp" WP_CLI_CACHE_DIR="$root/tmp/wp-cli" wp --path="$root/public" "$@"; }
id_of() { w post list --post_type=page --name="$1" --post_status=any --field=ID | head -1; }

# --- Menus in the header, mobile menu and footer ------------------------------------------------------
main=$(w menu list --fields=term_id,name --format=csv | awk -F, '$2=="Main"{print $1}')
footer=$(w menu list --fields=term_id,name --format=csv | awk -F, '$2=="Footer"{print $1}')
w menu location assign "$main" primary
w menu location assign "$main" mobile
w menu location assign "$footer" footer

# --- Page width and titles (Kadence page settings) -------------------------------------------------------
# Home: normal width, no title (the hero is the title). Text pages: narrow, title shown.
home=$(id_of home)
w post meta update "$home" _kad_post_layout normal >/dev/null
w post meta update "$home" _kad_post_title hide >/dev/null
for p in about pricing contact cookies; do
  id=$(id_of "$p")
  w post meta update "$id" _kad_post_layout narrow >/dev/null
  w post meta update "$id" _kad_post_title normal >/dev/null
done

# --- Footer: the site name instead of purposewrite's logo image ----------------------------------------
w eval '
$all = get_option( "widget_block", array() );
foreach ( $all as $n => $wgt ) {
  if ( is_array( $wgt ) && isset( $wgt["content"] ) && false !== strpos( $wgt["content"], "purposewrite" ) ) {
    $all[ $n ]["content"] = "<!-- wp:paragraph {\"style\":{\"typography\":{\"fontSize\":\"24px\",\"fontWeight\":\"700\"}}} -->\n<p style=\"font-size:24px;font-weight:700\">" . esc_html( get_bloginfo( "name" ) ) . "</p>\n<!-- /wp:paragraph -->";
    echo "footer widget block-$n: now the site name\n";
  }
}
update_option( "widget_block", $all );
'

# --- Footer: no social links (they were purposewrite's groups) -------------------------------------------
w eval '
foreach ( array( "facebook_link", "linkedin_link", "instagram_link", "twitter_link", "youtube_link" ) as $m ) {
  if ( get_theme_mod( $m ) ) { set_theme_mod( $m, "" ); echo "cleared $m\n"; }
}
'

echo; echo "== Kadence settings for the next step (logo and footer items)"
w eval '
foreach ( array( "logo_layout", "logo_width", "brand_typography", "footer_social_items", "footer_bottom_items", "footer_middle_items", "footer_top_items" ) as $m ) {
  echo $m, ": ", wp_json_encode( get_theme_mod( $m ) ), "\n";
}
'
echo; echo "== Uploads folder"
du -sh "$root/public/wp-content/uploads"/* 2>/dev/null | sort -h | tail -15
