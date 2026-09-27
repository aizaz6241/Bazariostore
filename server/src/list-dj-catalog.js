import fs from 'fs';

const dj = JSON.parse(fs.readFileSync('server/src/data/dummyjson-products.json'));
const cats = [
  'sports-accessories',
  'mobile-accessories',
  'skin-care',
  'mens-watches',
  'womens-watches',
  'mens-shoes',
  'womens-shoes',
  'kitchen-accessories',
  'laptops',
  'home-decoration',
  'furniture',
  'vehicle',
  'womens-bags',
  'sunglasses'
];

for (const c of cats) {
  const prods = dj.filter(p => p.category === c);
  console.log(`\n=== ${c} (${prods.length}) ===`);
  prods.forEach(p => console.log(`  "${p.title}" => "${p.thumbnail}"`));
}
