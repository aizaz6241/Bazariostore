import fs from 'fs';
const data = JSON.parse(fs.readFileSync('server/src/data/treasury-all-products.json'));

const imgMap = {};
data.forEach(p => {
  if (!imgMap[p.image]) imgMap[p.image] = [];
  imgMap[p.image].push(p);
});

const groups = [];
Object.entries(imgMap).forEach(([img, prods]) => {
  if (prods.length > 1) {
    groups.push({
      image: img,
      count: prods.length,
      products: prods.map(p => ({
        id: p._id,
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        category: p.category
      }))
    });
  }
});

groups.sort((a, b) => b.count - a.count);
fs.writeFileSync('server/src/data/duplicate-groups.json', JSON.stringify(groups, null, 2));
console.log(`Found ${groups.length} duplicate groups containing ${groups.reduce((acc, g) => acc + g.count, 0)} products.`);
