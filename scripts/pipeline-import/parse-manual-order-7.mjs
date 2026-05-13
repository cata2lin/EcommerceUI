// Parse Order 7 - Blackout Curtains.
// Header @ R6: ID=col 2, Title=col 3, Image=col 4, Size=col 6, Color=col 7,
//              Retail=col 8, QTY=col 11, COGS=col 12, Transport=col 13.
// Rows without product ID are user-added — flagged unmatched (will be skipped).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const OUT = path.join(ROOT, 'data/manual-order-7-parsed.json');

const cellText = c => c?.formattedValue ?? c?.effectiveValue?.stringValue ?? (c?.effectiveValue?.numberValue !== undefined ? String(c.effectiveValue.numberValue) : '');
const num = v => { if (v == null || v === '') return null; const n = parseFloat(String(v).replace(',', '.').replace(/[^\d.\-]/g,'')); return isFinite(n) ? n : null; };

const d = JSON.parse(fs.readFileSync(path.join(ROOT,'data/manual-orders-raw.json'),'utf8'));
const sh = d.sheets.find(s => /Order\s*7/i.test(s.properties.title));
const rows = sh.data?.[0]?.rowData || [];

const COL = { productId: 2, title: 3, imageUrl: 4, size: 6, color: 7, retail: 8, qty: 11, cogs: 12, transport: 13 };

const lines = [];
for (let i = 8; i < rows.length; i++) {
  const sheetRow = i + 1;
  const r = rows[i]?.values || [];
  const get = idx => cellText(r[idx]);
  const idRaw = get(COL.productId);
  const qtyRaw = get(COL.qty);
  if (!qtyRaw && !idRaw) continue;        // skip section headers / blanks
  if (!qtyRaw) continue;                  // no qty → not a real line
  const numericId = idRaw ? parseInt(String(idRaw).replace(/[^\d]/g, ''), 10) : null;
  const qtyParsed = parseFloat(String(qtyRaw).replace(',', '.').match(/-?\d+(\.\d+)?/)?.[0] ?? '');
  const qty = isFinite(qtyParsed) ? Math.round(qtyParsed) : 0;
  lines.push({
    sheet_row: sheetRow,
    product_id: isFinite(numericId) ? numericId : null,
    title: get(COL.title) || null,
    image_url: get(COL.imageUrl) || null,
    size: get(COL.size) || null,
    color: get(COL.color) || null,
    retail_ron: get(COL.retail) || null,
    qty,
    cogs_usd: num(get(COL.cogs)),
    transport_usd: num(get(COL.transport)),
    matched: !!numericId,
  });
}

fs.writeFileSync(OUT, JSON.stringify(lines, null, 2));
const matched = lines.filter(l=>l.matched);
const unmatched = lines.filter(l=>!l.matched);
console.log(`Parsed ${lines.length} line(s) — matched=${matched.length}, unmatched=${unmatched.length} (will skip)`);
console.log('Matched:');
for (const l of matched) console.log(`  R${l.sheet_row} id=${l.product_id} qty=${l.qty} cogs=${l.cogs_usd} tr=${l.transport_usd} | ${(l.title||'').slice(0,55)}`);
console.log('Unmatched (no ID):');
for (const l of unmatched) console.log(`  R${l.sheet_row} qty=${l.qty} ${l.size}/${l.color}`);
console.log(`Wrote ${OUT}`);
