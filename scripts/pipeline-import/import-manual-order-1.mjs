// Import "Order 1" — Manual Order, status=DRAFT.
// - Dedup by product_id (keep first occurrence)
// - For products already linked to another PO, re-link to this new PO
//   (the manual order is the real one).
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const COMMIT = process.argv.includes('--commit');
const PO_TITLE = 'Manual Order 1 - Metalic shelves and garden houses';
const PO_NOTES = 'Imported from "Grandia - Iulian Orders (non-app)" sheet, tab "Order 1". Manually-placed offline order.';
const PO_STATUS = 'DRAFT';
const PO_PRIORITY = 'STANDARD';
const CREATED_BY_ID = 2;

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const PARSED = path.join(ROOT, 'data/manual-order-1-parsed.json');

const lines = JSON.parse(fs.readFileSync(PARSED, 'utf8'));

// Dedup: keep first occurrence per product_id.
const seen = new Set();
const planned = [];
const dropped = [];
for (const l of lines) {
  if (seen.has(l.product_id)) { dropped.push(l); continue; }
  seen.add(l.product_id);
  planned.push(l);
}

const totalQty = planned.reduce((s,l) => s + (l.qty||0), 0);
const totalCost = +planned.reduce((s,l) => s + l.unit_cost_usd * (l.qty||0), 0).toFixed(2);

console.log(`=== Manual Order 1 import ===`);
console.log(`Mode:               ${COMMIT ? 'COMMIT' : 'DRY RUN'}`);
console.log(`Parsed lines:       ${lines.length}`);
console.log(`Dropped duplicates: ${dropped.length}`);
for (const d of dropped) console.log(`  R${d.sheet_row} id=${d.product_id} qty=${d.qty} | ${(d.name||'').slice(0,60)}`);
console.log(`Planned lines:      ${planned.length}`);
console.log(`Total qty:          ${totalQty}`);
console.log(`Total cost USD:     ${totalCost.toFixed(2)}`);

const client = new pg.Client({ host: '38.242.226.83', port: 5432, user: 'scraper', password: 'Scraper123#', database: 'test' });
await client.connect();
try {
  await client.query('BEGIN');

  // Verify all products exist.
  const ids = planned.map(l => l.product_id);
  const exRes = await client.query(`SELECT id FROM products WHERE id = ANY($1::int[])`, [ids]);
  const haveIds = new Set(exRes.rows.map(r => r.id));
  const missing = ids.filter(i => !haveIds.has(i));
  if (missing.length) {
    console.error(`Missing product ids: ${missing.join(',')}`);
    throw new Error('Aborting: missing products in DB');
  }

  const poRes = await client.query(
    `INSERT INTO purchase_orders (title, priority, status, notes, total_cost_usd, created_by_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, number;`,
    [PO_TITLE, PO_PRIORITY, PO_STATUS, PO_NOTES, totalCost, CREATED_BY_ID]);
  const poId = poRes.rows[0].id;
  const poNumber = poRes.rows[0].number;
  console.log(`\nCreated PurchaseOrder id=${poId} number=${poNumber}`);

  let relinked = 0, linkedNew = 0;
  for (const l of planned) {
    const prodRow = await client.query(`SELECT image, name FROM products WHERE id=$1`, [l.product_id]);
    const imageUrl = prodRow.rows[0]?.image ?? null;
    const productTitle = prodRow.rows[0]?.name || l.name || `Product ${l.product_id}`;
    const lineCost = +(l.unit_cost_usd * (l.qty||0)).toFixed(2);
    const noteParts = [];
    if (l.link) noteParts.push(`Supplier: ${l.link}`);
    if (l.link2) noteParts.push(`Alt: ${l.link2}`);
    const noteText = noteParts.join(' | ') || null;

    await client.query(
      `INSERT INTO purchase_order_items
        (purchase_order_id, product_id, product_title, sku, image_url, quantity, unit_cost_usd, line_cost_usd, priority, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);`,
      [poId, l.product_id, productTitle, l.sku, imageUrl, l.qty, l.unit_cost_usd, lineCost, 'STANDARD', noteText]);

    if (l.cogs_usd != null || l.transport_usd != null) {
      await client.query(
        `INSERT INTO product_pipeline_details (product_id, cogs_usd, transport_usd)
         VALUES ($1,$2,$3) ON CONFLICT (product_id) DO UPDATE SET
           cogs_usd      = COALESCE(EXCLUDED.cogs_usd,      product_pipeline_details.cogs_usd),
           transport_usd = COALESCE(EXCLUDED.transport_usd, product_pipeline_details.transport_usd);`,
        [l.product_id, l.cogs_usd, l.transport_usd]);
    }

    // Re-link this product to the manual PO (overwrite if previously linked elsewhere).
    const linkRes = await client.query(
      `INSERT INTO product_purchase_order_links (product_id, purchase_order_id)
       VALUES ($1,$2)
       ON CONFLICT (product_id) DO UPDATE SET purchase_order_id = EXCLUDED.purchase_order_id
       RETURNING (xmax = 0) AS inserted;`,
      [l.product_id, poId]);
    if (linkRes.rows[0].inserted) linkedNew++; else relinked++;
  }

  console.log(`\nLinks: ${linkedNew} new, ${relinked} re-linked from prior PO`);

  if (COMMIT) {
    await client.query('COMMIT');
    console.log(`\n✅ COMMITTED. PO id=${poId} number=${poNumber} with ${planned.length} lines.`);
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
