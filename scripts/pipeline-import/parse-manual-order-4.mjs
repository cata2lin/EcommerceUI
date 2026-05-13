// Parse Order 4 - Vevor.
// Header @ R6: col 2=Product ID, col 3=Title, col 4=Image URL,
// col 7=Retail, col 8=QTY (green=confirmed), col 9=COGS, col 10=Transport.
// COGS/Transport in sheet are mostly empty / junk text → IGNORED (sourced from DB).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const RAW = path.join(ROOT, 'data/manual-orders-raw.json');
const OUT = path.join(ROOT, 'data/manual-order-4-parsed.json');

const cellText = c => c?.formattedValue ?? c?.effectiveValue?.stringValue ?? (c?.effectiveValue?.numberValue !== undefined ? String(c.effectiveValue.numberValue) : '');
const isGreen = (bg) => { if (!bg) return false; const r=bg.red??0,g=bg.green??0,b=bg.blue??0; return g>0.55 && g>r+0.1 && g>b+0.1; };

const d = JSON.parse(fs.readFileSync(RAW, 'utf8'));
const sh = d.sheets.find(s => /Order\s*4/i.test(s.properties.title));
const rows = sh.data?.[0]?.rowData || [];

const COL = { productId: 2, title: 3, imageUrl: 4, retail: 7, qty: 8 };

const lines = [];
for (let i = 7; i < rows.length; i++) {  // R8 onwards (R6=header, R7 blank)
  const sheetRow = i + 1;
  const r = rows[i]?.values || [];
  const get = idx => cellText(r[idx]);
  const idRaw = get(COL.productId);
  if (!idRaw) continue;
  const numericId = parseInt(String(idRaw).replace(/[^\d]/g, ''), 10);
  if (!isFinite(numericId)) continue;

  const qtyRaw = get(COL.qty);
  const qtyNum = qtyRaw ? parseFloat(String(qtyRaw).replace(',', '.').match(/-?\d+(\.\d+)?/)?.[0] ?? '') : NaN;
  const greenQty = isGreen(r[COL.qty]?.effectiveFormat?.backgroundColor);

  // Confirmed = green AND has numeric qty. Otherwise Hold (qty=0).
  const confirmed = greenQty && isFinite(qtyNum) && qtyNum > 0;

  lines.push({
    sheet_row: sheetRow,
    product_id: numericId,
    title: get(COL.title) || null,
    image_url: get(COL.imageUrl) || null,
    retail_ron: get(COL.retail) || null,
    qty_raw: qtyRaw || null,
    qty: confirmed ? Math.round(qtyNum) : 0,
    confirmed,
  });
}

fs.writeFileSync(OUT, JSON.stringify(lines, null, 2));
const conf = lines.filter(l=>l.confirmed);
const hold = lines.filter(l=>!l.confirmed);
console.log(`Parsed ${lines.length} line(s) — confirmed=${conf.length}, hold=${hold.length}`);
console.log(`Confirmed total qty: ${conf.reduce((s,l)=>s+l.qty,0)}`);
for (const l of lines) {
  console.log(`  R${l.sheet_row} id=${l.product_id} qty=${l.qty} ${l.confirmed?'CONFIRMED':'hold'} | ${(l.title||'').slice(0,55)}`);
}
console.log(`Wrote ${OUT}`);
