// Inspect Order 6 - Green houses.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const d = JSON.parse(fs.readFileSync(path.join(ROOT,'data/manual-orders-raw.json'),'utf8'));
const sh = d.sheets.find(s => /Order\s*6/i.test(s.properties.title));
if (!sh) { console.error('Tab not found. Tabs:', d.sheets.map(s=>s.properties.title)); process.exit(1); }
console.log('Tab title:', sh.properties.title);
const rows = sh.data?.[0]?.rowData || [];
const txt = c => c?.formattedValue ?? c?.effectiveValue?.stringValue ?? (c?.effectiveValue?.numberValue !== undefined ? String(c.effectiveValue.numberValue) : '');
const isGreen = bg => { if (!bg) return false; const r=bg.red??0,g=bg.green??0,b=bg.blue??0; return g>0.55 && g>r+0.1 && g>b+0.1; };
const isYellow = bg => { if (!bg) return false; const r=bg.red??0,g=bg.green??0,b=bg.blue??0; return r>0.7 && g>0.7 && b<0.5; };

for (let i = 4; i < Math.min(9, rows.length); i++) {
  const r = rows[i]?.values || [];
  console.log(`Header R${i+1}:`, r.slice(0,16).map((c,idx)=>`${idx}:"${(txt(c)||'').slice(0,22)}"`).join(' | '));
}

console.log('\nData rows:');
for (let i = 8; i < rows.length; i++) {
  const r = rows[i]?.values || [];
  const sheetRow = i+1;
  const id = txt(r[2]);
  const cat = txt(r[0]);
  const title = txt(r[3]);
  if (!id && !title && !cat) continue;
  const greens = [];
  const yellows = [];
  for (let c = 6; c <= 16; c++) {
    const bg = r[c]?.effectiveFormat?.backgroundColor;
    if (isGreen(bg)) greens.push(c);
    if (isYellow(bg)) yellows.push(c);
  }
  // print c0,c2,c3 and 6..16
  const colsStr = [6,7,8,9,10,11,12,13,14,15,16].map(c=>`c${c}="${(txt(r[c])||'').slice(0,15)}"`).join(' ');
  // also row background (whole row green for "section bestsellers")
  const rowBg = r[0]?.effectiveFormat?.backgroundColor;
  const rowIsGreen = isGreen(rowBg);
  console.log(`  R${sheetRow}${rowIsGreen?'(rowGreen)':''} cat="${(cat||'').slice(0,18)}" id="${id}" ${colsStr} green=[${greens}] yellow=[${yellows}] | ${(title||'').slice(0,40)}`);
}
