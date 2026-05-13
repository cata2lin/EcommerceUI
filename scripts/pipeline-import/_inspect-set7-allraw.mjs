import fs from 'node:fs';
const ids=['3404174','2914532','2302495','2299640','2246287','1826498','1639383','3404636','3404368','3404357','3404317','3404286'];
const raw=JSON.parse(fs.readFileSync('data/pipeline-raw.json','utf8'));
const sheets=raw.sheets;
console.log('All sheet titles:', sheets.map(s=>s.properties?.title));
for (const id of ids){
  const hits=[];
  for (const sh of sheets){
    const rows=sh.data?.[0]?.rowData||[];
    for (let i=0;i<rows.length;i++){
      const cells=rows[i]?.values||[];
      for (let j=0;j<cells.length;j++){
        if (cells[j]?.formattedValue===id){ hits.push(`${sh.properties.title}@R${i+1}C${j+1}`); break; }
      }
    }
  }
  console.log(`id=${id} →`, hits.length ? hits.join(', ') : 'NOT in any tab of snapshot');
}
