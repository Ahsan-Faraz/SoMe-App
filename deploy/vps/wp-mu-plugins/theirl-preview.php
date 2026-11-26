<?php
/**
 * Plugin Name: theirl.net preview while building
 * Description: Lets a logged-in editor see pages at /index.php?page_id=N while the public paths
 *              (/, /about, ...) still go to the app. Delete this file when nginx sends the pages to
 *              WordPress (deploy/vps/nginx-wp-*.conf).
 *
 * WordPress normally redirects /index.php?page_id=N to the page's own address (/about/), which
 * nginx still hands to the app. For logged-in users only, that redirect is skipped. Visitors are
 * not affected: they cannot reach /index.php pages without a login anyway, since the redirect
 * still applies to them.
 */

defined( 'ABSPATH' ) || exit;

add_filter(
	'redirect_canonical',
	static function ( $redirect ) {
		return is_user_logged_in() ? false : $redirect;
	}
);
