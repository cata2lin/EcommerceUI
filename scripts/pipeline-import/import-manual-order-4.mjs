// Import Order 4 - Vevor as TWO POs:
//   - "VEVOR - Confirmed" (DRAFT)  — items with green numeric qty
//   - "VEVOR - Hold" (DRAFT)       — items without numeric qty (qty=0)
// Costs: pulled from product_pipeline_details (sheet COGS/Transport empty/junk).
// Uses re-link UPSERT for product_purchase_order_links. Each product can only be
// linked to ONE PO at a time — Confirmed wins (imported first).
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const COMMIT = process.argv.includes('--commit');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const PARSED = path.join(ROOT, 'data/manual-order-4-parsed.json');
const lines = JSON.parse(fs.readFileSync(PARSED, 'utf8'));
const CREATED_BY_ID = 2;

// Dedup by product_id, keep first occurrence (per bucket).
function dedup(arr) {
  const seen = new Set(); const kept = []; const dropped = [];
  for (const l of arr) { if (seen.has(l.product_id)) { dropped.push(l); continue; } seen.add(l.product_id); kept.push(l); }
  return { kept, dropped };
}

const confirmed = dedup(lines.filter(l => l.confirmed));
const hold = dedup(lines.filter(l => !l.confirmed));

console.log(`=== Manual Order 4 — Vevor ===`);
console.log(`Mode: ${COMMIT ? 'COMMIT' : 'DRY RUN'}`);
console.log(`Confirmed: ${confirmed.kept.length} (dropped ${confirmed.dropped.length} dup)`);
console.log(`Hold:      ${hold.kept.length} (dropped ${hold.dropped.length} dup)`);

const client = new pg.Client({ host: '38.242.226.83', port: 5432, user: 'scraper', password: 'Scraper123#', database: 'test' });
await client.connect();
try {
  await client.query('BEGIN');

  // Verify products + fetch costs/name/image.
  const allIds = [...confirmed.kept, ...hold.kept].map(l => l.product_id);
  const dbRows = await client.query(
    `SELECT p.id, p.name, p.image, ppd.cogs_usd, ppd.transport_usd
       FROM products p LEFT JOIN product_pipeline_details ppd ON ppd.product_id = p.id
      WHERE p.id = ANY($1::int[])`, [allIds]);
  const byId = new Map(dbRows.rows.map(r => [r.id, r]));
  const missing = allIds.filter(i => !byId.has(i));
  if (missing.length) { console.error('Missing product ids:', missing); throw new Error('Aborting: missing'); }

  function buildSpecs(planned, isConfirmed) {
    return planned.map(l => {
      const db = byId.get(l.product_id);
      const cogs = db.cogs_usd != null ? Number(db.cogs_usd) : null;
      const transport = db.transport_usd != null ? Number(db.transport_usd) : null;
      const unit = +((cogs ?? 0) + (transport ?? 0)).toFixed(2);
      const qty = isConfirmed ? Math.round(l.qty || 0) : 0;
      const lineCost = +(unit * qty).toFixed(2);
      return {
        product_id: l.product_id,
        title: db.name || l.title || `Product ${l.product_id}`,
        image: db.image || l.image_url || null,
        qty, unit, lineCost, cogs, transport,
        notes: isConfirmed ? null : 'On hold — not yet confirmed for ordering',
      };
    });
  }

  async function createPO(title, status, notes, specs) {
    const totalCost = +specs.reduce((s,x)=>s+x.lineCost, 0).toFixed(2);
    const totalQty = specs.reduce((s,x)=>s+x.qty, 0);
    console.log(`\n--- ${title} ---`);
    console.log(`  Lines: ${specs.length}, Qty: ${totalQty}, Cost: $${totalCost.toFixed(2)}`);
    const noCost = specs.filter(s => s.qty>0 && s.cogs == null && s.transport == null);
    if (noCost.length) {
      console.log(`  WARNING: ${noCost.length} ordered lines without DB cost:`);
      for (const x of noCost) console.log(`    id=${x.product_id} | ${x.title.slice(0,55)}`);
    }
    const poRes = await client.query(
      `INSERT INTO purchase_orders (title, priority, status, notes, total_cost_usd, created_by_id)
       VALUES ($1,'STANDARD',$2,$3,$4,$5) RETURNING id, number;`,
      [title, status, notes, totalCost, CREATED_BY_ID]);
    const { id: poId, number: poNumber } = poRes.rows[0];
    console.log(`  Created PO id=${poId} number=${poNumber}`);

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
    console.log(`  Links: ${linkedNew} new, ${relinked} re-linked`);
    return { poId, poNumber };
  }

  const NOTES_BASE = 'Imported from "Grandia - Iulian Orders (non-app)" sheet, tab "Order 4 Vevor". Costs sourced from product_pipeline_details.';

  // Confirmed first so it wins re-link conflicts vs Hold.
  const confSpecs = buildSpecs(confirmed.kept, true);
  await createPO('VEVOR - Confirmed', 'DRAFT', NOTES_BASE + ' Bucket: green-highlighted QTY (confirmed for ordering).', confSpecs);

  const holdSpecs = buildSpecs(hold.kept, false);
  await createPO('VEVOR - Hold', 'DRAFT', NOTES_BASE + ' Bucket: items without confirmed quantity (on hold).', holdSpecs);

  if (COMMIT) { await client.query('COMMIT'); console.log('\n✅ COMMITTED.'); }
  else { await client.query('ROLLBACK'); console.log('\n🟡 DRY RUN — rolled back. Re-run with --commit.'); }
} catch (err) {
  await client.query('ROLLBACK'); console.error('Error, rolled back:', err); process.exitCode = 1;
} finally { await client.end(); }
