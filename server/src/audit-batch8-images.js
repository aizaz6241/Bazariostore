import { BATCH_8_PRODUCTS } from './data/batch8-part1.js';
import { BATCH_8_PART2_PRODUCTS } from './data/batch8-part2.js';

const all = [...BATCH_8_PRODUCTS, ...BATCH_8_PART2_PRODUCTS];
console.log(`Total Batch 8 items: ${all.length}`);

const unsplash = all.filter(p => p.image.includes('unsplash.com'));
const dummyjson = all.filter(p => p.image.includes('dummyjson.com'));
const others = all.filter(p => !p.image.includes('unsplash.com') && !p.image.includes('dummyjson.com'));

console.log(`Unsplash items: ${unsplash.length}`);
console.log(`DummyJSON items: ${dummyjson.length}`);
console.log(`Other items: ${others.length}`);

// Print all Unsplash items with category and name
console.log('\n--- ALL UNSPLASH ITEMS ---');
unsplash.forEach((p, idx) => {
  const photoId = p.image.match(/photo-[a-zA-Z0-9-]+/)?.[0] || p.image;
  console.log(`${idx + 1}. [${p.categorySlug}] [${p.price}$] ${p.name}`);
  console.log(`   URL: ${photoId}`);
});

console.log('\n--- ALL DUMMYJSON ITEMS ---');
dummyjson.forEach((p, idx) => {
  const slugInUrl = p.image.split('/').slice(-2, -1)[0];
  console.log(`${idx + 1}. [${p.categorySlug}] [${p.price}$] ${p.name}`);
  console.log(`   Image slug: ${slugInUrl}`);
});
