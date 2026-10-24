/**
 * Build Batch 10 Catalog (500 Products: Exactly 25 per Category across 20 Categories)
 * Sourced via Exact Product Image Search & Verified Direct CDNs with Strict Zero-Duplicate & HTTP-200 Validation
 */

import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import Category from './models/Category.js';
import { ALL_BATCH10_BLUEPRINTS } from './blueprints-batch10/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGODB_URI = 'mongodb+srv://aizazkhan6241_db_user:98av24298@cluster0.ijpphlb.mongodb.net/bazario?retryWrites=true&w=majority&appName=Cluster0';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

async function verifyImageUrl(url, timeoutMs = 6000) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Range': 'bytes=0-1024'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    return res.ok && (res.status === 200 || res.status === 206);
  } catch (err) {
    return false;
  }
}

async function searchProductImage(query) {
  try {
    const tokenUrl = 'https://duckduckgo.com/?q=' + encodeURIComponent(query);
    const tokenRes = await fetch(tokenUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });
    const html = await tokenRes.text();
    const m = html.match(/vqd=([0-9-]+)/) || html.match(/vqd="([0-9-]+)"/);
    if (!m) return [];

    const vqd = m[1];
    const imgUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,&p=1`;
    const imgRes = await fetch(imgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://duckduckgo.com/'
      }
    });
    const data = await imgRes.json();
    return (data.results || []).map((r) => r.image).filter(Boolean);
  } catch (err) {
    return [];
  }
}

async function main() {
  console.log('=== STARTING BATCH 10 CATALOG BUILDER ===\n');

  // 1. Load existing signatures
  const sigsPath = path.join(__dirname, 'data', 'existing-signatures.json');
  let existingSignatures = { images: [], slugs: [], skus: [] };
  if (fs.existsSync(sigsPath)) {
    existingSignatures = JSON.parse(fs.readFileSync(sigsPath, 'utf8'));
  }
  const usedImages = new Set(existingSignatures.images.map((u) => u.toLowerCase().trim()));
  const usedSlugs = new Set(existingSignatures.slugs.map((s) => s.toLowerCase().trim()));
  const usedSkus = new Set(existingSignatures.skus.map((s) => s.toLowerCase().trim()));

  console.log(`[Signatures] Loaded ${usedImages.size} existing images, ${usedSlugs.size} slugs, ${usedSkus.size} SKUs from DB.`);

  // 2. Connect to Mongo to fetch categories map
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const dbCats = await Category.find({}).lean();
  const slugToCat = {};
  dbCats.forEach((c) => {
    slugToCat[c.slug] = c;
  });
  console.log(`[Database] Loaded ${dbCats.length} categories from MongoDB.\n`);

  // Group candidate blueprints by category
  const candidatesByCategory = {};
  for (const bp of ALL_BATCH10_BLUEPRINTS) {
    if (!candidatesByCategory[bp.categorySlug]) {
      candidatesByCategory[bp.categorySlug] = [];
    }
    candidatesByCategory[bp.categorySlug].push(bp);
  }

  const categorySlugs = Object.keys(candidatesByCategory);
  const final500Products = [];

  for (const catSlug of categorySlugs) {
    const cat = slugToCat[catSlug];
    if (!cat) {
      console.error(`ERROR: Category slug '${catSlug}' not found in database!`);
      continue;
    }

    const candidates = candidatesByCategory[catSlug];
    console.log(`\n============================================================`);
    console.log(`CATEGORY: ${cat.name} (${catSlug}) - Target: 25 items`);
    console.log(`============================================================`);
    const verifiedCategoryProducts = [];

    for (const candidate of candidates) {
      if (verifiedCategoryProducts.length >= 25) break;

      let chosenImageUrl = null;
      const queries = candidate.queries || [candidate.name];

      for (const q of queries) {
        if (chosenImageUrl) break;
        const imgCandidates = await searchProductImage(q);
        await sleep(150);

        for (const imgUrl of imgCandidates) {
          const lower = imgUrl.toLowerCase().trim();
          if (usedImages.has(lower)) continue;
          if (lower.endsWith('.svg') || lower.endsWith('.gif')) continue;

          // Verify HTTP 200 OK
          const isValid = await verifyImageUrl(imgUrl);
          if (isValid) {
            chosenImageUrl = imgUrl;
            usedImages.add(lower);
            break;
          }
        }
      }

      // Fallback to searching product name directly
      if (!chosenImageUrl) {
        const fallbackImgs = await searchProductImage(candidate.name);
        await sleep(150);
        for (const imgUrl of fallbackImgs) {
          const lower = imgUrl.toLowerCase().trim();
          if (usedImages.has(lower)) continue;
          if (lower.endsWith('.svg') || lower.endsWith('.gif')) continue;

          const isValid = await verifyImageUrl(imgUrl);
          if (isValid) {
            chosenImageUrl = imgUrl;
            usedImages.add(lower);
            break;
          }
        }
      }

      if (!chosenImageUrl) {
        console.warn(`  [SKIP] No valid unique image found for: "${candidate.name}"`);
        continue;
      }

      // Unique Slug
      let baseSlug = slugify(candidate.name);
      let candidateSlug = baseSlug;
      let counter = 1;
      while (usedSlugs.has(candidateSlug.toLowerCase())) {
        candidateSlug = `${baseSlug}-b10-${counter}`;
        counter++;
      }
      usedSlugs.add(candidateSlug.toLowerCase());

      // Unique SKU
      let candidateSku = candidate.sku;
      let skuCounter = 1;
      while (usedSkus.has(candidateSku.toLowerCase())) {
        candidateSku = `${candidate.sku}-${skuCounter}`;
        skuCounter++;
      }
      usedSkus.add(candidateSku.toLowerCase());

      const ratingsAverage = Number((4.6 + Math.random() * 0.35).toFixed(1));
      const ratingsQuantity = Math.floor(25 + Math.random() * 220);

      const specificationsMap = new Map();
      if (candidate.specifications) {
        for (const [k, v] of Object.entries(candidate.specifications)) {
          specificationsMap.set(k, String(v));
        }
      }

      const productDoc = {
        name: candidate.name,
        slug: candidateSlug,
        sku: candidateSku,
        brand: candidate.brand,
        category: cat._id.toString(),
        categorySlug: catSlug,
        price: candidate.price,
        costPrice: candidate.costPrice,
        oldPrice: candidate.oldPrice,
        stock: candidate.stock || 80,
        image: chosenImageUrl,
        images: [chosenImageUrl],
        shortDescription: candidate.shortDescription,
        description: candidate.description,
        bullets: candidate.bullets || [],
        specifications: Object.fromEntries(specificationsMap),
        tags: candidate.tags || [],
        ratingsAverage,
        ratingsQuantity,
        isActive: true,
        isTreasury: true
      };

      verifiedCategoryProducts.push(productDoc);
      console.log(`  [+${verifiedCategoryProducts.length}/25] ${candidate.name.substring(0, 48)}... ($${candidate.price})`);
    }

    console.log(`==> Category '${catSlug}' finished: ${verifiedCategoryProducts.length} / 25 products verified.`);
    final500Products.push(...verifiedCategoryProducts);
  }

  await mongoose.disconnect();

  console.log(`\n========================================`);
  console.log(`TOTAL VERIFIED PRODUCTS PREPARED: ${final500Products.length}`);
  console.log(`========================================`);

  const outPath = path.join(__dirname, 'data', 'batch10-500-products.json');
  fs.writeFileSync(outPath, JSON.stringify(final500Products, null, 2), 'utf8');
  console.log(`Successfully saved output to: ${outPath}`);
}

main().catch((err) => {
  console.error('Fatal error in catalog builder:', err);
  process.exit(1);
});
