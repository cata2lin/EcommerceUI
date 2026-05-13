// Inspect Order 7 - Blackout curtains
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const d = JSON.parse(fs.readFileSync(path.join(ROOT,'data/manual-orders-raw.json'),'utf8'));
const sh = d.sheets.find(s => /Order\s*7/i.test(s.properties.title));
if (!sh) { console.error('Tabs:', d.sheets.map(s=>s.properties.title)); process.exit(1); }
console.log('Tab title:', sh.properties.title);
const rows = sh.data?.[0]?.rowData || [];
const txt = c => c?.formattedValue ?? c?.effectiveValue?.stringValue ?? (c?.effectiveValue?.numberValue !== undefined ? String(c.effectiveValue.numberValue) : '');
const isGreen = bg => { if (!bg) return false; const r=bg.red??0,g=bg.green??0,b=bg.blue??0; return g>0.55 && g>r+0.1 && g>b+0.1; };

for (let i=4;i<8;i++){const r=rows[i]?.values||[];console.log(`Hdr R${i+1}:`, r.slice(0,16).map((c,idx)=>`${idx}:"${(txt(c)||'').slice(0,18)}"`).join('|'));}

console.log('\nData:');
for (let i = 8; i < rows.length; i++) {
  const r = rows[i]?.values || [];
  const sheetRow = i+1;
  const cat = txt(r[0]); const id = txt(r[2]); const title = txt(r[3]);
  const qty = txt(r[11]); const size = txt(r[6]);
  if (!cat && !id && !title && !qty && !size) continue;
  const greens = []; for (let c=8;c<=13;c++) if (isGreen(r[c]?.effectiveFormat?.backgroundColor)) greens.push(c);
  const cols = [6,7,8,9,10,11,12,13].map(c=>`c${c}="${(txt(r[c])||'').slice(0,14)}"`).join(' ');
  console.log(`  R${sheetRow} cat="${(cat||'').slice(0,16)}" id="${id}" ${cols} green=[${greens}] | ${(title||'').slice(0,45)}`);
}
