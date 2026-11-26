<?php
/**
 * Plugin Name: SoMe hardening
 * Description: Keeps login names private and leaves less for attackers to work with. Installed by
 *              deploy/vps/wordpress-finish.sh in every main-domain WordPress.
 */

defined( 'ABSPATH' ) || exit;

// Login names are half of a password guess: don't hand them out.
// 1. The REST API lists users (and their login slugs) only to logged-in users.
add_filter(
	'rest_endpoints',
	static function ( $endpoints ) {
		if ( ! is_user_logged_in() ) {
			foreach ( array_keys( $endpoints ) as $route ) {
				if ( 0 === strpos( $route, '/wp/v2/users' ) ) {
					unset( $endpoints[ $route ] );
				}
			}
		}
		return $endpoints;
	}
);

// 2. No author pages for visitors (/?author=1 would redirect to /author/<login>/).
add_filter(
	'redirect_canonical',
	static function ( $redirect, $requested ) {
		return ( ! is_user_logged_in() && preg_match( '/[?&]author=/i', (string) $requested ) ) ? false : $redirect;
	},
	10,
	2
);
add_action(
	'template_redirect',
	static function () {
		if ( is_author() && ! is_user_logged_in() ) {
			global $wp_query;
			$wp_query->set_404();
			status_header( 404 );
			nocache_headers();
		}
	},
	1
);

// 3. One message for a wrong login name or a wrong password, so a guess can't tell which was right.
add_filter(
	'login_errors',
	static function ( $message ) {
		return ( false !== stripos( (string) $message, 'username' ) || false !== stripos( (string) $message, 'password' ) || false !== stripos( (string) $message, 'email' ) )
			? '<strong>Error:</strong> The login details are not correct.'
			: $message;
	}
);

// No version number in the page source; no XML-RPC (nginx blocks the file too).
remove_action( 'wp_head', 'wp_generator' );
add_filter( 'the_generator', '__return_empty_string' );
add_filter( 'xmlrpc_enabled', '__return_false' );
