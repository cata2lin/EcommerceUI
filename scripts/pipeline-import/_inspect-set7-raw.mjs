import fs from 'node:fs';
const ids=['3404174','2914532','2302495','2299640','2246287','1826498','1639383'];
const raw=JSON.parse(fs.readFileSync('data/pipeline-raw.json','utf8'));
// raw is sheets API response
const sheets=raw.sheets || raw;
console.log('top-level keys:', Object.keys(raw).slice(0,5));
console.log('sheets count:', Array.isArray(sheets) ? sheets.length : 'n/a');
if (Array.isArray(sheets)){
  for (const sh of sheets){
    const title=sh.properties?.title;
    if (!title) continue;
    if (!/set\s*7/i.test(title)) continue;
    console.log('\n=== Sheet:', title, '===');
    const data=sh.data?.[0];
    const rows=data?.rowData||[];
    console.log('rows:', rows.length);
    // Look for our IDs in any cell
    for (const id of ids){
      let found=null;
      for (let i=0;i<rows.length;i++){
        const cells=rows[i]?.values||[];
        for (let j=0;j<cells.length;j++){
          const v=cells[j]?.formattedValue;
          if (v===id){ found={row:i+1,col:j+1}; break; }
        }
        if (found) break;
      }
      console.log(`  id=${id}`, found ? `FOUND at row ${found.row} col ${found.col}` : 'NOT in this sheet');
    }
  }
}
