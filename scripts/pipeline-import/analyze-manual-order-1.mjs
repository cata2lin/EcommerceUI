// Analyze "Order 1" — match parsed rows against products DB.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const PARSED = path.join(ROOT, 'data/manual-order-1-parsed.json');
const OUTDIR = path.join(ROOT, 'output');
const PGURI = 'postgresql://scraper:Scraper123%23@38.242.226.83:5432/test';

const lines = JSON.parse(fs.readFileSync(PARSED, 'utf8'));
console.log(`=== Order 1 — Manual ===`);
console.log(`Parsed lines: ${lines.length}`);

const ids = [...new Set(lines.map(l => l.product_id))];
const sql = `
WITH input(id) AS (VALUES ${ids.map(i => `(${i})`).join(',')})
SELECT i.id,
  CASE WHEN p.id IS NOT NULL THEN 1 ELSE 0 END,
  p.original_id, p.name,
  COALESCE((SELECT COUNT(*) FROM purchase_order_items poi WHERE poi.product_id=i.id),0)
FROM input i LEFT JOIN products p ON p.id = i.id ORDER BY i.id;`.replace(/\n/g,' ');

const out = execSync(`psql "${PGURI}" -At -F '|' -c "${sql}"`, { encoding: 'utf8' });
const byId = new Map();
for (const ln of out.trim().split('\n')) {
  const [id, exists, original_id, name, poCount] = ln.split('|');
  byId.set(id, { exists: exists === '1', original_id, name, poCount: parseInt(poCount, 10) });
}

const enriched = lines.map(l => {
  const m = byId.get(String(l.product_id)) || {};
  return {
    ...l,
    db_exists: !!m.exists,
    db_original_id: m.original_id || null,
    db_name: m.name || null,
    existing_po_lines: m.poCount || 0,
  };
});

console.log('\n--- Per-row match status ---');
for (const r of enriched) {
  const flags = [];
  if (!r.db_exists) flags.push('MISSING-DB');
  if (r.db_exists && r.existing_po_lines > 0) flags.push(`ALREADY-IN-PO(${r.existing_po_lines})`);
  console.log(`  R${r.sheet_row} id=${r.product_id} ${flags.join(' ') || 'OK'} | sheet="${(r.name||'').slice(0,40)}" | db="${(r.db_name||'').slice(0,40)}"`);
}

const missing = enriched.filter(r => !r.db_exists);
const alreadyInPo = enriched.filter(r => r.db_exists && r.existing_po_lines > 0);

const dupCounts = {};
for (const r of enriched) if (r.db_exists) dupCounts[r.product_id] = (dupCounts[r.product_id] || 0) + 1;
const dups = Object.entries(dupCounts).filter(([,c]) => c > 1);

console.log(`\n--- Buckets ---`);
console.log(`Missing from DB:        ${missing.length}`);
console.log(`Already on existing PO: ${alreadyInPo.length}`);
console.log(`Duplicates within tab:  ${dups.length}`);
for (const [id, c] of dups) {
  console.log(`  id=${id} count=${c}`);
  for (const d of enriched.filter(r => r.product_id === Number(id))) {
    console.log(`    R${d.sheet_row} qty=${d.qty} unit=${d.unit_cost_usd} | ${(d.name||'').slice(0,60)}`);
  }
}

// Plan after dedup (keep first occurrence per id, drop later ones).
const seen = new Set();
const planned = [];
const dropped = [];
for (const r of enriched) {
  if (!r.db_exists || r.existing_po_lines > 0) continue;
  if (seen.has(r.product_id)) { dropped.push(r); continue; }
  seen.add(r.product_id);
  planned.push(r);
}

const totalQty = planned.reduce((s,l) => s + (l.qty||0), 0);
const totalCost = planned.reduce((s,l) => s + (l.unit_cost_usd * (l.qty||0)), 0);
console.log(`\n--- Planned PO (after dedup, first occurrence kept) ---`);
console.log(`Lines:     ${planned.length}`);
console.log(`Total qty: ${totalQty}`);
console.log(`Total $:   ${totalCost.toFixed(2)}`);
console.log(`Dropped duplicates (later occurrences): ${dropped.length}`);
for (const d of dropped) console.log(`  R${d.sheet_row} id=${d.product_id} qty=${d.qty} | ${(d.name||'').slice(0,60)}`);

fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(path.join(OUTDIR, 'manual-order-1-enriched.json'), JSON.stringify(enriched, null, 2));
fs.writeFileSync(path.join(OUTDIR, 'manual-order-1-planned.json'), JSON.stringify(planned, null, 2));
fs.writeFileSync(path.join(OUTDIR, 'manual-order-1-dropped.json'), JSON.stringify(dropped, null, 2));
console.log(`\nOutput: ${OUTDIR}/manual-order-1-{enriched,planned,dropped}.json`);
