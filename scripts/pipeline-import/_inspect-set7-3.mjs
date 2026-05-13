import fs from 'node:fs';
const ids=[3404174,2914532,2302495,2299640,2246287,1826498,1639383];
const p=JSON.parse(fs.readFileSync('data/grandia-pipeline.json','utf8'));
console.log('--- Search ALL tabs in parsed JSON ---');
for (const [tab,rows] of Object.entries(p)){
  if (!Array.isArray(rows)) continue;
  for (const id of ids){
    const r=rows.find(x=>Number(x.ProductID)===id || Number(x._numericId)===id);
    if (r) console.log(`id=${id} in tab "${tab}": QTY=${r.QTY} Cogs=${r.Cogs} purchased=${r._purchased}`);
  }
}
// Also check raw sheet file if exists
const candidates=['data/grandia-pipeline-raw.json','data/grandia-raw.json','data/pipeline-raw.json'];
for (const f of candidates) if (fs.existsSync(f)) console.log('found raw:',f);
console.log('files in data/:', fs.readdirSync('data').filter(f=>f.endsWith('.json')));
