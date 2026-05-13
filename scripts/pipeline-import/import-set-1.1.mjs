// Import Set 1.1 from Grandia Pipeline sheet into the BI app DB.
//
// Behavior:
//   1. Creates a single PurchaseOrder (DRAFT, STANDARD, created_by=2 'Scraper').
//   2. Inserts one PurchaseOrderItem per matched row.
//        - Green (purchased) rows -> quantity = sheet QTY.
//        - White (skipped) rows   -> quantity = 0, notes = 'Skipped by supplier'.
//        - unit_cost_usd = Cogs + Transport (landed unit cost, USD).
//        - line_cost_usd = unit_cost_usd * quantity.
//   3. Updates product_pipeline_details.cogs_usd / transport_usd from sheet.
//   4. Inserts product_purchase_order_links rows so the Approved Items page
//      shows the PO link in the "PO" column.
//   5. Skips rows whose product is missing from the products table (logged).
//   6. All writes happen inside a single transaction; --commit is required to
//      actually write, otherwise dry-run prints the plan and rolls back.
//
// Usage:
//   node scripts/pipeline-import/import-set-1.1.mjs           # dry run
//   node scripts/pipeline-import/import-set-1.1.mjs --commit  # commit

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const COMMIT = process.argv.includes('--commit');
const TAB = 'Set 1.1';
const PO_TITLE = 'Pipeline Set 1.1';
const PO_NOTES = 'Imported from Grandia Pipeline sheet on 2026-04-27. 146 ordered + 9 supplier-skipped.';
const PO_STATUS = 'DRAFT';
const PO_PRIORITY = 'STANDARD';
const CREATED_BY_ID = 2; // Scraper

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const ENRICHED_PATH = path.join(ROOT, 'output/set-1.1-enriched.json');
const PGURI = 'postgresql://scraper:Scraper123%23@38.242.226.83:5432/test';

const num = v => {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isFinite(n) ? n : null;
};

const enriched = JSON.parse(fs.readFileSync(ENRICHED_PATH, 'utf8'));

const importable = enriched.filter(r => r.db_exists && r.existing_po_lines === 0);
const skipped_missing = enriched.filter(r => !r.db_exists);
const skipped_already_in_po = enriched.filter(r => r.db_exists && r.existing_po_lines > 0);

console.log(`=== ${TAB} import ===`);
console.log(`Mode:                 ${COMMIT ? 'COMMIT' : 'DRY RUN'}`);
console.log(`Importable rows:      ${importable.length}`);
console.log(`  - ordered (green):  ${importable.filter(r => r.purchased).length}`);
console.log(`  - skipped (white):  ${importable.filter(r => !r.purchased).length}`);
console.log(`Missing from DB:      ${skipped_missing.length} (NOT imported, logged)`);
console.log(`Already in some PO:   ${skipped_already_in_po.length}`);

// Build the planned line items
const rawLines = importable.map(r => {
  const qtySheet = num(r.qty);
  const cogs = num(r.cogs_usd);
  const transport = num(r.transport_usd);
  const unitCost = (cogs ?? 0) + (transport ?? 0);
  const quantity = r.purchased ? Math.round(qtySheet ?? 0) : 0;
  return {
    product_id: parseInt(r.id, 10),
    product_title: r.db_name || r.title || `Product ${r.id}`,
    sku: r.sku ?? null,
    quantity,
    unit_cost_usd: +unitCost.toFixed(2),
    notes: r.purchased ? null : 'Skipped by supplier',
    cogs_usd: cogs,
    transport_usd: transport,
    purchased: r.purchased,
    raw_qty: qtySheet,
  };
});

// Merge duplicate product_ids: keep ordered quantity, note original request.
const byProduct = new Map();
for (const l of rawLines) {
  const existing = byProduct.get(l.product_id);
  if (!existing) { byProduct.set(l.product_id, { ...l, _rows: [l] }); continue; }
  existing._rows.push(l);
  // Prefer the ordered (purchased) row's quantity; sum up "originally requested".
  if (l.purchased && !existing.purchased) {
    byProduct.set(l.product_id, { ...l, _rows: existing._rows });
  }
}
for (const m of byProduct.values()) {
  if (m._rows.length > 1) {
    const totalRequested = m._rows.reduce((s,r) => s + (r.raw_qty ?? 0), 0);
    const orderedQty = m._rows.filter(r=>r.purchased).reduce((s,r)=>s+(Math.round(r.raw_qty??0)),0);
    const skippedQty = m._rows.filter(r=>!r.purchased).reduce((s,r)=>s+(Math.round(r.raw_qty??0)),0);
    m.quantity = orderedQty;
    m.notes = `Originally requested ${totalRequested} (${orderedQty} ordered + ${skippedQty} skipped) — merged from ${m._rows.length} sheet rows.`;
  }
  delete m._rows;
}

const plannedLines = [...byProduct.values()].map(l => ({
  ...l,
  line_cost_usd: +(l.unit_cost_usd * l.quantity).toFixed(2),
}));

// Sanity report
const totalLineCost = plannedLines.reduce((s, l) => s + l.line_cost_usd, 0);
const totalUnitsOrdered = plannedLines.reduce((s, l) => s + l.quantity, 0);
console.log(`Total units ordered:  ${totalUnitsOrdered}`);
console.log(`Total line cost USD:  ${totalLineCost.toFixed(2)}`);

// Sample lines
console.log('\nFirst 3 planned lines:');
for (const l of plannedLines.slice(0, 3)) {
  console.log(' ', JSON.stringify(l));
}
console.log('Last 3 planned lines:');
for (const l of plannedLines.slice(-3)) {
  console.log(' ', JSON.stringify(l));
}

if (skipped_missing.length) {
  console.log(`\n${skipped_missing.length} row(s) skipped — missing from products table:`);
  for (const r of skipped_missing) console.log(`  id=${r.id} sku=${r.sku} purchased=${r.purchased} | ${(r.title||'').slice(0,80)}`);
}
if (skipped_already_in_po.length) {
  console.log(`\n${skipped_already_in_po.length} row(s) skipped — already on existing PO:`);
  for (const r of skipped_already_in_po) console.log(`  id=${r.id} po_lines=${r.existing_po_lines}`);
}

const client = new pg.Client({
  host: '38.242.226.83',
  port: 5432,
  user: 'scraper',
  password: 'Scraper123#',
  database: 'test',
});
await client.connect();

try {
  await client.query('BEGIN');

  const poRes = await client.query(
    `INSERT INTO purchase_orders (title, priority, status, notes, total_cost_usd, created_by_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, number;`,
    [PO_TITLE, PO_PRIORITY, PO_STATUS, PO_NOTES, totalLineCost.toFixed(2), CREATED_BY_ID]
  );
  const poId = poRes.rows[0].id;
  const poNumber = poRes.rows[0].number;
  console.log(`\nCreated PurchaseOrder id=${poId} number=${poNumber}`);

  for (const l of plannedLines) {
    // Pull product image (and a fallback title) inline from products table
    const prodRow = await client.query(`SELECT image, name FROM products WHERE id=$1`, [l.product_id]);
    const imageUrl = prodRow.rows[0]?.image ?? null;
    const productTitle = l.product_title || prodRow.rows[0]?.name || `Product ${l.product_id}`;

    await client.query(
      `INSERT INTO purchase_order_items
        (purchase_order_id, product_id, product_title, sku, image_url, quantity, unit_cost_usd, line_cost_usd, priority, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);`,
      [poId, l.product_id, productTitle, l.sku, imageUrl, l.quantity, l.unit_cost_usd, l.line_cost_usd, 'STANDARD', l.notes]
    );

    // Update product_pipeline_details cogs/transport from sheet
    if (l.cogs_usd != null || l.transport_usd != null) {
      await client.query(
        `INSERT INTO product_pipeline_details (product_id, cogs_usd, transport_usd)
         VALUES ($1, $2, $3)
         ON CONFLICT (product_id) DO UPDATE SET
           cogs_usd      = COALESCE(EXCLUDED.cogs_usd,      product_pipeline_details.cogs_usd),
           transport_usd = COALESCE(EXCLUDED.transport_usd, product_pipeline_details.transport_usd);`,
        [l.product_id, l.cogs_usd, l.transport_usd]
      );
    }

    // Link product to PO (one PO per product ever)
    await client.query(
      `INSERT INTO product_purchase_order_links (product_id, purchase_order_id)
       VALUES ($1, $2)
       ON CONFLICT (product_id) DO NOTHING;`,
      [l.product_id, poId]
    );
  }

  if (COMMIT) {
    await client.query('COMMIT');
    console.log(`\n✅ COMMITTED. PO id=${poId} number=${poNumber} with ${plannedLines.length} lines.`);
  } else {
    await client.query('ROLLBACK');
    console.log(`\n🟡 DRY RUN — rolled back. Re-run with --commit to apply.`);
  }
} catch (err) {
  await client.query('ROLLBACK');
  console.error('Error, rolled back:', err);
  process.exitCode = 1;
} finally {
  await client.end();
}
