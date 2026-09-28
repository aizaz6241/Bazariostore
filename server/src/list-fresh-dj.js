import fs from 'fs';

const dj = JSON.parse(fs.readFileSync('server/src/data/dummyjson-products.json', 'utf8'));
const existing = JSON.parse(fs.readFileSync('server/src/data/treasury-all-products.json', 'utf8'));
const existingImages = new Set(existing.map(p => p.image));

const available = dj.filter(p => !existingImages.has(p.thumbnail) && p.category !== 'groceries');
console.log(`Total available: ${available.length}`);

// Print all available with details
available.forEach((p, idx) => {
  console.log(`${idx + 1}. [${p.category}] ${p.title} (orig price: $${p.price}) -> ${p.thumbnail}`);
});
