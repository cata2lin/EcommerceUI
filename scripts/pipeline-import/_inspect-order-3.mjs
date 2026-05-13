import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync('data/manual-orders-raw.json','utf8'));
const cellText = c => c?.formattedValue ?? c?.effectiveValue?.stringValue ?? (c?.effectiveValue?.numberValue !== undefined ? String(c.effectiveValue.numberValue) : '');
function bg(c){ return c?.effectiveFormat?.backgroundColor; }
function isGreen(b){ if(!b) return false; const r=b.red??0,g=b.green??0,bl=b.blue??0; return g>0.55 && g>r+0.1 && g>bl+0.1; }
const sh = d.sheets.find(s => s.properties.title === 'Order 3');
const rows = sh.data?.[0]?.rowData || [];
console.log('Headers row 5:');
(rows[5]?.values || []).forEach((c,i)=>{ const t=cellText(c); if(t) console.log('  col',i,JSON.stringify(t),'bg=',bg(c)); });
console.log('\nLooking for any sub-header rows (cells with non-empty header-like text past row 5):');
for (let i=6; i<75; i++) {
  const r = rows[i]?.values || [];
  // Check if this row has only a few cells non-empty and looks like sub-header
  const txts = r.map(c => cellText(c));
  if (txts.some(t => /^(Kg|Pcs|Weight|QTY|Cogs|COGS|Transport|Landed|Title|Product ID)$/i.test(String(t).trim()))) {
    console.log(`  R${i+1}:`, txts.map((t,j)=>t?`${j}:${JSON.stringify(t)}`:'').filter(Boolean).join(' | '));
  }
}
console.log('\nFirst 75 data rows — printing cols 0..14 + green-detection at multiple QTY-candidate columns (7, 8, 9):');
for (let i=6; i<75; i++) {
  const r = rows[i]?.values || [];
  const get = idx => cellText(r[idx]);
  const id = get(2);
  if (!id) {
    // also note any green cell on this row to spot shifts
    let greenCols = [];
    for (let c=6; c<14; c++) if (isGreen(bg(r[c]))) greenCols.push(c);
    if (greenCols.length || (get(0) && /^(Children|Dumbbells|Fitness|Yoga|Bottle|Bag|Skip)/i.test(get(0)))) console.log(`  R${i+1} (cat-only?) cat=${JSON.stringify(get(0))} title=${JSON.stringify(get(3))} greenCols=${greenCols}`);
    continue;
  }
  let greenCols = [];
  for (let c=6; c<14; c++) if (isGreen(bg(r[c]))) greenCols.push(c);
  console.log(`  R${i+1} id=${id} title=${JSON.stringify((get(3)||'').slice(0,40))} c6=${JSON.stringify(get(6))} c7=${JSON.stringify(get(7))} c8=${JSON.stringify(get(8))} c9=${JSON.stringify(get(9))} c10=${JSON.stringify(get(10))} green=[${greenCols}]`);
}
