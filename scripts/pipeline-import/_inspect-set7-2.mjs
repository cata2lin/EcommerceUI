import fs from 'node:fs';
const ids=[3404174,2914532,2302495,2299640,2246287,1826498,1639383];
const p=JSON.parse(fs.readFileSync('data/grandia-pipeline.json','utf8'));
const s7=p['Set 7 mix'];
console.log('parsed lines:',s7.length);
for (const id of ids){
  const r=s7.find(x=>Number(x.ProductID)===id || Number(x._numericId)===id);
  console.log('id='+id, r? `IN parsed: QTY=${r.QTY} Cogs=${r.Cogs} purchased=${r._purchased} tab=${r._tab}` : 'MISSING from parsed');
}
const en=JSON.parse(fs.readFileSync('output/set-7-mix-enriched.json','utf8'));
console.log('enriched count:',en.length,'parsed count:',s7.length);
const pidsSet=new Set(s7.map(x=>String(x.ProductID||x._numericId||'')));
const eidsSet=new Set(en.map(x=>String(x.id||x.product_id||'')));
const onlyParsed=[...pidsSet].filter(x=>x && !eidsSet.has(x));
console.log('In parsed but NOT in enriched:', onlyParsed.length);
console.log(onlyParsed.slice(0,40));
