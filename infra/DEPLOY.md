# HomeHelp — Permanent Backend Hosting (no more tunnels)

The backend is a docker-compose stack (10 services + 9 Postgres DBs + Redis). Running it on a
VM with a **static public IP** gives the apps a permanent backend URL. Because the apps allow
cleartext HTTP (`androidScheme: 'http'`, `cleartext: true`), **no domain or HTTPS is required** —
the apps talk to `http://<vm-ip>:8080` directly.

## 1. Get a VM with a public IP

Pick one:

| Option | Cost | Notes |
|--------|------|-------|
| **Hetzner Cloud CX22** | ~€4/mo | Simplest & most reliable. 2 vCPU / 4 GB. Recommended. |
| **DigitalOcean / Vultr / Linode** | ~$6/mo | Same idea, 2 GB+ droplet. |
| **Oracle Cloud "Always Free" ARM** | Free forever | 4 ARM cores / 24 GB RAM. Best free option, but signup (card verify) is fiddly and capacity is sometimes unavailable. |

Choose **Ubuntu 22.04 or 24.04**. Give it **≥ 4 GB RAM** (the 9 Postgres containers need room).

## 2. Open port 8080

- In the cloud provider's **firewall / security group / security list**, allow inbound **TCP 8080**
  (and 22 for SSH). This is separate from the OS firewall — both must allow it.

## 3. Put the code on the VM

SSH in, then either:

```bash
# private repo → use a GitHub Personal Access Token as the password when prompted
git clone https://github.com/BabuBaji/Home-App.git HomeHelp
```
or copy it up from your PC: `scp -r C:/Users/Smartgrow/Home-App user@<vm-ip>:~/HomeHelp`

## 4. Configure secrets

```bash
cd HomeHelp/infra
cp .env.example .env
nano .env          # fill in real values you use locally:
                   #   RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET
                   #   GOOGLE_MAPS_KEY (if/when billing is on)
                   #   POSTGRES_PASSWORD, INTERNAL_KEY, ADMIN_SEED_* etc.
```

## 5. Deploy

```bash
bash deploy-vm.sh
```

It installs Docker, builds + starts the stack, and prints your public API URL:
`http://<vm-ip>:8080`.

## 6. Point the apps at it (permanent)

Edit `app-config.json` in the repo root:
```json
{ "apiBase": "http://<vm-ip>:8080" }
```
Commit & push to `Baji`. The customer & worker apps fetch this on launch — from now on they always
reach the VM. **The IP never changes, so this is the last time you touch the URL.**

## Keeping it running

- The stack is `restart: unless-stopped`-friendly; add `restart: unless-stopped` per service or just
  `docker compose up -d` again after a reboot. To auto-start on boot, Docker's service is already enabled.
- Update later: `git pull && docker compose -f infra/docker-compose.yml up -d --build`.

## Optional hardening (later)

- Put a domain in front + Caddy for HTTPS if you ever want `https://api.yourdomain.com`.
- Restrict 8080 to Cloudflare or a WAF.
- Move Razorpay to **live** keys for real UPI app launches.
