# 🚀 Auto-Deploy Pipeline

Automatic deployment from GitHub to production server on every push to `main`.

## Architecture

```
GitHub Push → Webhook (POST :9000) → autodeploy.sh → systemd restart → Health Check
```

| Component | Port | Service |
|---|---|---|
| FastAPI App | 8000 | `ecommerce-api.service` |
| Webhook Listener | 9000 | `ecommerce-webhook.service` |

## Initial Server Setup

**Run once on the production server:**

```bash
# Option A: Run directly from GitHub
ssh root@38.242.226.83
curl -sL https://raw.githubusercontent.com/cata2lin/EcommerceUI/main/deploy/setup_server.sh | bash

# Option B: Copy and run
scp deploy/setup_server.sh root@38.242.226.83:/tmp/
ssh root@38.242.226.83 'bash /tmp/setup_server.sh'
```

The setup script will:
1. Install Python 3, Node.js 20, git
2. Clone the repository to `/opt/ecommerce`
3. Create a Python virtualenv and install dependencies
4. Build the frontend
5. Generate a webhook secret (printed at the end — **save it!**)
6. Install and start both systemd services
7. Open firewall ports (22, 8000, 9000)

## Configure GitHub Webhook

After running setup, configure the webhook in GitHub:

1. Go to **https://github.com/cata2lin/EcommerceUI/settings/hooks/new**
2. Fill in:
   - **Payload URL:** `http://38.242.226.83:9000/webhook`
   - **Content type:** `application/json`
   - **Secret:** *(the secret printed by setup_server.sh)*
   - **Which events:** Select "Just the push event"
3. Click **Add webhook**

GitHub will send a ping — check the **Recent Deliveries** tab for a `200` response.

## How It Works

### Deploy Flow (`autodeploy.sh`)

1. **Lock** — Acquires a lock file to prevent concurrent deployments
2. **Git Pull** — Fetches and resets to latest `origin/main`
3. **Python Deps** — Only runs `pip install` if `requirements.txt` hash changed
4. **Node Deps** — Only runs `npm install` if `package.json` hash changed
5. **Frontend Build** — Always runs `npm run build` (outputs to `api/frontend_dist/`)
6. **Restart** — `systemctl restart ecommerce-api`
7. **Health Check** — Polls `/api/health` for 30 seconds
8. **Rollback** — If health check fails, reverts to previous commit and restarts

### Why It Survives Stack Changes

| Change | Handled By |
|---|---|
| New npm package (Tailwind, etc.) | `package.json` hash changes → `npm install` auto-runs |
| New Python dependency | `requirements.txt` hash changes → `pip install` auto-runs |
| Vite config / build config | `npm run build` runs every deploy |
| Framework swap | Still works if `npm run build` stays the command |
| New env var needed | Add to `.env` on server (one-time, manual) |

## Common Commands

```bash
# Service management
systemctl status ecommerce-api        # Check API status
systemctl status ecommerce-webhook    # Check webhook status
systemctl restart ecommerce-api       # Manual restart

# Logs
tail -f /var/log/ecommerce-deploy.log            # Deploy logs
journalctl -u ecommerce-api -f                   # API logs
journalctl -u ecommerce-webhook -f               # Webhook logs
journalctl -u ecommerce-api --since "1 hour ago" # Recent API logs

# Manual deploy (skip webhook)
sudo /opt/ecommerce/deploy/autodeploy.sh

# Check webhook secret
cat /opt/ecommerce/deploy/.webhook_secret

# Check dependency hashes
ls -la /var/lib/ecommerce-deploy/
```

## Troubleshooting

### Deploy stuck / concurrent deploy blocked
```bash
# Remove stale lock file
rm -f /tmp/ecommerce-deploy.lock
```

### API won't start
```bash
# Check logs
journalctl -u ecommerce-api -n 50

# Check .env exists
cat /opt/ecommerce/.env

# Test manually
cd /opt/ecommerce
.venv/bin/uvicorn api.main:app --host 0.0.0.0 --port 8000
```

### Webhook not receiving events
```bash
# Check webhook is running
systemctl status ecommerce-webhook

# Check firewall
ufw status

# Test locally
curl http://localhost:9000/health
```

### Frontend not building
```bash
# Check Node version
node --version  # Should be 18+

# Try manual build
cd /opt/ecommerce/frontend
npm install
npm run build
```

## File Structure

```
deploy/
├── autodeploy.sh              # Main deploy script (runs on push)
├── webhook_listener.py         # GitHub webhook HTTP server
├── ecommerce-api.service       # Systemd unit for FastAPI
├── ecommerce-webhook.service   # Systemd unit for webhook listener
├── setup_server.sh             # One-time server bootstrap
├── .webhook_secret             # HMAC secret (generated, gitignored)
└── README.md                   # This file
```
