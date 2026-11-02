# Prod VPS setup

One-time setup of the prod server, and how deploys, rollbacks and settings work afterwards. The files it installs are in `deploy/vps/`. The pipeline is `.github/workflows/deploy-prod.yml`.

## The setup at a glance

| | Test (ours) | Prod (live) |
|---|---|---|
| Branch | `dev` | `main` |
| App | Vercel, `some-app-mu.vercel.app` | Hostinger VPS `srv2120448.hstgr.cloud`, `187.124.131.7` (KVM 2: 2 CPUs, 8 GB RAM, Ubuntu) |
| Database | Supabase `hckf…` | Supabase `some-prod` (PMAGI AB, Pro, Stockholm) |
| Migrations | `npx supabase db push` from our terminal (linked to dev) | the pipeline, on merge to `main` |

Work goes to `dev` and is tested on Vercel. Then a pull request merges `dev` into `main`. The merge runs the pipeline:

1. **Push migrations** to the prod database. They go first because `next build` prerenders pages that read the database.
2. **Build** the new commit on the VPS, in its own folder. The live site keeps running.
3. **Release**: point the live folder at the new build and restart the app (a couple of seconds). If the new build doesn't answer within a minute, the server switches back to the old one by itself.

If any step fails, the old app stays live. Migrations stay additive, because the old app runs on the new database until the switch, or for longer if the build fails.

Our terminal stays linked to dev. Nobody runs `supabase link` against prod.

## Security

- **Secrets are never in the repo.** Prod app values live only in `/srv/some/shared/.env.production` on the VPS, readable by `deploy` only. The pipeline's secrets live in GitHub secrets.
- **You log in with your own SSH key**, as your own sudo user. Root login and passwords over SSH are off.
- **The app runs as `deploy`**, listens only on `127.0.0.1`, can write only under `/srv/some`, and can't gain privileges. `deploy` may run exactly one command with sudo: restarting the app.
- **nginx is the only door in.** It drops requests for the bare IP and for unknown host names, and it overwrites the client-IP headers the rate limits trust.
- **The firewall allows only SSH, HTTP and HTTPS.** fail2ban blocks repeated failed logins. Security updates install themselves.
- **GitHub Actions' SSH key can run only the deploy script**: no shell, no forwarding. The script accepts only `build` or `release` plus a 40-character commit ID.
- **The VPS reads the repo with a read-only deploy key.**
- **The workflow pins its actions to commit IDs**, deploys only from `main`, and deletes its SSH key at the end.

## Performance

- **One app process, on purpose.** `cacheComponents` keeps `'use cache'` entries and their `updateTag` invalidation in the process's memory. A second process would serve stale pages after a write.
- **nginx serves `/_next/static`** (the hashed JS/CSS) straight from disk with gzip and a one-year browser cache, so Node only renders pages.
- **Streaming stays on.** nginx doesn't buffer responses, so Suspense content streams to the browser as it's ready, as the Next.js self-hosting guide requires.
- **Kept-open connections** between nginx and the app; HTTP/2 to browsers after HTTPS is on (Part 9).
- **Builds run at low priority** (`nice`, `ionice`) and reuse the previous build's cache, so a deploy doesn't slow the live site.
- **Each build gets a deployment ID.** A tab still open from the old build does a full reload, instead of failing on files that are gone.
- **The database is in Stockholm.** Check where the VPS is (Part 2). Every page render talks to the database, so the VPS should be in Europe too, ideally Lithuania or the Netherlands.

## Part 1: on your PC

Use **Git Bash**, opened in the project folder (`C:\Users\Lenovo\Desktop\Chat-PWA`). Windows has SSH built in; check it:
```bash
ssh -V
```

1. **Your own login key.** Give it a passphrase when asked. It protects the key if your laptop is stolen. Skip this step if `~/.ssh/id_ed25519` already exists.
   ```bash
   ssh-keygen -t ed25519 -C "peter-some-prod"
   ```
2. **The key for GitHub Actions.** It has no passphrase, because the pipeline can't type one:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/some_github_actions -N "" -C "github-actions-deploy"
   ```
3. Show your public key, to paste into hPanel next:
   ```bash
   cat ~/.ssh/id_ed25519.pub
   ```

## Part 2: Hostinger panel and first login

1. **hPanel → VPS → Manage.** On the overview, check and tell me:
   - **Operating system**: it should be plain **Ubuntu** (ours is **26.04 LTS**). If it shows a panel or app template (CloudPanel, Coolify, …), stop and ask: that brings its own web server, and changing the OS wipes the server.
   - **Location** of the server (see Performance above).
2. **SSH keys** (in the VPS settings): **Add SSH key**, and paste the `.pub` line from Part 1, step 3.
3. **Root password**: set a strong one and keep it in your password manager. You only need it for hPanel's browser terminal, in an emergency.
4. **Log in from Git Bash:**
   ```bash
   ssh root@187.124.131.7
   ```
   The first time, SSH shows the server's fingerprint (`SHA256:…`) and asks whether to trust it. To make sure you're talking to the real server, open hPanel's **Browser terminal** and run:
   ```bash
   ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
   ```
   If the `SHA256:…` values match, type `yes`. Write the fingerprint down; you'll need it again in Part 7.

## Part 3: hardening (as root on the VPS)

1. Update everything, and install what we need. This runs without questions: it keeps the server's own config files, and restarts updated services by itself.
   ```bash
   export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a && apt-get update && apt-get -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold -y full-upgrade && apt-get -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold -y install unattended-upgrades fail2ban python3-systemd ufw git nginx curl
   ```
2. **Install security updates automatically**, and check it. The dry run must end without errors:
   ```bash
   printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades && unattended-upgrade --dry-run 2>&1 | tail -3
   ```
   Automatic reboots stay off, so the site never goes down by surprise. Part 3, step 8 shows how to check whether a reboot is waiting.
3. **fail2ban**: it watches SSH logins through the system journal, because newer Ubuntu keeps no `auth.log` file. Five failed logins in 10 minutes bans that address for an hour:
   ```bash
   printf '[sshd]\nenabled = true\nbackend = systemd\nmaxretry = 5\nfindtime = 10m\nbantime = 1h\n' > /etc/fail2ban/jail.local && systemctl enable fail2ban && systemctl restart fail2ban && sleep 2 && fail2ban-client status sshd
   ```
   It must print `Status for the jail: sshd`.
4. **Your own admin user.** First check which keys may log in as root. It should show exactly one line, ending in `peter-some-prod`:
   ```bash
   cat /root/.ssh/authorized_keys
   ```
   Create the user. Choose a strong password, kept in your password manager: `sudo` asks for it. Press Enter for the name, room and phone questions, then **Y**:
   ```bash
   adduser peter
   ```
   Give it sudo and your key, then check:
   ```bash
   usermod -aG sudo peter && install -d -m 700 -o peter -g peter /home/peter/.ssh && install -m 600 -o peter -g peter /root/.ssh/authorized_keys /home/peter/.ssh/authorized_keys && id peter && ls -la /home/peter/.ssh
   ```
   `id` must list `sudo`. `authorized_keys` must be `-rw-------` and owned by `peter peter`.
5. **Keep this root window open.** In a **second** Git Bash window, check the new login and sudo:
   ```bash
   ssh peter@187.124.131.7
   ```
   ```bash
   sudo -v
   ```
   Go on only if both work.
6. **Turn off root login and SSH passwords** (back in the root window). The file name starts with `00` on purpose: SSH uses the first value it reads, and Hostinger's image may ship a later file that turns passwords on.

   One exception keeps hPanel's **Web console** working for emergencies. It logs in as root from `169.254.0.1`, a link-local address that can't come from the internet. That exception goes at the very end of the main file, so nothing after it gets caught in it:
   ```bash
   printf 'PermitRootLogin no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\n' > /etc/ssh/sshd_config.d/00-hardening.conf && printf '\n# hPanel Web console (link-local, never from the internet)\nMatch Address 169.254.0.0/16\n    PermitRootLogin yes\n    PasswordAuthentication yes\n' >> /etc/ssh/sshd_config && sshd -t && systemctl restart ssh
   ```
   Restarting SSH keeps open sessions. Check that it took effect. From the internet, it must print `permitrootlogin no` and `passwordauthentication no`:
   ```bash
   sshd -T -C user=root,host=x,addr=203.0.113.9 | grep -E '^(permitrootlogin|passwordauthentication) '
   ```
   From the Web console's address, it must print `yes` twice:
   ```bash
   sshd -T -C user=root,host=x,addr=169.254.0.1 | grep -E '^(permitrootlogin|passwordauthentication) '
   ```
   Then, in a new Git Bash window, `ssh root@187.124.131.7` must be refused, while `ssh some-prod` still works. hPanel's Web console must still open.
7. **Firewall:**
   ```bash
   ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable && ufw status
   ```
8. Restart if the updates asked for it:
   ```bash
   [ -f /var/run/reboot-required ] && reboot
   ```

**On your PC**, add a short name for the server. Put these four lines in `~/.ssh/config` (create the file if it's missing):
```
Host some-prod
  HostName 187.124.131.7
  User peter
  IdentityFile ~/.ssh/id_ed25519
```
From now on, log in with:
```bash
ssh some-prod
```

## Part 4: Node.js, the deploy user and the folders (as peter, with sudo)

1. **Node.js 22 from NodeSource.** Node 22 matches `"node": ">=22"` in `package.json` and what the code is tested with. Why NodeSource and not Ubuntu's own `nodejs` (22.22 on 26.04):
   - NodeSource ships the official Node build with its matching npm.
   - Its updates can install themselves (below), while Ubuntu's `nodejs` lives in "universe", whose security fixes need Ubuntu Pro.

   Install it, and check that apt picks NodeSource's copy:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh && sudo bash /tmp/nodesource_setup.sh && rm /tmp/nodesource_setup.sh && sudo apt-get install -y nodejs && node -v && npm -v && apt-cache policy nodejs | head -3
   ```
   It must print `v22.…`, an npm version, and a `Candidate:` ending in `nodistro`. If the candidate ends in `ubuntu…` instead, stop and ask.

   Let Node's security updates install themselves, like Ubuntu's own. The running app keeps the old version until its next restart or deploy:
   ```bash
   echo 'Unattended-Upgrade::Origins-Pattern { "site=deb.nodesource.com"; };' | sudo tee /etc/apt/apt.conf.d/52unattended-upgrades-nodesource && sudo unattended-upgrade --dry-run --debug 2>&1 | grep -i "nodesource" | head -2
   ```
   It must show a line mentioning `deb.nodesource.com`. Node 22 is supported until April 2027. Before then, move Vercel and the VPS to Node 24 together.
2. The `deploy` user, which builds and runs the app. It has no password, so nobody can log in as it with one:
   ```bash
   sudo adduser --disabled-password --comment "" deploy
   ```
   ```bash
   sudo install -d -m 755 -o deploy -g deploy /srv/some /srv/some/releases /srv/some/shared && sudo install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
   ```
3. Let `deploy` restart the app with sudo, and nothing else:
   ```bash
   echo 'deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart some.service' | sudo tee /etc/sudoers.d/some-deploy && sudo chmod 440 /etc/sudoers.d/some-deploy && sudo visudo -cf /etc/sudoers.d/some-deploy
   ```
   It must print `parsed OK`.

## Part 5: repo access, read-only

1. Make the VPS's key for reading the repo, and print it:
   ```bash
   sudo -u deploy ssh-keygen -t ed25519 -f /home/deploy/.ssh/github -N "" -C "some-vps-read"
   ```
   ```bash
   sudo cat /home/deploy/.ssh/github.pub
   ```
2. In GitHub: **SoMe-App → Settings → Deploy keys → Add deploy key**. Title it `some-vps`, paste the key, and leave **Allow write access** off.
3. Point `deploy` at that key, trust GitHub's host key, and clone:
   ```bash
   printf 'Host github.com\n  IdentityFile ~/.ssh/github\n  IdentitiesOnly yes\n' | sudo -u deploy tee /home/deploy/.ssh/config
   ```
   ```bash
   sudo -u deploy sh -c 'ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts'
   ```
   ```bash
   sudo -u deploy git clone --mirror git@github.com:Ahsan-Faraz/SoMe-App.git /srv/some/repo
   ```
   You can check GitHub's host key against GitHub's published fingerprint (`SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`):
   ```bash
   sudo -u deploy ssh-keygen -lf /home/deploy/.ssh/known_hosts
   ```

## Part 6: the server files and the app's prod settings

1. **Copy the files from your PC.** Run this in Git Bash in the project folder:
   ```bash
   scp deploy/vps/some-deploy.sh deploy/vps/some.service deploy/vps/nginx-some.conf some-prod:/tmp/
   ```
2. **Install them on the server.** They're owned by root, so a pipeline run can't change them:
   ```bash
   sudo install -o root -g root -m 755 /tmp/some-deploy.sh /usr/local/bin/some-deploy && sudo install -o root -g root -m 644 /tmp/some.service /etc/systemd/system/some.service && sudo systemctl daemon-reload && sudo systemctl enable some.service
   ```
   The app doesn't start yet. The first release starts it.
3. **The env file.** Create it empty and private, then open it:
   ```bash
   sudo install -o deploy -g deploy -m 600 /dev/null /srv/some/shared/.env.production
   ```
   ```bash
   sudo -u deploy nano /srv/some/shared/.env.production
   ```
   Paste the contents of `deploy/vps/env.production.example` and fill in each value. The comments there say where each one comes from:

   | Setting | Where it comes from |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | some-prod → Project Settings → API Keys: `https://<id>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same page, **Publishable key** (`sb_publishable_…`) |
   | `SUPABASE_SECRET_KEY` | same page, **Secret keys** → new key named `vps` (`sb_secret_…`) |
   | `BREVO_API_KEY` | client's Brevo → SMTP & API → API keys |
   | `EMAIL_FROM` | a sender address verified in Brevo, e.g. `no-reply@theirl.net` |
   | `DEFAULT_COMMUNITY` | slug of the community shown at `/`. **Leave the line commented out (`#`) until it has a value.** An empty `DEFAULT_COMMUNITY=` makes `/` redirect to itself. Unset, it's `biking-stockholm` |
   | `COMMUNITY_DOMAINS` | leave it commented out for now |

   Save with Ctrl+O, Enter, then Ctrl+X.

## Part 7: the pipeline's SSH key

1. **Copy its public key to the server** (Git Bash, on your PC):
   ```bash
   scp ~/.ssh/some_github_actions.pub some-prod:/tmp/
   ```
2. **On the server: let that key run only the deploy script.**
   ```bash
   echo "restrict,command=\"/usr/local/bin/some-deploy\" $(cat /tmp/some_github_actions.pub)" | sudo -u deploy tee -a /home/deploy/.ssh/authorized_keys && sudo chmod 600 /home/deploy/.ssh/authorized_keys && rm /tmp/some_github_actions.pub
   ```
3. **Test from your PC** that the key gets no shell. It must print only the `usage: some-deploy …` line:
   ```bash
   ssh -i ~/.ssh/some_github_actions deploy@187.124.131.7 "ls /"
   ```
4. **The host-key line for GitHub:**
   ```bash
   ssh-keyscan -t ed25519 187.124.131.7 2>/dev/null
   ```
   Check its fingerprint matches the one you noted in Part 2:
   ```bash
   ssh-keyscan -t ed25519 187.124.131.7 2>/dev/null | ssh-keygen -lf -
   ```

## Part 8: GitHub settings

1. **Settings → Environments → New environment**, named `production`. Under **Deployment branches and tags**, choose **Selected branches** and add `main`. Then add these **environment secrets**:

   | Secret | Value |
   |---|---|
   | `VPS_HOST` | `187.124.131.7` |
   | `VPS_SSH_KEY` | the whole private file: `cat ~/.ssh/some_github_actions`, including the BEGIN and END lines |
   | `VPS_KNOWN_HOSTS` | the line from Part 7, step 4 (starts with `187.124.131.7 ssh-ed25519`) |
   | `PROD_DB_URL` | some-prod → **Connect** → **Session pooler** URI, with the database password filled in |

   For `PROD_DB_URL`:
   - It looks like `postgresql://postgres.<id>:<password>@aws-…-eu-north-1.pooler.supabase.com:5432/postgres`. Copy it from Supabase rather than typing it.
   - Use the **Session pooler**, not the direct `db.<id>.supabase.co` address. The direct one is IPv6 only, and GitHub's runners can't reach it.
   - If the password has special characters, percent-encode them: `@` → `%40`, `#` → `%23`, `/` → `%2F`, `:` → `%3A`, `?` → `%3F`, `%` → `%25`.

   Once the secrets are saved, delete the pipeline key from your PC:
   ```bash
   rm ~/.ssh/some_github_actions ~/.ssh/some_github_actions.pub
   ```
2. **Settings → Branches → Add branch ruleset** for `main`: require a pull request before merging, and block force pushes and deletion.

If the repo is private on GitHub's free plan, the **Environments** and branch-protection pages may be locked behind a paid plan. In that case:
- put the four secrets under **Settings → Secrets and variables → Actions** instead;
- delete the `environment: production` line from the workflow.

The workflow's own `main`-only check still applies.

## Part 9: first release, nginx and HTTPS

The prod database is filled by the pipeline on the first merge to `main`, after the client approves.

1. **First release.** When the client approves, open a pull request from `dev` into `main` and merge it. Follow the run under **Actions → Deploy to prod**. It can also be started by hand there (**Run workflow**, branch `main`). Then check on the server:
   ```bash
   sudo systemctl status some.service --no-pager
   ```
   ```bash
   curl -sI -H "Host: theirl.net" http://127.0.0.1:3000/ | head -5
   ```
2. **nginx:**
   ```bash
   sudo install -o root -g root -m 644 /tmp/nginx-some.conf /etc/nginx/sites-available/some && sudo ln -sf /etc/nginx/sites-available/some /etc/nginx/sites-enabled/some && sudo rm -f /etc/nginx/sites-enabled/default && sudo nginx -t && sudo systemctl reload nginx
   ```
   Test it from your PC before any DNS change:
   ```bash
   curl -sI -H "Host: theirl.net" http://187.124.131.7/ | head -5
   ```
3. **DNS at Oderland** (at go-live). Change only the website records. **Never touch MX** (email), **TXT** (SPF, site verifications) **or the nameservers.** Every change can be undone by putting the old value back.

   What the domains looked like on 2026-11-02:

   | Domain | Today | Change at go-live |
   |---|---|---|
   | `aiproduktion.se` | `@` **A** `91.201.62.9` and **AAAA** `2a02:28f0:304f:2c::` (Oderland web hosting, shows a 404); `www` is a **CNAME** to `@`; email at Oderland (MX); TTL 2 hours | `@` **A** → `187.124.131.7`. **AAAA** → the VPS's IPv6 from hPanel, or delete it. Leave the `www` CNAME as it is: it follows `@`. |
   | `theirl.net` | registered 2026-10-28 and pointed at Oderland's nameservers, but Oderland has no DNS zone for it yet, so it resolves nowhere | The client creates the zone in Oderland, with `@` **A** `187.124.131.7` and `www` **CNAME** `theirl.net` |

   Steps:
   1. **Write down the current records** (a screenshot of Oderland's DNS page), so you can undo.
   2. **One day before:** lower the TTL of the records you'll change to 300 seconds. Then the change, and an undo, take effect in about 5 minutes instead of 2 hours.
   3. **Do `aiproduktion.se` first.** The client called it the test domain. Do `theirl.net` when that works.
   4. Check from your PC that the name returns `187.124.131.7`:
      ```bash
      nslookup aiproduktion.se 1.1.1.1
      ```
   5. **To undo**, put the old A and AAAA values back.
4. **HTTPS.** Certbot adds the certificates and the http → https redirect, and renews them by itself. Only name domains that already point to the VPS, or Certbot fails. For example, `aiproduktion.se` first:
   ```bash
   sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d aiproduktion.se -d www.aiproduktion.se --redirect
   ```
   When `theirl.net` points to the VPS too, run the same command with `-d theirl.net -d www.theirl.net`.
   ```bash
   sudo certbot renew --dry-run
   ```
5. **HTTP/2.** Ubuntu 26.04's nginx uses the newer setting: open the site file, and on a new line inside the server block Certbot changed (the one with `listen 443 ssl`), add `http2 on;`. Then test and reload:
   ```bash
   sudo nano /etc/nginx/sites-available/some
   ```
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

## Part 10: the Supabase prod project

- **Authentication**: copy the settings from the dev project (`hckf…`) one by one: Sign In / Providers, Emails (templates), Rate limits. The current code works with those. Then change the URL Configuration for prod:
  - Site URL: `https://theirl.net`
  - Redirect URLs: `https://theirl.net/**`, `https://www.theirl.net/**`, `https://aiproduktion.se/**`, `https://www.aiproduktion.se/**`
- **Authentication → Emails → SMTP**: Brevo, from the client's account. Supabase's built-in email sends only a few messages an hour.
- **Database → Settings**: turn on **Enforce SSL**.
- Ask the client to turn on **two-factor login** for the Supabase and Hostinger accounts, because they hold everything.

## Day to day

- **Deploy:** open a pull request from `dev` into `main` and merge it. Nothing else.
- **Logs:**
  ```bash
  sudo journalctl -u some.service -n 200 --no-pager
  ```
- **Change a setting:** edit `/srv/some/shared/.env.production`, then restart the app:
  ```bash
  sudo systemctl restart some.service
  ```
  A `NEXT_PUBLIC_` setting is baked into the build, so a restart isn't enough. Merge a new commit to `main` so it gets rebuilt.
- **Roll back:** the last five builds stay on disk. List them, newest first, then release the one you want. This switches only the app, and database changes stay, which is why migrations only add things.
  ```bash
  ls -1t /srv/some/releases
  ```
  ```bash
  sudo -u deploy some-deploy release <sha>
  ```
- **Update a server file** (the deploy script, the service or nginx): copy it with `scp` and install it again, as in Part 6 or Part 9.
