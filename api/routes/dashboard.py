"""
Dashboard API — Main product grid with filters, sorting, pagination.
Queries product_metrics_view MV which has columns:
  id, name, url, image, vendor, parser_name, stock, stock_diff, price,
  avg_1d, avg_7d, avg_30d, avg_sold_over_period, last_stock_update,
  last_nonzero_stock_date, is_stale
NOTE: 'id' is the product_id, no 'parser_id' column in this MV.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import Optional

from db.session import get_db
from db.models import Product
from api.core.search_utils import build_search_conditions
from api.routes.auth import get_current_user
from api.core.cache_utils import cache_invalidate
from api.core.mv_scheduler import refresh_dashboard_mvs
from db.settings_utils import get_setting

router = APIRouter()

# Safe sort column mapping (prevents SQL injection)
SORT_COLUMNS = {
    "name": "pmv.name",
    "parser_name": "pmv.parser_name",
    "vendor": "pmv.vendor",
    "pipeline_status": "p.pipeline_status",
    "sales_ranking": "p.sales_ranking",
    "stock": "pmv.stock",
    "stock_diff": "pmv.stock_diff",
    "avg_1d": "pmv.avg_1d",
    "avg_7d": "pmv.avg_7d",
    "avg_30d": "pmv.avg_30d",
    "avg_sold_over_period": "pmv.avg_sold_over_period",
    "price": "pmv.price",
    "last_updated": "pmv.last_stock_update",
    "score": "COALESCE(ps.total_score, 0)",
    "total_score": "COALESCE(ps.total_score, 0)",
}


@router.get("/api/dashboard")
async def get_dashboard(
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
    parser_id: Optional[str] = Query(None),
    name_filter: Optional[str] = Query(None),
    vendor_filter: Optional[str] = Query(None),
    pipeline_status_filter: Optional[str] = Query(None),
    sales_ranking_filter: Optional[str] = Query(None),
    min_price: Optional[float] = Query(None),
    max_price: Optional[float] = Query(None),
    min_stock: Optional[int] = Query(None),
    max_stock: Optional[int] = Query(None),
    min_avg_30d: Optional[float] = Query(None),
    max_avg_30d: Optional[float] = Query(None),
    min_sold: Optional[float] = Query(None),
    max_sold: Optional[float] = Query(None),
    updated_within_days: Optional[int] = Query(None),
    min_score: Optional[int] = Query(None),
    max_score: Optional[int] = Query(None),
    grade_filter: Optional[str] = Query(None),
    exclude_stale: Optional[bool] = Query(False),
    sort_by: Optional[str] = Query("avg_30d"),
    sort_dir: Optional[str] = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: Optional[int] = Query(None),
):
    """
    Main product grid endpoint.
    Reads from product_metrics_view (MV has 'id' as product_id, no parser_id).
    Joins to products table for pipeline_status, sales_ranking, shortlisted.
    """
    # Get page size from settings if not provided
    if page_size is None:
        page_size = get_setting(db, "DEFAULT_PAGE_SIZE", 50)
    page_size = int(page_size)
    # Build query
    conditions = []
    params: dict = {}

    # Always exclude unrealistic data (INT_MAX stock = scraper errors)
    conditions.append("(pmv.stock IS NULL OR pmv.stock < 1000000)")
    conditions.append("(pmv.avg_1d IS NULL OR pmv.avg_1d < 1000000)")
    conditions.append("(pmv.avg_7d IS NULL OR pmv.avg_7d < 1000000)")
    conditions.append("(pmv.avg_30d IS NULL OR pmv.avg_30d < 1000000)")

    # Watchlist mode
    is_watchlist = parser_id == "watchlist"
    if is_watchlist:
        conditions.append("p.shortlisted = true")
        exclude_stale = False  # Show all in watchlist
    elif parser_id:
        try:
            # product_metrics_view has parser_name, not parser_id
            # We need to join via products.parser_id
            conditions.append("p.parser_id = :parser_id")
            params["parser_id"] = int(parser_id)
        except ValueError:
            pass

    # Text search (smart: diacritics-aware, multi-word AND, prefix, fuzzy, #ID)
    search_order_expr = None
    if name_filter:
        search_conds, search_params, search_order_expr = build_search_conditions(
            name_filter, "pmv.name", param_prefix="ds", extra_columns=["pmv.vendor"]
        )
        conditions.extend(search_conds)
        params.update(search_params)

    # Vendor
    if vendor_filter:
        conditions.append("pmv.vendor = :vendor_filter")
        params["vendor_filter"] = vendor_filter

    # Pipeline status
    if pipeline_status_filter:
        if pipeline_status_filter == '__none__':
            conditions.append("p.pipeline_status IS NULL")
        else:
            conditions.append("p.pipeline_status = :pipeline_status_filter")
            params["pipeline_status_filter"] = pipeline_status_filter

    # Sales ranking
    if sales_ranking_filter:
        conditions.append("p.sales_ranking = :sales_ranking_filter")
        params["sales_ranking_filter"] = sales_ranking_filter

    # Price range
    if min_price is not None:
        conditions.append("pmv.price >= :min_price")
        params["min_price"] = min_price
    if max_price is not None:
        conditions.append("pmv.price <= :max_price")
        params["max_price"] = max_price

    # Stock range
    if min_stock is not None:
        conditions.append("pmv.stock >= :min_stock")
        params["min_stock"] = min_stock
    if max_stock is not None:
        conditions.append("pmv.stock <= :max_stock")
        params["max_stock"] = max_stock

    # Avg 30D range
    if min_avg_30d is not None:
        conditions.append("pmv.avg_30d >= :min_avg_30d")
        params["min_avg_30d"] = min_avg_30d
    if max_avg_30d is not None:
        conditions.append("pmv.avg_30d <= :max_avg_30d")
        params["max_avg_30d"] = max_avg_30d

    # Sold (stock_diff) range
    if min_sold is not None:
        conditions.append("pmv.stock_diff >= :min_sold")
        params["min_sold"] = min_sold
    if max_sold is not None:
        conditions.append("pmv.stock_diff <= :max_sold")
        params["max_sold"] = max_sold

    # Updated within N days
    if updated_within_days is not None and updated_within_days > 0:
        conditions.append("pmv.last_stock_update >= NOW() - INTERVAL ':updated_days days'")
        # Use raw substitution for interval — parameterized intervals are tricky
        conditions[-1] = f"pmv.last_stock_update >= NOW() - INTERVAL '{int(updated_within_days)} days'"

    # Stale filtering
    if exclude_stale:
        conditions.append("pmv.is_stale = false")

    # Score filters
    if min_score is not None:
        conditions.append("COALESCE(ps.total_score, 0) >= :min_score")
        params["min_score"] = min_score
    if max_score is not None:
        conditions.append("COALESCE(ps.total_score, 0) <= :max_score")
        params["max_score"] = max_score
    if grade_filter:
        conditions.append("ps.grade = :grade_filter")
        params["grade_filter"] = grade_filter

    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""

    # Sort
    sort_col = SORT_COLUMNS.get(sort_by, "pmv.avg_30d")
    sort_direction = "DESC" if sort_dir and sort_dir.lower() == "desc" else "ASC"
    # If searching and no explicit sort chosen, use relevance ordering
    if search_order_expr and sort_by in ('avg_30d', ''):
        order_clause = f"ORDER BY {search_order_expr}, {sort_col} {sort_direction}"
    else:
        order_clause = f"ORDER BY {sort_col} {sort_direction}"

    # Join clause — include scoring MV
    join_clause = """JOIN products p ON p.id = pmv.id
        LEFT JOIN mv_product_scores ps ON ps.product_id = pmv.id"""

    # Count
    count_query = f"""
        SELECT COUNT(*) FROM product_metrics_view pmv
        {join_clause}
        {where_clause}
    """
    total = db.execute(text(count_query), params).scalar() or 0

    # Pagination
    offset = (page - 1) * page_size
    total_pages = max(1, (total + page_size - 1) // page_size)

    # Main query
    data_query = f"""
        SELECT
            pmv.id as product_id, pmv.name, pmv.url, pmv.image, pmv.vendor,
            pmv.parser_name,
            pmv.stock, pmv.stock_diff, pmv.price,
            pmv.avg_1d, pmv.avg_7d, pmv.avg_30d, pmv.avg_sold_over_period,
            pmv.is_stale,
            pmv.last_stock_update,
            p.parser_id,
            p.pipeline_status, p.sales_ranking, p.shortlisted,
            COALESCE(ps.total_score, 0) as total_score,
            COALESCE(ps.grade, 'F') as grade,
            ps.sales_velocity_score,
            ps.restock_score,
            ps.price_stability_score,
            ps.data_quality_score,
            ps.market_position_score,
            COALESCE(ps.is_oscillating, false) as is_oscillating,
            COALESCE(ps.is_liquidating, false) as is_liquidating,
            COALESCE(ps.is_restocking, false) as is_restocking,
            COALESCE(ps.is_new_listing, false) as is_new_listing
        FROM product_metrics_view pmv
        {join_clause}
        {where_clause}
        {order_clause} NULLS LAST
        LIMIT :limit OFFSET :offset
    """
    params["limit"] = page_size
    params["offset"] = offset

    rows = db.execute(text(data_query), params).fetchall()

    products = [
        {
            "id": r.product_id,
            "name": r.name,
            "url": r.url,
            "image": r.image,
            "vendor": r.vendor,
            "parser_id": r.parser_id,
            "parser_name": r.parser_name,
            "stock": r.stock if r.stock and r.stock < 1000000 else r.stock,
            "stock_diff": r.stock_diff if r.stock_diff and abs(r.stock_diff) < 1000000 else (0 if r.stock_diff and abs(r.stock_diff) >= 1000000 else r.stock_diff),
            "price": float(r.price) if r.price else None,
            "avg_1d": float(r.avg_1d) if r.avg_1d and r.avg_1d < 1000000 else 0,
            "avg_7d": float(r.avg_7d) if r.avg_7d and r.avg_7d < 1000000 else 0,
            "avg_30d": float(r.avg_30d) if r.avg_30d and r.avg_30d < 1000000 else 0,
            "avg_sold_over_period": float(r.avg_sold_over_period) if r.avg_sold_over_period and r.avg_sold_over_period < 1000000 else 0,
            "is_stale": r.is_stale,
            "pipeline_status": r.pipeline_status,
            "sales_ranking": r.sales_ranking,
            "shortlisted": r.shortlisted,
            "last_updated": r.last_stock_update.isoformat() if r.last_stock_update else None,
            "score": r.total_score,
            "grade": r.grade,
            "flags": {
                "oscillating": bool(r.is_oscillating),
                "liquidating": bool(r.is_liquidating),
                "restocking": bool(r.is_restocking),
                "new_listing": bool(r.is_new_listing),
            },
        }
        for r in rows
    ]

    # Vendor list for filter dropdown
    vendor_rows = db.execute(text("""
        SELECT DISTINCT vendor FROM products WHERE vendor IS NOT NULL ORDER BY vendor
    """)).fetchall()

    return {
        "products": products,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "vendors": [r.vendor for r in vendor_rows],
    }


@router.post("/api/products/{product_id}/shortlist")
async def toggle_shortlist(
    product_id: int,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Toggle the shortlisted flag on a product."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        return {"error": "Product not found"}
    product.shortlisted = not product.shortlisted
    db.commit()
    return {"id": product.id, "shortlisted": product.shortlisted}


@router.put("/api/products/{product_id}/status")
async def update_status(
    product_id: int,
    body: dict,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Update a product's pipeline status."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        return {"error": "Product not found"}
    product.pipeline_status = body.get("status")
    db.commit()
    cache_invalidate("sidebar")
    return {"id": product.id, "pipeline_status": product.pipeline_status}


@router.post("/api/product/{product_id}/move-to-new-status")
async def move_to_new(
    product_id: int,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Shortlist a product and set its pipeline status to 'New'."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        return {"error": "Product not found"}
    product.shortlisted = True
    product.pipeline_status = "New"
    db.commit()
    cache_invalidate("sidebar")
    return {"id": product.id, "pipeline_status": "New", "shortlisted": True}


@router.post("/api/dashboard/refresh")
async def refresh_dashboard(
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Refresh dashboard materialized views."""
    refresh_dashboard_mvs(db)
    cache_invalidate()
    return {"message": "Dashboard data refreshed"}
