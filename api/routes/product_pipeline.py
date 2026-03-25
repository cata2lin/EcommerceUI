"""
Product Pipeline API — Full sourcing workbench with pipeline details,
AI integrations, status transitions, and financial calculations.
"""
import os
import re
import json
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import Optional
from api.core.search_utils import build_search_conditions

from db.session import get_db
from db.models import Product, ProductPipelineDetail, ProductCategory, ProductGroup, product_assigned_categories
from api.routes.auth import get_current_user
from api.core.cache_utils import cache_invalidate
from db.settings_utils import get_setting

router = APIRouter()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")


# ─── Pipeline Details GET ────────────────────────────────────────────
@router.get("/api/product/{product_id}/pipeline-details")
async def get_pipeline_details(
    product_id: int,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Return product + all pipeline fields + history + financial metrics."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    detail = db.query(ProductPipelineDetail).filter(
        ProductPipelineDetail.product_id == product_id
    ).first()

    # Current stock + price from MVs
    stock_row = db.execute(text(
        "SELECT quantity FROM mv_latest_stock WHERE product_id = :pid"
    ), {"pid": product_id}).fetchone()

    price_row = db.execute(text(
        "SELECT price FROM mv_latest_price WHERE product_id = :pid"
    ), {"pid": product_id}).fetchone()

    # Avg daily sales (30d)
    ads_row = db.execute(text("""
        SELECT COALESCE(AVG(units_sold), 0) as avg_daily
        FROM mv_product_daily_sales
        WHERE product_id = :pid AND s_day >= CURRENT_DATE - INTERVAL '30 days'
    """), {"pid": product_id}).fetchone()

    # Financial calculations
    gross_margin = None
    if detail and detail.retail_price and detail.cogs_usd:
        vat_rate = get_setting(db, "VAT_RATE", 19.0)
        usd_to_ron = get_setting(db, "USD_TO_RON_CONVERSION_RATE", 4.60)

        cogs = float(detail.cogs_usd or 0)
        transport = float(detail.transport_usd or 0)
        customs = float(detail.customs_rate_percentage or 0)
        retail = float(detail.retail_price)

        landed_usd = cogs + transport
        landed_with_customs = landed_usd * (1 + customs / 100)
        landed_ron = landed_with_customs * usd_to_ron
        retail_no_vat = retail / (1 + vat_rate / 100)

        if retail_no_vat > 0:
            gross_margin = round((retail_no_vat - landed_ron) / retail_no_vat * 100, 2)

    # Categories
    categories = db.query(ProductCategory).join(
        product_assigned_categories
    ).filter(
        product_assigned_categories.c.product_id == product_id
    ).all()

    # All categories / groups for dropdowns
    all_categories = db.query(ProductCategory).order_by(ProductCategory.name).all()
    all_groups = db.query(ProductGroup).order_by(ProductGroup.name).all()

    # Stock + price history
    stock_history = db.execute(text(
        "SELECT quantity, timestamp FROM stock_history WHERE product_id = :pid ORDER BY timestamp"
    ), {"pid": product_id}).fetchall()

    price_history = db.execute(text(
        "SELECT value, timestamp FROM price_history WHERE product_id = :pid ORDER BY timestamp"
    ), {"pid": product_id}).fetchall()

    return {
        "product": {
            "id": product.id,
            "name": product.name,
            "url": product.url,
            "image": product.image,
            "vendor": product.vendor,
            "parser_name": product.parser.name if product.parser else None,
            "pipeline_status": product.pipeline_status,
            "group_id": product.group_id,
        },
        "pipeline_detail": {
            "title": detail.title if detail else None,
            "sku": detail.sku if detail else None,
            "barcode": detail.barcode if detail else None,
            "specs": detail.specs if detail else None,
            "retail_price": float(detail.retail_price) if detail and detail.retail_price else None,
            "factory_link_url": detail.factory_link_url if detail else None,
            "cogs_usd": float(detail.cogs_usd) if detail and detail.cogs_usd else None,
            "transport_usd": float(detail.transport_usd) if detail and detail.transport_usd else None,
            "dimension_width_cm": float(detail.dimension_width_cm) if detail and detail.dimension_width_cm else None,
            "dimension_length_cm": float(detail.dimension_length_cm) if detail and detail.dimension_length_cm else None,
            "dimension_height_cm": float(detail.dimension_height_cm) if detail and detail.dimension_height_cm else None,
            "cubic_meters": float(detail.cubic_meters) if detail and detail.cubic_meters else None,
            "customs_rate_percentage": float(detail.customs_rate_percentage) if detail and detail.customs_rate_percentage else None,
            "hs_code": detail.hs_code if detail else None,
            "top_keywords": detail.top_keywords if detail else None,
            "keyword_difficulty": detail.keyword_difficulty if detail else None,
            "main_competitors": detail.main_competitors if detail else None,
            "market_research_insights": detail.market_research_insights if detail else None,
            "suggested_quantity_min": detail.suggested_quantity_min if detail else None,
            "suggested_quantity_max": detail.suggested_quantity_max if detail else None,
            "first_order_cost_estimate": float(detail.first_order_cost_estimate) if detail and detail.first_order_cost_estimate else None,
            "launch_notes": detail.launch_notes if detail else None,
            "monthly_sales_index": detail.monthly_sales_index if detail else None,
            "variants": detail.variants if detail else [],
        },
        "metrics": {
            "current_stock": stock_row.quantity if stock_row else None,
            "current_price": float(price_row.price) if price_row else None,
            "avg_daily_sales_30d": float(ads_row.avg_daily) if ads_row else 0,
            "gross_margin": gross_margin,
        },
        "assigned_category_ids": [c.id for c in categories],
        "categories": [{"id": c.id, "name": c.name, "code": c.code} for c in categories],
        "all_categories": [{"id": c.id, "name": c.name, "code": c.code} for c in all_categories],
        "all_groups": [{"id": g.id, "name": g.name} for g in all_groups],
        "stock_history": [
            {"quantity": r.quantity, "timestamp": r.timestamp.isoformat()}
            for r in stock_history
        ],
        "price_history": [
            {"value": float(r.value), "timestamp": r.timestamp.isoformat()}
            for r in price_history
        ],
    }


# ─── Pipeline Details POST (Save) ───────────────────────────────────
@router.post("/api/product/{product_id}/pipeline-details")
async def save_pipeline_details(
    product_id: int,
    body: dict,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Save all pipeline fields, update categories, advance status."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Get or create pipeline detail
    detail = db.query(ProductPipelineDetail).filter(
        ProductPipelineDetail.product_id == product_id
    ).first()

    if not detail:
        detail = ProductPipelineDetail(product_id=product_id)
        db.add(detail)

    # Update pipeline fields
    field_map = [
        "title", "specs", "retail_price", "factory_link_url",
        "cogs_usd", "transport_usd", "dimension_width_cm", "dimension_length_cm",
        "dimension_height_cm", "cubic_meters", "customs_rate_percentage", "hs_code",
        "top_keywords", "keyword_difficulty", "main_competitors",
        "market_research_insights", "suggested_quantity_min", "suggested_quantity_max",
        "first_order_cost_estimate", "launch_notes", "variants",
    ]
    for field in field_map:
        if field in body:
            setattr(detail, field, body[field])

    # Update categories (M2M) — accept both field names
    cat_ids = body.get("category_ids") or body.get("assigned_category_ids")
    if cat_ids is not None:
        db.execute(
            product_assigned_categories.delete().where(
                product_assigned_categories.c.product_id == product_id
            )
        )
        for cat_id in cat_ids:
            db.execute(
                product_assigned_categories.insert().values(
                    product_id=product_id, category_id=cat_id
                )
            )

        # Auto-generate SKU on first category assignment
        if not detail.sku and cat_ids:
            cat = db.query(ProductCategory).filter(
                ProductCategory.id == cat_ids[0]
            ).first()
            if cat and cat.code:
                detail.sku = f"GD-{cat.code}-{product_id}"

            # Auto-generate barcode (EAN-13)
            if not detail.barcode:
                prefix = "5941237"
                padded_id = str(product_id).zfill(5)
                code = prefix + padded_id
                digits = [int(d) for d in code]
                checksum = 0
                for i, d in enumerate(digits):
                    checksum += d * (1 if i % 2 == 0 else 3)
                check_digit = (10 - (checksum % 10)) % 10
                detail.barcode = code + str(check_digit)

    # Update group
    if "group_id" in body:
        product.group_id = body.get("group_id")

    # Status transition — accept both field names
    new_status = body.get("new_status") or body.get("new_pipeline_status")
    if new_status:
        product.pipeline_status = new_status

    # Save monthly_sales_index if provided
    if "monthly_sales_index" in body:
        detail.monthly_sales_index = body["monthly_sales_index"]

    db.commit()
    cache_invalidate("sidebar")

    return {
        "message": "Saved",
        "updated_status": product.pipeline_status,
        "pipeline_status": product.pipeline_status,
        "sku": detail.sku,
        "barcode": detail.barcode,
    }


# ─── Seasonality Generation ─────────────────────────────────────────
@router.post("/api/product/{product_id}/seasonality/generate")
async def generate_seasonality(
    product_id: int,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Call Gemini AI to generate monthly demand index."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API key not configured. Set GEMINI_API_KEY in .env file.")

    try:
        from google import genai
        client = genai.Client(api_key=GEMINI_API_KEY)

        prompt = f"""You are an expert on Romanian market demand patterns for e-commerce products.
For the product "{product.name}", provide monthly demand intensity as an array of 12 integers (0-100),
one per month from January to December.
100 = peak demand, 0 = no demand.
Return ONLY a JSON array like [45, 30, 60, 80, 55, 40, 35, 30, 50, 65, 85, 95].
No explanation, just the array."""

        # Try multiple models in case one's quota is exhausted
        models = ["gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash"]
        last_error = None
        response = None

        for model_name in models:
            try:
                response = await client.aio.models.generate_content(
                    model=model_name,
                    contents=prompt,
                )
                break  # Success — stop trying
            except Exception as model_err:
                last_error = model_err
                err_str = str(model_err)
                if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                    continue  # Try next model
                raise  # Non-quota error — raise immediately

        if response is None:
            raise HTTPException(
                status_code=429,
                detail=f"All AI models are rate-limited. Please try again in a few minutes. Last error: {str(last_error)[:200]}"
            )

        text = response.text.strip()

        # Extract JSON array from response
        match = re.search(r'\[[\d\s,]+\]', text)
        if not match:
            raise HTTPException(status_code=500, detail=f"Could not parse AI response: {text[:200]}")

        data = json.loads(match.group())
        if len(data) != 12:
            raise HTTPException(status_code=500, detail=f"Expected 12-element array, got {len(data)}")

        # Save
        detail = db.query(ProductPipelineDetail).filter(
            ProductPipelineDetail.product_id == product_id
        ).first()
        if not detail:
            detail = ProductPipelineDetail(product_id=product_id)
            db.add(detail)
        detail.monthly_sales_index = data
        db.commit()

        return {"monthly_sales_index": data, "message": "Seasonality generated successfully!"}

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Seasonality generation failed: {str(e)}")


# ─── TARIC Autofill ──────────────────────────────────────────────────
@router.post("/api/product/{product_id}/financial-review/autofill")
async def autofill_taric(
    product_id: int,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Call Gemini AI to get HS code and customs rate."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API key not configured. Set GEMINI_API_KEY in .env file.")

    try:
        from google import genai
        client = genai.Client(api_key=GEMINI_API_KEY)

        prompt = f"""You are an EU TARIC customs classification expert.
For the product "{product.name}" being imported from China to Romania (EU):
1. Provide the most accurate 10-digit HS/TARIC code
2. Provide the applicable customs duty rate as a percentage

Return ONLY a JSON object like: {{"hs_code": "8523511000", "customs_rate": 3.7}}
No explanation, just the JSON."""

        # Try multiple models with fallback
        models = ["gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash"]
        last_error = None
        response = None

        for model_name in models:
            try:
                response = await client.aio.models.generate_content(
                    model=model_name,
                    contents=prompt,
                )
                break
            except Exception as model_err:
                last_error = model_err
                err_str = str(model_err)
                if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                    continue
                raise

        if response is None:
            raise HTTPException(
                status_code=429,
                detail=f"All AI models are rate-limited. Please try again in a few minutes. Last error: {str(last_error)[:200]}"
            )

        raw_text = response.text.strip()

        match = re.search(r'\{[^}]+\}', raw_text)
        if not match:
            raise HTTPException(status_code=500, detail=f"Could not parse AI response: {raw_text[:200]}")

        data = json.loads(match.group())

        # Save
        detail = db.query(ProductPipelineDetail).filter(
            ProductPipelineDetail.product_id == product_id
        ).first()
        if not detail:
            detail = ProductPipelineDetail(product_id=product_id)
            db.add(detail)
        detail.hs_code = str(data.get("hs_code", ""))
        detail.customs_rate_percentage = float(data.get("customs_rate", 0))
        db.commit()

        return {
            "hs_code": detail.hs_code,
            "customs_rate_percentage": float(detail.customs_rate_percentage),
            "message": f"TARIC autofilled: HS {detail.hs_code}, Customs {detail.customs_rate_percentage}%",
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"TARIC autofill failed: {str(e)}")


# ─── Inline Key Data Edit ────────────────────────────────────────────
@router.patch("/api/product/{product_id}/key-data")
async def patch_key_data(
    product_id: int,
    body: dict,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Inline edit for title and variants."""
    detail = db.query(ProductPipelineDetail).filter(
        ProductPipelineDetail.product_id == product_id
    ).first()
    if not detail:
        raise HTTPException(status_code=404, detail="Pipeline detail not found")

    if "title" in body:
        detail.title = body["title"]
    if "variants" in body:
        detail.variants = body["variants"]

    db.commit()
    return {"message": "Updated"}


# ─── Pipeline Status View ────────────────────────────────────────────
@router.get("/api/pipeline/{status_slug}")
async def get_pipeline_status_view(
    status_slug: str,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
    title: Optional[str] = None,
    parser_id: Optional[int] = None,
    category_id: Optional[int] = None,
    group_id: Optional[int] = None,
    sales_ranking: Optional[str] = None,
    margin_health: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    min_cogs: Optional[float] = None,
    max_cogs: Optional[float] = None,
    sort_by: str = "id",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 50,
):
    """Products at a specific pipeline stage with financial KPIs."""
    # Convert slug to status
    status_map = {
        "new": "New", "supplier-info": "Waiting for Supplier Info",
        "financial-review": "Financial Review", "market-research": "Market Research",
        "approved": "Approved", "hold": "Hold", "discarded": "Discarded",
    }
    status = status_map.get(status_slug)
    if not status:
        raise HTTPException(status_code=404, detail="Invalid status")

    # Get settings for margin calculation
    vat_rate = get_setting(db, "VAT_RATE", 19.0)
    usd_to_ron = get_setting(db, "USD_TO_RON_CONVERSION_RATE", 4.60)
    high_margin = get_setting(db, "DECIMAL_HIGH_MARGIN_THRESHOLD", 50.0)
    avg_margin = get_setting(db, "DECIMAL_AVERAGE_MARGIN_THRESHOLD_LOWER", 30.0)

    conditions = ["p.pipeline_status = :status"]
    params: dict = {"status": status}

    if title:
        search_conds, search_params, _ = build_search_conditions(
            title, "p.name", param_prefix="ps", extra_columns=["ppd.title"]
        )
        conditions.extend(search_conds)
        params.update(search_params)
    if parser_id:
        conditions.append("p.parser_id = :parser_id")
        params["parser_id"] = parser_id
    if group_id:
        conditions.append("p.group_id = :group_id")
        params["group_id"] = group_id
    if sales_ranking:
        conditions.append("p.sales_ranking = :sales_ranking")
        params["sales_ranking"] = sales_ranking
    if min_price is not None:
        conditions.append("ppd.retail_price >= :min_price")
        params["min_price"] = min_price
    if max_price is not None:
        conditions.append("ppd.retail_price <= :max_price")
        params["max_price"] = max_price
    if min_cogs is not None:
        conditions.append("ppd.cogs_usd >= :min_cogs")
        params["min_cogs"] = min_cogs
    if max_cogs is not None:
        conditions.append("ppd.cogs_usd <= :max_cogs")
        params["max_cogs"] = max_cogs

    where_clause = " AND ".join(conditions)

    # Count query
    total = db.execute(text(f"""
        SELECT COUNT(*) FROM products p
        LEFT JOIN product_pipeline_details ppd ON ppd.product_id = p.id
        WHERE {where_clause}
    """), params).scalar() or 0

    offset = (page - 1) * page_size
    total_pages = max(1, (total + page_size - 1) // page_size)

    # Sort mapping
    safe_sort = {
        "id": "p.id", "title": "COALESCE(ppd.title, p.name)", "parser": "par.name",
        "parser_name": "par.name",
        "group": "pg.name", "retail_price": "ppd.retail_price",
        "cogs_usd": "ppd.cogs_usd",
        "margin": f"""CASE WHEN ppd.retail_price > 0 AND ppd.cogs_usd > 0 THEN
            ((ppd.retail_price / (1 + {vat_rate} / 100.0)) - ((COALESCE(ppd.cogs_usd,0) + COALESCE(ppd.transport_usd,0)) * (1 + COALESCE(ppd.customs_rate_percentage,0) / 100.0) * {usd_to_ron}))
            / (ppd.retail_price / (1 + {vat_rate} / 100.0)) * 100
            ELSE 0 END""",
        "gross_margin": f"""CASE WHEN ppd.retail_price > 0 AND ppd.cogs_usd > 0 THEN
            ((ppd.retail_price / (1 + {vat_rate} / 100.0)) - ((COALESCE(ppd.cogs_usd,0) + COALESCE(ppd.transport_usd,0)) * (1 + COALESCE(ppd.customs_rate_percentage,0) / 100.0) * {usd_to_ron}))
            / (ppd.retail_price / (1 + {vat_rate} / 100.0)) * 100
            ELSE 0 END""",
    }
    sort_col = safe_sort.get(sort_by, "p.id")
    direction = "DESC" if sort_dir.lower() == "desc" else "ASC"

    rows = db.execute(text(f"""
        SELECT
            p.id, p.image, p.name, p.sales_ranking, p.group_id,
            COALESCE(ppd.title, p.name) as title,
            ppd.retail_price, ppd.cogs_usd, ppd.transport_usd,
            ppd.customs_rate_percentage, ppd.suggested_quantity_min,
            ppd.suggested_quantity_max, ppd.top_keywords,
            par.name as parser_name,
            pg.name as group_name
        FROM products p
        LEFT JOIN product_pipeline_details ppd ON ppd.product_id = p.id
        LEFT JOIN parsers par ON par.id = p.parser_id
        LEFT JOIN product_groups pg ON pg.id = p.group_id
        WHERE {where_clause}
        ORDER BY {sort_col} {direction} NULLS LAST
        LIMIT :limit OFFSET :offset
    """), {**params, "limit": page_size, "offset": offset}).fetchall()

    products = []
    for r in rows:
        # Server-side margin calculation
        gross_margin = None
        margin_health_val = None
        if r.retail_price and r.cogs_usd:
            cogs = float(r.cogs_usd or 0)
            transport = float(r.transport_usd or 0)
            customs = float(r.customs_rate_percentage or 0)
            retail = float(r.retail_price)

            landed_ron = (cogs + transport) * (1 + customs / 100) * usd_to_ron
            retail_no_vat = retail / (1 + vat_rate / 100)
            if retail_no_vat > 0:
                gross_margin = round((retail_no_vat - landed_ron) / retail_no_vat * 100, 2)
                if gross_margin >= high_margin:
                    margin_health_val = "Healthy"
                elif gross_margin >= avg_margin:
                    margin_health_val = "Average"
                else:
                    margin_health_val = "Low"

        # Filter by margin_health if specified
        if margin_health and margin_health_val != margin_health:
            continue

        products.append({
            "id": r.id,
            "image": r.image,
            "title": r.title,
            "parser_name": r.parser_name,
            "group_name": r.group_name,
            "sales_ranking": r.sales_ranking,
            "retail_price": float(r.retail_price) if r.retail_price else None,
            "cogs_usd": float(r.cogs_usd) if r.cogs_usd else None,
            "gross_margin": gross_margin,
            "margin_health": margin_health_val,
            "suggested_quantity_min": r.suggested_quantity_min,
            "suggested_quantity_max": r.suggested_quantity_max,
        })

    return {
        "products": products,
        "status": status,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


# ─── Pipeline Status Excel Export ────────────────────────────────────
@router.get("/api/pipeline/{status_slug}/export")
async def export_pipeline_excel(
    status_slug: str,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Export all products at a pipeline status to Excel with financial KPIs."""
    import openpyxl
    import io
    from fastapi.responses import StreamingResponse

    status_map = {
        "new": "New", "supplier-info": "Waiting for Supplier Info",
        "financial-review": "Financial Review", "market-research": "Market Research",
        "approved": "Approved", "hold": "Hold", "discarded": "Discarded",
    }
    status = status_map.get(status_slug)
    if not status:
        raise HTTPException(status_code=404, detail="Invalid status")

    vat_rate = get_setting(db, "VAT_RATE", 19.0)
    usd_to_ron = get_setting(db, "USD_TO_RON_CONVERSION_RATE", 4.60)

    rows = db.execute(text("""
        SELECT
            p.id, p.name, p.sales_ranking,
            COALESCE(ppd.title, p.name) as title,
            ppd.retail_price, ppd.cogs_usd, ppd.transport_usd,
            ppd.customs_rate_percentage, ppd.suggested_quantity_min,
            ppd.suggested_quantity_max, ppd.hs_code,
            par.name as parser_name,
            pg.name as group_name
        FROM products p
        LEFT JOIN product_pipeline_details ppd ON ppd.product_id = p.id
        LEFT JOIN parsers par ON par.id = p.parser_id
        LEFT JOIN product_groups pg ON pg.id = p.group_id
        WHERE p.pipeline_status = :status
        ORDER BY p.id DESC
    """), {"status": status}).fetchall()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = status
    ws.append(["ID", "Title", "Store", "Group", "Ranking", "Retail (RON)",
               "COGS (USD)", "Transport (USD)", "Customs %", "Landed (RON)",
               "Margin %", "Health", "Qty Min", "Qty Max", "HS Code"])

    for r in rows:
        landed_ron = None
        margin = None
        health = ""
        if r.retail_price and r.cogs_usd:
            cogs = float(r.cogs_usd or 0)
            transport = float(r.transport_usd or 0)
            customs_pct = float(r.customs_rate_percentage or 0)
            retail = float(r.retail_price)
            landed_ron = (cogs + transport) * (1 + customs_pct / 100) * usd_to_ron
            retail_no_vat = retail / (1 + vat_rate / 100)
            if retail_no_vat > 0:
                margin = round((retail_no_vat - landed_ron) / retail_no_vat * 100, 2)
                health = "Healthy" if margin >= 50 else "Average" if margin >= 30 else "Low"

        ws.append([
            r.id, r.title, r.parser_name, r.group_name, r.sales_ranking,
            float(r.retail_price) if r.retail_price else None,
            float(r.cogs_usd) if r.cogs_usd else None,
            float(r.transport_usd) if r.transport_usd else None,
            float(r.customs_rate_percentage) if r.customs_rate_percentage else None,
            round(landed_ron, 2) if landed_ron else None,
            margin, health,
            r.suggested_quantity_min, r.suggested_quantity_max, r.hs_code,
        ])

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=pipeline-{status_slug}.xlsx"}
    )
