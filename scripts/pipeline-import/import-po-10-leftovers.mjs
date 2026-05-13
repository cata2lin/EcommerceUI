// Create "PO-10 - Leftovers" — DRAFT — qty=50 each — for all approved products with no PO link
// Reads output/approved-not-in-po-vs-sheet.json
import fs from 'node:fs';
import pg from 'pg';

const COMMIT = process.argv.includes('--commit');
const QTY = 50;
const TITLE = 'PO-10 - Leftovers';
const CREATED_BY_ID = 2;

const products = JSON.parse(fs.readFileSync('output/approved-not-in-po-vs-sheet.json','utf8'));
const ids = products.map(p => p.id);
console.log(`Source list: ${ids.length} products`);

const c = new pg.Client({host:'38.242.226.83',port:5432,user:'scraper',password:'Scraper123#',database:'test'});
await c.connect();

// Re-confirm filter against current DB to avoid stale data, and fetch costs/images
const rows = (await c.query(`
  SELECT p.id, p.name, p.image,
         ppd.cogs_usd::float8 AS cogs_usd,
         ppd.transport_usd::float8 AS transport_usd,
         ppd.sku AS sku,
         EXISTS(SELECT 1 FROM product_purchase_order_links l WHERE l.product_id=p.id) AS has_link,
         (SELECT purchase_order_id FROM product_purchase_order_links l WHERE l.product_id=p.id) AS existing_po_id
  FROM products p
  LEFT JOIN product_pipeline_details ppd ON ppd.product_id = p.id
  WHERE p.id = ANY($1::int[])
  ORDER BY p.id
`, [ids])).rows;

const stillEligible = rows.filter(r => !r.has_link);
const droppedNowLinked = rows.filter(r => r.has_link);
const missingProduct = ids.filter(id => !rows.some(r => r.id === id));

console.log(`Eligible (no PO link): ${stillEligible.length}`);
console.log(`Dropped (already linked since audit): ${droppedNowLinked.length}`);
console.log(`Missing in DB: ${missingProduct.length}`);

const lines = stillEligible.map(r => {
  const cogs = r.cogs_usd != null ? Number(r.cogs_usd) : null;
  const tr = r.transport_usd != null ? Number(r.transport_usd) : null;
  const unit = (cogs ?? 0) + (tr ?? 0);
  return {
    product_id: r.id,
    product_title: r.name || `Product ${r.id}`,
    sku: r.sku || null,
    image_url: r.image || null,
    quantity: QTY,
    unit_cost_usd: +unit.toFixed(2),
    line_cost_usd: +(unit * QTY).toFixed(2),
    has_cost: cogs != null || tr != null,
  };
});

const totalQty = lines.reduce((s,l)=>s+l.quantity, 0);
const totalCost = +lines.reduce((s,l)=>s+l.line_cost_usd, 0).toFixed(2);
const linesNoCost = lines.filter(l => !l.has_cost).length;

console.log(`\n=== ${TITLE} ===`);
console.log(`Mode:           ${COMMIT ? 'COMMIT' : 'DRY RUN'}`);
console.log(`Lines:          ${lines.length}`);
console.log(`Total qty:      ${totalQty}`);
console.log(`Total cost USD: $${totalCost.toFixed(2)}`);
console.log(`Lines w/o cost: ${linesNoCost} (unit_cost_usd=$0)`);

try {
  await c.query('BEGIN');
  const poRes = await c.query(
    `INSERT INTO purchase_orders (title, priority, status, notes, total_cost_usd, created_by_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, number;`,
    [TITLE, 'STANDARD', 'DRAFT',
     `Leftovers PO created on 2026-04-27. ${lines.length} approved products that had no PO link, qty=50 each. Costs from product_pipeline_details where available; ${linesNoCost} lines have no cost data and were inserted with unit_cost_usd=0.`,
     totalCost, CREATED_BY_ID]);
  const poId = poRes.rows[0].id;
  const poNumber = poRes.rows[0].number;
  console.log(`\nCreated PO id=${poId} number=${poNumber}`);

  let newLinks = 0, relinked = 0;
  for (const l of lines) {
    await c.query(
      `INSERT INTO purchase_order_items
        (purchase_order_id, product_id, product_title, sku, image_url, quantity, unit_cost_usd, line_cost_usd, priority, notes)
       VALUES ($1::int,$2::int,$3,$4,$5,$6::int,$7::numeric,$8::numeric,$9,$10);`,
      [poId, l.product_id, l.product_title, l.sku, l.image_url, l.quantity, l.unit_cost_usd, l.line_cost_usd, 'STANDARD', null]);

    const linkRes = await c.query(
      `INSERT INTO product_purchase_order_links (product_id, purchase_order_id)
       VALUES ($1,$2)
       ON CONFLICT (product_id) DO UPDATE SET purchase_order_id = EXCLUDED.purchase_order_id
       RETURNING (xmax = 0) AS inserted;`,
      [l.product_id, poId]);
    if (linkRes.rows[0].inserted) newLinks++; else relinked++;
  }
  console.log(`Links: ${newLinks} new, ${relinked} re-linked`);

  if (COMMIT) {
    await c.query('COMMIT');
    console.log(`\n✅ COMMITTED. PO id=${poId} number=${poNumber}.`);
  } else {
    await c.query('ROLLBACK');
    console.log(`\n🟡 DRY RUN — rolled back. Re-run with --commit.`);
  }
} catch (err) {
  await c.query('ROLLBACK');
  console.error('Rolled back:', err);
  process.exitCode = 1;
} finally {
  await c.end();
}
