import fs from 'fs';

try {
  const dj = JSON.parse(fs.readFileSync('server/src/data/dummyjson-products.json', 'utf8'));
  console.log('DummyJSON total products:', Array.isArray(dj) ? dj.length : (dj.products?.length || 'not array'));
  const prods = Array.isArray(dj) ? dj : (dj.products || []);
  const djCats = {};
  prods.forEach(p => { djCats[p.category] = (djCats[p.category] || 0) + 1; });
  console.log('DummyJSON categories:', djCats);
} catch (e) {
  console.log('DummyJSON read error:', e.message);
}

try {
  const mk = JSON.parse(fs.readFileSync('server/src/data/makeup-api-products.json', 'utf8'));
  const mkWithCf = mk.filter(m => m.image_link && m.image_link.includes('cloudfront.net'));
  console.log('\nMakeup API total with CloudFront:', mkWithCf.length);
  const mkTypes = {};
  mkWithCf.forEach(m => { mkTypes[m.product_type] = (mkTypes[m.product_type] || 0) + 1; });
  console.log('Makeup API types:', mkTypes);
} catch (e) {
  console.log('Makeup API read error:', e.message);
}
