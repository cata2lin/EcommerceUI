"""
Parser Status API — Health monitoring with dual status system (run + activity),
coverage bars, 24h/48h update counts, and run logs.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timedelta

from db.session import get_db
from db.models import ParserRunLog
from api.routes.auth import get_current_user
from api.core.cache_utils import cache_get, cache_set

router = APIRouter()


@router.get("/api/parser-status")
async def get_parser_status(
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Parser health dashboard with dual status system and coverage metrics."""
    cached = cache_get("parser_status")
    if cached:
        return cached

    rows = db.execute(text("""
        SELECT
            p.id, p.name, p.url, p.category,
            (SELECT COUNT(*) FROM products WHERE parser_id = p.id) as total_products,
            (SELECT COUNT(*) FROM products prod
             JOIN stock_history sh ON sh.product_id = prod.id
             WHERE prod.parser_id = p.id
             AND sh.timestamp >= NOW() - INTERVAL '24 hours'
            ) as products_24h,
            (SELECT COUNT(*) FROM products prod
             JOIN stock_history sh ON sh.product_id = prod.id
             WHERE prod.parser_id = p.id
             AND sh.timestamp >= NOW() - INTERVAL '48 hours'
            ) as products_48h,
            prl.status as last_status,
            prl.finished_at as last_run,
            prl.products_found,
            prl.duration_seconds
        FROM parsers p
        LEFT JOIN LATERAL (
            SELECT status, finished_at, products_found, duration_seconds
            FROM parser_run_logs WHERE parser_id = p.id
            ORDER BY finished_at DESC NULLS LAST LIMIT 1
        ) prl ON true
        ORDER BY p.name
    """)).fetchall()

    # Compute average duration per parser
    avg_durations = {}
    avg_rows = db.execute(text("""
        SELECT parser_id, AVG(duration_seconds) as avg_dur
        FROM parser_run_logs
        WHERE duration_seconds IS NOT NULL
        GROUP BY parser_id
    """)).fetchall()
    for r in avg_rows:
        avg_durations[r.parser_id] = float(r.avg_dur)

    parsers = []
    for r in rows:
        total = r.total_products or 0
        p24h = r.products_24h or 0
        p48h = r.products_48h or 0

        # Coverage percentage
        coverage_pct = round((p24h / total) * 100, 1) if total > 0 else 0

        # Run status (from last run log)
        run_status = "Unknown"
        if r.last_status in ("ok", "success", "completed"):
            run_status = "Healthy"
        elif r.last_status in ("error", "failed"):
            run_status = "Error"
        elif r.last_status == "running":
            run_status = "Running"
        elif r.last_run:
            hours_since = (datetime.utcnow() - r.last_run).total_seconds() / 3600
            if hours_since > 48:
                run_status = "Stale"
            else:
                run_status = "Warning"

        # Activity status (from update percentages)
        if total == 0:
            activity_status = "Inactive"
        else:
            pct_24h = (p24h / total) * 100
            pct_48h = (p48h / total) * 100
            if pct_24h >= 50:
                activity_status = "Active"
            elif pct_24h >= 10:
                activity_status = "Partial"
            elif pct_48h >= 10:
                activity_status = "Stale"
            else:
                activity_status = "Inactive"

        hours_since_run = None
        if r.last_run:
            hours_since_run = round((datetime.utcnow() - r.last_run).total_seconds() / 3600, 1)

        parsers.append({
            "id": r.id,
            "name": r.name,
            "category": r.category,
            "total_products": total,
            "products_24h": p24h,
            "products_48h": p48h,
            "coverage_pct": coverage_pct,
            "last_stock_update": r.last_run.isoformat() if r.last_run else None,
            "run_status": run_status,
            "activity_status": activity_status,
            "last_run_status": r.last_status,
            "avg_duration": avg_durations.get(r.id),
            "hours_since_run": hours_since_run,
        })

    data = {"parsers": parsers}
    cache_set("parser_status", data, ttl=60)
    return data


@router.get("/api/parser-runs")
async def get_parser_runs(
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
    parser_id: Optional[int] = Query(None),
    page: int = 1,
    page_size: int = 50,
):
    """Recent parser run logs — matches frontend ParserStatus.tsx field names."""
    query = db.query(ParserRunLog).order_by(ParserRunLog.finished_at.desc())
    if parser_id:
        query = query.filter(ParserRunLog.parser_id == parser_id)

    total = query.count()
    offset = (page - 1) * page_size
    runs = query.offset(offset).limit(page_size).all()

    return {
        "runs": [
            {
                "id": r.id,
                "parser_id": r.parser_id,
                "status": r.status,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "finished_at": r.finished_at.isoformat() if r.finished_at else None,
                "products_found": r.products_found or 0,
                "products_parsed_success": getattr(r, 'products_parsed_success', 0) or 0,
                "products_parsed_failed": getattr(r, 'products_parsed_failed', 0) or 0,
                "duration_seconds": float(r.duration_seconds) if r.duration_seconds else None,
                "error_message": r.error_message if hasattr(r, 'error_message') else None,
            }
            for r in runs
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/api/parser-activity/{parser_id}")
async def get_parser_activity(
    parser_id: int,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """
    Detailed activity log for a single parser.

    Returns:
      - parser metadata (name, category, total products)
      - last 24h: counts of price/stock measurements (total + unique products)
      - 10-day breakdown: per-day price + stock entries, unique products touched
      - 10 most recent run logs
      - health metrics: success rate, avg duration, staleness, last activity timestamps
    """
    cache_key = f"parser_activity_{parser_id}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    # Parser metadata
    parser_row = db.execute(text("""
        SELECT p.id, p.name, p.category,
               (SELECT COUNT(*) FROM products WHERE parser_id = p.id) AS total_products
        FROM parsers p WHERE p.id = :pid
    """), {"pid": parser_id}).fetchone()

    if not parser_row:
        return {"error": f"Parser {parser_id} not found"}

    # Last 24h activity counters
    last_24h = db.execute(text("""
        SELECT
            (SELECT COUNT(*) FROM price_history ph
             JOIN products p ON p.id = ph.product_id
             WHERE p.parser_id = :pid AND ph.timestamp >= NOW() - INTERVAL '24 hours'
            ) AS price_entries_24h,
            (SELECT COUNT(DISTINCT ph.product_id) FROM price_history ph
             JOIN products p ON p.id = ph.product_id
             WHERE p.parser_id = :pid AND ph.timestamp >= NOW() - INTERVAL '24 hours'
            ) AS unique_products_priced_24h,
            (SELECT COUNT(*) FROM stock_history sh
             JOIN products p ON p.id = sh.product_id
             WHERE p.parser_id = :pid AND sh.timestamp >= NOW() - INTERVAL '24 hours'
            ) AS stock_entries_24h,
            (SELECT COUNT(DISTINCT sh.product_id) FROM stock_history sh
             JOIN products p ON p.id = sh.product_id
             WHERE p.parser_id = :pid AND sh.timestamp >= NOW() - INTERVAL '24 hours'
            ) AS unique_products_stocked_24h,
            (SELECT MAX(ph.timestamp) FROM price_history ph
             JOIN products p ON p.id = ph.product_id
             WHERE p.parser_id = :pid
            ) AS last_price_ts,
            (SELECT MAX(sh.timestamp) FROM stock_history sh
             JOIN products p ON p.id = sh.product_id
             WHERE p.parser_id = :pid
            ) AS last_stock_ts
    """), {"pid": parser_id}).fetchone()

    # 10-day breakdown (one row per calendar day)
    breakdown_rows = db.execute(text("""
        WITH days AS (
            SELECT generate_series(
                (CURRENT_DATE - INTERVAL '9 days')::date,
                CURRENT_DATE,
                '1 day'::interval
            )::date AS d
        ),
        price_agg AS (
            SELECT date_trunc('day', ph.timestamp)::date AS d,
                   COUNT(*) AS price_entries,
                   COUNT(DISTINCT ph.product_id) AS unique_priced
            FROM price_history ph
            JOIN products p ON p.id = ph.product_id
            WHERE p.parser_id = :pid
              AND ph.timestamp >= CURRENT_DATE - INTERVAL '9 days'
            GROUP BY 1
        ),
        stock_agg AS (
            SELECT date_trunc('day', sh.timestamp)::date AS d,
                   COUNT(*) AS stock_entries,
                   COUNT(DISTINCT sh.product_id) AS unique_stocked
            FROM stock_history sh
            JOIN products p ON p.id = sh.product_id
            WHERE p.parser_id = :pid
              AND sh.timestamp >= CURRENT_DATE - INTERVAL '9 days'
            GROUP BY 1
        )
        SELECT d.d AS day,
               COALESCE(pa.price_entries, 0) AS price_entries,
               COALESCE(pa.unique_priced, 0) AS unique_priced,
               COALESCE(sa.stock_entries, 0) AS stock_entries,
               COALESCE(sa.unique_stocked, 0) AS unique_stocked
        FROM days d
        LEFT JOIN price_agg pa ON pa.d = d.d
        LEFT JOIN stock_agg sa ON sa.d = d.d
        ORDER BY d.d DESC
    """), {"pid": parser_id}).fetchall()

    # Last 10 runs
    runs_rows = db.execute(text("""
        SELECT id, status, started_at, finished_at, duration_seconds,
               products_found, products_parsed_success, products_parsed_failed,
               stock_entries_saved, price_entries_saved, error_message
        FROM parser_run_logs
        WHERE parser_id = :pid
        ORDER BY COALESCE(finished_at, started_at) DESC NULLS LAST
        LIMIT 10
    """), {"pid": parser_id}).fetchall()

    # Health: success rate over last 30 runs + staleness counts
    health_row = db.execute(text("""
        WITH last_runs AS (
            SELECT status FROM parser_run_logs
            WHERE parser_id = :pid
            ORDER BY COALESCE(finished_at, started_at) DESC NULLS LAST
            LIMIT 30
        ),
        success_stats AS (
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status IN ('ok','success','completed')) AS ok_count,
                COUNT(*) FILTER (WHERE status IN ('error','failed')) AS error_count
            FROM last_runs
        ),
        avg_dur AS (
            SELECT AVG(duration_seconds) AS avg_duration
            FROM parser_run_logs
            WHERE parser_id = :pid AND duration_seconds IS NOT NULL
        ),
        staleness AS (
            SELECT
                (SELECT COUNT(*) FROM products prod
                 LEFT JOIN LATERAL (
                    SELECT MAX(timestamp) AS last_ts FROM stock_history
                    WHERE product_id = prod.id
                 ) sh ON TRUE
                 WHERE prod.parser_id = :pid
                   AND (sh.last_ts IS NULL OR sh.last_ts < NOW() - INTERVAL '7 days')
                ) AS stale_7d,
                (SELECT COUNT(*) FROM products prod
                 LEFT JOIN LATERAL (
                    SELECT MAX(timestamp) AS last_ts FROM stock_history
                    WHERE product_id = prod.id
                 ) sh ON TRUE
                 WHERE prod.parser_id = :pid
                   AND (sh.last_ts IS NULL OR sh.last_ts < NOW() - INTERVAL '30 days')
                ) AS stale_30d
        )
        SELECT s.total, s.ok_count, s.error_count, a.avg_duration,
               st.stale_7d, st.stale_30d
        FROM success_stats s, avg_dur a, staleness st
    """), {"pid": parser_id}).fetchone()

    total_runs = (health_row.total if health_row else 0) or 0
    ok_count = (health_row.ok_count if health_row else 0) or 0
    success_rate = round(100.0 * ok_count / total_runs, 1) if total_runs > 0 else None

    def hours_ago(ts):
        if not ts:
            return None
        return round((datetime.utcnow() - ts).total_seconds() / 3600, 1)

    data = {
        "parser": {
            "id": parser_row.id,
            "name": parser_row.name,
            "category": parser_row.category,
            "total_products": parser_row.total_products or 0,
        },
        "last_24h": {
            "price_entries": last_24h.price_entries_24h or 0,
            "unique_products_priced": last_24h.unique_products_priced_24h or 0,
            "stock_entries": last_24h.stock_entries_24h or 0,
            "unique_products_stocked": last_24h.unique_products_stocked_24h or 0,
            "last_price_ts": last_24h.last_price_ts.isoformat() if last_24h.last_price_ts else None,
            "last_stock_ts": last_24h.last_stock_ts.isoformat() if last_24h.last_stock_ts else None,
            "hours_since_last_price": hours_ago(last_24h.last_price_ts),
            "hours_since_last_stock": hours_ago(last_24h.last_stock_ts),
        },
        "breakdown_10d": [
            {
                "day": r.day.isoformat(),
                "price_entries": r.price_entries or 0,
                "unique_priced": r.unique_priced or 0,
                "stock_entries": r.stock_entries or 0,
                "unique_stocked": r.unique_stocked or 0,
            }
            for r in breakdown_rows
        ],
        "recent_runs": [
            {
                "id": r.id,
                "status": r.status,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "finished_at": r.finished_at.isoformat() if r.finished_at else None,
                "duration_seconds": float(r.duration_seconds) if r.duration_seconds else None,
                "products_found": r.products_found or 0,
                "products_parsed_success": r.products_parsed_success or 0,
                "products_parsed_failed": r.products_parsed_failed or 0,
                "stock_entries_saved": r.stock_entries_saved or 0,
                "price_entries_saved": r.price_entries_saved or 0,
                "error_message": r.error_message,
            }
            for r in runs_rows
        ],
        "health": {
            "runs_evaluated": total_runs,
            "success_count": ok_count,
            "error_count": (health_row.error_count if health_row else 0) or 0,
            "success_rate_pct": success_rate,
            "avg_duration_seconds": float(health_row.avg_duration) if health_row and health_row.avg_duration else None,
            "stale_products_7d": (health_row.stale_7d if health_row else 0) or 0,
            "stale_products_30d": (health_row.stale_30d if health_row else 0) or 0,
        },
    }

    cache_set(cache_key, data, ttl=60)
    return data
