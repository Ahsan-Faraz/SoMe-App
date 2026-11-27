# Moving aiproduktion.se to a new domain

Step by step: how to move the aiproduktion.se site to a new domain name on the VPS.

In the steps the new name is written **`newname.se`**. Replace it everywhere with the real name
before you run a command, and in the folder names replace the dots with dashes (`newname-se`).

## What moves, and what stays

- **Everything in the app moves along by itself.** All communities, members, chats, photos and logins
  of aiproduktion.se belong to the site `aiproduktion` in the database, not to the domain name. The
  move changes settings, not data. Members only log in once more on the new name (a login cookie
  belongs to one domain).
- **theirl.net is not touched** by any step.
- **The old name keeps working** during the move, and afterwards forwards every address to the same
  page on the new name.
- **Time:** about an hour of work, plus waiting for DNS and for Brevo to verify the domain (a few
  hours, sometimes up to a day). Do steps 1 and 2 first, and the rest once they are through.

## What you need

- The new domain, and access to its DNS settings.
- The client's Brevo account.
- SSH to the VPS as `peter` (`ssh -i ~/.ssh/id_ed25519 peter@187.124.131.7`), with your sudo password.
- The app release of 27 November 2026 or later deployed on the VPS (it brings the scripts used below).

## 1. DNS for the new name

At the new domain's DNS provider, add:

| Type | Name | Value |
|---|---|---|
| A | `newname.se` (often written `@`) | `187.124.131.7` |
| A | `www` | `187.124.131.7` |
| AAAA | `newname.se` (`@`) | `2a02:4780:c:ef62::1` |
| AAAA | `www` | `2a02:4780:c:ef62::1` |

Remove any other A or AAAA records for these two names (for example a parking page from the domain
seller). Leave MX records (email) as they are.

**Check** from your PC: `nslookup newname.se` and `nslookup www.newname.se` both show `187.124.131.7`.
Wait for this before step 4.

## 2. Brevo: the new sender

In Brevo: Senders, domains & dedicated IPs → Domains → Add a domain → `newname.se`. Add the DNS
records Brevo shows you (DKIM, the Brevo code, and DMARC if asked). When Brevo says the domain is
authenticated, add the sender `noreply@newname.se` (Senders → Add a sender).

**Check:** Brevo shows `newname.se` as authenticated. Without this, sign-up and password emails from
the new name land in spam or never arrive.

## 3. Get the scripts into a work folder

On the VPS:

```
mkdir -p ~/move && cd ~/move
sudo cp /srv/some/current/deploy/vps/*.sh /srv/some/current/deploy/vps/*.conf \
  /srv/some/current/deploy/vps/wp-mu-plugins/*.php /srv/some/current/deploy/wordpress/*.sh ~/move/
sudo chown peter: ~/move/*
```

**Check:** `ls ~/move` lists, among others, `wordpress-setup.sh`, `wordpress-clone.sh`,
`wordpress-plugins.sh` and `wordpress-check.sh`.

## 4. The certificate

One certificate covers every name on the server. To get it, Let's Encrypt checks the new name over
plain http, so nginx must answer for the new name on http first. Make a copy of the nginx config, so
you can go back:

```
sudo cp -a /etc/nginx/sites-available/some ~/move/nginx-some.before-move
sudo nano /etc/nginx/sites-available/some
```

In the last server block (the one with `listen 80;`), add the new names to `server_name`, so the line
reads:

```
    server_name theirl.net www.theirl.net aiproduktion.se www.aiproduktion.se newname.se www.newname.se;
```

Save (Ctrl+O, Enter, Ctrl+X), then test, reload and get the certificate with the new names added (all
the old names stay in it; the old name still needs it to forward):

```
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --nginx --expand --cert-name theirl.net -d theirl.net -d www.theirl.net -d aiproduktion.se -d www.aiproduktion.se -d newname.se -d www.newname.se
```

**Check:** certbot ends with "Successfully received certificate". If it says the domain could not be
reached, the DNS from step 1 is not through yet: wait and run the certbot command again.

## 5. The app's settings

```
sudo nano /srv/some/shared/.env.production
```

- In `SITE_HOSTS`, add at the end: `,newname.se=aiproduktion,www.newname.se=aiproduktion`
  (keep the `aiproduktion.se` entries for now).
- In `SITE_SENDERS`, change `aiproduktion=noreply@aiproduktion.se` to `aiproduktion=noreply@newname.se`.

Save (Ctrl+O, Enter, Ctrl+X), then restart the app:

```
sudo systemctl restart some.service
```

**Check:** `systemctl is-active some.service` says `active`.

## 6. WordPress for the new name

The WordPress sites live in folders named after their domain, so the new name gets its own copy of
the aiproduktion.se site, with the name replaced everywhere:

```
cd ~/move
sudo bash wordpress-setup.sh newname.se
sudo bash wordpress-clone.sh aiproduktion.se newname.se --icon-only
sudo bash wordpress-plugins.sh newname.se
sudo sed -e 's#/srv/wp/aiproduktion.se/#/srv/wp/newname.se/#' -e 's#aiproduktion-se.sock#newname-se.sock#g' \
  /etc/nginx/snippets/wp-aiproduktion-se.conf | sudo tee /etc/nginx/snippets/wp-newname-se.conf >/dev/null
```

Leave out `--icon-only` if the new name should show the icon and the name as its logo.
`wordpress-setup.sh` restarts the WordPress database for a few seconds; visitors still get the pages
from the page cache meanwhile, and the app is not affected.

**Check:** the last lines of `wordpress-clone.sh` show `https://newname.se` and the five pages, and
`wordpress-plugins.sh` says `newname.se: mail on, from noreply@newname.se`. The nightly backups pick
up the new site by themselves.

## 7. nginx: the new name serves, the old name forwards

```
sudo nano /etc/nginx/sites-available/some
```

Two changes:

**a.** In the server block that starts with `# aiproduktion.se:`, change the two lines

```
    server_name aiproduktion.se www.aiproduktion.se;
    ...
    include snippets/wp-aiproduktion-se.conf;
```

to

```
    server_name newname.se www.newname.se;
    ...
    include snippets/wp-newname-se.conf;
```

**b.** Right after that server block (after its closing `}`), add a block for the old name:

```
# aiproduktion.se: moved to newname.se; every address forwards to the same page there.
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name aiproduktion.se www.aiproduktion.se;

    ssl_certificate /etc/letsencrypt/live/theirl.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/theirl.net/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    return 301 https://newname.se$request_uri;
}
```

Save, then test and reload:

```
sudo nginx -t && sudo systemctl reload nginx
```

**Check:** `nginx -t` says "syntax is ok" and "test is successful". If it shows an error, nothing
has changed yet: fix the line it names, or go back with
`sudo cp -a ~/move/nginx-some.before-move /etc/nginx/sites-available/some`.

## 8. Check everything

In a browser (a private window, so no old login is used):

1. `https://newname.se/` opens the WordPress home page with the right logo, and Get started opens the
   app's sign-up.
2. `https://newname.se/<a community>` opens the community; log in with an existing login.
3. Sign up with a new test address: the code arrives from `noreply@newname.se`.
4. `https://aiproduktion.se/<a community>` lands on the same page on `newname.se`.
5. `https://newname.se/wp-login.php`: log in to WordPress with your usual login.

On the VPS:

```
sudo bash ~/move/wordpress-check.sh
```

**Check:** `newname.se` is listed with `mail (Brevo sandbox, nothing is sent): true`.

## If something goes wrong

- **The site does not open after step 4 or 7:** put the old nginx config back and reload:
  `sudo cp -a ~/move/nginx-some.before-move /etc/nginx/sites-available/some && sudo nginx -t && sudo systemctl reload nginx`.
- **Logins or emails fail after step 5:** undo the two changes in `.env.production` and restart the
  app (`sudo systemctl restart some.service`).
- Nothing in these steps changes the database of the app, so no data needs restoring.

## Good to know after the move

- The repo's nginx config (`deploy/vps/nginx-some.conf`) still has the old name. Don't run
  `wordpress-finish.sh` or `wordpress-switch.sh` from it any more: they install that config and would
  undo step 7. Update the repo's nginx files to match the server first.
- `wordpress-check.sh` and the nightly backups find every site by themselves, the new one included.
- To renew the mail key for the new site later: `sudo bash ~/move/wordpress-plugins.sh newname.se`.

## 9. Later: switching the old name off

After a few months, when links and installed apps have moved on:

1. Remove the `aiproduktion.se` entries from `SITE_HOSTS` and restart the app.
2. Remove the forwarding block (7b) and the old names from the port 80 block (step 4), then test and
   reload nginx.
3. Remove the old WordPress: `sudo systemctl disable --now wp-cron-aiproduktion-se.timer`, delete
   `/etc/systemd/system/wp-cron-aiproduktion-se.*`,
   `/srv/wp/aiproduktion.se`, `/etc/php/8.5/fpm/pool.d/aiproduktion-se.conf` (then
   `sudo systemctl reload php8.5-fpm`), `/etc/nginx/snippets/wp-aiproduktion-se.conf`, and the database
   (`sudo mariadb -e "DROP DATABASE wp_aiproduktion_se; DROP USER 'wp_aiproduktion_se'@'localhost';"`).
4. Renew the certificate without the old names: the certbot command from step 4 without
   `--expand` and without `-d aiproduktion.se -d www.aiproduktion.se` (certbot asks you to confirm).
5. The old site's backups in `/srv/wp-backups/aiproduktion.se` can be kept or deleted.

Installed phone apps belong to the old name: members open the new address once and add it to the
home screen again.
