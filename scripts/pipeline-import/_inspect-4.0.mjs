import fs from 'node:fs';
const e = JSON.parse(fs.readFileSync('output/set-4.0-mix-enriched.json','utf8'));
console.log('--- Rows missing SKU ---');
for (const r of e.filter(r=>!r.sku)) {
  console.log(`  id=${r.id} purchased=${r.purchased} qty=${r.qty} | db_name=${(r.db_name||'').slice(0,80)}`);
}
console.log('--- Sample first 3 rows ---');
for (const r of e.slice(0,3)) {
  console.log(`  id=${r.id} sku=${r.sku} qty=${r.qty} purchased=${r.purchased} cogs=${r.cogs_usd} transport=${r.transport_usd} | ${(r.db_name||r.title||'').slice(0,80)}`);
}
console.log('--- Last 3 rows ---');
for (const r of e.slice(-3)) {
  console.log(`  id=${r.id} sku=${r.sku} qty=${r.qty} purchased=${r.purchased} cogs=${r.cogs_usd} transport=${r.transport_usd} | ${(r.db_name||r.title||'').slice(0,80)}`);
}
