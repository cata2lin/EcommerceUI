-- =====================================================
-- E-Commerce Intelligence Platform — Full Database Schema
-- Generated via information_schema introspection
-- =====================================================

-- ─── Extensions ─────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- v1.6
CREATE EXTENSION IF NOT EXISTS postgres_fdw;  -- v1.1
CREATE EXTENSION IF NOT EXISTS unaccent;  -- v1.1


-- ─── Table: application_settings ─────────────────────────────────
CREATE TABLE application_settings (
    id INTEGER NOT NULL DEFAULT nextval('application_settings_id_seq'::regclass),
    setting_key VARCHAR(100) NOT NULL,
    setting_value TEXT,
    description TEXT,
    value_type VARCHAR(50) DEFAULT 'string'::character varying,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);


-- ─── Table: parser_defined_categories ─────────────────────────────────
CREATE TABLE parser_defined_categories (
    id INTEGER NOT NULL DEFAULT nextval('parser_defined_categories_id_seq'::regclass),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);


-- ─── Table: parser_run_logs ─────────────────────────────────
CREATE TABLE parser_run_logs (
    id INTEGER NOT NULL DEFAULT nextval('parser_run_logs_id_seq'::regclass),
    parser_id INTEGER NOT NULL,
    run_date TIMESTAMP NOT NULL,
    products_found INTEGER,
    products_parsed_success INTEGER,
    products_parsed_failed INTEGER,
    stock_entries_saved INTEGER,
    price_entries_saved INTEGER,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    duration_seconds DOUBLE PRECISION,
    status VARCHAR,
    error_message VARCHAR,
    speed_products_per_sec DOUBLE PRECISION,
    PRIMARY KEY (id)
);

ALTER TABLE parser_run_logs ADD FOREIGN KEY (parser_id) REFERENCES parsers(id);

-- ─── Table: parsers ─────────────────────────────────
CREATE TABLE parsers (
    id INTEGER NOT NULL DEFAULT nextval('parsers_id_seq'::regclass),
    name VARCHAR,
    category VARCHAR(100),
    PRIMARY KEY (id)
);


-- ─── Table: price_history ─────────────────────────────────
CREATE TABLE price_history (
    id INTEGER NOT NULL DEFAULT nextval('price_history_id_seq'::regclass),
    product_id INTEGER NOT NULL,
    value DOUBLE PRECISION,
    timestamp TIMESTAMP,
    PRIMARY KEY (id)
);

ALTER TABLE price_history ADD FOREIGN KEY (product_id) REFERENCES products(id);

-- ─── Table: product_assigned_categories ─────────────────────────────────
CREATE TABLE product_assigned_categories (
    product_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    PRIMARY KEY (product_id, category_id)
);

ALTER TABLE product_assigned_categories ADD FOREIGN KEY (category_id) REFERENCES product_categories(id);
ALTER TABLE product_assigned_categories ADD FOREIGN KEY (product_id) REFERENCES products(id);

-- ─── Table: product_categories ─────────────────────────────────
CREATE TABLE product_categories (
    id INTEGER NOT NULL DEFAULT nextval('product_categories_id_seq'::regclass),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    code VARCHAR(50),
    PRIMARY KEY (id)
);


-- ─── Table: product_groups ─────────────────────────────────
CREATE TABLE product_groups (
    id INTEGER NOT NULL DEFAULT nextval('product_groups_id_seq'::regclass),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id)
);


-- ─── Table: product_pipeline_details ─────────────────────────────────
CREATE TABLE product_pipeline_details (
    product_id INTEGER NOT NULL,
    specs TEXT,
    retail_price NUMERIC(12,2),
    factory_link_url TEXT,
    cogs_usd NUMERIC(12,2),
    transport_usd NUMERIC(12,2),
    dimension_width_cm NUMERIC(10,2),
    dimension_length_cm NUMERIC(10,2),
    dimension_height_cm NUMERIC(10,2),
    cubic_meters NUMERIC(10,4),
    customs_rate_percentage NUMERIC(5,2),
    hs_code VARCHAR(100),
    top_keywords TEXT,
    keyword_difficulty VARCHAR(50),
    main_competitors TEXT,
    market_research_insights TEXT,
    suggested_quantity_min INTEGER,
    suggested_quantity_max INTEGER,
    first_order_cost_estimate NUMERIC(12,2),
    launch_notes TEXT,
    last_saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    monthly_sales_index JSONB,
    title TEXT,
    variants JSONB,
    sku VARCHAR(100),
    barcode VARCHAR(13),
    title_search TEXT,
    PRIMARY KEY (product_id)
);

ALTER TABLE product_pipeline_details ADD FOREIGN KEY (product_id) REFERENCES products(id);

-- ─── Table: products ─────────────────────────────────
CREATE TABLE products (
    id INTEGER NOT NULL DEFAULT nextval('products_id_seq'::regclass),
    original_id VARCHAR,
    name VARCHAR,
    url VARCHAR,
    image VARCHAR,
    slug VARCHAR,
    vendor VARCHAR,
    stock_policy VARCHAR,
    parser_id INTEGER,
    parent_id VARCHAR,
    shortlisted BOOLEAN DEFAULT false,
    pipeline_status VARCHAR(50) DEFAULT 'None'::character varying,
    sales_ranking VARCHAR(20),
    group_id INTEGER,
    name_search TEXT,
    PRIMARY KEY (id)
);

ALTER TABLE products ADD FOREIGN KEY (group_id) REFERENCES product_groups(id);
ALTER TABLE products ADD FOREIGN KEY (parser_id) REFERENCES parsers(id);

-- ─── Table: stock_history ─────────────────────────────────
CREATE TABLE stock_history (
    id INTEGER NOT NULL DEFAULT nextval('stock_history_id_seq'::regclass),
    product_id INTEGER NOT NULL,
    quantity INTEGER,
    timestamp TIMESTAMP,
    PRIMARY KEY (id)
);

ALTER TABLE stock_history ADD FOREIGN KEY (product_id) REFERENCES products(id);

-- ─── Table: users ─────────────────────────────────
CREATE TABLE users (
    id INTEGER NOT NULL DEFAULT nextval('users_id_seq'::regclass),
    username VARCHAR NOT NULL,
    hashed_password VARCHAR NOT NULL,
    PRIMARY KEY (id)
);



-- ─── Indexes ────────────────────────────────────────
CREATE UNIQUE INDEX application_settings_setting_key_key ON public.application_settings USING btree (setting_key);
CREATE UNIQUE INDEX mv_best_sellers_product_id_uq ON public.mv_best_sellers USING btree (product_id);
CREATE UNIQUE INDEX mv_best_sellers_ranked_product_id_uq ON public.mv_best_sellers_ranked USING btree (product_id);
CREATE UNIQUE INDEX mv_latest_price_product_id_uq ON public.mv_latest_price USING btree (product_id);
CREATE UNIQUE INDEX mv_lp_pk ON public.mv_latest_price USING btree (product_id);
CREATE UNIQUE INDEX mv_latest_stock_product_id_uq ON public.mv_latest_stock USING btree (product_id);
CREATE INDEX mv_latest_stock_timestamp_idx ON public.mv_latest_stock USING btree ("timestamp");
CREATE INDEX mv_parser_activity_latest_update_idx ON public.mv_parser_activity USING btree (latest_stock_update);
CREATE INDEX mv_parser_activity_name_idx ON public.mv_parser_activity USING btree (parser_name);
CREATE UNIQUE INDEX mv_parser_activity_parser_id_uq ON public.mv_parser_activity USING btree (parser_id);
CREATE UNIQUE INDEX mv_pds_pk ON public.mv_product_daily_sales USING btree (product_id, s_day);
CREATE INDEX mv_pds_units_idx ON public.mv_product_daily_sales USING btree (units_sold);
CREATE UNIQUE INDEX mv_product_daily_sales_uq ON public.mv_product_daily_sales USING btree (product_id, s_day);
CREATE INDEX idx_mv_product_scores_grade ON public.mv_product_scores USING btree (grade);
CREATE UNIQUE INDEX idx_mv_product_scores_pid ON public.mv_product_scores USING btree (product_id);
CREATE INDEX idx_mv_product_scores_total ON public.mv_product_scores USING btree (total_score DESC);
CREATE UNIQUE INDEX mv_sidebar_parser_counts_id_uq ON public.mv_sidebar_parser_counts USING btree (id);
CREATE UNIQUE INDEX mv_sidebar_pipeline_status_counts_status_uq ON public.mv_sidebar_pipeline_status_counts USING btree (pipeline_status);
CREATE UNIQUE INDEX mv_sidebar_pipeline_status_counts_uq ON public.mv_sidebar_pipeline_status_counts USING btree (pipeline_status);
CREATE INDEX mv_sld_day_idx ON public.mv_stock_last_per_day USING btree (s_day);
CREATE UNIQUE INDEX mv_sld_pk ON public.mv_stock_last_per_day USING btree (product_id, s_day);
CREATE UNIQUE INDEX mv_stock_last_per_day_uq ON public.mv_stock_last_per_day USING btree (product_id, s_day);
CREATE UNIQUE INDEX mv_vendor_counts_all_vendor_uq ON public.mv_vendor_counts_all USING btree (vendor);
CREATE UNIQUE INDEX mv_vendor_counts_by_parser_uq ON public.mv_vendor_counts_by_parser USING btree (parser_id, vendor);
CREATE UNIQUE INDEX parser_defined_categories_name_key ON public.parser_defined_categories USING btree (name);
CREATE INDEX idx_prl_parser_id ON public.parser_run_logs USING btree (parser_id);
CREATE INDEX idx_prl_run_date ON public.parser_run_logs USING btree (run_date);
CREATE INDEX ix_parser_run_logs_id ON public.parser_run_logs USING btree (id);
CREATE INDEX ix_parser_run_logs_parser_id ON public.parser_run_logs USING btree (parser_id);
CREATE INDEX ix_parser_run_logs_run_date ON public.parser_run_logs USING btree (run_date);
CREATE UNIQUE INDEX parser_status_mv_parser_id_idx ON public.parser_status_mv USING btree (parser_id);
CREATE UNIQUE INDEX parser_status_mv_parser_id_uq ON public.parser_status_mv USING btree (parser_id);
CREATE INDEX ix_parsers_category ON public.parsers USING btree (category);
CREATE UNIQUE INDEX ix_parsers_name ON public.parsers USING btree (name);
CREATE INDEX idx_price_history_product_ts_desc ON public.price_history USING btree (product_id, "timestamp" DESC);
CREATE INDEX ix_price_history_pid_ts_desc ON public.price_history USING btree (product_id, "timestamp" DESC) INCLUDE (value);
CREATE INDEX ix_price_history_ts_brin ON public.price_history USING brin ("timestamp") WITH (pages_per_range='64');
CREATE INDEX product_assigned_categories_category_idx ON public.product_assigned_categories USING btree (category_id, product_id);
CREATE UNIQUE INDEX product_categories_code_key ON public.product_categories USING btree (code);
CREATE UNIQUE INDEX product_categories_name_key ON public.product_categories USING btree (name);
CREATE UNIQUE INDEX product_groups_name_key ON public.product_groups USING btree (name);
CREATE INDEX idx_pipeline_title_search_fts ON public.product_pipeline_details USING gin (to_tsvector('simple'::regconfig, COALESCE(title_search, ''::text)));
CREATE INDEX product_pipeline_details_barcode_idx ON public.product_pipeline_details USING btree (barcode);
CREATE INDEX product_pipeline_details_sku_idx ON public.product_pipeline_details USING btree (sku);
CREATE INDEX idx_products_name_lower_trgm ON public.products USING gin (lower((COALESCE(name, ''::character varying))::text) gin_trgm_ops);
CREATE INDEX idx_products_name_search_fts ON public.products USING gin (to_tsvector('simple'::regconfig, COALESCE(name_search, ''::text)));
CREATE INDEX idx_products_name_search_trgm ON public.products USING gin (COALESCE(name_search, ''::text) gin_trgm_ops);
CREATE INDEX idx_products_not_in_pipeline ON public.products USING btree (id) WHERE ((pipeline_status IS NULL) OR ((pipeline_status)::text = 'None'::text));
CREATE INDEX idx_products_parser_id ON public.products USING btree (parser_id, id);
CREATE INDEX idx_products_parser_pipeline_id ON public.products USING btree (parser_id, pipeline_status, id);
CREATE INDEX idx_products_shortlisted_id ON public.products USING btree (shortlisted, id);
CREATE INDEX ix_products_group_id ON public.products USING btree (group_id);
CREATE INDEX ix_products_name_trgm ON public.products USING gin (name gin_trgm_ops);
CREATE UNIQUE INDEX ix_products_original_id ON public.products USING btree (original_id);
CREATE INDEX ix_products_parser_group ON public.products USING btree (parser_id, group_id);
CREATE INDEX ix_products_pipeline_status ON public.products USING btree (pipeline_status);
CREATE INDEX ix_products_sales_ranking ON public.products USING btree (sales_ranking);
CREATE INDEX ix_products_shortlisted_true ON public.products USING btree (id) WHERE (shortlisted IS TRUE);
CREATE INDEX ix_products_vendor ON public.products USING btree (vendor);
CREATE INDEX idx_stock_history_product_ts_desc ON public.stock_history USING btree (product_id, "timestamp" DESC);
CREATE INDEX idx_stock_history_ts_product ON public.stock_history USING btree ("timestamp" DESC, product_id);
CREATE INDEX ix_stock_history_pid_ts_desc ON public.stock_history USING btree (product_id, "timestamp" DESC) INCLUDE (quantity);
CREATE INDEX ix_stock_history_ts_brin ON public.stock_history USING brin ("timestamp") WITH (pages_per_range='64');
CREATE INDEX ix_store_daily_metrics_day ON public.store_daily_metrics_mv USING btree (day);
CREATE UNIQUE INDEX store_daily_metrics_mv_uq ON public.store_daily_metrics_mv USING btree (store_id, day);
CREATE UNIQUE INDEX ux_store_daily_metrics ON public.store_daily_metrics_mv USING btree (store_id, day);
CREATE UNIQUE INDEX users_username_key ON public.users USING btree (username);


-- ─── Materialized Views ─────────────────────────────

-- MV: mv_best_sellers
CREATE MATERIALIZED VIEW mv_best_sellers AS
 WITH settings AS (
         SELECT COALESCE(( SELECT (application_settings.setting_value)::integer AS setting_value
                   FROM application_settings
                  WHERE ((application_settings.setting_key)::text = 'SALES_OUTLIER_MULTIPLIER'::text)), 10) AS outlier_multiplier
        ), product_stats AS (
         SELECT mv_product_daily_sales.product_id,
            percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((mv_product_daily_sales.units_sold)::double precision)) AS median_daily_sales
           FROM mv_product_daily_sales
          WHERE (mv_product_daily_sales.units_sold > 0)
          GROUP BY mv_product_daily_sales.product_id
        ), win AS (
         SELECT pds.product_id,
            sum(LEAST((pds.units_sold)::double precision, ((COALESCE(ps.median_daily_sales, (0)::double precision) * (( SELECT settings.outlier_multiplier
                   FROM settings))::double precision) + (5)::double precision))) FILTER (WHERE (pds.s_day >= (CURRENT_DATE - '7 days'::interval))) AS sold7,
            sum(LEAST((pds.units_sold)::double precision, ((COALESCE(ps.median_daily_sales, (0)::double precision) * (( SELECT settings.outlier_multiplier
                   FROM settings))::double precision) + (5)::double precision))) FILTER (WHERE (pds.s_day >= (CURRENT_DATE - '30 days'::interval))) AS sold30,
            sum(LEAST((pds.units_sold)::double precision, ((COALESCE(ps.median_daily_sales, (0)::double precision) * (( SELECT settings.outlier_multiplier
                   FROM settings))::double precision) + (5)::double precision))) FILTER (WHERE (pds.s_day >= (CURRENT_DATE - '90 days'::interval))) AS sold90,
            max(pds.s_day) FILTER (WHERE (pds.units_sold > 0)) AS last_sold_day
           FROM (mv_product_daily_sales pds
             LEFT JOIN product_stats ps ON ((pds.product_id = ps.product_id)))
          GROUP BY pds.product_id
        ), latest AS (
         SELECT DISTINCT ON (mv_stock_last_per_day.product_id) mv_stock_last_per_day.product_id,
            mv_stock_last_per_day.close_stock AS latest_stock
           FROM mv_stock_last_per_day
          ORDER BY mv_stock_last_per_day.product_id, mv_stock_last_per_day.s_day DESC
        )
 SELECT p.id AS product_id,
    p.parser_id,
    par.name AS parser_name,
    p.vendor,
    p.name,
    p.url,
    p.image,
    COALESCE(l.latest_stock, 0) AS latest_stock,
    COALESCE(lp.price, (0)::double precision) AS price,
    round(((COALESCE(win.sold7, (0)::double precision))::numeric / (7)::numeric), 2) AS ads7_cal,
    round(((COALESCE(win.sold30, (0)::double precision))::numeric / (30)::numeric), 2) AS ads30_cal,
    round(((COALESCE(win.sold90, (0)::double precision))::numeric / (90)::numeric), 2) AS ads90_cal,
    win.last_sold_day,
    to_tsvector('romanian_unaccent'::regconfig, (((COALESCE(p.name, ''::character varying))::text || ' '::text) || (COALESCE(p.vendor, ''::character varying))::text)) AS search_vector
   FROM ((((win
     JOIN products p ON ((p.id = win.product_id)))
     LEFT JOIN parsers par ON ((par.id = p.parser_id)))
     LEFT JOIN latest l ON ((l.product_id = p.id)))
     LEFT JOIN mv_latest_price lp ON ((lp.product_id = p.id)));;


-- MV: mv_best_sellers_ranked
CREATE MATERIALIZED VIEW mv_best_sellers_ranked AS
 SELECT product_id,
    parser_id,
    parser_name,
    vendor,
    name,
    url,
    image,
    latest_stock,
    price,
    ads7_cal,
    ads30_cal,
    ads90_cal,
    last_sold_day,
    search_vector,
    dense_rank() OVER (ORDER BY ads30_cal DESC NULLS LAST) AS rnk_global_ads30,
    dense_rank() OVER (PARTITION BY parser_id ORDER BY ads30_cal DESC NULLS LAST) AS rnk_store_ads30
   FROM mv_best_sellers;;


-- MV: mv_latest_price
CREATE MATERIALIZED VIEW mv_latest_price AS
 SELECT DISTINCT ON (product_id) product_id,
    value AS price,
    "timestamp" AS price_seen_at
   FROM price_history ph
  ORDER BY product_id, "timestamp" DESC, id DESC;;


-- MV: mv_latest_stock
CREATE MATERIALIZED VIEW mv_latest_stock AS
 SELECT DISTINCT ON (product_id) product_id,
    quantity,
    "timestamp"
   FROM stock_history sh
  ORDER BY product_id, "timestamp" DESC;;


-- MV: mv_parser_activity
CREATE MATERIALIZED VIEW mv_parser_activity AS
 SELECT par.id AS parser_id,
    par.name AS parser_name,
    par.category AS parser_category,
    count(DISTINCT p.id) AS total_products,
    count(DISTINCT sh_all.product_id) AS products_with_stock_history,
    count(DISTINCT sh_24h.product_id) AS products_updated_24h,
    count(DISTINCT sh_48h.product_id) AS products_updated_48h,
    max(sh_all."timestamp") AS latest_stock_update
   FROM ((((parsers par
     LEFT JOIN products p ON ((p.parser_id = par.id)))
     LEFT JOIN stock_history sh_all ON ((sh_all.product_id = p.id)))
     LEFT JOIN stock_history sh_24h ON (((sh_24h.product_id = p.id) AND (sh_24h."timestamp" >= (now() - '24:00:00'::interval)))))
     LEFT JOIN stock_history sh_48h ON (((sh_48h.product_id = p.id) AND (sh_48h."timestamp" >= (now() - '48:00:00'::interval)))))
  GROUP BY par.id, par.name, par.category;;


-- MV: mv_product_daily_sales
CREATE MATERIALIZED VIEW mv_product_daily_sales AS
 WITH settings AS (
         SELECT COALESCE(( SELECT (application_settings.setting_value)::integer AS setting_value
                   FROM application_settings
                  WHERE ((application_settings.setting_key)::text = 'SALES_SANITY_CHECK_THRESHOLD'::text)), 10000) AS sanity_threshold
        )
 SELECT product_id,
    s_day,
    close_stock,
        CASE
            WHEN ((lag(close_stock) OVER w > ( SELECT settings.sanity_threshold
               FROM settings)) AND (close_stock < ( SELECT settings.sanity_threshold
               FROM settings))) THEN 0
            ELSE GREATEST((lag(close_stock) OVER w - close_stock), 0)
        END AS units_sold
   FROM mv_stock_last_per_day s
  WINDOW w AS (PARTITION BY product_id ORDER BY s_day);;


-- MV: mv_product_scores
CREATE MATERIALIZED VIEW mv_product_scores AS
 WITH daily_stock AS (
         SELECT mv_stock_last_per_day.product_id,
            mv_stock_last_per_day.s_day,
            mv_stock_last_per_day.close_stock
           FROM mv_stock_last_per_day
          WHERE (mv_stock_last_per_day.s_day >= (CURRENT_DATE - '90 days'::interval))
        ), stock_changes AS (
         SELECT daily_stock.product_id,
            daily_stock.s_day,
            daily_stock.close_stock,
            lag(daily_stock.close_stock) OVER (PARTITION BY daily_stock.product_id ORDER BY daily_stock.s_day) AS prev_qty,
            (daily_stock.close_stock - lag(daily_stock.close_stock) OVER (PARTITION BY daily_stock.product_id ORDER BY daily_stock.s_day)) AS diff
           FROM daily_stock
        ), restocks AS (
         SELECT stock_changes.product_id,
            count(*) FILTER (WHERE ((stock_changes.diff > 0) AND ((stock_changes.prev_qty = 0) OR ((stock_changes.diff)::numeric >= GREATEST((10)::numeric, ((stock_changes.prev_qty)::numeric * 0.2)))))) AS restock_count_90d,
            count(*) FILTER (WHERE (stock_changes.close_stock = 0)) AS zero_stock_days,
            count(*) AS tracked_days,
            count(*) FILTER (WHERE (stock_changes.diff > 0)) AS increase_days,
            count(*) FILTER (WHERE (stock_changes.diff < 0)) AS decrease_days
           FROM stock_changes
          WHERE (stock_changes.prev_qty IS NOT NULL)
          GROUP BY stock_changes.product_id
        ), sales_stats AS (
         SELECT mv_product_daily_sales.product_id,
            avg(mv_product_daily_sales.units_sold) FILTER (WHERE (mv_product_daily_sales.s_day >= (CURRENT_DATE - '30 days'::interval))) AS avg_sold_30d,
            stddev(mv_product_daily_sales.units_sold) FILTER (WHERE (mv_product_daily_sales.s_day >= (CURRENT_DATE - '30 days'::interval))) AS stddev_sold_30d,
            avg(mv_product_daily_sales.units_sold) FILTER (WHERE (mv_product_daily_sales.s_day >= (CURRENT_DATE - '7 days'::interval))) AS avg_sold_7d,
            count(*) FILTER (WHERE (mv_product_daily_sales.s_day >= (CURRENT_DATE - '30 days'::interval))) AS sales_days_30d
           FROM mv_product_daily_sales
          WHERE (mv_product_daily_sales.s_day >= (CURRENT_DATE - '90 days'::interval))
          GROUP BY mv_product_daily_sales.product_id
        ), price_bounds AS (
         SELECT price_history.product_id,
            min(price_history.value) AS min_price_30d,
            max(price_history.value) AS max_price_30d,
            (array_agg(price_history.value ORDER BY price_history."timestamp"))[1] AS earliest_price,
            (array_agg(price_history.value ORDER BY price_history."timestamp" DESC))[1] AS latest_price,
            count(DISTINCT date(price_history."timestamp")) AS price_days
           FROM price_history
          WHERE ((price_history."timestamp" >= (CURRENT_DATE - '30 days'::interval)) AND (price_history.value > (0)::double precision))
          GROUP BY price_history.product_id
        ), data_quality AS (
         SELECT mv_stock_last_per_day.product_id,
            count(*) AS total_stock_entries,
            count(DISTINCT mv_stock_last_per_day.s_day) AS distinct_stock_days,
            max(mv_stock_last_per_day.close_stock) AS max_stock_ever
           FROM mv_stock_last_per_day
          GROUP BY mv_stock_last_per_day.product_id
        ), latest AS (
         SELECT ls.product_id,
            ls.quantity AS current_stock,
            ls."timestamp" AS last_stock_date,
            lp.price AS current_price
           FROM (mv_latest_stock ls
             LEFT JOIN mv_latest_price lp ON ((lp.product_id = ls.product_id)))
        ), scored AS (
         SELECT p.id AS product_id,
            COALESCE(ss.avg_sold_30d, (0)::numeric) AS avg_sold_30d,
            COALESCE(ss.avg_sold_7d, (0)::numeric) AS avg_sold_7d,
            COALESCE(r.restock_count_90d, (0)::bigint) AS restock_count_90d,
            COALESCE(pb.earliest_price, (0)::double precision) AS earliest_price,
            COALESCE(pb.latest_price, (0)::double precision) AS latest_price,
            COALESCE(dq.total_stock_entries, (0)::bigint) AS total_stock_entries,
            COALESCE(dq.distinct_stock_days, (0)::bigint) AS distinct_stock_days,
            COALESCE(dq.max_stock_ever, 0) AS max_stock_ever,
            lt.current_stock,
            lt.current_price,
            lt.last_stock_date,
            LEAST(30, GREATEST(0, (((
                CASE
                    WHEN (COALESCE(ss.avg_sold_30d, (0)::numeric) >= (5)::numeric) THEN 15
                    WHEN (COALESCE(ss.avg_sold_30d, (0)::numeric) >= (2)::numeric) THEN 10
                    WHEN (COALESCE(ss.avg_sold_30d, (0)::numeric) >= 0.5) THEN 5
                    ELSE 0
                END +
                CASE
                    WHEN ((COALESCE(ss.avg_sold_30d, (0)::numeric) > (0)::numeric) AND ((COALESCE(ss.stddev_sold_30d, (0)::numeric) / GREATEST(ss.avg_sold_30d, 0.01)) < 0.5)) THEN 5
                    ELSE 0
                END) +
                CASE
                    WHEN (COALESCE(ss.avg_sold_7d, (0)::numeric) > (COALESCE(ss.avg_sold_30d, (0)::numeric) * 1.2)) THEN 5
                    WHEN (COALESCE(ss.avg_sold_7d, (0)::numeric) < (COALESCE(ss.avg_sold_30d, (0)::numeric) * 0.5)) THEN '-5'::integer
                    ELSE 0
                END) +
                CASE
                    WHEN ((COALESCE(dq.max_stock_ever, 0) >= 100000) AND (COALESCE(ss.avg_sold_30d, (0)::numeric) < (10)::numeric)) THEN '-15'::integer
                    WHEN ((COALESCE(dq.max_stock_ever, 0) >= 50000) AND (COALESCE(ss.avg_sold_30d, (0)::numeric) < (5)::numeric)) THEN '-10'::integer
                    ELSE 0
                END))) AS sales_velocity_score,
            LEAST(25, GREATEST(0, ((
                CASE
                    WHEN ((COALESCE(dq.max_stock_ever, 0) >= 50000) AND (COALESCE(r.restock_count_90d, (0)::bigint) >= 6)) THEN 0
                    WHEN (COALESCE(r.restock_count_90d, (0)::bigint) >= 3) THEN 15
                    WHEN (COALESCE(r.restock_count_90d, (0)::bigint) = 2) THEN 10
                    WHEN (COALESCE(r.restock_count_90d, (0)::bigint) = 1) THEN 5
                    ELSE 0
                END +
                CASE
                    WHEN (COALESCE(dq.max_stock_ever, 0) >= 50000) THEN 0
                    WHEN ((COALESCE(r.restock_count_90d, (0)::bigint) > 0) AND (COALESCE(r.zero_stock_days, (0)::bigint) = 0)) THEN 5
                    ELSE 0
                END) +
                CASE
                    WHEN (COALESCE(dq.max_stock_ever, 0) >= 50000) THEN 0
                    WHEN ((COALESCE(r.restock_count_90d, (0)::bigint) > 0) AND (COALESCE(lt.current_stock, 0) = 0)) THEN 5
                    ELSE 0
                END))) AS restock_score,
            LEAST(20, GREATEST(0, ((
                CASE
                    WHEN ((pb.earliest_price IS NULL) OR (pb.earliest_price = (0)::double precision)) THEN 5
                    WHEN (((pb.latest_price - pb.earliest_price) / GREATEST(pb.earliest_price, (0.01)::double precision)) >= (0)::double precision) THEN 15
                    WHEN (((pb.latest_price - pb.earliest_price) / GREATEST(pb.earliest_price, (0.01)::double precision)) >= ('-0.10'::numeric)::double precision) THEN 10
                    WHEN (((pb.latest_price - pb.earliest_price) / GREATEST(pb.earliest_price, (0.01)::double precision)) >= ('-0.25'::numeric)::double precision) THEN 5
                    ELSE 0
                END +
                CASE
                    WHEN ((pb.earliest_price > (0)::double precision) AND (pb.latest_price > pb.earliest_price) AND (COALESCE(ss.avg_sold_30d, (0)::numeric) >= (1)::numeric)) THEN 5
                    ELSE 0
                END) +
                CASE
                    WHEN ((pb.min_price_30d IS NOT NULL) AND (pb.min_price_30d > (0)::double precision) AND (((pb.max_price_30d - pb.min_price_30d) / pb.min_price_30d) > (0.5)::double precision)) THEN '-10'::integer
                    ELSE 0
                END))) AS price_stability_score,
            LEAST(15, GREATEST('-10'::integer, (
                CASE
                    WHEN ((COALESCE(dq.total_stock_entries, (0)::bigint) >= 30) AND (COALESCE(dq.distinct_stock_days, (0)::bigint) >= 15)) THEN 10
                    WHEN ((COALESCE(dq.total_stock_entries, (0)::bigint) >= 10) AND (COALESCE(dq.distinct_stock_days, (0)::bigint) >= 7)) THEN 5
                    ELSE 0
                END +
                CASE
                    WHEN ((COALESCE(r.tracked_days, (0)::bigint) > 5) AND (((LEAST(COALESCE(r.increase_days, (0)::bigint), COALESCE(r.decrease_days, (0)::bigint)))::double precision / (GREATEST((COALESCE(r.increase_days, (0)::bigint) + COALESCE(r.decrease_days, (0)::bigint)), (1)::bigint))::double precision) > (0.4)::double precision)) THEN '-10'::integer
                    WHEN ((COALESCE(dq.max_stock_ever, 0) >= 50000) AND (COALESCE(r.restock_count_90d, (0)::bigint) >= 6)) THEN '-10'::integer
                    WHEN (COALESCE(dq.max_stock_ever, 0) >= 100000) THEN '-5'::integer
                    ELSE 5
                END))) AS data_quality_score,
            LEAST(10, GREATEST(0, (((
                CASE
                    WHEN (lt.last_stock_date >= (CURRENT_DATE - '3 days'::interval)) THEN 5
                    WHEN (lt.last_stock_date >= (CURRENT_DATE - '7 days'::interval)) THEN 3
                    WHEN (lt.last_stock_date >= (CURRENT_DATE - '30 days'::interval)) THEN 1
                    ELSE 0
                END +
                CASE
                    WHEN ((p.image IS NOT NULL) AND ((p.image)::text <> ''::text)) THEN 2
                    ELSE 0
                END) +
                CASE
                    WHEN ((p.vendor IS NOT NULL) AND ((p.vendor)::text <> ''::text)) THEN 2
                    ELSE 0
                END) +
                CASE
                    WHEN ((COALESCE(lt.current_price, (0)::double precision) >= (5)::double precision) AND (COALESCE(lt.current_price, (0)::double precision) <= (500)::double precision)) THEN 1
                    ELSE 0
                END))) AS market_position_score,
            ((COALESCE(r.tracked_days, (0)::bigint) > 5) AND ((((LEAST(COALESCE(r.increase_days, (0)::bigint), COALESCE(r.decrease_days, (0)::bigint)))::double precision / (GREATEST((COALESCE(r.increase_days, (0)::bigint) + COALESCE(r.decrease_days, (0)::bigint)), (1)::bigint))::double precision) > (0.4)::double precision) OR ((COALESCE(dq.max_stock_ever, 0) >= 50000) AND (COALESCE(r.restock_count_90d, (0)::bigint) >= 6)))) AS is_oscillating,
            ((pb.earliest_price IS NOT NULL) AND (pb.earliest_price > (0)::double precision) AND (((pb.latest_price - pb.earliest_price) / GREATEST(pb.earliest_price, (0.01)::double precision)) < ('-0.15'::numeric)::double precision) AND (COALESCE(r.restock_count_90d, (0)::bigint) = 0)) AS is_liquidating,
            ((COALESCE(r.restock_count_90d, (0)::bigint) >= 2) AND (COALESCE(dq.max_stock_ever, 0) < 50000)) AS is_restocking,
            (COALESCE(dq.max_stock_ever, 0) >= 100000) AS is_unrealistic_stock,
            (COALESCE(dq.max_stock_ever, 0) >= 50000) AS is_high_stock,
            ((COALESCE(dq.distinct_stock_days, (0)::bigint) <= 14) AND (lt.last_stock_date >= (CURRENT_DATE - '14 days'::interval))) AS is_new_listing
           FROM (((((products p
             LEFT JOIN sales_stats ss ON ((ss.product_id = p.id)))
             LEFT JOIN restocks r ON ((r.product_id = p.id)))
             LEFT JOIN price_bounds pb ON ((pb.product_id = p.id)))
             LEFT JOIN data_quality dq ON ((dq.product_id = p.id)))
             LEFT JOIN latest lt ON ((lt.product_id = p.id)))
        )
 SELECT product_id,
    avg_sold_30d,
    avg_sold_7d,
    restock_count_90d,
    earliest_price,
    latest_price,
    total_stock_entries,
    distinct_stock_days,
    max_stock_ever,
    current_stock,
    current_price,
    last_stock_date,
    sales_velocity_score,
    restock_score,
    price_stability_score,
    data_quality_score,
    market_position_score,
    LEAST(100, GREATEST(0, ((((sales_velocity_score + restock_score) + price_stability_score) + data_quality_score) + market_position_score))) AS total_score,
        CASE
            WHEN (((((sales_velocity_score + restock_score) + price_stability_score) + data_quality_score) + market_position_score) >= 75) THEN 'A'::text
            WHEN (((((sales_velocity_score + restock_score) + price_stability_score) + data_quality_score) + market_position_score) >= 55) THEN 'B'::text
            WHEN (((((sales_velocity_score + restock_score) + price_stability_score) + data_quality_score) + market_position_score) >= 35) THEN 'C'::text
            WHEN (((((sales_velocity_score + restock_score) + price_stability_score) + data_quality_score) + market_position_score) >= 15) THEN 'D'::text
            ELSE 'F'::text
        END AS grade,
    is_oscillating,
    is_liquidating,
    is_restocking,
    is_unrealistic_stock,
    is_high_stock,
    is_new_listing
   FROM scored;;


-- MV: mv_sidebar_parser_counts
CREATE MATERIALIZED VIEW mv_sidebar_parser_counts AS
 SELECT p.id,
    p.name,
    p.category,
    count(pr.id) AS product_count
   FROM (parsers p
     LEFT JOIN products pr ON ((pr.parser_id = p.id)))
  GROUP BY p.id, p.name, p.category;;


-- MV: mv_sidebar_pipeline_status_counts
CREATE MATERIALIZED VIEW mv_sidebar_pipeline_status_counts AS
 SELECT pipeline_status,
    count(*) AS product_count
   FROM products
  GROUP BY pipeline_status;;


-- MV: mv_stock_last_per_day
CREATE MATERIALIZED VIEW mv_stock_last_per_day AS
 SELECT DISTINCT ON (s.product_id, ((s."timestamp")::date)) s.product_id,
    (s."timestamp")::date AS s_day,
    s.quantity AS close_stock,
    s."timestamp" AS last_seen_at
   FROM (stock_history s
     JOIN LATERAL ( SELECT (s."timestamp")::date AS s_day) d ON (true))
  WHERE (s."timestamp" >= (CURRENT_DATE - '180 days'::interval))
  ORDER BY s.product_id, ((s."timestamp")::date), s."timestamp" DESC, s.id DESC;;


-- MV: mv_vendor_counts_all
CREATE MATERIALIZED VIEW mv_vendor_counts_all AS
 SELECT vendor,
    count(*) AS product_count
   FROM products
  WHERE ((vendor IS NOT NULL) AND ((vendor)::text <> ''::text))
  GROUP BY vendor;;


-- MV: mv_vendor_counts_by_parser
CREATE MATERIALIZED VIEW mv_vendor_counts_by_parser AS
 SELECT parser_id,
    vendor,
    count(*) AS product_count
   FROM products
  WHERE ((vendor IS NOT NULL) AND ((vendor)::text <> ''::text) AND (parser_id IS NOT NULL))
  GROUP BY parser_id, vendor;;


-- MV: parser_status_mv
CREATE MATERIALIZED VIEW parser_status_mv AS
 WITH last_stock AS (
         SELECT p.id AS product_id,
            p.parser_id,
            max(sh."timestamp") AS last_stock_timestamp
           FROM (products p
             LEFT JOIN stock_history sh ON ((p.id = sh.product_id)))
          GROUP BY p.id, p.parser_id
        ), last_run AS (
         SELECT p.id AS parser_id,
            p.name AS parser_name,
            count(ls.product_id) AS product_count,
            max(ls.last_stock_timestamp) AS last_stock_activity
           FROM (parsers p
             LEFT JOIN last_stock ls ON ((p.id = ls.parser_id)))
          GROUP BY p.id, p.name
        )
 SELECT parser_id,
    parser_name,
    product_count,
    last_stock_activity,
    ( SELECT avg(subquery.diff) AS avg
           FROM ( SELECT (EXTRACT(epoch FROM (sh."timestamp" - lag(sh."timestamp") OVER (PARTITION BY p.id ORDER BY sh."timestamp"))) / (3600)::numeric) AS diff
                   FROM (stock_history sh
                     JOIN products p ON ((sh.product_id = p.id)))
                  WHERE ((p.parser_id = lr.parser_id) AND (sh."timestamp" > (now() - '30 days'::interval)))) subquery) AS avg_parse_frequency_hours
   FROM last_run lr;;


-- MV: product_metrics_view
CREATE MATERIALIZED VIEW product_metrics_view AS
 WITH settings AS (
         SELECT COALESCE(( SELECT (application_settings.setting_value)::integer AS setting_value
                   FROM application_settings
                  WHERE ((application_settings.setting_key)::text = 'SALES_AVG_PERIOD_DAYS'::text)), 30) AS period_days
        ), recent_stock_history AS (
         SELECT sh.product_id,
            sh.quantity,
            sh."timestamp",
            lag(sh.quantity) OVER (PARTITION BY sh.product_id ORDER BY sh."timestamp") AS prev_quantity
           FROM stock_history sh
          WHERE (sh."timestamp" >= (now() - '31 days'::interval))
        ), daily_sales AS (
         SELECT rsh.product_id,
            (rsh."timestamp")::date AS day,
            GREATEST(0, (rsh.prev_quantity - rsh.quantity)) AS sold_units
           FROM recent_stock_history rsh
          WHERE (rsh.quantity < rsh.prev_quantity)
        ), aggregated_sales AS (
         SELECT ds.product_id,
            sum(ds.sold_units) AS total_sold_30d,
            sum(ds.sold_units) FILTER (WHERE (ds.day >= (CURRENT_DATE - '6 days'::interval))) AS total_sold_7d,
            sum(ds.sold_units) FILTER (WHERE (ds.day = CURRENT_DATE)) AS total_sold_1d,
            round(((sum(ds.sold_units))::numeric / (( SELECT settings.period_days
                   FROM settings))::numeric), 2) AS avg_sold_over_period
           FROM daily_sales ds
          GROUP BY ds.product_id
        ), latest_stock_entries AS (
         SELECT sh.product_id,
            sh.quantity,
            sh."timestamp",
            row_number() OVER (PARTITION BY sh.product_id ORDER BY sh."timestamp" DESC) AS rn
           FROM stock_history sh
        ), current_stock_levels AS (
         SELECT lse.product_id,
            max(
                CASE
                    WHEN (lse.rn = 1) THEN lse.quantity
                    ELSE NULL::integer
                END) AS current_stock,
            max(
                CASE
                    WHEN (lse.rn = 2) THEN lse.quantity
                    ELSE NULL::integer
                END) AS previous_stock,
            max(
                CASE
                    WHEN (lse.rn = 1) THEN lse."timestamp"
                    ELSE NULL::timestamp without time zone
                END) AS latest_stock_ts,
            max(
                CASE
                    WHEN (lse.rn = 2) THEN lse."timestamp"
                    ELSE NULL::timestamp without time zone
                END) AS previous_stock_ts
           FROM latest_stock_entries lse
          WHERE (lse.rn <= 2)
          GROUP BY lse.product_id
        ), stock_history_stats AS (
         SELECT sh.product_id,
            max(sh."timestamp") AS last_stock_update,
            max(sh."timestamp") FILTER (WHERE (sh.quantity > 0)) AS last_nonzero_stock_date
           FROM stock_history sh
          GROUP BY sh.product_id
        )
 SELECT p.id,
    p.name,
    p.url,
    p.image,
    p.vendor,
    par.name AS parser_name,
    COALESCE(cs.current_stock, 0) AS stock,
    COALESCE((cs.previous_stock - cs.current_stock), 0) AS stock_diff,
    COALESCE(lp.price, (0)::double precision) AS price,
    COALESCE(ags.total_sold_1d, (0)::bigint) AS avg_1d,
    round(((COALESCE(ags.total_sold_7d, (0)::bigint))::numeric / 7.0), 2) AS avg_7d,
    round(((COALESCE(ags.total_sold_30d, (0)::bigint))::numeric / 30.0), 2) AS avg_30d,
    COALESCE(ags.avg_sold_over_period, 0.0) AS avg_sold_over_period,
    shs.last_stock_update,
    shs.last_nonzero_stock_date,
        CASE
            WHEN (shs.last_stock_update IS NULL) THEN true
            WHEN (shs.last_stock_update < (now() - '14 days'::interval)) THEN true
            WHEN ((COALESCE(cs.current_stock, 0) = 0) AND ((shs.last_nonzero_stock_date IS NULL) OR (shs.last_nonzero_stock_date < (now() - '14 days'::interval)))) THEN true
            WHEN ((cs.latest_stock_ts < (now() - '14 days'::interval)) AND (cs.previous_stock_ts < (now() - '14 days'::interval))) THEN true
            ELSE false
        END AS is_stale
   FROM (((((products p
     LEFT JOIN parsers par ON ((p.parser_id = par.id)))
     LEFT JOIN current_stock_levels cs ON ((p.id = cs.product_id)))
     LEFT JOIN stock_history_stats shs ON ((p.id = shs.product_id)))
     LEFT JOIN mv_latest_price lp ON ((lp.product_id = p.id)))
     LEFT JOIN aggregated_sales ags ON ((p.id = ags.product_id)));;


-- MV: store_analytics_mv
CREATE MATERIALIZED VIEW store_analytics_mv AS
 WITH date_range AS (
         SELECT (CURRENT_DATE - '29 days'::interval) AS start_date,
            CURRENT_DATE AS end_date
        ), stock_changes AS (
         SELECT p.parser_id,
            sh.product_id,
            sh."timestamp",
            GREATEST(0, (lag(sh.quantity) OVER w - sh.quantity)) AS units_sold,
            GREATEST(0, (sh.quantity - lag(sh.quantity) OVER w)) AS units_restocked,
            COALESCE(( SELECT ph.value
                   FROM price_history ph
                  WHERE ((ph.product_id = sh.product_id) AND (ph."timestamp" <= sh."timestamp"))
                  ORDER BY ph."timestamp" DESC
                 LIMIT 1), (0)::double precision) AS price_at_change
           FROM ((stock_history sh
             JOIN products p ON ((sh.product_id = p.id)))
             CROSS JOIN date_range)
          WHERE (((sh."timestamp")::date >= date_range.start_date) AND ((sh."timestamp")::date <= date_range.end_date))
          WINDOW w AS (PARTITION BY sh.product_id ORDER BY sh."timestamp")
        ), parser_aggregates AS (
         SELECT p.id AS parser_id,
            p.name AS parser_name,
            COALESCE(sum(sc.units_sold) FILTER (WHERE ((sc."timestamp")::date = (CURRENT_DATE - '1 day'::interval))), (0)::bigint) AS sold_last_24h,
            COALESCE(sum(sc.units_sold) FILTER (WHERE ((sc."timestamp")::date >= (CURRENT_DATE - '6 days'::interval))), (0)::bigint) AS sold_last_7d,
            COALESCE(sum(sc.units_sold), (0)::bigint) AS sold_last_30d,
            COALESCE(sum(sc.units_restocked) FILTER (WHERE ((sc."timestamp")::date = (CURRENT_DATE - '1 day'::interval))), (0)::bigint) AS restocked_last_24h,
            COALESCE(sum(sc.units_restocked) FILTER (WHERE ((sc."timestamp")::date >= (CURRENT_DATE - '6 days'::interval))), (0)::bigint) AS restocked_last_7d,
            COALESCE(sum(sc.units_restocked), (0)::bigint) AS restocked_last_30d,
            COALESCE(sum(((sc.units_sold)::double precision * sc.price_at_change)), (0)::double precision) AS total_revenue_30d,
            count(DISTINCT sc.product_id) FILTER (WHERE (sc.units_sold > 0)) AS active_sku_count_30d
           FROM ((parsers p
             LEFT JOIN products pr ON ((p.id = pr.parser_id)))
             LEFT JOIN stock_changes sc ON ((pr.id = sc.product_id)))
          GROUP BY p.id, p.name
        ), inventory_values AS (
         SELECT p.parser_id,
            count(p.id) AS total_sku_count,
            COALESCE(sum(pmv.stock), (0)::bigint) AS total_current_stock,
            COALESCE(sum(((pmv.stock)::double precision * pmv.price)), (0)::double precision) AS total_inventory_value
           FROM (products p
             JOIN product_metrics_view pmv ON ((p.id = pmv.id)))
          GROUP BY p.parser_id
        )
 SELECT pa.parser_name,
    iv.total_current_stock,
    iv.total_sku_count,
    pa.sold_last_24h,
    pa.sold_last_7d,
    pa.sold_last_30d,
    pa.restocked_last_24h,
    pa.restocked_last_7d,
    pa.restocked_last_30d,
    pa.total_revenue_30d,
    iv.total_inventory_value,
    pa.active_sku_count_30d,
        CASE
            WHEN (pa.sold_last_30d > 0) THEN (pa.total_revenue_30d / (pa.sold_last_30d)::double precision)
            ELSE (0)::double precision
        END AS average_order_value,
        CASE
            WHEN (iv.total_sku_count > 0) THEN (((pa.active_sku_count_30d)::double precision / (iv.total_sku_count)::double precision) * (100)::double precision)
            ELSE (0)::double precision
        END AS active_sku_ratio,
        CASE
            WHEN (pa.active_sku_count_30d > 0) THEN (pa.total_revenue_30d / (pa.active_sku_count_30d)::double precision)
            ELSE (0)::double precision
        END AS revenue_per_active_sku,
        CASE
            WHEN ((pa.sold_last_30d + iv.total_current_stock) > 0) THEN (((pa.sold_last_30d)::double precision / ((pa.sold_last_30d + iv.total_current_stock))::double precision) * (100)::double precision)
            ELSE (0)::double precision
        END AS sell_through_rate,
        CASE
            WHEN (pa.sold_last_30d > 0) THEN ((iv.total_current_stock)::numeric / ((pa.sold_last_30d)::numeric / 30.0))
            ELSE (0)::numeric
        END AS days_of_inventory,
        CASE
            WHEN (iv.total_current_stock > 0) THEN (((pa.sold_last_30d)::numeric * 12.0) / (NULLIF(iv.total_current_stock, 0))::numeric)
            ELSE (0)::numeric
        END AS stock_turn
   FROM (parser_aggregates pa
     JOIN inventory_values iv ON ((pa.parser_id = iv.parser_id)));;


-- MV: store_daily_metrics_mv
CREATE MATERIALIZED VIEW store_daily_metrics_mv AS
 WITH snapshots AS (
         SELECT sh.product_id,
            p.parser_id AS store_id,
            pr.name AS store_name,
            sh."timestamp" AS ts,
            sh.quantity,
            lag(sh.quantity) OVER (PARTITION BY sh.product_id ORDER BY sh."timestamp") AS prev_qty
           FROM ((stock_history sh
             JOIN products p ON ((p.id = sh.product_id)))
             LEFT JOIN parsers pr ON ((pr.id = p.parser_id)))
        ), deltas AS (
         SELECT snapshots.product_id,
            snapshots.store_id,
            snapshots.store_name,
            snapshots.ts,
            (snapshots.quantity - snapshots.prev_qty) AS delta
           FROM snapshots
          WHERE (snapshots.prev_qty IS NOT NULL)
        ), neg_moves AS (
         SELECT deltas.product_id,
            deltas.store_id,
            deltas.store_name,
            deltas.ts,
            (deltas.ts)::date AS day,
            ((- deltas.delta))::bigint AS units_sold_at_ts
           FROM deltas
          WHERE (deltas.delta < 0)
        ), priced_neg_moves AS (
         SELECT n.product_id,
            n.store_id,
            n.store_name,
            n.day,
            n.ts,
            n.units_sold_at_ts,
            ( SELECT ph.value
                   FROM price_history ph
                  WHERE ((ph.product_id = n.product_id) AND (ph."timestamp" <= n.ts))
                  ORDER BY ph."timestamp" DESC
                 LIMIT 1) AS unit_price_at_ts
           FROM neg_moves n
        ), costs AS (
         SELECT ppd.product_id,
            ((COALESCE(ppd.cogs_usd, (0)::numeric) + COALESCE(ppd.transport_usd, (0)::numeric)) + ((COALESCE(ppd.customs_rate_percentage, (0)::numeric) / 100.0) * COALESCE(ppd.cogs_usd, (0)::numeric))) AS unit_cost_estimate
           FROM product_pipeline_details ppd
        ), daily_store AS (
         SELECT pn.store_id,
            max((pn.store_name)::text) AS store_name,
            pn.day,
            (sum(pn.units_sold_at_ts))::bigint AS units_sold,
            count(DISTINCT pn.product_id) AS distinct_skus_sold,
                CASE
                    WHEN (count(DISTINCT pn.product_id) > 0) THEN (sum(pn.units_sold_at_ts) / (count(DISTINCT pn.product_id))::numeric)
                    ELSE NULL::numeric
                END AS avg_units_per_sku,
            (sum(((pn.units_sold_at_ts)::double precision * COALESCE(pn.unit_price_at_ts, (0)::double precision))))::numeric AS revenue,
            sum(((pn.units_sold_at_ts)::numeric * COALESCE(c.unit_cost_estimate, (0)::numeric))) AS cost,
            ((sum(((pn.units_sold_at_ts)::double precision * COALESCE(pn.unit_price_at_ts, (0)::double precision))) - (sum(((pn.units_sold_at_ts)::numeric * COALESCE(c.unit_cost_estimate, (0)::numeric))))::double precision))::numeric AS profit,
            (
                CASE
                    WHEN (sum(pn.units_sold_at_ts) > (0)::numeric) THEN (sum(((pn.units_sold_at_ts)::double precision * COALESCE(pn.unit_price_at_ts, (0)::double precision))) / (sum(pn.units_sold_at_ts))::double precision)
                    ELSE NULL::double precision
                END)::numeric AS avg_selling_price,
            (
                CASE
                    WHEN (sum(((pn.units_sold_at_ts)::double precision * COALESCE(pn.unit_price_at_ts, (0)::double precision))) > (0)::double precision) THEN ((sum(((pn.units_sold_at_ts)::double precision * COALESCE(pn.unit_price_at_ts, (0)::double precision))) - (sum(((pn.units_sold_at_ts)::numeric * COALESCE(c.unit_cost_estimate, (0)::numeric))))::double precision) / sum(((pn.units_sold_at_ts)::double precision * COALESCE(pn.unit_price_at_ts, (0)::double precision))))
                    ELSE NULL::double precision
                END)::numeric AS gross_margin_rate,
            (sum(
                CASE
                    WHEN (pn.unit_price_at_ts IS NULL) THEN pn.units_sold_at_ts
                    ELSE (0)::bigint
                END))::bigint AS units_without_price
           FROM (priced_neg_moves pn
             LEFT JOIN costs c ON ((c.product_id = pn.product_id)))
          GROUP BY pn.store_id, pn.day
        ), monthly_agg AS (
         SELECT daily_store.store_id,
            (date_trunc('month'::text, (daily_store.day)::timestamp with time zone))::date AS month,
            (sum(daily_store.units_sold))::bigint AS month_units,
            sum(daily_store.revenue) AS month_revenue,
            sum(daily_store.profit) AS month_profit
           FROM daily_store
          GROUP BY daily_store.store_id, (date_trunc('month'::text, (daily_store.day)::timestamp with time zone))
        ), monthly_with_windows AS (
         SELECT m.store_id,
            m.month,
            m.month_units,
            m.month_revenue,
            m.month_profit,
            avg(m.month_units) OVER (PARTITION BY m.store_id) AS avg_monthly_units_all_time,
            avg(m.month_revenue) OVER (PARTITION BY m.store_id) AS avg_monthly_revenue_all_time,
            avg(m.month_profit) OVER (PARTITION BY m.store_id) AS avg_monthly_profit_all_time,
            avg(m.month_units) OVER (PARTITION BY m.store_id ORDER BY m.month ROWS BETWEEN 5 PRECEDING AND CURRENT ROW) AS avg_monthly_units_6m,
            avg(m.month_revenue) OVER (PARTITION BY m.store_id ORDER BY m.month ROWS BETWEEN 5 PRECEDING AND CURRENT ROW) AS avg_monthly_revenue_6m,
            avg(m.month_profit) OVER (PARTITION BY m.store_id ORDER BY m.month ROWS BETWEEN 5 PRECEDING AND CURRENT ROW) AS avg_monthly_profit_6m
           FROM monthly_agg m
        )
 SELECT d.store_id,
    d.store_name,
    d.day,
    d.units_sold,
    d.distinct_skus_sold,
    d.avg_units_per_sku,
    d.avg_selling_price,
    d.revenue,
    d.cost,
    d.profit,
    d.gross_margin_rate,
    d.units_without_price,
    avg(d.units_sold) OVER (PARTITION BY d.store_id ORDER BY d.day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS avg_daily_units_7d,
    avg(d.revenue) OVER (PARTITION BY d.store_id ORDER BY d.day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS avg_daily_revenue_7d,
    avg(d.units_sold) OVER (PARTITION BY d.store_id ORDER BY d.day ROWS BETWEEN 29 PRECEDING AND CURRENT ROW) AS avg_daily_units_30d,
    avg(d.revenue) OVER (PARTITION BY d.store_id ORDER BY d.day ROWS BETWEEN 29 PRECEDING AND CURRENT ROW) AS avg_daily_revenue_30d,
    (sum(d.units_sold) OVER (PARTITION BY d.store_id, (date_trunc('month'::text, (d.day)::timestamp with time zone))))::bigint AS month_to_date_units,
    sum(d.revenue) OVER (PARTITION BY d.store_id, (date_trunc('month'::text, (d.day)::timestamp with time zone))) AS month_to_date_revenue,
    sum(d.profit) OVER (PARTITION BY d.store_id, (date_trunc('month'::text, (d.day)::timestamp with time zone))) AS month_to_date_profit,
    mw.avg_monthly_units_all_time,
    mw.avg_monthly_revenue_all_time,
    mw.avg_monthly_profit_all_time,
    mw.avg_monthly_units_6m,
    mw.avg_monthly_revenue_6m,
    mw.avg_monthly_profit_6m
   FROM (daily_store d
     LEFT JOIN monthly_with_windows mw ON (((mw.store_id = d.store_id) AND (mw.month = (date_trunc('month'::text, (d.day)::timestamp with time zone))::date))))
  ORDER BY d.store_id, d.day;;
