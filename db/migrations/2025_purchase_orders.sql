-- Purchase Order module schema
-- Option B: one PO per product ever (enforced via product_purchase_order_links junction table — products table is NOT modified)
-- No reception, no location, no variants.

-- ─── Purchase Orders ───────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS po_number_seq START 1;

CREATE TABLE IF NOT EXISTS purchase_orders (
    id                        SERIAL PRIMARY KEY,
    number                    INTEGER NOT NULL UNIQUE DEFAULT nextval('po_number_seq'),
    title                     TEXT,
    priority                  VARCHAR(16) NOT NULL DEFAULT 'STANDARD',  -- STANDARD|HIGH
    status                    VARCHAR(32) NOT NULL DEFAULT 'DRAFT',     -- DRAFT|APPROVED|SENT_TO_TOM|CANCELLED
    notes                     TEXT,
    total_cost_usd            NUMERIC(14,2) DEFAULT 0,
    created_by_id             INTEGER REFERENCES users(id),
    created_at                TIMESTAMP NOT NULL DEFAULT now(),
    updated_at                TIMESTAMP NOT NULL DEFAULT now(),
    approved_at               TIMESTAMP,
    cancelled_at              TIMESTAMP,

    -- TOM integration mirror fields
    tom_number                VARCHAR(64) UNIQUE,
    tom_po_id                 VARCHAR(128),
    tom_status                VARCHAR(32),
    tom_sent_at               TIMESTAMP,
    tom_send_idempotency_key  VARCHAR(64),
    tom_refreshed_at          TIMESTAMP,
    tom_supplier_name         TEXT,
    tom_supplier_url          TEXT,
    tom_shipment_code         TEXT,
    tom_shipment_mode         VARCHAR(32),
    tom_shipment_eta          TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_purchase_orders_status   ON purchase_orders (status);
CREATE INDEX IF NOT EXISTS ix_purchase_orders_created  ON purchase_orders (created_at DESC);

-- ─── Purchase Order Items ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id                   SERIAL PRIMARY KEY,
    purchase_order_id    INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id           INTEGER NOT NULL REFERENCES products(id),
    product_title        TEXT NOT NULL,
    sku                  VARCHAR(128),
    barcode              VARCHAR(128),
    image_url            TEXT,
    quantity             INTEGER NOT NULL DEFAULT 1,
    unit_cost_usd        NUMERIC(12,2),
    line_cost_usd        NUMERIC(14,2),
    priority             VARCHAR(16) NOT NULL DEFAULT 'STANDARD',
    notes                TEXT,
    created_at           TIMESTAMP NOT NULL DEFAULT now(),

    -- TOM mirror
    tom_item_id          VARCHAR(128),
    tom_status           VARCHAR(32),
    tom_matched_by       VARCHAR(32),
    tom_ordered_qty      INTEGER,
    tom_received_qty     INTEGER,
    tom_shipped_qty      INTEGER,
    tom_unit_cost_usd    NUMERIC(12,2),
    tom_extra_cost_usd   NUMERIC(12,2),
    tom_shipment_code    TEXT,
    tom_cancel_reason    TEXT,

    CONSTRAINT uq_po_product UNIQUE (purchase_order_id, product_id)
);

CREATE INDEX IF NOT EXISTS ix_po_items_po      ON purchase_order_items (purchase_order_id);
CREATE INDEX IF NOT EXISTS ix_po_items_product ON purchase_order_items (product_id);

-- ─── PO Sync Log ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS po_sync_logs (
    id                   SERIAL PRIMARY KEY,
    purchase_order_id    INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    direction            VARCHAR(8) NOT NULL,       -- OUT | IN
    action               VARCHAR(64) NOT NULL,      -- TOM_PO_CREATE | TOM_PO_REFRESH | TOM_PO_CANCEL | ...
    status               VARCHAR(16) NOT NULL,      -- SUCCESS | FAILED
    http_status          INTEGER,
    idempotency_key      VARCHAR(64),
    items_affected       INTEGER DEFAULT 0,
    error_message        TEXT,
    request_body         JSONB,
    response_body        JSONB,
    details              JSONB,
    created_at           TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_po_sync_logs_po      ON po_sync_logs (purchase_order_id, created_at DESC);

-- ─── Product ⇄ PO link (Option B: one PO per product ever) ────────
-- Junction table avoids any ALTER TABLE on the high-traffic products table.
-- product_id is the PRIMARY KEY → enforces "one PO per product" without unique partial index.
-- Rows are deleted when a PO is cancelled / a DRAFT line is removed → product becomes free again.
CREATE TABLE IF NOT EXISTS product_purchase_order_links (
    product_id          INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    purchase_order_id   INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    linked_at           TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_pp_link_po ON product_purchase_order_links (purchase_order_id);
