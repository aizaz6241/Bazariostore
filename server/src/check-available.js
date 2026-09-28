import fs from 'fs';
import https from 'https';

const dj = JSON.parse(fs.readFileSync('server/src/data/dummyjson-products.json', 'utf8'));
const existing = JSON.parse(fs.readFileSync('server/src/data/treasury-all-products.json', 'utf8'));
const existingImages = new Set(existing.map(p => p.image));
import { FINAL_100_PRODUCTS } from './data/batch8-final-100.js';
const batch8Images = new Set(FINAL_100_PRODUCTS.map(p => p.image));

const available = dj.filter(p => !existingImages.has(p.thumbnail) && !batch8Images.has(p.thumbnail) && p.category !== 'groceries');

async function testUrl(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { Range: 'bytes=0-10' } }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    }).on('error', () => resolve(false));
  });
}

console.log(`Checking ${available.length} candidates...`);

const validItems = [];
for (const p of available) {
  const ok = await testUrl(p.thumbnail);
  if (ok) {
    validItems.push({
      id: p.id,
      title: p.title,
      category: p.category,
      brand: p.brand,
      price: p.price,
      thumbnail: p.thumbnail,
      description: p.description
    });
  }
}

console.log(`Valid tested items: ${validItems.length}`);
console.log('Sample valid items:', JSON.stringify(validItems.slice(0, 10), null, 2));

// Save valid tested items to a json file
fs.writeFileSync('server/src/data/valid-tested-candidates.json', JSON.stringify(validItems, null, 2));
