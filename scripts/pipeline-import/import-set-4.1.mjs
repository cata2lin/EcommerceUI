// Import Set 4.1 Furniture — splits into TWO POs:
//   - "Pipeline Set 4.1 Furniture - Confirmed" : green QTY rows
//   - "Pipeline Set 4.1 Furniture - Hold"      : non-green rows (qty kept as-is)
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const COMMIT = process.argv.includes('--commit');
const TAB = 'Set 4.1 Furniture';
const SLUG = 'set-4.1-furniture';
const CREATED_BY_ID = 2;

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

function buildLines(list, { holdNote } = {}) {
  return list.map(r => {
    const qtySheet = num(r.qty);
    const cogs = num(r.cogs_usd);
    const transport = num(r.transport_usd);
    const unit = (cogs ?? 0) + (transport ?? 0);
    const quantity = Math.round(qtySheet ?? 0);
    return {
      product_id: parseInt(r.id, 10),
      product_title: r.db_name || r.title || `Product ${r.id}`,
      sku: r.sku ?? null,
      quantity,
      unit_cost_usd: +unit.toFixed(2),
      line_cost_usd: +(unit * quantity).toFixed(2),
      notes: holdNote ?? null,
      cogs_usd: cogs, transport_usd: transport,
    };
  });
}

const confirmedRows = importable.filter(r => r.purchased);
const holdRows = importable.filter(r => !r.purchased);
const confirmedLines = buildLines(confirmedRows);
const holdLines = buildLines(holdRows, { holdNote: 'On hold — pending supplier confirmation' });

const sumCost = ls => +ls.reduce((s,l)=>s+l.line_cost_usd, 0).toFixed(2);
const sumQty = ls => ls.reduce((s,l)=>s+l.quantity, 0);

const POS = [
  {
    title: 'Pipeline Set 4.1 Furniture - Confirmed',
    notes: `Imported from Grandia Pipeline sheet on 2026-04-27. Confirmed (green) rows from "${TAB}". ${confirmedLines.length} lines.`,
    status: 'DRAFT', priority: 'STANDARD',
    lines: confirmedLines,
  },
  {
    title: 'Pipeline Set 4.1 Furniture - Hold',
    notes: `Imported from Grandia Pipeline sheet on 2026-04-27. On-hold (non-green) rows from "${TAB}". Pending supplier confirmation. ${holdLines.length} lines.`,
    status: 'DRAFT', priority: 'STANDARD',
    lines: holdLines,
  },
];

console.log(`=== ${TAB} import ===`);
console.log(`Mode:                 ${COMMIT ? 'COMMIT' : 'DRY RUN'}`);
console.log(`Importable rows:      ${importable.length}`);
console.log(`Missing from DB:      ${skipped_missing.length}`);
console.log(`Already in some PO:   ${skipped_already_in_po.length}`);
for (const po of POS) {
  console.log(`\nPO: ${po.title}`);
  console.log(`  Lines:       ${po.lines.length}`);
  console.log(`  Total units: ${sumQty(po.lines)}`);
  console.log(`  Total cost:  $${sumCost(po.lines)}`);
}

const client = new pg.Client({ host: '38.242.226.83', port: 5432, user: 'scraper', password: 'Scraper123#', database: 'test' });
await client.connect();
try {
  await client.query('BEGIN');
  const created = [];
  for (const po of POS) {
    const total = sumCost(po.lines);
    const poRes = await client.query(
      `INSERT INTO purchase_orders (title, priority, status, notes, total_cost_usd, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, number;`,
      [po.title, po.priority, po.status, po.notes, total, CREATED_BY_ID]);
    const poId = poRes.rows[0].id;
    const poNumber = poRes.rows[0].number;
    console.log(`\nCreated PurchaseOrder id=${poId} number=${poNumber} — ${po.title}`);

    for (const l of po.lines) {
      const prodRow = await client.query(`SELECT image, name FROM products WHERE id=$1`, [l.product_id]);
      const imageUrl = prodRow.rows[0]?.image ?? null;
      const productTitle = l.product_title || prodRow.rows[0]?.name || `Product ${l.product_id}`;

      await client.query(
        `INSERT INTO purchase_order_items
          (purchase_order_id, product_id, product_title, sku, image_url, quantity, unit_cost_usd, line_cost_usd, priority, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);`,
        [poId, l.product_id, productTitle, l.sku, imageUrl, l.quantity, l.unit_cost_usd, l.line_cost_usd, 'STANDARD', l.notes]);

      if (l.cogs_usd != null || l.transport_usd != null) {
        await client.query(
          `INSERT INTO product_pipeline_details (product_id, cogs_usd, transport_usd)
           VALUES ($1,$2,$3) ON CONFLICT (product_id) DO UPDATE SET
             cogs_usd      = COALESCE(EXCLUDED.cogs_usd,      product_pipeline_details.cogs_usd),
             transport_usd = COALESCE(EXCLUDED.transport_usd, product_pipeline_details.transport_usd);`,
          [l.product_id, l.cogs_usd, l.transport_usd]);
      }

      await client.query(
        `INSERT INTO product_purchase_order_links (product_id, purchase_order_id) VALUES ($1,$2) ON CONFLICT (product_id) DO NOTHING;`,
        [l.product_id, poId]);
    }
    created.push({ id: poId, number: poNumber, title: po.title, lines: po.lines.length });
  }

  if (COMMIT) {
    await client.query('COMMIT');
    console.log(`\n✅ COMMITTED ${created.length} POs:`);
    for (const c of created) console.log(`   PO id=${c.id} number=${c.number} (${c.lines} lines) — ${c.title}`);
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
