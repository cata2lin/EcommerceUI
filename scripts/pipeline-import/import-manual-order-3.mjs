// Import "Order 2 - Sanitary" — single PO, DRAFT, includes white skipped rows.
// COGS/Transport are missing from the sheet → pulled from product_pipeline_details in DB.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const COMMIT = process.argv.includes('--commit');
const PO_TITLE = 'Manual Order 3 - Home fitness';
const PO_NOTES = 'Imported from "Grandia - Iulian Orders (non-app)" sheet, tab "Order 3". Manually-placed offline order. Costs sourced from product_pipeline_details (sheet had empty COGS/Transport columns).';
const PO_STATUS = 'DRAFT';
const PO_PRIORITY = 'STANDARD';
const CREATED_BY_ID = 2;

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const PARSED = path.join(ROOT, 'data/manual-order-3-parsed.json');
const lines = JSON.parse(fs.readFileSync(PARSED, 'utf8'));

// Dedup by product_id, keep first occurrence.
const seen = new Set();
const planned = [];
const dropped = [];
for (const l of lines) {
  if (seen.has(l.product_id)) { dropped.push(l); continue; }
  seen.add(l.product_id);
  planned.push(l);
}

console.log(`=== Manual Order 3 ===`);
console.log(`Mode:               ${COMMIT ? 'COMMIT' : 'DRY RUN'}`);
console.log(`Parsed lines:       ${lines.length}`);
console.log(`Dropped duplicates: ${dropped.length}`);
for (const d of dropped) console.log(`  R${d.sheet_row} id=${d.product_id} | ${(d.title||'').slice(0,60)}`);

const client = new pg.Client({ host: '38.242.226.83', port: 5432, user: 'scraper', password: 'Scraper123#', database: 'test' });
await client.connect();
try {
  await client.query('BEGIN');

  // Verify products exist + fetch costs from product_pipeline_details + image/name from products.
  const ids = planned.map(l => l.product_id);
  const dbRows = await client.query(
    `SELECT p.id, p.name, p.image, ppd.cogs_usd, ppd.transport_usd
       FROM products p
       LEFT JOIN product_pipeline_details ppd ON ppd.product_id = p.id
      WHERE p.id = ANY($1::int[])`,
    [ids]);
  const byId = new Map(dbRows.rows.map(r => [r.id, r]));
  const missing = ids.filter(i => !byId.has(i));
  if (missing.length) {
    console.error(`Missing product ids: ${missing.join(',')}`);
    throw new Error('Aborting: products missing from DB');
  }

  // Build line specs.
  const specs = planned.map(l => {
    const db = byId.get(l.product_id);
    const cogs = l.cogs_usd ?? (db.cogs_usd != null ? Number(db.cogs_usd) : null);
    const transport = l.transport_usd ?? (db.transport_usd != null ? Number(db.transport_usd) : null);
    const unit = +((cogs ?? 0) + (transport ?? 0)).toFixed(2);
    const qty = l.purchased ? Math.round(l.qty ?? 0) : 0;
    const lineCost = +(unit * qty).toFixed(2);
    return {
      product_id: l.product_id,
      title: db.name || l.title || `Product ${l.product_id}`,
      image: db.image || l.image_url || null,
      qty,
      unit,
      lineCost,
      cogs, transport,
      notes: l.purchased ? null : 'Skipped — not ordered manually',
    };
  });

  const totalQty = specs.reduce((s,x)=>s+x.qty, 0);
  const totalCost = +specs.reduce((s,x)=>s+x.lineCost, 0).toFixed(2);
  console.log(`Planned lines:      ${specs.length} (ordered=${specs.filter(s=>s.qty>0).length}, skipped=${specs.filter(s=>s.qty===0).length})`);
  console.log(`Total qty:          ${totalQty}`);
  console.log(`Total cost USD:     ${totalCost.toFixed(2)}`);

  const noCost = specs.filter(s => s.qty>0 && s.cogs == null && s.transport == null);
  if (noCost.length) {
    console.log(`\nWARNING: ${noCost.length} ordered lines have no cost (sheet empty + DB empty):`);
    for (const x of noCost) console.log(`  id=${x.product_id} | ${x.title.slice(0,60)}`);
  }

  const poRes = await client.query(
    `INSERT INTO purchase_orders (title, priority, status, notes, total_cost_usd, created_by_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, number;`,
    [PO_TITLE, PO_PRIORITY, PO_STATUS, PO_NOTES, totalCost, CREATED_BY_ID]);
  const poId = poRes.rows[0].id;
  const poNumber = poRes.rows[0].number;
  console.log(`\nCreated PurchaseOrder id=${poId} number=${poNumber}`);

  let linkedNew = 0, relinked = 0;
  for (const x of specs) {
    await client.query(
      `INSERT INTO purchase_order_items
        (purchase_order_id, product_id, product_title, sku, image_url, quantity, unit_cost_usd, line_cost_usd, priority, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);`,
      [poId, x.product_id, x.title, null, x.image, x.qty, x.unit, x.lineCost, 'STANDARD', x.notes]);

    const linkRes = await client.query(
      `INSERT INTO product_purchase_order_links (product_id, purchase_order_id)
       VALUES ($1,$2)
       ON CONFLICT (product_id) DO UPDATE SET purchase_order_id = EXCLUDED.purchase_order_id
       RETURNING (xmax = 0) AS inserted;`,
      [x.product_id, poId]);
    if (linkRes.rows[0].inserted) linkedNew++; else relinked++;
  }
  console.log(`Links: ${linkedNew} new, ${relinked} re-linked from prior PO`);

  if (COMMIT) {
    await client.query('COMMIT');
    console.log(`\n✅ COMMITTED. PO id=${poId} number=${poNumber} with ${specs.length} lines.`);
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
