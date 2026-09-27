import fs from 'fs';
const data = JSON.parse(fs.readFileSync('server/src/data/treasury-all-products.json'));
const checkNames = ['BioLite', 'Stanley', 'YETI', 'Dyson', 'Omron', 'Peak Design', 'Osprey', 'Matador', 'Nitecore'];
const found = data.filter(p => checkNames.some(n => p.name.includes(n) || p.brand?.includes(n)));
found.forEach(p => {
  console.log(`[${p.sku}] "${p.name}"`);
  console.log(`  Brand: ${p.brand}, Cat: ${p.category}`);
  console.log(`  Img: ${p.image}\n`);
});
