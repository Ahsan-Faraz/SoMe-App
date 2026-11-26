<?php
/**
 * Plugin Name: SoMe mail via Brevo
 * Description: WordPress sends its emails (password resets, admin notices) through Brevo's API,
 *              like the app does; the server itself has no mail program. The key and sender come
 *              from /srv/wp/<domain>/secrets.php, written by deploy/vps/wordpress-finish.sh from the
 *              app's settings (BREVO_API_KEY). Without them WordPress mail fails, as before.
 */

defined( 'ABSPATH' ) || exit;

add_filter(
	'pre_wp_mail',
	static function ( $short_circuit, $atts ) {
		if ( ! defined( 'SOME_BREVO_API_KEY' ) || ! SOME_BREVO_API_KEY || ! defined( 'SOME_MAIL_FROM' ) ) {
			return $short_circuit;
		}

		$address = static function ( $value ) {
			$value = trim( (string) $value );
			if ( preg_match( '/<([^>]+)>/', $value, $m ) ) {
				$value = $m[1];
			}
			return is_email( $value ) ? $value : null;
		};

		$to = is_array( $atts['to'] ) ? $atts['to'] : explode( ',', (string) $atts['to'] );
		$recipients = array();
		foreach ( $to as $one ) {
			$email = $address( $one );
			if ( $email ) {
				$recipients[] = array( 'email' => $email );
			}
		}
		if ( ! $recipients ) {
			return false;
		}

		$headers = $atts['headers'];
		if ( ! is_array( $headers ) ) {
			$headers = '' === (string) $headers ? array() : explode( "\n", str_replace( "\r\n", "\n", (string) $headers ) );
		}
		$html     = 'text/html' === apply_filters( 'wp_mail_content_type', 'text/plain' );
		$reply_to = null;
		$custom   = array(); // X- headers go to Brevo as they are ("X-Sib-Sandbox: drop" checks without sending)
		foreach ( $headers as $header ) {
			if ( 0 === stripos( $header, 'content-type:' ) && false !== stripos( $header, 'text/html' ) ) {
				$html = true;
			} elseif ( 0 === stripos( $header, 'reply-to:' ) ) {
				$reply_to = $address( substr( $header, 9 ) );
			} elseif ( preg_match( '/^(X-[A-Za-z0-9-]+):\s*(.+)$/', trim( $header ), $m ) ) {
				$custom[ $m[1] ] = $m[2];
			}
		}

		$body = array(
			'sender'  => array(
				'email' => SOME_MAIL_FROM,
				'name'  => wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ),
			),
			'to'      => $recipients,
			'subject' => (string) $atts['subject'],
		);
		$body[ $html ? 'htmlContent' : 'textContent' ] = (string) $atts['message'];
		if ( $reply_to ) {
			$body['replyTo'] = array( 'email' => $reply_to );
		}
		if ( $custom ) {
			$body['headers'] = $custom;
		}

		$response = wp_remote_post(
			'https://api.brevo.com/v3/smtp/email',
			array(
				'timeout' => 15,
				'headers' => array(
					'api-key'      => SOME_BREVO_API_KEY,
					'content-type' => 'application/json',
					'accept'       => 'application/json',
				),
				'body'    => wp_json_encode( $body ),
			)
		);

		$code = is_wp_error( $response ) ? 0 : (int) wp_remote_retrieve_response_code( $response );
		if ( $code < 200 || $code >= 300 ) {
			$reason = is_wp_error( $response ) ? $response->get_error_message() : 'Brevo answered ' . $code;
			do_action( 'wp_mail_failed', new WP_Error( 'wp_mail_failed', $reason, $atts ) );
			return false;
		}
		return true;
	},
	10,
	2
);
