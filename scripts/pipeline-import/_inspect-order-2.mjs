import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync('data/manual-orders-raw.json','utf8'));
const cellText = c => c?.formattedValue ?? c?.effectiveValue?.stringValue ?? (c?.effectiveValue?.numberValue !== undefined ? String(c.effectiveValue.numberValue) : '');
const sh = d.sheets.find(s => s.properties.title === 'Order 2 - Sanitary');
const rows = sh.data?.[0]?.rowData || [];
console.log('Headers row 5:');
(rows[5]?.values || []).forEach((c,i)=>{ const t=cellText(c); if(t) console.log('  col',i,JSON.stringify(t)); });
function isGreen(bg) { if (!bg) return false; const r=bg.red??0, g=bg.green??0, b=bg.blue??0; return g>0.55 && g>r+0.1 && g>b+0.1; }
console.log('\nData rows 6..52:');
for (let i=6; i<=52; i++) {
  const r = rows[i]?.values || [];
  const get = idx => cellText(r[idx]);
  const qtyCell = r[7];
  const bg = qtyCell?.effectiveFormat?.backgroundColor;
  const green = isGreen(bg);
  const id = get(2);
  if (!id && !green) continue;
  console.log(`  R${i+1} cat=${JSON.stringify((get(0)||'').slice(0,20))} id=${JSON.stringify(id)} title=${JSON.stringify((get(3)||'').slice(0,40))} retail=${JSON.stringify(get(6))} qty=${JSON.stringify(get(7))} GREEN=${green} cogs=${JSON.stringify(get(8))} transport=${JSON.stringify(get(9))}`);
}
