"""
FastAPI application entry point.
CORS, auth middleware, router mounting, static files, SPA catch-all.
"""
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, FileResponse
from starlette.middleware.base import BaseHTTPMiddleware
from dotenv import load_dotenv

load_dotenv()

from db.session import SessionLocal
from db.settings_utils import ensure_settings
from api.routes import auth, sidebar, dashboard
from api.routes import product_detail, product_pipeline
from api.routes import bestsellers, opportunities, analytics
from api.routes import parser_status, config
from api.routes import deployments
from api.routes import system_monitoring
from api.routes import purchase_orders
from api.routes import tom_config

import asyncio

app = FastAPI(title="E-commerce BI Platform V3", version="3.0.0")

# ─── CORS ────────────────────────────────────────────────────────────
FRONTEND_DEV_URL = os.getenv("FRONTEND_DEV_URL", "http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000",
        FRONTEND_DEV_URL,
        "http://localhost:5174",  # Allow frontend on port 5174
        "http://localhost:5175",  # Allow frontend on port 5175
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Auth Redirect Middleware ────────────────────────────────────────
class AuthRedirectMiddleware(BaseHTTPMiddleware):
    """Redirect HTML requests that get 401 to the login page."""

    EXEMPT_PATHS = {"/login", "/api/auth/login", "/auth/logout", "/auth/register", "/api/docs", "/openapi.json"}

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        if response.status_code == 401:
            accept = request.headers.get("accept", "")
            if "text/html" in accept and request.url.path not in self.EXEMPT_PATHS:
                return RedirectResponse(url="/login", status_code=302)

        return response


app.add_middleware(AuthRedirectMiddleware)


# ─── Routers ─────────────────────────────────────────────────────────
app.include_router(auth.router, tags=["Authentication"])
app.include_router(sidebar.router, tags=["Sidebar"])
app.include_router(dashboard.router, tags=["Dashboard"])
app.include_router(product_detail.router, tags=["Product Detail"])
app.include_router(product_pipeline.router, tags=["Product Pipeline"])
app.include_router(bestsellers.router, tags=["Bestsellers"])
app.include_router(opportunities.router, tags=["Opportunities"])
app.include_router(analytics.router, tags=["Analytics"])
app.include_router(parser_status.router, tags=["Parser Status"])
app.include_router(config.router, tags=["Configuration"])
app.include_router(system_monitoring.router, tags=["System Monitoring"])
app.include_router(purchase_orders.router, tags=["Purchase Orders"])
app.include_router(tom_config.router, tags=["TOM API Config"])
app.include_router(deployments.router, tags=["Deployments"])


# ─── Daily 8 AM Background MV Refresh ───────────────────────────────
async def daily_mv_refresh():
    """Background task: refresh all materialized views daily at 8:00 AM."""
    import logging
    from datetime import datetime, timedelta
    logger = logging.getLogger("mv_scheduler")

    while True:
        # Calculate seconds until next 8:00 AM
        now = datetime.now()
        target = now.replace(hour=8, minute=0, second=0, microsecond=0)
        if now >= target:
            target += timedelta(days=1)
        wait_seconds = (target - now).total_seconds()
        logger.info(f"Next MV refresh scheduled at {target.isoformat()} ({wait_seconds:.0f}s from now)")

        await asyncio.sleep(wait_seconds)

        try:
            db = SessionLocal()
            try:
                from api.core.mv_scheduler import refresh_all_mvs
                results = refresh_all_mvs(db)
                logger.info(f"Daily 8AM MV refresh complete: {results}")
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Daily MV refresh failed: {e}")


# ─── Startup ─────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    """Ensure default settings exist and start background jobs."""
    try:
        db = SessionLocal()
        try:
            ensure_settings(db)
            # Create scoring MV if it doesn't exist
            from api.core.product_scorer import create_scoring_mv
            create_scoring_mv(db)
        finally:
            db.close()
    except Exception as e:
        import logging
        logging.warning(f"Could not connect to database on startup: {e}")
        logging.warning("Application will start but DB-dependent features may not work.")

    # Start daily 8AM MV refresh background task
    asyncio.create_task(daily_mv_refresh())


# ─── Health Check ────────────────────────────────────────────────────
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "3.0.0"}


# ─── SPA Catch-All (production) ─────────────────────────────────────
# In development, React is served by Vite dev server.
# In production, serve built frontend from api/frontend_dist/
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "frontend_dist")

if os.path.isdir(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="frontend-assets")

    @app.get("/{path:path}")
    async def spa_catch_all(path: str):
        """Serve React SPA for all unmatched routes."""
        index_file = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.isfile(index_file):
            return FileResponse(index_file)
        return {"error": "Frontend not built"}
