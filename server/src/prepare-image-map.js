import fs from 'fs';

const items = JSON.parse(fs.readFileSync('server/src/data/items-to-fix.json'));
console.log(`Processing ${items.length} items to fix...`);

// Let's print out the items grouped by category with their current SKU and name
const byCat = {};
items.forEach(it => {
  if (!byCat[it.category]) byCat[it.category] = [];
  byCat[it.category].push({ sku: it.sku, name: it.name, reason: it.reason });
});

for (const [cat, prods] of Object.entries(byCat)) {
  console.log(`\n=== ${cat} (${prods.length} items) ===`);
  prods.forEach(p => console.log(`  - [${p.sku}] ${p.name} (${p.reason})`));
}
