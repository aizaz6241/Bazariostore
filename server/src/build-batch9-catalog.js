import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}

import fs from 'fs';
import https from 'https';
import { GROUP1_BLUEPRINTS } from './blueprints/blueprints-group1.js';
import { GROUP2_BLUEPRINTS } from './blueprints/blueprints-group2.js';
import { GROUP3_BLUEPRINTS } from './blueprints/blueprints-group3.js';
import { GROUP4_BLUEPRINTS } from './blueprints/blueprints-group4.js';

// Load existing signatures
const existingSigs = JSON.parse(fs.readFileSync('server/src/data/existing-signatures.json', 'utf8'));
const existingImages = new Set(existingSigs.images || []);
const existingSlugs = new Set(existingSigs.slugs || []);
const existingSkus = new Set(existingSigs.skus || []);

console.log('Loaded existing signatures:');
console.log(`  Existing images: ${existingImages.size}`);
console.log(`  Existing slugs:  ${existingSlugs.size}`);
console.log(`  Existing SKUs:   ${existingSkus.size}`);

const allBlueprints = [
  ...GROUP1_BLUEPRINTS,
  ...GROUP2_BLUEPRINTS,
  ...GROUP3_BLUEPRINTS,
  ...GROUP4_BLUEPRINTS,
];

console.log(`Total blueprints to process: ${allBlueprints.length}`);

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s\W-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function verifyUrl(url) {
  return new Promise((resolve) => {
    try {
      const req = https.request(
        url,
        { method: 'HEAD', timeout: 8000, agent: false },
        (res) => {
          res.resume();
          resolve(res.statusCode === 200);
        }
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    } catch {
      resolve(false);
    }
  });
}

function fetchUnsplashCandidates(query) {
  return new Promise((resolve) => {
    const url = `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(query)}&per_page=15`;
    const opts = {
      headers: {
        'User-Agent': 'curl/8.4.0',
        'Accept': '*/*',
      },
      timeout: 10000,
    };

    https
      .get(url, opts, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            const results = (j.results || [])
              .filter((r) => !r.plus && !r.premium && r.urls?.raw)
              .map((r) => ({
                id: r.id,
                url: `${r.urls.raw.split('?')[0]}?w=800&auto=format&fit=crop&q=80`,
                desc: r.alt_description || r.description || '',
              }));
            resolve(results);
          } catch {
            resolve([]);
          }
        });
      })
      .on('error', () => resolve([]));
  });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const batchImages = new Set();
  const batchSlugs = new Set();
  const batchSkus = new Set();

  const finalProducts = [];
  let index = 0;

  for (const item of allBlueprints) {
    index++;
    // 1. Slug determination
    let baseSlug = slugify(item.name);
    let candidateSlug = baseSlug;
    let slugCounter = 1;
    while (existingSlugs.has(candidateSlug) || batchSlugs.has(candidateSlug)) {
      candidateSlug = `${baseSlug}-${slugCounter++}`;
    }
    batchSlugs.add(candidateSlug);

    // 2. SKU determination
    let candidateSku = item.sku;
    let skuCounter = 1;
    while (existingSkus.has(candidateSku) || batchSkus.has(candidateSku)) {
      candidateSku = `${item.sku}-${skuCounter++}`;
    }
    batchSkus.add(candidateSku);

    // 3. Image determination
    let selectedImage = null;

    if (item.image) {
      // Direct image URL provided (e.g. verified CloudFront item)
      if (!existingImages.has(item.image) && !batchImages.has(item.image)) {
        const isOk = await verifyUrl(item.image);
        if (isOk) {
          selectedImage = item.image;
        }
      }
    }

    if (!selectedImage && item.queries && item.queries.length > 0) {
      for (const query of item.queries) {
        await sleep(350); // Be respectful to endpoint rate limit
        const candidates = await fetchUnsplashCandidates(query);
        for (const cand of candidates) {
          if (existingImages.has(cand.url) || batchImages.has(cand.url)) {
            continue;
          }
          const isOk = await verifyUrl(cand.url);
          if (isOk) {
            selectedImage = cand.url;
            break;
          }
        }
        if (selectedImage) break;
      }
    }

    // Fallback if queries didn't yield an image: try general brand + category
    if (!selectedImage) {
      const fallbackQuery = `${item.brand} ${item.categorySlug}`;
      console.log(`⚠️ Trying fallback query for [${index}]: "${fallbackQuery}"`);
      await sleep(400);
      const candidates = await fetchUnsplashCandidates(fallbackQuery);
      for (const cand of candidates) {
        if (existingImages.has(cand.url) || batchImages.has(cand.url)) {
          continue;
        }
        const isOk = await verifyUrl(cand.url);
        if (isOk) {
          selectedImage = cand.url;
          break;
        }
      }
    }

    if (!selectedImage) {
      console.error(`❌ FAILED TO FIND IMAGE FOR [${index}]: ${item.name}`);
      continue;
    }

    batchImages.add(selectedImage);

    // Calculate rating and reviews
    const rating = +(4.7 + Math.random() * 0.25).toFixed(1);
    const numReviews = Math.floor(25 + Math.random() * 115);

    const productRecord = {
      name: item.name,
      slug: candidateSlug,
      brand: item.brand,
      categorySlug: item.categorySlug,
      price: item.price,
      costPrice: item.costPrice,
      oldPrice: item.oldPrice,
      stock: item.stock,
      lowStockThreshold: 10,
      sku: candidateSku,
      image: selectedImage,
      images: [{ url: selectedImage, key: null }],
      shortDescription: item.shortDescription,
      description: item.description,
      bullets: item.bullets,
      specifications: item.specifications,
      labels: ['featured'],
      tags: item.tags,
      rating: rating,
      numReviews: numReviews,
      sold: 0,
      active: true,
      primeEligible: true,
      freeDelivery: true,
    };

    finalProducts.push(productRecord);

    if (index % 10 === 0 || index === allBlueprints.length) {
      console.log(`[${index}/${allBlueprints.length}] Generated: [${item.categorySlug}] "${item.name}" -> $${item.price}`);
    }
  }

  console.log('\n=============================================');
  console.log(`🎉 Pipeline finished:`);
  console.log(`   Total Blueprints: ${allBlueprints.length}`);
  console.log(`   Successfully Built: ${finalProducts.length}`);
  console.log(`   Unique Batch Images: ${batchImages.size}`);
  console.log('=============================================\n');

  // Verify zero duplicates
  let dupCount = 0;
  for (const img of batchImages) {
    if (existingImages.has(img)) {
      console.error(`COLLISION DETECTED with existing DB: ${img}`);
      dupCount++;
    }
  }
  if (dupCount === 0) {
    console.log('✅ ZERO IMAGE COLLISIONS WITH EXISTING DATABASE GUARANTEED!');
  } else {
    console.error(`❌ ${dupCount} COLLISIONS FOUND!`);
  }

  // Count by category
  const catCount = {};
  finalProducts.forEach((p) => {
    catCount[p.categorySlug] = (catCount[p.categorySlug] || 0) + 1;
  });
  console.log('\nCategory Distribution:');
  for (const [cat, count] of Object.entries(catCount)) {
    console.log(`   ${cat}: ${count} products`);
  }

  // Save to file
  fs.writeFileSync(
    'server/src/data/batch9-380-products.json',
    JSON.stringify(finalProducts, null, 2)
  );
  console.log('\n💾 Successfully written to server/src/data/batch9-380-products.json');
}

run().catch(console.error);
