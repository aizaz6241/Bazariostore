import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}

import fs from 'fs';
import https from 'https';
import http from 'http';
import { FINAL_100_PRODUCTS } from './data/batch8-final-100.js';

console.log('=== AUDITING BATCH 8 FINAL 100 PRODUCTS ===');
console.log(`Total products: ${FINAL_100_PRODUCTS.length}`);

// 1. Verify Count
if (FINAL_100_PRODUCTS.length !== 100) {
  console.error(`ERROR: Expected 100 products, got ${FINAL_100_PRODUCTS.length}`);
  process.exit(1);
}

// 2. Price Distribution & Boundaries
let minPrice = Infinity;
let maxPrice = -Infinity;
let highTierCount = 0;
let lowTierCount = 0;

for (const p of FINAL_100_PRODUCTS) {
  if (p.price < minPrice) minPrice = p.price;
  if (p.price > maxPrice) maxPrice = p.price;
  if (p.price >= 2000) highTierCount++;
  else lowTierCount++;
  
  if (p.price < 250 || p.price > 5000) {
    console.error(`ERROR: Price out of bounds: ${p.name} ($${p.price})`);
  }
}

console.log(`Min Price: $${minPrice.toFixed(2)}`);
console.log(`Max Price: $${maxPrice.toFixed(2)}`);
console.log(`High Tier (>= $2,000): ${highTierCount} / 100 (${(highTierCount/100*100).toFixed(1)}%)`);
console.log(`Low Tier (< $2,000): ${lowTierCount} / 100 (${(lowTierCount/100*100).toFixed(1)}%)`);

// 3. Category Slugs
const catCount = {};
for (const p of FINAL_100_PRODUCTS) {
  catCount[p.categorySlug] = (catCount[p.categorySlug] || 0) + 1;
}
console.log('Category distribution:', JSON.stringify(catCount, null, 2));

// 4. Duplicate checks internally
const slugs = new Set();
const skus = new Set();
const images = new Set();
let dupInternal = 0;

for (const p of FINAL_100_PRODUCTS) {
  if (slugs.has(p.slug)) { console.error(`Duplicate slug internally: ${p.slug}`); dupInternal++; }
  if (skus.has(p.sku)) { console.error(`Duplicate SKU internally: ${p.sku}`); dupInternal++; }
  if (images.has(p.image)) { console.error(`Duplicate image internally: ${p.image}`); dupInternal++; }
  slugs.add(p.slug);
  skus.add(p.sku);
  images.add(p.image);
}
console.log(`Internal duplicate errors: ${dupInternal}`);

// 5. Collision checks with existing DB 347 products
const existing = JSON.parse(fs.readFileSync('server/src/data/treasury-all-products.json', 'utf8'));
console.log(`Existing Treasury products to check against: ${existing.length}`);
const existingImages = new Set(existing.map(p => p.image));
const existingSlugs = new Set(existing.map(p => p.slug));
const existingSkus = new Set(existing.map(p => p.sku));

let collisions = 0;
for (const p of FINAL_100_PRODUCTS) {
  if (existingImages.has(p.image)) { console.error(`COLLISION image: ${p.image}`); collisions++; }
  if (existingSlugs.has(p.slug)) { console.error(`COLLISION slug: ${p.slug}`); collisions++; }
  if (existingSkus.has(p.sku)) { console.error(`COLLISION sku: ${p.sku}`); collisions++; }
}
console.log(`Collisions with existing DB: ${collisions}`);

// 6. Test URL validity for all 100 images
async function checkUrl(url) {
  return new Promise((resolve) => {
    try {
      const client = url.startsWith('https') ? https : http;
      const req = client.request(url, { method: 'HEAD', timeout: 8000 }, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve({ ok: true, status: res.statusCode });
        } else {
          // Retry with GET range
          const getReq = client.get(url, { headers: { Range: 'bytes=0-10' }, timeout: 8000 }, (gRes) => {
            resolve({ ok: gRes.statusCode >= 200 && gRes.statusCode < 400, status: gRes.statusCode });
          });
          getReq.on('error', () => resolve({ ok: false, status: 'error' }));
          getReq.on('timeout', () => { getReq.destroy(); resolve({ ok: false, status: 'timeout' }); });
        }
      });
      req.on('error', () => resolve({ ok: false, status: 'error' }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 'timeout' }); });
      req.end();
    } catch (e) {
      resolve({ ok: false, status: e.message });
    }
  });
}

console.log('\nValidating all 100 image URLs over HTTP...');
let failedUrls = 0;
for (let i = 0; i < FINAL_100_PRODUCTS.length; i++) {
  const p = FINAL_100_PRODUCTS[i];
  const res = await checkUrl(p.image);
  if (!res.ok) {
    console.error(`FAILED URL [${i + 1}/100]: ${p.image} (${res.status}) - ${p.name}`);
    failedUrls++;
  }
}

console.log(`Failed URL count: ${failedUrls} / 100`);

if (dupInternal === 0 && collisions === 0 && failedUrls === 0 && FINAL_100_PRODUCTS.length === 100) {
  console.log('\n>>> AUDIT PASSED 100% CLEAN! READY FOR SEEDING! <<<');
} else {
  console.error('\n>>> AUDIT FAILED! FIX ISSUES BEFORE SEEDING. <<<');
  process.exit(1);
}
