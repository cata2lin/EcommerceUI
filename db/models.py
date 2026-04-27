"""
SQLAlchemy ORM models mapping to the existing PostgreSQL schema.
10 models + 1 M2M association table.
"""
from sqlalchemy import (
    Column, Integer, String, Text, Float, Boolean, DateTime, ForeignKey,
    Table, Numeric, Sequence, func
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from db.session import Base


# ─── M2M Association ────────────────────────────────────────────────
product_assigned_categories = Table(
    "product_assigned_categories",
    Base.metadata,
    Column("product_id", Integer, ForeignKey("products.id"), primary_key=True),
    Column("category_id", Integer, ForeignKey("product_categories.id"), primary_key=True),
)


# ─── User ───────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)


# ─── Parser ─────────────────────────────────────────────────────────
class Parser(Base):
    __tablename__ = "parsers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    category = Column(String)

    products = relationship("Product", back_populates="parser")
    run_logs = relationship("ParserRunLog", back_populates="parser")


# ─── Product ────────────────────────────────────────────────────────
class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    original_id = Column(String, unique=True)
    name = Column(String, nullable=False)
    url = Column(String)
    image = Column(String)
    slug = Column(String)
    vendor = Column(String)
    stock_policy = Column(String)
    parser_id = Column(Integer, ForeignKey("parsers.id"))
    parent_id = Column(String)
    shortlisted = Column(Boolean, default=False)
    pipeline_status = Column(String, default=None)
    sales_ranking = Column(String)
    group_id = Column(Integer, ForeignKey("product_groups.id"))

    parser = relationship("Parser", back_populates="products")
    group = relationship("ProductGroup", back_populates="products")
    pipeline_detail = relationship("ProductPipelineDetail", uselist=False, back_populates="product")
    stock_history = relationship("StockHistory", back_populates="product", lazy="dynamic")
    price_history = relationship("PriceHistory", back_populates="product", lazy="dynamic")
    categories = relationship("ProductCategory", secondary=product_assigned_categories, back_populates="products")


# ─── ProductPipelineDetail ──────────────────────────────────────────
class ProductPipelineDetail(Base):
    __tablename__ = "product_pipeline_details"

    product_id = Column(Integer, ForeignKey("products.id"), primary_key=True)
    title = Column(String)
    variants = Column(JSONB, default=list)
    sku = Column(String)
    barcode = Column(String)
    specs = Column(Text)
    retail_price = Column(Numeric(10, 2))
    factory_link_url = Column(Text)
    cogs_usd = Column(Numeric(10, 2))
    transport_usd = Column(Numeric(10, 2))
    dimension_width_cm = Column(Numeric(10, 2))
    dimension_length_cm = Column(Numeric(10, 2))
    dimension_height_cm = Column(Numeric(10, 2))
    cubic_meters = Column(Numeric(10, 4))
    customs_rate_percentage = Column(Numeric(5, 2))
    hs_code = Column(String)
    top_keywords = Column(Text)
    keyword_difficulty = Column(String)
    main_competitors = Column(Text)
    market_research_insights = Column(Text)
    suggested_quantity_min = Column(Integer)
    suggested_quantity_max = Column(Integer)
    first_order_cost_estimate = Column(Numeric(10, 2))
    launch_notes = Column(Text)
    last_saved_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    monthly_sales_index = Column(JSONB)

    product = relationship("Product", back_populates="pipeline_detail")


# ─── StockHistory ───────────────────────────────────────────────────
class StockHistory(Base):
    __tablename__ = "stock_history"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    quantity = Column(Integer, nullable=False)
    timestamp = Column(DateTime, nullable=False, server_default=func.now())

    product = relationship("Product", back_populates="stock_history")


# ─── PriceHistory ───────────────────────────────────────────────────
class PriceHistory(Base):
    __tablename__ = "price_history"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    value = Column(Float, nullable=False)
    timestamp = Column(DateTime, nullable=False, server_default=func.now())

    product = relationship("Product", back_populates="price_history")


# ─── ProductCategory ────────────────────────────────────────────────
class ProductCategory(Base):
    __tablename__ = "product_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    code = Column(String)

    products = relationship("Product", secondary=product_assigned_categories, back_populates="categories")


# ─── ParserDefinedCategory ──────────────────────────────────────────
class ParserDefinedCategory(Base):
    __tablename__ = "parser_defined_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)


# ─── ProductGroup ───────────────────────────────────────────────────
class ProductGroup(Base):
    __tablename__ = "product_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)

    products = relationship("Product", back_populates="group")


# ─── ParserRunLog ───────────────────────────────────────────────────
class ParserRunLog(Base):
    __tablename__ = "parser_run_logs"

    id = Column(Integer, primary_key=True, index=True)
    parser_id = Column(Integer, ForeignKey("parsers.id"), nullable=False, index=True)
    run_date = Column(DateTime)
    products_found = Column(Integer)
    products_parsed_success = Column(Integer)
    products_parsed_failed = Column(Integer)
    stock_entries_saved = Column(Integer)
    price_entries_saved = Column(Integer)
    started_at = Column(DateTime)
    finished_at = Column(DateTime)
    duration_seconds = Column(Float)
    status = Column(String)
    error_message = Column(Text)
    speed_products_per_sec = Column(Float)

    parser = relationship("Parser", back_populates="run_logs")


# ─── ApplicationSetting ────────────────────────────────────────────
class ApplicationSetting(Base):
    __tablename__ = "application_settings"

    id = Column(Integer, primary_key=True, index=True)
    setting_key = Column(String, unique=True, nullable=False)
    setting_value = Column(String, nullable=False)
    value_type = Column(String, default="string")
    description = Column(Text)


# ─── PurchaseOrder ──────────────────────────────────────────────────
class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(Integer, primary_key=True, index=True)
    number = Column(
        Integer,
        Sequence("po_number_seq"),
        unique=True,
        nullable=False,
        server_default=func.nextval("po_number_seq"),
    )
    title = Column(Text)
    priority = Column(String(16), nullable=False, default="STANDARD")
    status = Column(String(32), nullable=False, default="DRAFT")
    notes = Column(Text)
    total_cost_usd = Column(Numeric(14, 2), default=0)
    created_by_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    approved_at = Column(DateTime)
    cancelled_at = Column(DateTime)

    tom_number = Column(String(64), unique=True)
    tom_po_id = Column(String(128))
    tom_status = Column(String(32))
    tom_sent_at = Column(DateTime)
    tom_send_idempotency_key = Column(String(64))
    tom_refreshed_at = Column(DateTime)
    tom_supplier_name = Column(Text)
    tom_supplier_url = Column(Text)
    tom_shipment_code = Column(Text)
    tom_shipment_mode = Column(String(32))
    tom_shipment_eta = Column(DateTime)

    items = relationship("PurchaseOrderItem", back_populates="purchase_order", cascade="all, delete-orphan")
    sync_logs = relationship("PoSyncLog", back_populates="purchase_order", cascade="all, delete-orphan")
    created_by = relationship("User")


# ─── PurchaseOrderItem ──────────────────────────────────────────────
class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"

    id = Column(Integer, primary_key=True, index=True)
    purchase_order_id = Column(Integer, ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    product_title = Column(Text, nullable=False)
    sku = Column(String(128))
    barcode = Column(String(128))
    image_url = Column(Text)
    quantity = Column(Integer, nullable=False, default=1)
    unit_cost_usd = Column(Numeric(12, 2))
    line_cost_usd = Column(Numeric(14, 2))
    priority = Column(String(16), nullable=False, default="STANDARD")
    notes = Column(Text)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    tom_item_id = Column(String(128))
    tom_status = Column(String(32))
    tom_matched_by = Column(String(32))
    tom_ordered_qty = Column(Integer)
    tom_received_qty = Column(Integer)
    tom_shipped_qty = Column(Integer)
    tom_unit_cost_usd = Column(Numeric(12, 2))
    tom_extra_cost_usd = Column(Numeric(12, 2))
    tom_shipment_code = Column(Text)
    tom_cancel_reason = Column(Text)

    purchase_order = relationship("PurchaseOrder", back_populates="items")
    product = relationship("Product", foreign_keys=[product_id])


# ─── PoSyncLog ──────────────────────────────────────────────────────
class PoSyncLog(Base):
    __tablename__ = "po_sync_logs"

    id = Column(Integer, primary_key=True, index=True)
    purchase_order_id = Column(Integer, ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False)
    direction = Column(String(8), nullable=False)
    action = Column(String(64), nullable=False)
    status = Column(String(16), nullable=False)
    http_status = Column(Integer)
    idempotency_key = Column(String(64))
    items_affected = Column(Integer, default=0)
    error_message = Column(Text)
    request_body = Column(JSONB)
    response_body = Column(JSONB)
    details = Column(JSONB)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    purchase_order = relationship("PurchaseOrder", back_populates="sync_logs")


# ─── ProductPurchaseOrderLink (junction; enforces "one PO per product ever") ─
class ProductPurchaseOrderLink(Base):
    __tablename__ = "product_purchase_order_links"

    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    purchase_order_id = Column(Integer, ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    linked_at = Column(DateTime, nullable=False, server_default=func.now())


# ─── TomApiConfig (single-row settings store for TOM API integration) ─────
class TomApiConfig(Base):
    __tablename__ = "tom_api_config"

    id = Column(Integer, primary_key=True, default=1)
    base_url = Column(Text)
    api_key_id = Column(Text)
    api_secret = Column(Text)
    source_code = Column(Text)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
