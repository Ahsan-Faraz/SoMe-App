# WordPress on the main domains

Client guide 261123: `theirl.net/` and `aiproduktion.se/` are WordPress sites (Home, Pricing, About,
Contact, Cookies, a "Get started" button); their Log in and Join buttons go to the app; every other
address (`/<community>`, `/login`, `/join`, `/communities`) is the app. Both run on the prod VPS next
to the app, and nginx sends each path to one or the other.

**Status:** both sites are built; the public pages move to WordPress with `wordpress-switch.sh` (below).

## How it is set up

| What | Where |
|---|---|
| Site files | `/srv/wp/<domain>/public`, owned by the Linux user `wp-<domain-with-dashes>` |
| Database | MariaDB, local only, one database and database user per site (`wp_theirl_net`, ...) |
| PHP | PHP-FPM 8.5, one pool per site (`/run/php/<slug>.sock`), workers only on demand |
| Mail key | `/srv/wp/<domain>/secrets.php` (root and the site's PHP only), from the app's `BREVO_API_KEY` |
| Logs | `/srv/wp/<domain>/logs/php-error.log`, rotated weekly |
| Backups | `/srv/wp-backups/<domain>` (root only) |
| nginx | `/etc/nginx/sites-available/some` and `/etc/nginx/snippets/{some-app,wp-common,wp-<slug>}.conf` |

Limits, so WordPress can never slow the app down: MariaDB at most 1 GB of memory, PHP-FPM 1.5 GB,
both with half the app's CPU weight; WordPress's scheduled jobs run from a systemd timer every
5 minutes at low priority (512 MB cap), not on page views. The server has 2 GB of swap.

Security: XML-RPC, the install screens and `wp-cron.php` are blocked in nginx; logins are limited to
6 tries a minute per address; no PHP file in `wp-content` or `wp-includes` runs directly; dot-files,
logs, dumps and backups are never served; login names are hidden (REST API, author pages) and a wrong
login gets one message whether the name or the password was wrong; the code editor in wp-admin is
off; minor WordPress updates install themselves. Search engines are kept out until the switch.

## The scripts (deploy/)

Run on the VPS as root, from `~/wp` with the files copied there flat (`scp ... peter@187.124.131.7:~/wp/`).

| Script | What it does |
|---|---|
| `vps/wordpress-setup.sh <domain>` | Swap, PHP, MariaDB and limits once; then the site's user, pool, database, WordPress files, log rotation and jobs timer. Safe to repeat. |
| `vps/wordpress-enable.sh <domain>` | First install from the command line, the nginx routes for WordPress's own paths. (Used once for theirl.net.) |
| `wordpress/apply-content.sh <domain>` | The pages from `deploy/wordpress/<slug>/*.html`, menus, header button, footer, site name. Running it again resets the pages to the files (the old version stays as a revision). |
| `wordpress/fix-layout.sh <domain>` | Menu places, page widths and titles, the footer's site name. |
| `wordpress/fix-branding.sh <domain> [--icon-only]` | The logo (icon + site name, or the icon only), no social icons, leftover uploads removed. |
| `vps/wordpress-clone.sh <from> <to> [--icon-only] [--force]` | Copies one site to another with the domain name replaced; the target keeps its own database and keys. |
| `vps/wordpress-plugins.sh <domain>...` | The must-use plugins and the mail key for the named sites only. Run again after a new Brevo key. |
| `vps/wordpress-finish.sh` | aiproduktion.se as a copy of theirl.net, the must-use plugins and mail key on both, nginx, nightly backups, checks. Safe to repeat. |
| `vps/wordpress-check.sh [--update]` | Health check: versions, mail (Brevo sandbox, nothing is sent), timers, last backups. `--update` installs newer must-use plugins first. |
| `vps/wordpress-backup.sh` | The nightly backup (installed as `/usr/local/sbin/wordpress-backup`). |

The must-use plugins (`deploy/vps/wp-mu-plugins/`): `some-hardening.php` (login names, errors,
generator tag), `some-mail.php` (mail through Brevo's API), and `theirl-preview.php`, which lets a
logged-in editor see the pages at `https://<domain>/index.php?page_id=<id>` before the switch. Delete
the preview plugin at the switch.

## Day to day

- **Editing pages:** wp-admin → Pages. Peter's login is the account imported from purposewrite. The
  pages are normal blocks; the illustrations are Custom HTML blocks and can be replaced with images.
- **New Brevo key** (it expires every 90 days): put it in the app's `.env.production` as usual, then
  run `sudo bash ~/wp/wordpress-plugins.sh theirl.net aiproduktion.se` (it rewrites both sites' `secrets.php`) and
  `sudo bash ~/wp/wordpress-check.sh` (the mail line must say `true`).
- **Updates:** wp-admin → Dashboard → Updates, or as root:
  `sudo -u wp-theirl-net env HOME=/srv/wp/theirl.net/tmp wp --path=/srv/wp/theirl.net/public plugin update --all`.
  The Kadence Pro add-ons get updates only with a licence key for the site (not entered; Peter decides).
- **Backups:** every night the database and uploads (kept 14 days); on Sundays all of `wp-content`
  (kept 4 weeks). They stay on the VPS: keep the hosting's snapshots on, or copy
  `/srv/wp-backups` elsewhere now and then.
- **Restore a database:** `gunzip -c /srv/wp-backups/<domain>/db-<date>.sql.gz > /srv/wp/<domain>/tmp/restore.sql`,
  `chown wp-<slug> /srv/wp/<domain>/tmp/restore.sql`, then as the site user
  `wp db import /srv/wp/<domain>/tmp/restore.sql` and delete the file.

## The switch: the public pages to WordPress

`deploy/vps/wordpress-switch.sh` (run as root from the deploy files' folder) does it for both domains:

1. nginx sends `/`, `/home`, `/pricing`, `/about`, `/contact`, `/cookies`, `/robots.txt` and the
   WordPress sitemap to WordPress; `/get-started` forwards to the app's `/join`. Every other address
   (every community, `/login`, `/join`, `/communities`) stays with the app. These addresses are
   reserved community slugs (`private.reserved_slug`), so no community can take them.
2. Page caching in nginx (`nginx-wp-page.conf`, zone `wp_pages` in `/var/cache/nginx/wp`, at most
   256 MB): visitors get a stored copy for 5 minutes; a logged-in WordPress editor, a form post or an
   address with a query string always gets the page fresh. The `X-Cache` header shows HIT, MISS or
   BYPASS. After an edit, visitors see it within 5 minutes.
3. `blog_public` to 1 (search engines welcome) and the preview plugin removed.
4. Checks for both domains: pages, cache HIT and BYPASS, the app's addresses, the title.

`sudo bash wordpress-switch.sh --undo` puts the nginx config from before the switch back and keeps
search engines out again.

The installed app (the PWA) starts at `/communities` (`src/app/manifest.ts`), not at `/`, which is
the WordPress page on the main domains. Community pages have their own start address (`/<community>`).
