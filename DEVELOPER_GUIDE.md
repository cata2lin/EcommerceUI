# Developer Guide — E-Commerce BI Platform

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/cata2lin/EcommerceUI.git
cd EcommerceUI

# 2. Backend setup
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux/Mac
pip install -r requirements.txt

# 3. Frontend setup
cd frontend
npm install
cd ..

# 4. Create .env from template
copy .env.example .env         # Windows
# cp .env.example .env         # Linux/Mac
# Edit .env with your database credentials

# 5. Run locally (two terminals)
# Terminal 1 — Backend:
python -m uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — Frontend dev server:
cd frontend
npm run dev
# Opens at http://localhost:5173
```

---

## How Deployments Work

**Every push to `main` is automatically deployed to production.**

```
git push origin main
  → GitHub sends webhook to the server
  → Server pulls code, installs deps, builds frontend, restarts API
  → Live at http://38.242.226.83:8000 in ~10 seconds
```

You can monitor deploys in the app: **Sidebar → Deployments**

### Making Changes

```bash
# 1. Make your changes locally
# 2. Test them with the local dev server

# 3. Commit
git add -A
git commit -m "feat: description of what you did"

# 4. Push — this triggers auto-deploy
git push origin main

# 5. Watch the deploy in the app at /deployments (Live Log tab)
```

### Commit Message Format

Use conventional commits for clarity:

| Prefix | When to use | Example |
|--------|-------------|---------|
| `feat:` | New feature | `feat: add export button to analytics` |
| `fix:` | Bug fix | `fix: correct price calculation rounding` |
| `style:` | UI/CSS changes | `style: update sidebar hover colors` |
| `refactor:` | Code restructure | `refactor: extract scoring logic to utils` |
| `docs:` | Documentation | `docs: update API endpoint descriptions` |

---

## Server Access (SSH)

```bash
# Connect
ssh root@38.242.226.83
# Password: xsQR6YYA

# Project location
cd ~/EcommerceUI
```

### Useful Server Commands

```bash
# Check service status
systemctl status ecommerce-api
systemctl status ecommerce-webhook

# View API logs
journalctl -u ecommerce-api -f

# View deploy logs
tail -f /var/log/ecommerce-deploy.log

# Manual deploy (skip webhook)
sudo ~/EcommerceUI/deploy/autodeploy.sh

# Restart API manually
systemctl restart ecommerce-api

# Check what's running on which port
ss -tlnp | grep -E '8000|9000'
```

---

## Project Structure

```
EcommerceUI/
├── api/                    # Backend (FastAPI)
│   ├── main.py             # App entry point, CORS, routers
│   ├── core/               # Business logic (scoring, search, cache)
│   └── routes/             # API endpoints
│       ├── auth.py         # Login, session, JWT
│       ├── dashboard.py    # Main product grid
│       ├── deployments.py  # Deploy history API
│       └── ...
├── db/                     # Database layer
│   ├── models.py           # SQLAlchemy models
│   └── session.py          # DB connection
├── frontend/               # React + TypeScript + Vite
│   ├── src/
│   │   ├── api/index.ts    # All API calls (axios)
│   │   ├── pages/          # Page components
│   │   ├── components/     # Shared components (Layout, Sidebar)
│   │   └── contexts/       # Auth, Theme, Sidebar providers
│   ├── package.json
│   └── vite.config.ts      # Builds to api/frontend_dist/
├── deploy/                 # CI/CD infrastructure
│   ├── autodeploy.sh       # Deploy script (pull, build, restart)
│   ├── webhook_listener.py # GitHub webhook receiver
│   └── *.service           # Systemd units
├── .env                    # Secrets (not in git)
├── .env.example            # Template for .env
└── requirements.txt        # Python dependencies
```

---

## Adding New Features

### New Backend Endpoint

1. Create `api/routes/your_feature.py`
2. Add router in `api/main.py`:
   ```python
   from api.routes import your_feature
   app.include_router(your_feature.router, tags=["Your Feature"])
   ```
3. Add API function in `frontend/src/api/index.ts`

### New Frontend Page

1. Create `frontend/src/pages/YourPage.tsx` and `.css`
2. Add route in `frontend/src/App.tsx`
3. Add sidebar link in `frontend/src/components/Layout/Sidebar.tsx`

### New Python Dependency

```bash
pip install some-package
pip freeze | grep some-package >> requirements.txt
# The deploy script auto-detects requirements.txt changes
```

### New npm Dependency

```bash
cd frontend
npm install some-package
# package.json changes are auto-detected by the deploy script
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | JWT signing key |
| `GEMINI_API_KEY` | Google Gemini API key (AI features) |
| `FRONTEND_DEV_URL` | Frontend dev server URL (CORS, default: `http://localhost:5173`) |

> ⚠️ The `.env` file is **not in git**. If you add a new variable, also update `.env.example`.

---

## Ports

| Service | Port | Location |
|---------|------|----------|
| FastAPI (production) | 8000 | `http://38.242.226.83:8000` |
| Webhook listener | 9000 | `http://38.242.226.83:9000` |
| Vite dev server (local) | 5173 | `http://localhost:5173` |
| PostgreSQL | 5432 | `38.242.226.83:5432` |
