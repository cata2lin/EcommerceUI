# E-Commerce Intelligence Platform

Full-stack e-commerce product intelligence platform for monitoring, scoring, and managing products across multiple online stores.

## Features

- **Dashboard** — Paginated product table with advanced search (diacritics-aware, fuzzy matching, #ID lookup), sorting, filtering by store/vendor/stock/pipeline status
- **Product Detail** — Stock & price history charts with date range filters, KPI cards, and **Similar Products** table powered by `pg_trgm` name similarity
- **Product Pipeline** — Multi-stage pipeline (New → Sourcing → Financial Review → Ready → Live → Paused → Dead) with drag-and-drop status management
- **Pipeline Status View** — Filtered views per pipeline stage with sales ranking, margin health, price/COGS range filters
- **Bestsellers** — Ranked product performance with store/global rank badges, image preview, and shortlist actions
- **Product Scoring** — Automated 5-dimension scoring (Sales Velocity, Restock Pattern, Price Stability, Data Quality, Market Position) with grades A-F
- **Analytics** — Store-level performance analytics
- **Opportunities** — AI-powered product opportunity detection
- **System Monitoring** — MV health status, refresh history, manual/automatic refresh controls
- **Configuration** — Store management, product categories, pipeline status management

## Tech Stack

### Backend
- **Python 3.11+** with **FastAPI**
- **SQLAlchemy 2.0** ORM
- **PostgreSQL** with extensions:
  - `pg_trgm` — trigram-based fuzzy text matching
  - `unaccent` — diacritics-insensitive search
- **JWT Authentication** (httpOnly cookies)
- **Uvicorn** with hot-reload

### Frontend
- **React 19** with **TypeScript**
- **Vite 8** build tool
- **React Router 7** — client-side routing
- **TanStack React Query** — data fetching & caching
- **Chart.js** + **react-chartjs-2** — stock/price charts
- **Axios** — HTTP client
- **Vanilla CSS** — custom design system

## Prerequisites

- Python 3.11 or higher
- Node.js 18+ and npm
- PostgreSQL 14+ with `pg_trgm` and `unaccent` extensions enabled

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/cata2lin/EcommerceUI.git
cd EcommerceUI
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your actual values:

```env
DATABASE_URL=postgresql://user:password@host:5432/database_name
SECRET_KEY=your-random-secret-key
GEMINI_API_KEY=your-gemini-api-key
FRONTEND_DEV_URL=http://localhost:5173
```

### 3. PostgreSQL extensions

Ensure these extensions are enabled in your database:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
```

### 4. Backend setup

```bash
# Install Python dependencies
pip install -r requirements.txt

# Start the API server (with auto-reload)
python -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

The backend will:
- Auto-create required materialized views on first startup
- Schedule daily MV refresh at 8:00 AM
- Serve the API at `http://localhost:8000`

### 5. Frontend setup (Development)

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server runs at `http://localhost:5173`.

### 6. Create initial user

The API uses JWT authentication. Create a user via the API or directly in the database:

```sql
-- Password hash for "admin" (bcrypt)
INSERT INTO users (username, hashed_password)
VALUES ('admin', '$2b$12$LJ3...(generate with passlib)');
```

Or use the registration endpoint if available.

---

## Production Deployment (Linux Server)

For deploying on a server (e.g., `bi.arona.ro`), you need to **build the frontend** so the API can serve everything on a single port.

### Quick Deploy

```bash
# Clone and enter project
git clone https://github.com/cata2lin/EcommerceUI.git
cd EcommerceUI

# Set up Python environment
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Configure environment
cp .env.example .env
nano .env  # Edit with your actual database URL, keys, etc.

# Build frontend for production
cd frontend
npm install
npm run build   # Outputs to api/frontend_dist/
cd ..

# Start the server
python -m uvicorn api.main:app --host 0.0.0.0 --port 8000
```

The app will be available at `http://your-server:8000` — both API and frontend served on the same port.

### Or use the deploy script

```bash
chmod +x deploy.sh
./deploy.sh
python -m uvicorn api.main:app --host 0.0.0.0 --port 8000
```

### Running as a background service (systemd)

Create `/etc/systemd/system/ecommerce.service`:

```ini
[Unit]
Description=E-Commerce Intelligence Platform
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/EcommerceUI
Environment=PATH=/root/EcommerceUI/venv/bin:/usr/bin
ExecStart=/root/EcommerceUI/venv/bin/python -m uvicorn api.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ecommerce
sudo systemctl start ecommerce
sudo systemctl status ecommerce  # Check status
sudo journalctl -u ecommerce -f  # View logs
```

## Project Structure

```
├── api/                    # FastAPI backend
│   ├── main.py             # App entry point, startup, daily MV scheduler
│   ├── core/
│   │   ├── mv_scheduler.py # MV refresh logic (dependency-ordered)
│   │   ├── product_scorer.py # 5-dimension product scoring algorithm
│   │   └── search_utils.py # Unified search (fuzzy, diacritics, #ID)
│   └── routes/
│       ├── auth.py         # JWT login/logout
│       ├── dashboard.py    # Main dashboard API
│       ├── product_detail.py # Product detail + similar products
│       ├── product_pipeline.py # Pipeline management
│       ├── bestsellers.py  # Bestseller rankings
│       ├── analytics.py    # Store analytics
│       ├── opportunities.py # AI opportunities
│       ├── config.py       # Configuration CRUD
│       └── system_monitoring.py # System health & MV status
├── db/
│   ├── session.py          # SQLAlchemy engine & session
│   └── models.py           # ORM models (Product, Parser, etc.)
├── frontend/               # React + TypeScript frontend
│   ├── src/
│   │   ├── App.tsx         # Router & layout
│   │   ├── api/index.ts    # Axios API client
│   │   ├── contexts/       # React contexts (Auth, Sidebar, Theme)
│   │   ├── components/     # Shared components (Layout, Sidebar)
│   │   └── pages/          # Page components
│   └── package.json
├── requirements.txt        # Python dependencies
├── .env.example            # Environment variable template
└── README.md
```

## Materialized Views

The system uses 12 materialized views that auto-refresh daily at 8:00 AM:

| MV | Purpose |
|----|---------|
| `mv_latest_stock` | Latest stock quantity per product |
| `mv_latest_price` | Latest price per product |
| `mv_stock_last_per_day` | Daily closing stock levels |
| `mv_product_daily_sales` | Computed daily sales |
| `product_metrics_view` | Aggregated product metrics |
| `mv_product_scores` | 5-dimension product scoring (A-F grades) |
| `mv_best_sellers` | Bestseller calculations |
| `mv_best_sellers_ranked` | Global + per-store rankings |
| `mv_parser_activity` | Store scraper activity stats |
| `mv_sidebar_parser_counts` | Sidebar store counts |
| `mv_sidebar_pipeline_status_counts` | Sidebar pipeline counts |
| `store_analytics_mv` | Store-level analytics |

Manual refresh is available via the System Monitoring page or the Config refresh button.

## Search System

The unified search supports:
- **#ID search** — `#12345` finds product by ID
- **Diacritics-aware** — "telefon" matches "Telefón"
- **Multi-word AND** — "placi podea" finds "Plăci PVC Podea"
- **Prefix matching** — "tric" matches "Tricicleta"
- **Fuzzy tolerance** — "samung" finds "Samsung"
- **Relevance sorting** — Results ordered by similarity score

## Product Scoring Algorithm

Products are scored on 5 dimensions (0-100 total):

| Dimension | Max Points | What It Measures |
|-----------|-----------|-----------------|
| Sales Velocity | 30 | Sales volume, consistency, trend |
| Restock Pattern | 25 | Restock frequency, inventory management |
| Price Stability | 20 | Price trend, volatility |
| Data Quality | 15 | Data completeness, oscillation detection |
| Market Position | 10 | Recency, images, vendor, price range |

Includes protections against fake-stock products (high-stock penalties, oscillation detection, restock caps for stock cycling).

## License

Private repository.
