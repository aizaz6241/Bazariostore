import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}

import fs from 'fs';
import { BATCH_8_ALL_PRODUCTS } from './data/batch8-complete-100.js';
import { validateUrls } from './batch-url-validator.js';

async function verifyAll() {
  console.log('=== BATCH 8 VERIFICATION AUDIT ===\n');

  // 1. Total Count
  console.log(`1. Total Products: ${BATCH_8_ALL_PRODUCTS.length}`);
  if (BATCH_8_ALL_PRODUCTS.length !== 100) {
    throw new Error(`Expected exactly 100 products, got ${BATCH_8_ALL_PRODUCTS.length}`);
  }

  // 2. Field Schema Check
  const requiredFields = [
    'name', 'slug', 'brand', 'categorySlug', 'price', 'costPrice', 'oldPrice',
    'stock', 'lowStockThreshold', 'sku', 'image', 'images',
    'shortDescription', 'description', 'bullets', 'specifications', 'labels', 'tags'
  ];

  for (let i = 0; i < BATCH_8_ALL_PRODUCTS.length; i++) {
    const p = BATCH_8_ALL_PRODUCTS[i];
    for (const f of requiredFields) {
      if (p[f] === undefined || p[f] === null || p[f] === '') {
        throw new Error(`Product ${i + 1} (${p.name || 'unnamed'}) missing field '${f}'`);
      }
    }
  }
  console.log('2. Field Schema: PASS (all 100 items have complete required fields)');

  // 3. Price Validation
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let highTierCount = 0; // $2,000 to $5,000
  let lowTierCount = 0;  // $250 to $1,999

  for (const p of BATCH_8_ALL_PRODUCTS) {
    if (typeof p.price !== 'number' || p.price < 250 || p.price > 5000) {
      throw new Error(`Product ${p.name} has invalid price: ${p.price}`);
    }
    if (p.price < minPrice) minPrice = p.price;
    if (p.price > maxPrice) maxPrice = p.price;

    if (p.price >= 2000) {
      highTierCount++;
    } else {
      lowTierCount++;
    }
  }

  const highTierPct = ((highTierCount / BATCH_8_ALL_PRODUCTS.length) * 100).toFixed(1);
  console.log(`3. Price Analysis:
   - Min Price: $${minPrice.toFixed(2)} (>= $250)
   - Max Price: $${maxPrice.toFixed(2)} (<= $5,000)
   - High Tier ($2,000 - $5,000): ${highTierCount} / 100 (${highTierPct}%)
   - Lower/Mid Tier ($250 - $1,999): ${lowTierCount} / 100 (${(100 - highTierPct).toFixed(1)}%)
   - Target Range: 65% - 70% -> STATUS: ${highTierCount >= 65 && highTierCount <= 70 ? 'PASS (Perfect Match)' : 'CHECK'}`);

  // 4. Internal Uniqueness Check
  const slugs = new Set();
  const skus = new Set();
  const images = new Set();

  for (const p of BATCH_8_ALL_PRODUCTS) {
    if (slugs.has(p.slug)) throw new Error(`Duplicate slug within Batch 8: ${p.slug}`);
    if (skus.has(p.sku)) throw new Error(`Duplicate SKU within Batch 8: ${p.sku}`);
    if (images.has(p.image)) throw new Error(`Duplicate image within Batch 8: ${p.image}`);
    slugs.add(p.slug);
    skus.add(p.sku);
    images.add(p.image);
  }
  console.log(`4. Internal Uniqueness: PASS (100 unique slugs, 100 unique SKUs, 100 unique images)`);

  // 5. Cross-Check with Existing 347 Database Products
  const existing = JSON.parse(fs.readFileSync('server/src/data/treasury-all-products.json', 'utf8'));
  console.log(`\nExisting Treasury Products in DB baseline: ${existing.length}`);
  const existingSlugs = new Set(existing.map(p => p.slug));
  const existingSkus = new Set(existing.map(p => p.sku));
  const existingImages = new Set(existing.map(p => p.image));

  let slugConflicts = 0;
  let skuConflicts = 0;
  let imageConflicts = 0;

  for (const p of BATCH_8_ALL_PRODUCTS) {
    if (existingSlugs.has(p.slug)) {
      console.error(`Slug collision with existing: ${p.slug}`);
      slugConflicts++;
    }
    if (existingSkus.has(p.sku)) {
      console.error(`SKU collision with existing: ${p.sku}`);
      skuConflicts++;
    }
    if (existingImages.has(p.image)) {
      console.error(`Image collision with existing: ${p.image}`);
      imageConflicts++;
    }
  }

  if (slugConflicts > 0 || skuConflicts > 0 || imageConflicts > 0) {
    throw new Error(`Found collisions with existing products! Slugs: ${slugConflicts}, SKUs: ${skuConflicts}, Images: ${imageConflicts}`);
  }
  console.log('5. Zero Overwrite / Zero Collision Check: PASS (0 slug, 0 SKU, 0 image collisions with existing 347 items)');

  // 6. Category Breakdown
  const catDist = {};
  for (const p of BATCH_8_ALL_PRODUCTS) {
    catDist[p.categorySlug] = (catDist[p.categorySlug] || 0) + 1;
  }
  console.log('\n6. Category Breakdown across 100 items:');
  for (const [cat, count] of Object.entries(catDist)) {
    console.log(`   - ${cat.padEnd(20)}: ${count} products`);
  }

  // 7. Validate ALL 100 URLs live
  console.log('\n7. Live URL Validation of all 100 images...');
  const allUrls = BATCH_8_ALL_PRODUCTS.map(p => p.image);
  const urlRes = await validateUrls(allUrls);
  let failed = 0;
  for (const [url, r] of Object.entries(urlRes)) {
    if (!r.ok) {
      console.error(`FAILED URL (${r.status}): ${url}`);
      failed++;
    }
  }

  if (failed > 0) {
    throw new Error(`${failed} image URLs failed HTTP 200 check!`);
  }
  console.log('   All 100 image URLs returned HTTP 200 OK! PASS');

  console.log('\n=== ALL BATCH 8 VERIFICATIONS PASSED 100% ===');
}

verifyAll().catch(err => {
  console.error('\nVerification FAILED:', err.message);
  process.exit(1);
});
