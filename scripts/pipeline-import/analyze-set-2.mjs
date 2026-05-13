// Set 2 — focused analyzer (same layout as Set 1.1).
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const TAB = 'Set 2';
const SLUG = 'set-2';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const PARSED = path.join(ROOT, 'data/grandia-pipeline.json');
const OUTDIR = path.join(ROOT, 'output');
const PGURI = 'postgresql://scraper:Scraper123%23@38.242.226.83:5432/test';

const all = JSON.parse(fs.readFileSync(PARSED, 'utf8'));
const rows = all[TAB];
if (!rows) { console.error(`Tab not found: ${TAB}`); process.exit(1); }

console.log(`=== ${TAB} ===`);
console.log(`Total rows: ${rows.length}`);
console.log(`Purchased (green QTY): ${rows.filter(r => r._purchased).length}`);
console.log(`Not purchased (white):  ${rows.filter(r => !r._purchased).length}`);

const noId = rows.filter(r => !r._numericId);
const noSku = rows.filter(r => !r.SKU);
console.log(`Rows with NO numeric ID: ${noId.length}`);
console.log(`Rows with NO SKU:        ${noSku.length}`);

const pipStatuses = {};
for (const r of rows) pipStatuses[r.PipelineStatus || 'NULL'] = (pipStatuses[r.PipelineStatus || 'NULL'] || 0) + 1;
console.log('Pipeline Status values:', pipStatuses);

const ids = [...new Set(rows.map(r => r._numericId).filter(Boolean).map(Number))];
const sql = `
WITH input(id) AS (VALUES ${ids.map(i => `(${i})`).join(',')})
SELECT i.id,
  CASE WHEN p.id IS NOT NULL THEN 1 ELSE 0 END,
  p.original_id, p.name, p.pipeline_status, p.shortlisted,
  COALESCE((SELECT COUNT(*) FROM purchase_order_items poi WHERE poi.product_id=i.id),0)
FROM input i LEFT JOIN products p ON p.id = i.id ORDER BY i.id;`.replace(/\n/g,' ');

const out = execSync(`psql "${PGURI}" -At -F '|' -c "${sql}"`, { encoding: 'utf8' });
const byId = new Map();
for (const ln of out.trim().split('\n')) {
  const [id, exists, original_id, name, pipeline_status, shortlisted, poCount] = ln.split('|');
  byId.set(id, {
    exists: exists === '1', original_id, name, pipeline_status,
    shortlisted: shortlisted === 't', poCount: parseInt(poCount, 10),
  });
}

const enriched = rows.map(r => {
  const m = byId.get(String(r._numericId)) || {};
  return {
    tab: TAB,
    id: r._numericId,
    sku: r.SKU,
    title: r.Title,
    parser: r.Parser,
    qty: r.QTY,
    cogs_usd: r.Cogs,
    transport_usd: r.TransportUSD,
    landed_usd: r.LandedUSD,
    price_lei: r.PriceLei,
    m3_unit: r.M3Unit,
    pipeline_status_sheet: r.PipelineStatus,
    purchased: r._purchased,
    db_exists: !!m.exists,
    db_original_id: m.original_id || null,
    db_name: m.name || null,
    db_pipeline_status: m.pipeline_status || null,
    db_shortlisted: m.shortlisted || false,
    existing_po_lines: m.poCount || 0,
  };
});

const missing = enriched.filter(r => !r.db_exists);
const alreadyInPo = enriched.filter(r => r.db_exists && r.existing_po_lines > 0);
const importableOrdered = enriched.filter(r => r.db_exists && r.existing_po_lines === 0 && r.purchased);
const importableNew = enriched.filter(r => r.db_exists && r.existing_po_lines === 0 && !r.purchased);

console.log(`\n--- Buckets ---`);
console.log(`Missing from products:    ${missing.length}`);
console.log(`Already on existing PO:   ${alreadyInPo.length}`);
console.log(`To import as ORDERED:     ${importableOrdered.length}`);
console.log(`To import as NEW/Approved:${importableNew.length}`);

function num(v) { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; }
let qtySum = 0, qtyMissing = 0, cogsMissing = 0, transportMissing = 0;
for (const r of [...importableOrdered, ...importableNew]) {
  const q = num(r.qty);
  if (q == null) qtyMissing++; else qtySum += q;
  if (num(r.cogs_usd) == null) cogsMissing++;
  if (num(r.transport_usd) == null) transportMissing++;
}
console.log(`\nQty sum (importable):       ${qtySum}`);
console.log(`Rows missing QTY:           ${qtyMissing}`);
console.log(`Rows missing Cogs (USD):    ${cogsMissing}`);
console.log(`Rows missing Transport USD: ${transportMissing}`);

// Duplicate product IDs within tab
const dupCounts = {};
for (const r of enriched) if (r.db_exists) dupCounts[r.id] = (dupCounts[r.id]||0)+1;
const dups = Object.entries(dupCounts).filter(([,c])=>c>1);
console.log(`\nDuplicate product IDs: ${dups.length}`);
for (const [id,c] of dups) {
  const drs = enriched.filter(r=>r.id===id);
  console.log(`  id=${id} count=${c}`);
  for (const d of drs) console.log(`    qty=${d.qty} purchased=${d.purchased} | ${(d.title||'').slice(0,80)}`);
}

console.log(`\n--- Missing from DB ---`);
for (const r of missing) console.log(`  id=${r.id} sku=${r.sku} purchased=${r.purchased} | ${(r.title||'').slice(0,80)}`);

if (alreadyInPo.length) {
  console.log(`\n--- Already on existing PO ---`);
  for (const r of alreadyInPo) console.log(`  id=${r.id} po_lines=${r.existing_po_lines} | ${(r.db_name||'').slice(0,80)}`);
}

fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(path.join(OUTDIR, `${SLUG}-enriched.json`), JSON.stringify(enriched, null, 2));
fs.writeFileSync(path.join(OUTDIR, `${SLUG}-missing.json`), JSON.stringify(missing, null, 2));

console.log(`\nOutput written to ${OUTDIR}/${SLUG}-*.json`);
