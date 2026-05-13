// Parse "Order 2 - Sanitary" → data/manual-order-2-parsed.json
// Layout: headers row 5; cols: 0 Category, 1 Link, 2 Product ID, 3 Title, 4 Image URL,
//         6 Retail Price (RON), 7 QTY (green = confirmed), 8 COGS (USD), 9 Transport (USD)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const RAW = path.join(ROOT, 'data/manual-orders-raw.json');
const OUT = path.join(ROOT, 'data/manual-order-2-parsed.json');

const cellText = c => c?.formattedValue ?? c?.effectiveValue?.stringValue ?? (c?.effectiveValue?.numberValue !== undefined ? String(c.effectiveValue.numberValue) : '');
const isGreen = (bg) => { if (!bg) return false; const r=bg.red??0,g=bg.green??0,b=bg.blue??0; return g>0.55 && g>r+0.1 && g>b+0.1; };
const num = (v) => { if (v == null || v === '') return null; const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };

const d = JSON.parse(fs.readFileSync(RAW, 'utf8'));
const sh = d.sheets.find(s => s.properties.title === 'Order 2 - Sanitary');
const rows = sh.data?.[0]?.rowData || [];

const COL = { category: 0, link: 1, productId: 2, title: 3, imageUrl: 4, retail: 6, qty: 7, cogs: 8, transport: 9, landed: 10, linkSite: 11 };

const lines = [];
for (let i = 6; i < rows.length; i++) {
  const r = rows[i]?.values || [];
  const get = idx => cellText(r[idx]);
  const idRaw = get(COL.productId);
  if (!idRaw) continue;
  const numericId = parseInt(String(idRaw).replace(/[^\d]/g, ''), 10);
  if (!isFinite(numericId)) continue;

  const qtyCell = r[COL.qty];
  const green = isGreen(qtyCell?.effectiveFormat?.backgroundColor);
  const qtyRaw = get(COL.qty);
  const qty = qtyRaw ? Math.round(parseFloat(String(qtyRaw).replace(',', '.'))) : null;

  lines.push({
    sheet_row: i + 1,
    category: get(COL.category) || null,
    product_id: numericId,
    title: get(COL.title) || null,
    image_url: get(COL.imageUrl) || null,
    retail_ron: get(COL.retail) || null,
    qty,
    purchased: green,
    cogs_usd: num(get(COL.cogs)),
    transport_usd: num(get(COL.transport)),
  });
}

fs.writeFileSync(OUT, JSON.stringify(lines, null, 2));
console.log(`Parsed ${lines.length} line(s) (green=${lines.filter(l=>l.purchased).length}, white=${lines.filter(l=>!l.purchased).length}) → ${OUT}`);
