# Developer Guide — E-Commerce BI Platform

Everything a new developer needs to start working on this project.

---

## 1. Production Server (VDS)

| Detail | Value |
|--------|-------|
| **Provider** | Contabo VDS |
| **Hostname** | `vmi2680831.contaboserver.net` |
| **IP Address** | `38.242.226.83` |
| **OS** | Debian (Linux) |
| **SSH User** | `root` |
| **SSH Password** | `xsQR6YYA` |
| **Project Path** | `/root/EcommerceUI` |
| **Python** | 3.11 (virtualenv at `/root/EcommerceUI/venv`) |
| **Node.js** | 20.x |
| **Live App** | http://38.242.226.83:8000 |

### Connecting via SSH

```bash
ssh root@38.242.226.83
# Password: xsQR6YYA
```

Once connected, the project is at:
```bash
cd ~/EcommerceUI
```

### Setting Up SSH Key (recommended — no password needed)

If you want passwordless SSH (and for auto-deploy to work from your machine):

```bash
# On YOUR machine (Windows PowerShell):
ssh-keygen -t rsa -b 4096     # Press Enter for defaults, no passphrase

# Copy your public key to the server:
type $env:USERPROFILE\.ssh\id_rsa.pub | ssh root@38.242.226.83 "cat >> ~/.ssh/authorized_keys"

# Test — should connect without asking for password:
ssh root@38.242.226.83
```

---

## 2. Database (PostgreSQL)

| Detail | Value |
|--------|-------|
| **Host** | `38.242.226.83` |
| **Port** | `5432` |
| **Database** | `test` |
| **User** | `scraper` |
| **Password** | `Scraper123#` |
| **Connection String** | `postgresql://scraper:Scraper123#@38.242.226.83:5432/test` |

### Connecting with a GUI (DBeaver, pgAdmin, etc.)

Use the credentials above. The database is accessible remotely on port 5432.

### Connecting from terminal

```bash
# From the server:
psql -U scraper -d test -h localhost

# From your local machine:
psql -U scraper -d test -h 38.242.226.83
```

---

## 3. GitHub Repository

| Detail | Value |
|--------|-------|
| **Repo** | https://github.com/cata2lin/EcommerceUI |
| **Branch** | `main` (the only branch, auto-deploys) |
| **Owner** | `cata2lin` |

To get access, ask the owner to add you as a collaborator.

```bash
# Clone
git clone https://github.com/cata2lin/EcommerceUI.git
cd EcommerceUI
```

---

## 4. Local Development Setup

### Prerequisites

- **Python 3.10+** — https://python.org
- **Node.js 18+** — https://nodejs.org
- **Git** — https://git-scm.com

### Setup Steps

```bash
# 1. Clone
git clone https://github.com/cata2lin/EcommerceUI.git
cd EcommerceUI

# 2. Python backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux/Mac
pip install -r requirements.txt

# 3. Frontend
cd frontend
npm install
cd ..

# 4. Environment
copy .env.example .env         # Windows
# cp .env.example .env         # Linux/Mac
```

Edit `.env` with the production database credentials (see Section 2 above) or point to a local DB.

### Running Locally

You need **two terminals**:

```bash
# Terminal 1 — Backend (port 8000):
venv\Scripts\activate
python -m uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — Frontend dev server (port 5173):
cd frontend
npm run dev
```

- **Frontend**: http://localhost:5173 (hot-reload, talks to backend at :8000)
- **Backend API docs**: http://localhost:8000/docs (Swagger UI)

---

## 5. Making Changes & Deploying

### The Workflow

```
You code locally → Test → git commit → git push origin main → Auto-deployed in ~10 seconds
```

**Every push to `main` automatically deploys to production.** No manual steps needed.

### Step by Step

```bash
# 1. Make your changes, test locally

# 2. Stage and commit
git add -A
git commit -m "feat: your description here"

# 3. Push — triggers auto-deploy
git push origin main

# 4. Watch it deploy (two options):
#    a) In the app: go to Sidebar → Deployments → Live Log tab
#    b) On the server: ssh root@38.242.226.83 "tail -f /var/log/ecommerce-deploy.log"
```

### Commit Message Conventions

| Prefix | When to use | Example |
|--------|-------------|---------|
| `feat:` | New feature | `feat: add export button to analytics` |
| `fix:` | Bug fix | `fix: correct price calculation rounding` |
| `style:` | UI/CSS only | `style: update sidebar hover colors` |
| `refactor:` | Code restructure | `refactor: extract scoring logic to utils` |
| `docs:` | Documentation | `docs: update API descriptions` |

### What the Auto-Deploy Does

1. Pulls latest code from `main`
2. Checks if `requirements.txt` changed → installs Python deps
3. Checks if `package.json` changed → installs npm deps
4. Builds frontend (`npm run build` → outputs to `api/frontend_dist/`)
5. Restarts the API service
6. Runs health check — **if it fails, automatically rolls back**

---

## 6. Server Management

### Services Running

| Service | Port | Systemd Unit |
|---------|------|--------------|
| FastAPI App | 8000 | `ecommerce-api` |
| Webhook Listener | 9000 | `ecommerce-webhook` |

### Common Commands (run on server via SSH)

```bash
# ─── Service Status ───
systemctl status ecommerce-api
systemctl status ecommerce-webhook

# ─── Restart ───
systemctl restart ecommerce-api

# ─── View Logs ───
journalctl -u ecommerce-api -f              # API logs (live)
journalctl -u ecommerce-api --since "1h ago" # Last hour
journalctl -u ecommerce-webhook -f           # Webhook logs
tail -f /var/log/ecommerce-deploy.log        # Deploy logs

# ─── Manual Deploy ───
sudo ~/EcommerceUI/deploy/autodeploy.sh

# ─── Check Ports ───
ss -tlnp | grep -E '8000|9000|5432'

# ─── Edit Environment Variables ───
nano ~/EcommerceUI/.env
systemctl restart ecommerce-api   # Restart to pick up changes
```

### If Something Goes Wrong

```bash
# Check API logs for errors
journalctl -u ecommerce-api -n 50 --no-pager

# Try running manually to see the error
cd ~/EcommerceUI
source venv/bin/activate
python -m uvicorn api.main:app --host 0.0.0.0 --port 8000

# If deploy is stuck (lock file)
rm -f /tmp/ecommerce-deploy.lock

# If a deploy broke the app, manually revert
cd ~/EcommerceUI
git log --oneline -5           # Find the last working commit
git reset --hard <commit_hash>
systemctl restart ecommerce-api
```

---

## 7. Project Structure

```
EcommerceUI/
├── api/                        # Backend (FastAPI + Python)
│   ├── main.py                 # App entry, CORS, middleware, routers
│   ├── core/                   # Business logic
│   │   ├── product_scorer.py   # Product scoring algorithm
│   │   ├── search_utils.py     # Search/filter logic
│   │   ├── mv_scheduler.py     # Materialized view refresh scheduler
│   │   └── cache_utils.py      # Caching utilities
│   └── routes/                 # API endpoints (one file per feature)
│       ├── auth.py             # Login, session, JWT cookies
│       ├── dashboard.py        # Main product grid + filters
│       ├── sidebar.py          # Sidebar data (parsers, counts)
│       ├── product_detail.py   # Single product view
│       ├── product_pipeline.py # Pipeline management
│       ├── bestsellers.py      # Best sellers ranking
│       ├── opportunities.py    # Opportunity finder
│       ├── analytics.py        # Analytics & charts
│       ├── parser_status.py    # Scraper status dashboard
│       ├── config.py           # App configuration
│       ├── system_monitoring.py# DB/MV health monitoring
│       └── deployments.py      # Deploy history API
├── db/                         # Database layer (SQLAlchemy)
│   ├── models.py               # All database models
│   ├── session.py              # DB connection + session factory
│   └── settings_utils.py       # Default settings seeder
├── frontend/                   # React + TypeScript + Vite
│   ├── src/
│   │   ├── api/index.ts        # All API calls (single file, axios)
│   │   ├── pages/              # One .tsx + .css per page
│   │   ├── components/Layout/  # Sidebar, Layout shell
│   │   └── contexts/           # AuthContext, ThemeContext, SidebarContext
│   ├── package.json            # npm dependencies
│   └── vite.config.ts          # Build config → outputs to api/frontend_dist/
├── deploy/                     # CI/CD auto-deploy infrastructure
│   ├── autodeploy.sh           # Main deploy script
│   ├── webhook_listener.py     # GitHub webhook server (:9000)
│   ├── ecommerce-api.service   # Systemd unit for the API
│   ├── ecommerce-webhook.service # Systemd unit for webhook
│   ├── setup_server.sh         # One-time server bootstrap
│   └── README.md               # Deploy system documentation
├── .env                        # Secrets (NOT in git)
├── .env.example                # Template for .env
├── requirements.txt            # Python dependencies
└── DEVELOPER_GUIDE.md          # This file
```

---

## 8. Adding New Features

### New Backend Endpoint

1. Create a new file: `api/routes/your_feature.py`
2. Define a router:
   ```python
   from fastapi import APIRouter, Depends
   from api.routes.auth import get_current_user

   router = APIRouter()

   @router.get("/api/your-feature")
   async def get_data(_user=Depends(get_current_user)):
       return {"data": "hello"}
   ```
3. Register it in `api/main.py`:
   ```python
   from api.routes import your_feature
   app.include_router(your_feature.router, tags=["Your Feature"])
   ```
4. Add the API call in `frontend/src/api/index.ts`:
   ```typescript
   export const fetchYourFeature = () => api.get('/api/your-feature');
   ```

### New Frontend Page

1. Create `frontend/src/pages/YourPage.tsx` and `YourPage.css`
2. Add the route in `frontend/src/App.tsx`:
   ```tsx
   import YourPage from './pages/YourPage';
   // Inside AppRoutes:
   <Route path="/your-page" element={<YourPage />} />
   ```
3. Add sidebar link in `frontend/src/components/Layout/Sidebar.tsx`

### New Dependencies

```bash
# Python — auto-installed on next deploy
pip install some-package
pip freeze | grep some-package >> requirements.txt

# npm — auto-installed on next deploy
cd frontend && npm install some-package
```

---

## 9. Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection | `postgresql://scraper:Scraper123#@38.242.226.83:5432/test` |
| `SECRET_KEY` | JWT signing key | Any random string |
| `GEMINI_API_KEY` | Google Gemini API key | `AIzaSy...` |
| `FRONTEND_DEV_URL` | Frontend dev URL (CORS) | `http://localhost:5173` |

> ⚠️ `.env` is **not in git**. If you add a new variable, update `.env.example` too.
> The `.env` on the server is at `/root/EcommerceUI/.env` — edit with `nano`.

---

## 10. Quick Reference

| What | Where |
|------|-------|
| Live app | http://38.242.226.83:8000 |
| GitHub repo | https://github.com/cata2lin/EcommerceUI |
| SSH | `ssh root@38.242.226.83` (password: `xsQR6YYA`) |
| Database | `psql -U scraper -h 38.242.226.83 -d test` (password: `Scraper123#`) |
| Deploy logs | SSH → `tail -f /var/log/ecommerce-deploy.log` |
| API docs | http://38.242.226.83:8000/docs |
| Deploy dashboard | http://38.242.226.83:8000/deployments |
