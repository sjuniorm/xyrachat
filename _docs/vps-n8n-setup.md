# VPS + n8n self-host setup (Hetzner CX22, Ubuntu 24.04)

A hardened, auto-HTTPS n8n you own, for running the Xyra Chat integrations
(Make/Zapier/n8n connectors point at the public REST API + outbound webhooks).
Caddy gives automatic Let's Encrypt TLS — no certbot cron to babysit.

**Prereqs**
- A Hetzner CX22 (or any 2 vCPU / 4 GB Ubuntu 24.04 box).
- A subdomain you control, e.g. `n8n.xyrachat.com`, with an **A record → the
  server's IPv4** (and AAAA → IPv6 if you want). DNS must resolve before step 5
  or Let's Encrypt can't issue the cert.
- Your SSH public key (`~/.ssh/id_ed25519.pub`). If you don't have one:
  `ssh-keygen -t ed25519`.

---

## 1) Rebuild + first login
Hetzner Console → server → **Rebuild** → Ubuntu 24.04 (wipes whatever junk was
on it). Then from your laptop:

```bash
ssh root@<SERVER_IP>
```

## 2) Create a non-root sudo user + add your key
```bash
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
# paste YOUR public key into authorized_keys:
nano /home/deploy/.ssh/authorized_keys      # paste the contents of id_ed25519.pub
chmod 600 /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
```
Verify in a **second terminal** (don't close root yet):
`ssh deploy@<SERVER_IP>` should log in with your key.

## 3) Harden SSH (key-only, no root login)
```bash
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

## 4) Firewall + fail2ban
```bash
sudo apt update && sudo apt -y install ufw fail2ban
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP (Let's Encrypt challenge + redirect)
sudo ufw allow 443/tcp     # HTTPS
sudo ufw --force enable
sudo systemctl enable --now fail2ban   # ships with an sshd jail on by default
```

## 5) Install Docker + compose plugin
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
# log out + back in (or `newgrp docker`) so the group applies:
exit
ssh deploy@<SERVER_IP>
docker run --rm hello-world   # sanity check
```

## 6) Project files
```bash
mkdir -p ~/n8n && cd ~/n8n
```

Create **`.env`** (fill the bracketed values; generate the secrets):
```bash
cat > .env <<'EOF'
# --- domain ---
N8N_DOMAIN=n8n.xyrachat.com
LETSENCRYPT_EMAIL=you@xyrachat.com

# --- n8n basic auth (the login wall in front of the editor) ---
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=__set_a_strong_password__

# --- secrets: generate with `openssl rand -hex 24` ---
N8N_ENCRYPTION_KEY=__openssl_rand_hex_24__
POSTGRES_PASSWORD=__openssl_rand_hex_24__

# --- misc ---
GENERIC_TIMEZONE=Atlantic/Canary
EOF
chmod 600 .env
```

Create **`docker-compose.yml`**:
```yaml
services:
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    environment:
      - N8N_DOMAIN=${N8N_DOMAIN}
      - LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL}
    depends_on:
      - n8n

  n8n:
    image: docker.n8n.io/n8nio/n8n:latest
    restart: unless-stopped
    environment:
      - N8N_HOST=${N8N_DOMAIN}
      - N8N_PORT=5678
      - N8N_PROTOCOL=https
      - WEBHOOK_URL=https://${N8N_DOMAIN}/
      - N8N_EDITOR_BASE_URL=https://${N8N_DOMAIN}/
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=${N8N_BASIC_AUTH_USER}
      - N8N_BASIC_AUTH_PASSWORD=${N8N_BASIC_AUTH_PASSWORD}
      - N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}
      - GENERIC_TIMEZONE=${GENERIC_TIMEZONE}
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
      - DB_POSTGRESDB_DATABASE=n8n
      - DB_POSTGRESDB_USER=n8n
      - DB_POSTGRESDB_PASSWORD=${POSTGRES_PASSWORD}
      - N8N_PROXY_HOPS=1
    volumes:
      - n8n_data:/home/node/.n8n
    depends_on:
      - postgres
    # NOT published to the host — only Caddy reaches it over the compose network.
    expose:
      - "5678"

  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      - POSTGRES_USER=n8n
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=n8n
    volumes:
      - pg_data:/var/lib/postgresql/data
    expose:
      - "5432"

volumes:
  caddy_data:
  caddy_config:
  n8n_data:
  pg_data:
```

Create **`Caddyfile`** (Caddy auto-provisions + renews the TLS cert):
```caddy
{$N8N_DOMAIN} {
	encode zstd gzip
	reverse_proxy n8n:5678
	tls {$LETSENCRYPT_EMAIL}
}
```

## 7) Launch
```bash
docker compose up -d
docker compose logs -f caddy      # watch the cert get issued (a few seconds once DNS resolves)
```
Open `https://n8n.xyrachat.com` → basic-auth prompt → set up the n8n owner
account. Done.

## 8) Wire it to Xyra Chat
- In n8n, use the **Xyra Chat** community node (`@xyrachat/n8n-nodes-xyrachat`)
  once published, or the generic HTTP Request node against the public API
  (`https://<app>/api/v1/...`) with an **API key** (Settings → API & Webhooks).
- For inbound (Xyra → n8n), create an n8n **Webhook** node; register its URL as
  an outbound endpoint in Xyra (Settings → API & Webhooks → add endpoint), or let
  the connector's `POST /api/v1/webhooks/subscribe` do it.
- n8n's webhook URLs are public-by-design; the basic-auth wall protects the
  **editor**, not the webhook endpoints — secure individual webhooks with a
  header/secret in the workflow if they trigger sensitive actions.

## 9) Operations
- **Update n8n:** `cd ~/n8n && docker compose pull && docker compose up -d`
- **Logs:** `docker compose logs -f n8n`
- **Backup:** the important state is the `pg_data` volume + `n8n_data` (holds the
  encryption-key-dependent credentials) + your `.env` (the
  `N8N_ENCRYPTION_KEY` — **without it, stored credentials are unrecoverable**).
  Snapshot the Hetzner volume, or:
  `docker compose exec postgres pg_dump -U n8n n8n | gzip > n8n-$(date +%F).sql.gz`
  and copy `~/n8n/.env` somewhere safe.
- **Auto-restart on reboot:** `restart: unless-stopped` + Docker's systemd unit
  already handle it.

## Hardening notes
- Only 22/80/443 are open (ufw); Postgres + n8n are not published to the host —
  reachable only inside the compose network.
- SSH is key-only, root login disabled, fail2ban on the sshd jail.
- Rotate `N8N_BASIC_AUTH_PASSWORD` if shared. Consider Cloudflare/Tailscale in
  front of the editor if you want it off the public internet entirely.
- `N8N_PROXY_HOPS=1` tells n8n it's behind one reverse proxy (Caddy) so it reads
  the real client IP from `X-Forwarded-For`.
