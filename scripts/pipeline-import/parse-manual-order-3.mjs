// Parse "Order 3" with column-shift handling.
// Bottles section uses QTY=col 7; from R20 onward the sub-header "Kg|Pcs|Weight"
// shifts QTY to col 8. We resolve QTY column per row by:
//   1) preferring the green-highlighted cell (cols 7 or 8)
//   2) else: if sheet_row <= 18 use col 7, else col 8
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const RAW = path.join(ROOT, 'data/manual-orders-raw.json');
const OUT = path.join(ROOT, 'data/manual-order-3-parsed.json');

const cellText = c => c?.formattedValue ?? c?.effectiveValue?.stringValue ?? (c?.effectiveValue?.numberValue !== undefined ? String(c.effectiveValue.numberValue) : '');
const isGreen = (bg) => { if (!bg) return false; const r=bg.red??0,g=bg.green??0,b=bg.blue??0; return g>0.55 && g>r+0.1 && g>b+0.1; };
const num = (v) => { if (v == null || v === '') return null; const n = parseFloat(String(v).replace(',', '.').replace(/[^\d.\-]/g,'')); return isFinite(n) ? n : null; };

const d = JSON.parse(fs.readFileSync(RAW, 'utf8'));
const sh = d.sheets.find(s => s.properties.title === 'Order 3');
const rows = sh.data?.[0]?.rowData || [];

// NOTE: COGS / Transport columns are intentionally NOT read from the sheet —
// the dumbbells subsection (R20-R32) uses a Kg|Pcs|Weight sub-header at R19,
// which shifts col 8 to "Pcs" (qty) and col 9 to "Weight". Sheet COGS/Transport
// are empty everywhere anyway, so we pull both from product_pipeline_details in DB.
const COL = { category: 0, productId: 2, title: 3, imageUrl: 4, retail: 6 };
const QTY_CANDIDATE_COLS = [7, 8];

const lines = [];
for (let i = 6; i < rows.length; i++) {
  const sheetRow = i + 1; // 1-based
  const r = rows[i]?.values || [];
  const get = idx => cellText(r[idx]);
  const idRaw = get(COL.productId);
  if (!idRaw) continue;
  const numericId = parseInt(String(idRaw).replace(/[^\d]/g, ''), 10);
  if (!isFinite(numericId)) continue;

  // Detect green column among QTY candidates.
  let greenCol = null;
  for (const c of QTY_CANDIDATE_COLS) {
    if (isGreen(r[c]?.effectiveFormat?.backgroundColor)) { greenCol = c; break; }
  }

  // Resolve QTY column:
  let qtyCol;
  if (greenCol != null) qtyCol = greenCol;
  else qtyCol = sheetRow <= 18 ? 7 : 8;

  const qtyRaw = get(qtyCol);
  // qtyRaw can be "120", "6 pcs set", "1order=10pcs"; extract the leading integer
  const qty = qtyRaw ? Math.round(parseFloat(String(qtyRaw).replace(',', '.').match(/-?\d+(\.\d+)?/)?.[0] ?? '')) : null;

  lines.push({
    sheet_row: sheetRow,
    category: get(COL.category) || null,
    product_id: numericId,
    title: get(COL.title) || null,
    image_url: get(COL.imageUrl) || null,
    retail_ron: get(COL.retail) || null,
    qty_col_used: qtyCol,
    qty_raw: qtyRaw || null,
    qty: isFinite(qty) ? qty : null,
    purchased: greenCol != null,
    cogs_usd: null,       // always sourced from DB (see note at COL above)
    transport_usd: null,  // always sourced from DB
  });
}

fs.writeFileSync(OUT, JSON.stringify(lines, null, 2));
console.log(`Parsed ${lines.length} line(s) — green=${lines.filter(l=>l.purchased).length}, white=${lines.filter(l=>!l.purchased).length}`);
console.log('Per row:');
for (const l of lines) {
  console.log(`  R${l.sheet_row} id=${l.product_id} qtyCol=${l.qty_col_used} qty=${l.qty} green=${l.purchased} | ${(l.title||'').slice(0,55)}`);
}
console.log(`Wrote ${OUT}`);
