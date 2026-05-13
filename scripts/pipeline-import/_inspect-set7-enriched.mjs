import fs from 'node:fs';
const ids = [3404636,3404368,3404357,3404317,3404286,3404174,2914532,2302495,2299640,2246287,1826498,1639383];
const en = JSON.parse(fs.readFileSync('output/set-7-mix-enriched.json','utf8'));
console.log('Enriched count:', en.length);
console.log('Sample keys:', Object.keys(en[0]));
console.log();
for (const id of ids) {
  const row = en.find(r => Number(r.id)===id || Number(r.product_id)===id);
  if (!row) { console.log(`id=${id} → NOT IN ENRICHED`); continue; }
  console.log(`id=${id} db_exists=${row.db_exists} existing_po_lines=${row.existing_po_lines} purchased=${row.purchased} qty=${row.qty} cogs=${row.cogs_usd} tr=${row.transport_usd}`);
}
