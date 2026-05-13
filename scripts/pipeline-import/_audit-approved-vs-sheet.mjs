// Cross-reference: products with pipeline_status=Approved AND no PO link
// vs Grandia Pipeline Sheet (all tabs) — present? green QTY (confirmed) vs not coloured (hold)?
import fs from 'node:fs';
import pg from 'pg';

const c = new pg.Client({host:'38.242.226.83',port:5432,user:'scraper',password:'Scraper123#',database:'test'});
await c.connect();
const r = await c.query(`
  SELECT p.id, p.name, p.original_id, pg2.name AS group_name
  FROM products p
  LEFT JOIN product_groups pg2 ON pg2.id = p.group_id
  WHERE p.pipeline_status = 'Approved'
    AND NOT EXISTS (SELECT 1 FROM product_purchase_order_links l WHERE l.product_id = p.id)
  ORDER BY p.id
`);
await c.end();
const products = r.rows;
console.log(`Total approved-not-in-PO products: ${products.length}`);

const raw = JSON.parse(fs.readFileSync('data/pipeline-raw.json','utf8'));
const sheets = raw.sheets;

// Green color test (same as manual orders)
const isGreen = (bg) => {
  if (!bg) return false;
  const r = bg.red ?? 0, g = bg.green ?? 0, b = bg.blue ?? 0;
  return g > 0.55 && g > r + 0.1 && g > b + 0.1;
};

// For each tab, find the header row (first row that contains "ProductID" or "ID")
// Then find which column is "QTY"
function indexTab(sheet) {
  const rows = sheet.data?.[0]?.rowData || [];
  let headerRowIdx = -1, idCol = -1, qtyCol = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = rows[i]?.values || [];
    let foundId = -1, foundQty = -1;
    for (let j = 0; j < cells.length; j++) {
      const v = (cells[j]?.formattedValue || '').toString().trim().toLowerCase();
      if (foundId === -1 && (v === 'productid' || v === 'product id' || v === 'id')) foundId = j;
      if (foundQty === -1 && v === 'qty') foundQty = j;
    }
    if (foundId !== -1 && foundQty !== -1) { headerRowIdx = i; idCol = foundId; qtyCol = foundQty; break; }
  }
  return { rows, headerRowIdx, idCol, qtyCol };
}

const tabIndex = {};
for (const sh of sheets) {
  const title = sh.properties?.title;
  const idx = indexTab(sh);
  tabIndex[title] = idx;
  console.log(`Tab "${title}": header@R${idx.headerRowIdx+1} idCol=${idx.idCol} qtyCol=${idx.qtyCol} totalRows=${idx.rows.length}`);
}

// For each product, search in all tabs
const results = [];
for (const p of products) {
  const idStr = String(p.id);
  let foundIn = null;
  for (const [tab, idx] of Object.entries(tabIndex)) {
    if (idx.headerRowIdx < 0) continue;
    for (let i = idx.headerRowIdx + 1; i < idx.rows.length; i++) {
      const cells = idx.rows[i]?.values || [];
      const idCell = cells[idx.idCol];
      const idVal = idCell?.formattedValue;
      if (idVal === idStr) {
        const qtyCell = cells[idx.qtyCol];
        const qtyVal = qtyCell?.formattedValue;
        const bg = qtyCell?.effectiveFormat?.backgroundColor;
        const green = isGreen(bg);
        foundIn = { tab, row: i+1, qty: qtyVal, green, bg };
        break;
      }
    }
    if (foundIn) break;
  }
  results.push({ ...p, sheet: foundIn });
}

const present = results.filter(x => x.sheet);
const absent = results.filter(x => !x.sheet);
const confirmed = present.filter(x => x.sheet.green);
const hold = present.filter(x => !x.sheet.green);

console.log(`\n=== Summary ===`);
console.log(`Total: ${results.length}`);
console.log(`Present in sheet: ${present.length}`);
console.log(`  - Green (Confirmed): ${confirmed.length}`);
console.log(`  - Not coloured (Hold): ${hold.length}`);
console.log(`Not present in any sheet: ${absent.length}`);

console.log(`\n=== Per tab (present) ===`);
const byTab = {};
for (const x of present) {
  const t = x.sheet.tab;
  byTab[t] = byTab[t] || { confirmed: 0, hold: 0 };
  if (x.sheet.green) byTab[t].confirmed++; else byTab[t].hold++;
}
console.table(byTab);

console.log(`\n=== Per group (absent from sheet) ===`);
const byGroup = {};
for (const x of absent) {
  const g = x.group_name || '(no group)';
  byGroup[g] = (byGroup[g] || 0) + 1;
}
console.table(byGroup);

fs.writeFileSync('output/approved-not-in-po-vs-sheet.json', JSON.stringify(results, null, 2));
console.log(`\nDetails written to output/approved-not-in-po-vs-sheet.json`);

// Print full lists
console.log(`\n--- ABSENT FROM SHEET (${absent.length}) ---`);
for (const x of absent) console.log(`  id=${x.id} group=${x.group_name||'-'} | ${(x.name||'').slice(0,60)}`);
console.log(`\n--- HOLD (present, not coloured) (${hold.length}) ---`);
for (const x of hold) console.log(`  id=${x.id} tab=${x.sheet.tab} R${x.sheet.row} qty=${x.sheet.qty} | ${(x.name||'').slice(0,50)}`);
console.log(`\n--- CONFIRMED (present, green) (${confirmed.length}) ---`);
for (const x of confirmed) console.log(`  id=${x.id} tab=${x.sheet.tab} R${x.sheet.row} qty=${x.sheet.qty} | ${(x.name||'').slice(0,50)}`);
