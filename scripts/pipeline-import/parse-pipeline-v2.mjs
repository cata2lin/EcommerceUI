// Re-parse Grandia pipeline raw JSON, detecting the QTY column dynamically
// per tab from the header row. Sets 4/7/8 have a shifted layout vs 1.1/2/3.
//
// Output: data/grandia-pipeline.json — same shape as before, but rows now
// include ALL cells indexed by the tab's actual header text, plus _purchased
// based on the QTY cell's effective backgroundColor.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const RAW = path.join(ROOT, 'data/pipeline-raw.json');
const OUT = path.join(ROOT, 'data/grandia-pipeline.json');

const raw = JSON.parse(fs.readFileSync(RAW, 'utf8'));

// Canonical headers we care about, with their normalized aliases.
// Each entry: [canonicalKey, [aliases...]]
const HEADER_MAP = [
  ['ProductID',     ['product id']],
  ['ID',            ['id']],
  ['Title',         ['title']],
  ['ImageURL',      ['image url', 'image']],
  ['Parser',        ['parser (source)', 'parser', 'source']],
  ['SalesRank',     ['sales rank']],
  ['Seasonality',   ['seasonality (good months)', 'seasonality']],
  ['Categories',    ['categories']],
  ['Group',         ['group']],
  ['M3Unit',        ['(m³)', 'm³', 'unit m3', 'm3 unit']],
  ['PriceLei',      ['price (lei)', 'price lei']],
  ['Cogs',          ['cogs']],
  ['TransportUSD',  ['transport (usd)', 'transport usd']],
  ['LandedUSD',     ['landed cost (usd)', 'landed (usd)']],
  ['GrossMarginPct',['gross margin (%)', 'gross margin']],
  ['MarginHealth',  ['margin health']],
  ['QTY',           ['qty', 'quantity']],
  ['PipelineStatus',['pipeline status']],
  ['M3',            ['m3']],
  ['Cost',          ['cost']],
  ['ProfitPerM3',   ['profit/m3', 'profit per m3']],
  ['GrossProfit',   ['gross profit']],
  ['SKU',           ['sku']],
];

function normHeader(s) {
  return String(s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function buildHeaderIndex(headerCells) {
  // header values may span 2 rows; the API gives them per cell.
  const idx = {};
  for (let col = 0; col < headerCells.length; col++) {
    const v = normHeader(headerCells[col]);
    if (!v) continue;
    for (const [canon, aliases] of HEADER_MAP) {
      if (aliases.includes(v) || v === canon.toLowerCase()) {
        if (idx[canon] == null) idx[canon] = col;
        break;
      }
    }
  }
  return idx;
}

function isGreen(bg) {
  if (!bg) return false;
  const r = bg.red ?? 0, g = bg.green ?? 0, b = bg.blue ?? 0;
  return g > 0.55 && g > r + 0.1 && g > b + 0.1;
}

const out = {};
const debug = {};

for (const sheet of raw.sheets) {
  const tab = sheet.properties.title;
  const rowData = sheet.data?.[0]?.rowData ?? [];
  if (rowData.length < 3) { out[tab] = []; continue; }

  // Merge header rows 0 + 1 (some tabs use 2-row headers)
  const headerCells = [];
  const r0 = rowData[0]?.values ?? [];
  const r1 = rowData[1]?.values ?? [];
  const width = Math.max(r0.length, r1.length);
  for (let c = 0; c < width; c++) {
    const a = r0[c]?.formattedValue ?? '';
    const b = r1[c]?.formattedValue ?? '';
    // Prefer the more specific (longer) header; otherwise concatenate.
    headerCells.push((b && a) ? `${a} ${b}` : (a || b || ''));
  }

  const idx = buildHeaderIndex(headerCells);
  debug[tab] = { headerCells, headerIndex: idx };

  const qtyCol = idx.QTY;
  const rows = [];
  for (let i = 2; i < rowData.length; i++) {
    const cells = rowData[i].values ?? [];
    if (!cells.length) continue;
    const row = {};
    for (const [canon] of HEADER_MAP) {
      const c = idx[canon];
      row[canon] = (c != null) ? (cells[c]?.formattedValue ?? null) : null;
    }
    if (!row.Title && !row.SKU && !row.ProductID && !row.ID) continue;

    row._purchased = qtyCol != null
      ? isGreen(cells[qtyCol]?.effectiveFormat?.backgroundColor)
      : false;

    // Resolve numeric product id (BI app DB key):
    //   - Set 1.1/2/3 layout: ProductID is numeric.
    //   - Shifted layout (Set 4/7/8): numeric ID is in Title column or in
    //     the trailing digits of `ID` ("GD-XX-<numeric>").
    let numericId = null;
    if (row.ProductID && /^\d+$/.test(String(row.ProductID).trim())) {
      numericId = String(row.ProductID).trim();
    } else if (row.Title && /^\d+$/.test(String(row.Title).trim())) {
      numericId = String(row.Title).trim();
    } else if (row.ID) {
      const m = String(row.ID).match(/(\d{3,})\s*$/);
      if (m) numericId = m[1];
    }
    row._numericId = numericId;
    row._tab = tab;
    rows.push(row);
  }
  out[tab] = rows;
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));

// Summary
let total = 0, purchased = 0;
for (const [tab, rows] of Object.entries(out)) {
  const p = rows.filter(r => r._purchased).length;
  total += rows.length; purchased += p;
  const qtyCol = debug[tab].headerIndex.QTY;
  console.log(`${tab.padEnd(20)} rows=${String(rows.length).padStart(4)} purchased=${String(p).padStart(4)}  QTY col idx=${qtyCol}`);
}
console.log(`TOTAL rows=${total} purchased=${purchased}`);

// Save debug header info for inspection
fs.writeFileSync(path.join(ROOT, 'data/header-index.json'), JSON.stringify(debug, null, 2));
console.log(`Wrote ${OUT}`);
console.log(`Wrote ${path.join(ROOT, 'data/header-index.json')} (header index per tab)`);
