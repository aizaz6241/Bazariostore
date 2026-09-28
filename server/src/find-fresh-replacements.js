import fs from 'fs';
import { BATCH_8_ALL_PRODUCTS } from './data/batch8-complete-100.js';

const existing = JSON.parse(fs.readFileSync('server/src/data/treasury-all-products.json', 'utf8'));
const existingImages = new Set(existing.map(p => p.image));

const dj = JSON.parse(fs.readFileSync('server/src/data/dummyjson-products.json', 'utf8'));
const current100Images = new Set(BATCH_8_ALL_PRODUCTS.map(p => p.image));

const colliding = BATCH_8_ALL_PRODUCTS.filter(p => existingImages.has(p.image));
const nonColliding = BATCH_8_ALL_PRODUCTS.filter(p => !existingImages.has(p.image));

console.log(`Non-colliding kept items: ${nonColliding.length}`);
console.log(`Colliding items needing replacement: ${colliding.length}`);

// Available DummyJSON unused by existing 347 AND unused by current non-colliding
const availableDJ = dj.filter(p => 
  !existingImages.has(p.thumbnail) && 
  !current100Images.has(p.thumbnail) &&
  p.category !== 'groceries'
);

console.log(`Available completely fresh DummyJSON products: ${availableDJ.length}`);

// Print category breakdown of colliding items to see what categories we need
const collCat = {};
for (const p of colliding) {
  collCat[p.categorySlug] = (collCat[p.categorySlug] || 0) + 1;
}
console.log('Categories of colliding items to replace:', collCat);

// Print sample available DummyJSON by category
const djByCat = {};
for (const p of availableDJ) {
  if (!djByCat[p.category]) djByCat[p.category] = [];
  djByCat[p.category].push({ id: p.id, title: p.title, price: p.price, thumb: p.thumbnail });
}

console.log('\nAvailable DJ by Category:');
for (const [c, items] of Object.entries(djByCat)) {
  console.log(`Category [${c}]: ${items.length} items (e.g. ${items[0].title})`);
}
