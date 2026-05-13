// Parse Order 6 - Green house.
// Header @ R6: ID=col 2, Title=col 3, Image=col 4, Size=col 6, sqm=col 7,
//              Retail=col 9, QTY=col 12, COGS=col 13, Transport=col 14.
// Some rows have no Product ID (manually added by user, not in DB) → flagged unmatched.
// Sheet HAS cogs/transport for most rows; fall back to DB if missing.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const OUT = path.join(ROOT, 'data/manual-order-6-parsed.json');

const cellText = c => c?.formattedValue ?? c?.effectiveValue?.stringValue ?? (c?.effectiveValue?.numberValue !== undefined ? String(c.effectiveValue.numberValue) : '');
const num = (v) => { if (v == null || v === '') return null; const n = parseFloat(String(v).replace(',', '.').replace(/[^\d.\-]/g,'')); return isFinite(n) ? n : null; };

const d = JSON.parse(fs.readFileSync(path.join(ROOT,'data/manual-orders-raw.json'),'utf8'));
const sh = d.sheets.find(s => /Order\s*6/i.test(s.properties.title));
const rows = sh.data?.[0]?.rowData || [];

const COL = { category: 0, productId: 2, title: 3, imageUrl: 4, size: 6, sqm: 7, variant: 8, retail: 9, qty: 12, cogs: 13, transport: 14 };

const lines = [];
for (let i = 8; i < rows.length; i++) {
  const sheetRow = i + 1;
  const r = rows[i]?.values || [];
  const get = idx => cellText(r[idx]);
  const idRaw = get(COL.productId);
  const title = get(COL.title);
  const qtyRaw = get(COL.qty);
  // Skip section headers and empty rows
  if (!qtyRaw && !idRaw && !title) continue;
  // Section header: just category text, no qty
  if (!qtyRaw) continue;

  const numericId = idRaw ? parseInt(String(idRaw).replace(/[^\d]/g, ''), 10) : null;
  const qty = parseInt(String(qtyRaw).replace(/[^\d]/g, ''), 10);

  lines.push({
    sheet_row: sheetRow,
    category: get(COL.category) || null,
    product_id: isFinite(numericId) ? numericId : null,
    title: title || null,
    image_url: get(COL.imageUrl) || null,
    size: get(COL.size) || null,
    sqm: get(COL.sqm) || null,
    variant: get(COL.variant) || null,
    retail_ron: get(COL.retail) || null,
    qty: isFinite(qty) ? qty : 0,
    cogs_usd: num(get(COL.cogs)),
    transport_usd: num(get(COL.transport)),
    matched: !!numericId,
  });
}

fs.writeFileSync(OUT, JSON.stringify(lines, null, 2));
const matched = lines.filter(l=>l.matched);
const unmatched = lines.filter(l=>!l.matched);
console.log(`Parsed ${lines.length} line(s) — matched=${matched.length}, unmatched=${unmatched.length}`);
console.log('Matched:');
for (const l of matched) console.log(`  R${l.sheet_row} id=${l.product_id} qty=${l.qty} cogs=${l.cogs_usd} tr=${l.transport_usd} | ${(l.title||'').slice(0,55)}`);
console.log('Unmatched (manually added, will be skipped):');
for (const l of unmatched) console.log(`  R${l.sheet_row} qty=${l.qty} | ${(l.title||'').slice(0,55)}`);
console.log(`Wrote ${OUT}`);
