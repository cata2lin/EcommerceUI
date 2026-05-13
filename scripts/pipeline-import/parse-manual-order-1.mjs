// Parse Manual Orders sheet ("Grandia - Iulian Orders (non-app)") tab "Order 1".
// Output: data/manual-order-1-parsed.json (array of line objects).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const RAW = path.join(ROOT, 'data/manual-orders-raw.json');
const OUT = path.join(ROOT, 'data/manual-order-1-parsed.json');

const cellText = c => c?.formattedValue ?? c?.effectiveValue?.stringValue ?? (c?.effectiveValue?.numberValue !== undefined ? String(c.effectiveValue.numberValue) : '');

const d = JSON.parse(fs.readFileSync(RAW, 'utf8'));
const sh = d.sheets.find(s => s.properties.title === 'Order 1');
if (!sh) { console.error('Tab "Order 1" not found'); process.exit(1); }
const rows = sh.data?.[0]?.rowData || [];

// Headers at row index 6 (R7 = data start).
const COL = { sku: 0, productId: 1, urlId: 2, img: 3, name: 4, specs: 5, specs2: 6, specs3: 7, packing: 8, volume: 9, qty: 10, price: 11, link: 12, link2: 13, retail: 14 };

function parsePrice(s) {
  // "11+2"  → cogs=11, transport=2
  // "10.9+2.7" → cogs=10.9, transport=2.7
  if (!s) return { cogs: null, transport: null };
  const m = String(s).replace(/\s+/g, '').match(/^([\d.,]+)\+([\d.,]+)$/);
  if (!m) {
    const single = parseFloat(String(s).replace(',', '.'));
    return { cogs: isFinite(single) ? single : null, transport: null };
  }
  const cogs = parseFloat(m[1].replace(',', '.'));
  const transport = parseFloat(m[2].replace(',', '.'));
  return { cogs: isFinite(cogs) ? cogs : null, transport: isFinite(transport) ? transport : null };
}

const lines = [];
for (let i = 7; i < rows.length; i++) {
  const r = rows[i]?.values || [];
  const get = idx => cellText(r[idx]);
  const idRaw = get(COL.productId);
  if (!idRaw) continue; // skip blank / total / divider rows
  const numericId = parseInt(String(idRaw).replace(/[^\d]/g, ''), 10);
  if (!isFinite(numericId)) continue;

  const qtyRaw = get(COL.qty);
  const qty = qtyRaw ? Math.round(parseFloat(String(qtyRaw).replace(',', '.'))) : null;
  const { cogs, transport } = parsePrice(get(COL.price));

  lines.push({
    sheet_row: i + 1, // 1-based as shown in Sheets
    sku: get(COL.sku) || null,
    product_id: numericId,
    name: get(COL.name) || null,
    specs: get(COL.specs) || null,
    qty,
    price_raw: get(COL.price) || null,
    cogs_usd: cogs,
    transport_usd: transport,
    unit_cost_usd: (cogs ?? 0) + (transport ?? 0),
    link: get(COL.link) || null,
    link2: get(COL.link2) || null,
    retail: get(COL.retail) || null,
  });
}

fs.writeFileSync(OUT, JSON.stringify(lines, null, 2));
console.log(`Parsed ${lines.length} line(s) from "Order 1".`);
for (const l of lines) {
  console.log(`  R${l.sheet_row} id=${l.product_id} sku=${l.sku} qty=${l.qty} price="${l.price_raw}" → cogs=${l.cogs_usd} transport=${l.transport_usd} unit=${l.unit_cost_usd.toFixed(2)} | ${(l.name||'').slice(0,60)}`);
}
console.log(`Wrote ${OUT}`);
