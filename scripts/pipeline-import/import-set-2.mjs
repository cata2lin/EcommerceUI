// Import Set 2 — same behavior as Set 1.1 (see import-set-1.1.mjs).
// Run dry-run by default; pass --commit to write.

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const COMMIT = process.argv.includes('--commit');
const TAB = 'Set 2';
const SLUG = 'set-2';
const PO_TITLE = 'Pipeline Set 2';
const PO_NOTES = 'Imported from Grandia Pipeline sheet on 2026-04-27. 41 ordered + 7 supplier-skipped.';
const PO_STATUS = 'DRAFT';
const PO_PRIORITY = 'STANDARD';
const CREATED_BY_ID = 2; // Scraper

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const ENRICHED_PATH = path.join(ROOT, `output/${SLUG}-enriched.json`);

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
console.log(`Missing from DB:      ${skipped_missing.length} (NOT imported)`);
console.log(`Already in some PO:   ${skipped_already_in_po.length}`);

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

// Merge duplicate product_ids
const byProduct = new Map();
for (const l of rawLines) {
  const existing = byProduct.get(l.product_id);
  if (!existing) { byProduct.set(l.product_id, { ...l, _rows: [l] }); continue; }
  existing._rows.push(l);
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

const totalLineCost = plannedLines.reduce((s, l) => s + l.line_cost_usd, 0);
const totalUnitsOrdered = plannedLines.reduce((s, l) => s + l.quantity, 0);
console.log(`Planned line items:   ${plannedLines.length}`);
console.log(`Total units ordered:  ${totalUnitsOrdered}`);
console.log(`Total line cost USD:  ${totalLineCost.toFixed(2)}`);

if (skipped_missing.length) {
  console.log(`\nSkipped — missing from products table:`);
  for (const r of skipped_missing) console.log(`  id=${r.id} sku=${r.sku} purchased=${r.purchased} | ${(r.title||'').slice(0,80)}`);
}

const client = new pg.Client({
  host: '38.242.226.83', port: 5432,
  user: 'scraper', password: 'Scraper123#', database: 'test',
});
await client.connect();

try {
  await client.query('BEGIN');

  const poRes = await client.query(
    `INSERT INTO purchase_orders (title, priority, status, notes, total_cost_usd, created_by_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, number;`,
    [PO_TITLE, PO_PRIORITY, PO_STATUS, PO_NOTES, totalLineCost.toFixed(2), CREATED_BY_ID]
  );
  const poId = poRes.rows[0].id;
  const poNumber = poRes.rows[0].number;
  console.log(`\nCreated PurchaseOrder id=${poId} number=${poNumber}`);

  for (const l of plannedLines) {
    const prodRow = await client.query(`SELECT image, name FROM products WHERE id=$1`, [l.product_id]);
    const imageUrl = prodRow.rows[0]?.image ?? null;
    const productTitle = l.product_title || prodRow.rows[0]?.name || `Product ${l.product_id}`;

    await client.query(
      `INSERT INTO purchase_order_items
        (purchase_order_id, product_id, product_title, sku, image_url, quantity, unit_cost_usd, line_cost_usd, priority, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);`,
      [poId, l.product_id, productTitle, l.sku, imageUrl, l.quantity, l.unit_cost_usd, l.line_cost_usd, 'STANDARD', l.notes]
    );

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

    await client.query(
      `INSERT INTO product_purchase_order_links (product_id, purchase_order_id)
       VALUES ($1, $2) ON CONFLICT (product_id) DO NOTHING;`,
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
