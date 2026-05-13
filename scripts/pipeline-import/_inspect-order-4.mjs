// Inspect Order 4 - Vevor.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const d = JSON.parse(fs.readFileSync(path.join(ROOT,'data/manual-orders-raw.json'),'utf8'));
const sh = d.sheets.find(s => /Order\s*4/i.test(s.properties.title));
if (!sh) { console.error('Tab not found. Tabs:', d.sheets.map(s=>s.properties.title)); process.exit(1); }
console.log('Tab title:', sh.properties.title);
const rows = sh.data?.[0]?.rowData || [];
const txt = c => c?.formattedValue ?? c?.effectiveValue?.stringValue ?? (c?.effectiveValue?.numberValue !== undefined ? String(c.effectiveValue.numberValue) : '');
const isGreen = bg => { if (!bg) return false; const r=bg.red??0,g=bg.green??0,b=bg.blue??0; return g>0.55 && g>r+0.1 && g>b+0.1; };

// Show header rows 5-7
for (let i = 4; i < Math.min(8, rows.length); i++) {
  const r = rows[i]?.values || [];
  console.log(`Header R${i+1}:`, r.slice(0,12).map((c,idx)=>`${idx}:"${(txt(c)||'').slice(0,30)}"`).join(' | '));
}

console.log('\nData rows:');
for (let i = 6; i < rows.length; i++) {
  const r = rows[i]?.values || [];
  const sheetRow = i+1;
  const id = txt(r[2]);
  if (!id) continue;
  const greens = [];
  for (let c = 6; c <= 12; c++) if (isGreen(r[c]?.effectiveFormat?.backgroundColor)) greens.push(c);
  console.log(`  R${sheetRow} id=${id} c6="${txt(r[6])}" c7="${txt(r[7])}" c8="${txt(r[8])}" c9="${txt(r[9])}" c10="${txt(r[10])}" c11="${txt(r[11])}" green=[${greens}] | ${(txt(r[3])||'').slice(0,55)}`);
}
