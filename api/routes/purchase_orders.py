"""
Purchase Orders API — CRUD, status transitions, TOM sync.

Design decisions (Option B):
 - One PO per product ever: enforced via product_purchase_order_links junction table (no ALTER on products).
 - Statuses: DRAFT → APPROVED → SENT_TO_TOM (+ CANCELLED terminal).
 - Removing a line or cancelling a PO releases the product lock.
 - PO lines are product-level (no variants).
 - PO number: sequential integer (Postgres sequence), displayed as "BI-{n}".
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from api.core.tom_client import get_source_code, is_tom_configured, tom_fetch
from api.routes.auth import get_current_user
from db.models import (
    PoSyncLog,
    Product,
    ProductPipelineDetail,
    PurchaseOrder,
    PurchaseOrderItem,
)
from db.session import get_db

router = APIRouter()

# ─── Constants ──────────────────────────────────────────────────────
PRIORITY_VALUES = {"STANDARD", "HIGH"}
STATUS_VALUES = {"DRAFT", "APPROVED", "SENT_TO_TOM", "CANCELLED"}

PUBLIC_APP_URL = os.getenv("PUBLIC_APP_URL", "http://localhost:8000").rstrip("/")


# ─── Serializers ────────────────────────────────────────────────────
def _d(v) -> Optional[float]:
    return float(v) if v is not None else None


def _dt(v) -> Optional[str]:
    return v.isoformat() if v else None


def _serialize_item(it: PurchaseOrderItem) -> dict:
    return {
        "id": it.id,
        "product_id": it.product_id,
        "product_title": it.product_title,
        "sku": it.sku,
        "barcode": it.barcode,
        "image_url": it.image_url,
        "quantity": it.quantity,
        "unit_cost_usd": _d(it.unit_cost_usd),
        "line_cost_usd": _d(it.line_cost_usd),
        "priority": it.priority,
        "notes": it.notes,
        "tom_item_id": it.tom_item_id,
        "tom_status": it.tom_status,
        "tom_matched_by": it.tom_matched_by,
        "tom_ordered_qty": it.tom_ordered_qty,
        "tom_received_qty": it.tom_received_qty,
        "tom_shipped_qty": it.tom_shipped_qty,
        "tom_unit_cost_usd": _d(it.tom_unit_cost_usd),
        "tom_extra_cost_usd": _d(it.tom_extra_cost_usd),
        "tom_shipment_code": it.tom_shipment_code,
        "tom_cancel_reason": it.tom_cancel_reason,
    }


def _serialize_po(po: PurchaseOrder, items: Optional[list] = None) -> dict:
    out = {
        "id": po.id,
        "number": po.number,
        "display_number": f"BI-{po.number:03d}",
        "title": po.title,
        "priority": po.priority,
        "status": po.status,
        "notes": po.notes,
        "total_cost_usd": _d(po.total_cost_usd),
        "items_count": len(items) if items is not None else None,
        "created_at": _dt(po.created_at),
        "updated_at": _dt(po.updated_at),
        "approved_at": _dt(po.approved_at),
        "cancelled_at": _dt(po.cancelled_at),
        "tom_number": po.tom_number,
        "tom_po_id": po.tom_po_id,
        "tom_status": po.tom_status,
        "tom_sent_at": _dt(po.tom_sent_at),
        "tom_refreshed_at": _dt(po.tom_refreshed_at),
        "tom_supplier_name": po.tom_supplier_name,
        "tom_supplier_url": po.tom_supplier_url,
        "tom_shipment_code": po.tom_shipment_code,
        "tom_shipment_mode": po.tom_shipment_mode,
        "tom_shipment_eta": _dt(po.tom_shipment_eta),
    }
    if items is not None:
        out["items"] = [_serialize_item(i) for i in items]
    return out


def _recompute_totals(po: PurchaseOrder) -> None:
    total = Decimal("0")
    for it in po.items:
        qty = Decimal(it.quantity or 0)
        cost = Decimal(it.unit_cost_usd or 0)
        line = qty * cost
        it.line_cost_usd = line
        total += line
    po.total_cost_usd = total


# ─── LIST + STATS ───────────────────────────────────────────────────
@router.get("/api/purchase-orders")
def list_purchase_orders(
    status: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 25,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    q = db.query(PurchaseOrder)
    if status:
        q = q.filter(PurchaseOrder.status == status)
    if search:
        s = f"%{search}%"
        # match PO number (int) or title or tom_number
        try:
            num = int(search.replace("BI-", "").strip())
            q = q.filter(
                (PurchaseOrder.number == num)
                | PurchaseOrder.title.ilike(s)
                | PurchaseOrder.tom_number.ilike(s)
            )
        except ValueError:
            q = q.filter(PurchaseOrder.title.ilike(s) | PurchaseOrder.tom_number.ilike(s))

    total = q.count()
    col_map = {
        "created_at": PurchaseOrder.created_at,
        "number": PurchaseOrder.number,
        "status": PurchaseOrder.status,
        "total_cost_usd": PurchaseOrder.total_cost_usd,
    }
    col = col_map.get(sort_by, PurchaseOrder.created_at)
    q = q.order_by(col.desc() if sort_dir == "desc" else col.asc())
    q = q.offset((page - 1) * page_size).limit(page_size)

    rows = q.all()
    # Items count via grouped query
    ids = [p.id for p in rows]
    counts: dict[int, int] = {}
    if ids:
        cnt_rows = db.execute(
            text(
                "SELECT purchase_order_id, COUNT(*) as c FROM purchase_order_items "
                "WHERE purchase_order_id = ANY(:ids) GROUP BY purchase_order_id"
            ),
            {"ids": ids},
        ).fetchall()
        counts = {r[0]: r[1] for r in cnt_rows}

    serialized = []
    for p in rows:
        d = _serialize_po(p)
        d["items_count"] = counts.get(p.id, 0)
        serialized.append(d)

    return {
        "purchase_orders": serialized,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/api/purchase-orders/stats")
def po_stats(db: Session = Depends(get_db), _user=Depends(get_current_user)):
    rows = db.execute(
        text(
            "SELECT status, COUNT(*) as c, COALESCE(SUM(total_cost_usd),0) as cost "
            "FROM purchase_orders GROUP BY status"
        )
    ).fetchall()
    counts = {s: 0 for s in STATUS_VALUES}
    costs = {s: 0.0 for s in STATUS_VALUES}
    total = 0
    total_cost = 0.0
    for r in rows:
        counts[r[0]] = r[1]
        costs[r[0]] = float(r[2] or 0)
        total += r[1]
        total_cost += float(r[2] or 0)
    return {
        "total": total,
        "total_cost_usd": total_cost,
        "by_status": {s: {"count": counts[s], "cost_usd": costs[s]} for s in STATUS_VALUES},
    }


# ─── GET single ─────────────────────────────────────────────────────
@router.get("/api/purchase-orders/{po_id}")
def get_purchase_order(
    po_id: int, db: Session = Depends(get_db), _user=Depends(get_current_user)
):
    po = (
        db.query(PurchaseOrder)
        .options(selectinload(PurchaseOrder.items))
        .filter(PurchaseOrder.id == po_id)
        .first()
    )
    if not po:
        raise HTTPException(404, "PO not found")
    return _serialize_po(po, items=po.items)


# ─── Sync logs ──────────────────────────────────────────────────────
@router.get("/api/purchase-orders/{po_id}/sync-logs")
def get_sync_logs(
    po_id: int, db: Session = Depends(get_db), _user=Depends(get_current_user)
):
    logs = (
        db.query(PoSyncLog)
        .filter(PoSyncLog.purchase_order_id == po_id)
        .order_by(PoSyncLog.created_at.desc())
        .limit(100)
        .all()
    )
    return {
        "logs": [
            {
                "id": lg.id,
                "direction": lg.direction,
                "action": lg.action,
                "status": lg.status,
                "http_status": lg.http_status,
                "idempotency_key": lg.idempotency_key,
                "items_affected": lg.items_affected,
                "error_message": lg.error_message,
                "details": lg.details,
                "request_body": lg.request_body,
                "response_body": lg.response_body,
                "created_at": _dt(lg.created_at),
            }
            for lg in logs
        ]
    }


# ─── Create ─────────────────────────────────────────────────────────
def _load_product_for_line(db: Session, product_id: int) -> tuple[Product, Optional[ProductPipelineDetail]]:
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(404, f"Product {product_id} not found")
    pd = (
        db.query(ProductPipelineDetail)
        .filter(ProductPipelineDetail.product_id == product_id)
        .first()
    )
    return p, pd


def _check_product_free(db: Session, product_id: int, allow_po_id: Optional[int] = None):
    """Enforce Option B — one PO per product ever (via product_purchase_order_links junction)."""
    exists = db.execute(
        text("SELECT 1 FROM products WHERE id = :id"), {"id": product_id}
    ).fetchone()
    if not exists:
        raise HTTPException(404, f"Product {product_id} not found")
    row = db.execute(
        text("SELECT purchase_order_id FROM product_purchase_order_links WHERE product_id = :id"),
        {"id": product_id},
    ).fetchone()
    cur = row[0] if row else None
    if cur and cur != allow_po_id:
        po_row = db.execute(
            text("SELECT number FROM purchase_orders WHERE id = :id"), {"id": cur}
        ).fetchone()
        num = po_row[0] if po_row else "?"
        raise HTTPException(
            409,
            f"Product {product_id} is already linked to PO BI-{num:03d}. "
            "Each product can belong to at most one PO.",
        )


def _link_product(db: Session, product_id: int, po_id: int):
    """Insert link row (idempotent for same po, fails ON CONFLICT for different po)."""
    db.execute(
        text(
            "INSERT INTO product_purchase_order_links (product_id, purchase_order_id) "
            "VALUES (:pid, :po) "
            "ON CONFLICT (product_id) DO NOTHING"
        ),
        {"pid": product_id, "po": po_id},
    )


def _unlink_product(db: Session, product_id: int, po_id: int):
    """Remove link row only if it points at this PO (defensive)."""
    db.execute(
        text(
            "DELETE FROM product_purchase_order_links "
            "WHERE product_id = :pid AND purchase_order_id = :po"
        ),
        {"pid": product_id, "po": po_id},
    )


def _build_item_from_product(
    p: Product, pd: Optional[ProductPipelineDetail], overrides: dict
) -> PurchaseOrderItem:
    title = (pd.title if pd else None) or p.name or f"Product #{p.id}"
    default_qty = (pd.suggested_quantity_min if pd else None) or 1
    default_cost = pd.cogs_usd if pd else None
    qty = int(overrides.get("quantity") or default_qty or 1)
    unit_cost = overrides.get("unit_cost_usd")
    if unit_cost is None and default_cost is not None:
        unit_cost = float(default_cost)
    priority = overrides.get("priority", "STANDARD")
    if priority not in PRIORITY_VALUES:
        priority = "STANDARD"
    return PurchaseOrderItem(
        product_id=p.id,
        product_title=overrides.get("product_title") or title,
        sku=(pd.sku if pd else None),
        barcode=(pd.barcode if pd else None),
        image_url=p.image,
        quantity=qty,
        unit_cost_usd=Decimal(str(unit_cost)) if unit_cost is not None else None,
        priority=priority,
        notes=overrides.get("notes"),
    )


@router.post("/api/purchase-orders")
def create_purchase_order(
    body: dict = Body(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    title = (body.get("title") or "").strip() or None
    priority = body.get("priority", "STANDARD")
    if priority not in PRIORITY_VALUES:
        priority = "STANDARD"
    notes = body.get("notes")
    items_in = body.get("items") or []

    # Pre-validate uniqueness
    for it in items_in:
        pid = it.get("product_id")
        if not pid:
            raise HTTPException(400, "Every item requires product_id")
        _check_product_free(db, int(pid))

    po = PurchaseOrder(
        title=title,
        priority=priority,
        notes=notes,
        status="DRAFT",
        created_by_id=getattr(user, "id", None),
    )
    db.add(po)
    db.flush()  # get po.id + po.number

    for it in items_in:
        p, pd = _load_product_for_line(db, int(it["product_id"]))
        line = _build_item_from_product(p, pd, it)
        line.purchase_order_id = po.id
        db.add(line)
        # Lock product via junction table
        _link_product(db, p.id, po.id)

    db.flush()
    db.refresh(po)
    po.items  # load
    _recompute_totals(po)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(409, f"Conflict: {e.orig}")
    db.refresh(po)
    return _serialize_po(po, items=po.items)


# ─── Update ─────────────────────────────────────────────────────────
@router.patch("/api/purchase-orders/{po_id}")
def update_purchase_order(
    po_id: int,
    body: dict = Body(...),
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(404, "PO not found")
    if po.status in {"CANCELLED"}:
        raise HTTPException(400, f"Cannot edit PO in status {po.status}")

    # Whitelist scalar fields
    for f in ("title", "notes"):
        if f in body:
            setattr(po, f, body[f])
    if "priority" in body and body["priority"] in PRIORITY_VALUES:
        po.priority = body["priority"]

    # Item updates: list of {id?, product_id, quantity, unit_cost_usd, priority, notes}
    if "items" in body:
        if po.status != "DRAFT":
            raise HTTPException(400, "Items can only be edited while PO is DRAFT")
        new_items = body["items"]
        existing = {it.id: it for it in po.items}
        keep_ids: set[int] = set()

        for raw in new_items:
            raw_id = raw.get("id")
            if raw_id and raw_id in existing:
                line = existing[raw_id]
                if "quantity" in raw:
                    line.quantity = int(raw["quantity"])
                if "unit_cost_usd" in raw and raw["unit_cost_usd"] is not None:
                    line.unit_cost_usd = Decimal(str(raw["unit_cost_usd"]))
                if "priority" in raw and raw["priority"] in PRIORITY_VALUES:
                    line.priority = raw["priority"]
                if "notes" in raw:
                    line.notes = raw["notes"]
                if "product_title" in raw:
                    line.product_title = raw["product_title"]
                keep_ids.add(raw_id)
            else:
                pid = int(raw["product_id"])
                _check_product_free(db, pid, allow_po_id=po.id)
                p, pd = _load_product_for_line(db, pid)
                new_line = _build_item_from_product(p, pd, raw)
                new_line.purchase_order_id = po.id
                db.add(new_line)
                _link_product(db, pid, po.id)

        # Delete removed lines + release their product locks
        for lid, line in existing.items():
            if lid not in keep_ids:
                _unlink_product(db, line.product_id, po.id)
                db.delete(line)

    db.flush()
    db.refresh(po)
    po.items
    _recompute_totals(po)
    db.commit()
    db.refresh(po)
    return _serialize_po(po, items=po.items)


# ─── Add single product ─────────────────────────────────────────────
@router.post("/api/purchase-orders/{po_id}/items")
def add_item(
    po_id: int,
    body: dict = Body(...),
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(404, "PO not found")
    if po.status != "DRAFT":
        raise HTTPException(400, "Items can only be added while PO is DRAFT")
    pid = int(body["product_id"])
    _check_product_free(db, pid, allow_po_id=po.id)
    p, pd = _load_product_for_line(db, pid)
    line = _build_item_from_product(p, pd, body)
    line.purchase_order_id = po.id
    db.add(line)
    _link_product(db, pid, po.id)
    db.flush()
    db.refresh(po)
    po.items
    _recompute_totals(po)
    db.commit()
    db.refresh(po)
    return _serialize_po(po, items=po.items)


@router.delete("/api/purchase-orders/{po_id}/items/{item_id}")
def delete_item(
    po_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(404, "PO not found")
    if po.status != "DRAFT":
        raise HTTPException(400, "Items can only be removed while PO is DRAFT")
    line = (
        db.query(PurchaseOrderItem)
        .filter(
            PurchaseOrderItem.id == item_id,
            PurchaseOrderItem.purchase_order_id == po_id,
        )
        .first()
    )
    if not line:
        raise HTTPException(404, "Item not found")
    _unlink_product(db, line.product_id, po.id)
    db.delete(line)
    db.flush()
    db.refresh(po)
    po.items
    _recompute_totals(po)
    db.commit()
    return {"ok": True}


# ─── Status transitions ─────────────────────────────────────────────
@router.post("/api/purchase-orders/{po_id}/approve")
def approve_po(po_id: int, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    po = (
        db.query(PurchaseOrder)
        .options(selectinload(PurchaseOrder.items))
        .filter(PurchaseOrder.id == po_id)
        .first()
    )
    if not po:
        raise HTTPException(404, "PO not found")
    if po.status != "DRAFT":
        raise HTTPException(400, f"Can only approve DRAFT POs (currently {po.status})")
    if not po.items:
        raise HTTPException(400, "Cannot approve empty PO")
    po.status = "APPROVED"
    po.approved_at = datetime.utcnow()
    db.commit()
    db.refresh(po)
    return _serialize_po(po, items=po.items)


@router.post("/api/purchase-orders/{po_id}/cancel")
def cancel_po(po_id: int, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    po = (
        db.query(PurchaseOrder)
        .options(selectinload(PurchaseOrder.items))
        .filter(PurchaseOrder.id == po_id)
        .first()
    )
    if not po:
        raise HTTPException(404, "PO not found")
    if po.status == "CANCELLED":
        raise HTTPException(400, "Already cancelled")
    po.status = "CANCELLED"
    po.cancelled_at = datetime.utcnow()
    # Release all product locks
    db.execute(
        text("DELETE FROM product_purchase_order_links WHERE purchase_order_id = :po"),
        {"po": po.id},
    )
    db.commit()
    db.refresh(po)
    return _serialize_po(po, items=po.items)


@router.delete("/api/purchase-orders/{po_id}")
def delete_po(po_id: int, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(404, "PO not found")
    if po.status != "DRAFT":
        raise HTTPException(400, "Only DRAFT POs can be deleted")
    db.execute(
        text("DELETE FROM product_purchase_order_links WHERE purchase_order_id = :po"),
        {"po": po.id},
    )
    db.delete(po)
    db.commit()
    return {"ok": True}


# ─── TOM Sync ───────────────────────────────────────────────────────
def _build_tom_payload(po: PurchaseOrder) -> dict:
    items = []
    for it in po.items:
        body: dict[str, Any] = {
            "source_line_id": str(it.id),
            "title": it.product_title,
            "image_url": it.image_url,
            "requested_qty": it.quantity,
            "priority": it.priority,
            "ref1_url": None,  # products.url — filled below
            "ref2_url": f"{PUBLIC_APP_URL}/product/{it.product_id}/pipeline-details",
        }
        if it.sku:
            body["sku"] = it.sku
        if it.barcode:
            body["barcode"] = it.barcode
        if it.unit_cost_usd is not None:
            body["requested_unit_cost_usd"] = float(it.unit_cost_usd)
        items.append(body)

    payload: dict[str, Any] = {
        "source_po_id": str(po.id),
        "source_po_number": f"BI-{po.number:03d}",
        "priority": po.priority,
        "type": "NEW_PRODUCT",
        "items": items,
    }
    if po.title:
        payload["title"] = po.title
    if po.notes:
        payload["notes"] = po.notes
    return payload


def _fill_ref1(db: Session, payload: dict, items: list[PurchaseOrderItem]) -> None:
    ids = [it.product_id for it in items]
    if not ids:
        return
    rows = db.execute(
        text("SELECT id, url FROM products WHERE id = ANY(:ids)"), {"ids": ids}
    ).fetchall()
    url_map = {r[0]: r[1] for r in rows}
    for p_item, src in zip(payload["items"], items):
        p_item["ref1_url"] = url_map.get(src.product_id)


def _pick(obj: Any, key: str):
    return obj.get(key) if isinstance(obj, dict) else None


def _extract_tom_ids(body: Any) -> tuple[Optional[str], Optional[str], Optional[str]]:
    if not isinstance(body, dict):
        return None, None, None
    err = body.get("error") if isinstance(body.get("error"), dict) else {}
    return (
        body.get("tom_number") or err.get("tom_number"),
        body.get("tom_po_id") or err.get("tom_po_id"),
        body.get("status"),
    )


@router.post("/api/purchase-orders/{po_id}/send-to-tom")
async def send_to_tom(
    po_id: int, db: Session = Depends(get_db), _user=Depends(get_current_user)
):
    if not is_tom_configured():
        raise HTTPException(400, "TOM is not configured on this server.")

    po = (
        db.query(PurchaseOrder)
        .options(selectinload(PurchaseOrder.items))
        .filter(PurchaseOrder.id == po_id)
        .first()
    )
    if not po:
        raise HTTPException(404, "PO not found")
    if po.status not in {"APPROVED", "SENT_TO_TOM"}:
        raise HTTPException(400, f"PO must be APPROVED before sending (currently {po.status})")
    if not po.items:
        raise HTTPException(400, "PO has no items")

    # Preconditions: all items must have image_url
    missing = [it.product_title for it in po.items if not (it.image_url or "").strip()]
    if missing:
        sample = "; ".join(missing[:5])
        suffix = f"; and {len(missing)-5} more" if len(missing) > 5 else ""
        raise HTTPException(
            422,
            f"Cannot send to TOM — {len(missing)} line(s) missing image URLs: {sample}{suffix}",
        )

    # Idempotency key (reuse on retry)
    if not po.tom_send_idempotency_key:
        po.tom_send_idempotency_key = str(uuid.uuid4())
        db.commit()
        db.refresh(po)

    payload = _build_tom_payload(po)
    _fill_ref1(db, payload, po.items)

    path = "/api/v1/po"
    http_status = 0
    resp_body: Any = None
    network_error: Optional[str] = None
    try:
        resp = await tom_fetch("POST", path, payload, po.tom_send_idempotency_key)
        http_status = resp["status"]
        resp_body = resp["body"]
    except Exception as e:
        network_error = str(e)

    created = http_status == 201
    already = http_status == 409
    success = created or already

    tom_number, tom_po_id, tom_status = _extract_tom_ids(resp_body)

    matched_by_summary: dict[str, int] = {}
    response_items = (
        resp_body.get("items") if isinstance(resp_body, dict) and isinstance(resp_body.get("items"), list) else []
    ) or []
    for ri in response_items:
        mb = _pick(ri, "matched_by") or "unknown"
        matched_by_summary[mb] = matched_by_summary.get(mb, 0) + 1

    if success and tom_number and tom_po_id:
        po.tom_number = tom_number
        po.tom_po_id = tom_po_id
        po.tom_status = tom_status
        po.tom_sent_at = datetime.utcnow()
        po.status = "SENT_TO_TOM"
        # Update line mirror
        by_id = {str(it.id): it for it in po.items}
        for ri in response_items:
            src_id = _pick(ri, "source_line_id")
            if src_id and src_id in by_id:
                ln = by_id[src_id]
                ln.tom_item_id = _pick(ri, "tom_item_id")
                ln.tom_status = _pick(ri, "status")
                ln.tom_matched_by = _pick(ri, "matched_by")

    err_msg = None
    err_code = None
    if not success:
        err = resp_body.get("error") if isinstance(resp_body, dict) else None
        if isinstance(err, dict):
            err_msg = err.get("message")
            err_code = err.get("code")
        err_msg = network_error or err_msg or f"HTTP {http_status}"

    db.add(
        PoSyncLog(
            purchase_order_id=po.id,
            direction="OUT",
            action="TOM_PO_CREATE",
            status="SUCCESS" if success else "FAILED",
            http_status=http_status or None,
            idempotency_key=po.tom_send_idempotency_key,
            items_affected=len(po.items),
            error_message=err_msg,
            request_body=payload,
            response_body=resp_body if isinstance(resp_body, (dict, list)) else None,
            details={
                "endpoint": path,
                "method": "POST",
                "already_existed": already,
                "error_code": err_code,
                "matched_by_summary": matched_by_summary,
                "network_error": network_error,
            },
        )
    )
    db.commit()
    db.refresh(po)
    po.items

    if not success:
        return {
            "ok": False,
            "status": http_status,
            "error_message": err_msg,
            "purchase_order": _serialize_po(po, items=po.items),
        }
    return {
        "ok": True,
        "status": http_status,
        "already_existed": already,
        "tom_number": tom_number,
        "purchase_order": _serialize_po(po, items=po.items),
    }


@router.post("/api/purchase-orders/{po_id}/refresh-from-tom")
async def refresh_from_tom(
    po_id: int, db: Session = Depends(get_db), _user=Depends(get_current_user)
):
    if not is_tom_configured():
        raise HTTPException(400, "TOM is not configured on this server.")
    po = (
        db.query(PurchaseOrder)
        .options(selectinload(PurchaseOrder.items))
        .filter(PurchaseOrder.id == po_id)
        .first()
    )
    if not po:
        raise HTTPException(404, "PO not found")
    if not po.tom_po_id:
        raise HTTPException(400, "PO has not been sent to TOM yet")

    path = f"/api/v1/po/{get_source_code()}/{po.id}"
    idempotency_key = str(uuid.uuid4())
    http_status = 0
    resp_body: Any = None
    network_error: Optional[str] = None
    try:
        resp = await tom_fetch("GET", path, None, idempotency_key)
        http_status = resp["status"]
        resp_body = resp["body"]
    except Exception as e:
        network_error = str(e)

    success = http_status == 200
    items_updated = 0
    tom_status = None
    err_msg = None

    if success and isinstance(resp_body, dict):
        tom_status = resp_body.get("status")
        supplier = resp_body.get("supplier") if isinstance(resp_body.get("supplier"), dict) else {}
        shipment = resp_body.get("shipment") if isinstance(resp_body.get("shipment"), dict) else {}
        po.tom_status = tom_status
        po.tom_refreshed_at = datetime.utcnow()
        po.tom_supplier_name = supplier.get("name") if supplier else None
        po.tom_supplier_url = supplier.get("url") if supplier else None
        po.tom_shipment_code = shipment.get("code") if shipment else None
        po.tom_shipment_mode = shipment.get("mode") if shipment else None
        eta = shipment.get("eta") if shipment else None
        if eta:
            try:
                po.tom_shipment_eta = datetime.fromisoformat(eta.replace("Z", "+00:00"))
            except Exception:
                po.tom_shipment_eta = None
        by_id = {str(it.id): it for it in po.items}
        for ri in resp_body.get("items") or []:
            src = _pick(ri, "source_line_id")
            if not src or src not in by_id:
                continue
            ln = by_id[src]
            ln.tom_item_id = _pick(ri, "tom_item_id") or ln.tom_item_id
            ln.tom_status = _pick(ri, "status")
            ln.tom_ordered_qty = _pick(ri, "ordered_qty")
            ln.tom_received_qty = _pick(ri, "received_qty")
            ln.tom_shipped_qty = _pick(ri, "shipped_qty")
            ucu = _pick(ri, "tom_unit_cost_usd")
            if ucu is not None:
                ln.tom_unit_cost_usd = Decimal(str(ucu))
            ecu = _pick(ri, "extra_cost_usd")
            if ecu is not None:
                ln.tom_extra_cost_usd = Decimal(str(ecu))
            ln.tom_shipment_code = _pick(ri, "shipment_code")
            ln.tom_cancel_reason = _pick(ri, "cancel_reason")
            items_updated += 1
    elif not success:
        err = resp_body.get("error") if isinstance(resp_body, dict) else None
        err_msg = network_error or (err.get("message") if isinstance(err, dict) else None) or f"HTTP {http_status}"

    db.add(
        PoSyncLog(
            purchase_order_id=po.id,
            direction="IN",
            action="TOM_PO_REFRESH",
            status="SUCCESS" if success else "FAILED",
            http_status=http_status or None,
            idempotency_key=idempotency_key,
            items_affected=items_updated,
            error_message=err_msg,
            request_body=None,
            response_body=resp_body if isinstance(resp_body, (dict, list)) else None,
            details={"endpoint": path, "method": "GET", "network_error": network_error},
        )
    )
    db.commit()
    db.refresh(po)
    po.items
    return {
        "ok": success,
        "status": http_status,
        "items_updated": items_updated,
        "purchase_order": _serialize_po(po, items=po.items),
    }
