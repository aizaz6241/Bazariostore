/**
 * Seed Batch 10 to TreasuryProduct (Strictly Additive, Zero Deletions)
 * Requires: $env:ALLOW_DB_SCRIPT='yes'
 */

import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import TreasuryProduct from './models/TreasuryProduct.js';
import Category from './models/Category.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.env.ALLOW_DB_SCRIPT !== 'yes') {
  console.error('SAFETY BLOCK: Set ALLOW_DB_SCRIPT=yes to run this script.');
  process.exit(1);
}

const MONGODB_URI = 'mongodb+srv://aizazkhan6241_db_user:98av24298@cluster0.ijpphlb.mongodb.net/bazario?retryWrites=true&w=majority&appName=Cluster0';

async function main() {
  console.log('--- SEEDING BATCH 10 TO TREASURY ---');

  const catalogPath = path.join(__dirname, 'data', 'batch10-500-products.json');
  if (!fs.existsSync(catalogPath)) {
    console.error(`ERROR: Catalog file not found at: ${catalogPath}`);
    process.exit(1);
  }

  const productsToSeed = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  console.log(`Loaded ${productsToSeed.length} products to insert.`);

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });

  const countBefore = await TreasuryProduct.countDocuments({});
  console.log(`Existing Treasury Products count before insert: ${countBefore}`);

  let insertedCount = 0;
  let skippedCount = 0;

  for (const prod of productsToSeed) {
    const res = await TreasuryProduct.updateOne(
      { slug: prod.slug },
      { $setOnInsert: prod },
      { upsert: true }
    );
    if (res.upsertedCount > 0) {
      insertedCount++;
    } else {
      skippedCount++;
    }
  }

  console.log(`\nInsert complete:`);
  console.log(`  Newly Inserted: ${insertedCount}`);
  console.log(`  Already Existing / Skipped: ${skippedCount}`);

  const countAfter = await TreasuryProduct.countDocuments({});
  console.log(`Treasury Products count after insert: ${countAfter}`);

  // Comprehensive Integrity Audit
  console.log('\n--- RUNNING INTEGRITY AUDIT ---');
  const allProducts = await TreasuryProduct.find({}).lean();
  console.log(`Total records in DB: ${allProducts.length}`);

  const imageMap = new Map();
  const slugMap = new Map();
  const skuMap = new Map();

  for (const p of allProducts) {
    // Audit Image
    const img = (p.image || '').trim();
    if (!img) {
      console.error(`WARNING: Product missing image: ${p._id} (${p.name})`);
    } else {
      imageMap.set(img, (imageMap.get(img) || 0) + 1);
    }

    // Audit Slug
    const slg = (p.slug || '').trim();
    slugMap.set(slg, (slugMap.get(slg) || 0) + 1);

    // Audit SKU
    const sku = (p.sku || '').trim();
    skuMap.set(sku, (skuMap.get(sku) || 0) + 1);
  }

  let dupImages = 0;
  for (const [img, count] of imageMap.entries()) {
    if (count > 1) {
      dupImages++;
      console.warn(`Duplicate image found (${count}x): ${img}`);
    }
  }

  let dupSlugs = 0;
  for (const [s, count] of slugMap.entries()) {
    if (count > 1) {
      dupSlugs++;
      console.warn(`Duplicate slug found (${count}x): ${s}`);
    }
  }

  let dupSkus = 0;
  for (const [sk, count] of skuMap.entries()) {
    if (count > 1) {
      dupSkus++;
      console.warn(`Duplicate SKU found (${count}x): ${sk}`);
    }
  }

  console.log(`Audit Summary:`);
  console.log(`  Total Products: ${allProducts.length}`);
  console.log(`  Unique Images: ${imageMap.size} (Duplicate image URLs: ${dupImages})`);
  console.log(`  Unique Slugs: ${slugMap.size} (Duplicate slugs: ${dupSlugs})`);
  console.log(`  Unique SKUs: ${skuMap.size} (Duplicate SKUs: ${dupSkus})`);

  // Category counts
  const cats = await Category.find({}).lean();
  const catNames = Object.fromEntries(cats.map(c => [c._id.toString(), c.name]));
  const byCat = await TreasuryProduct.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 } } }
  ]);
  console.log('\nProducts per Category:');
  byCat.forEach(b => {
    const name = b._id ? (catNames[b._id.toString()] || 'Unknown ID') : 'No Category';
    console.log(`  ${name}: ${b.count}`);
  });

  // Export all products and updated signatures
  console.log('\n--- EXPORTING BACKUPS & SIGNATURES ---');
  const allExportPath = path.join(__dirname, 'data', 'treasury-all-products.json');
  fs.writeFileSync(allExportPath, JSON.stringify(allProducts, null, 2), 'utf8');
  console.log(`Exported full catalog (${allProducts.length} items) to: ${allExportPath}`);

  const sigs = {
    total: allProducts.length,
    updatedAt: new Date().toISOString(),
    images: Array.from(imageMap.keys()),
    slugs: Array.from(slugMap.keys()),
    skus: Array.from(skuMap.keys())
  };
  const sigsPath = path.join(__dirname, 'data', 'existing-signatures.json');
  fs.writeFileSync(sigsPath, JSON.stringify(sigs, null, 2), 'utf8');
  console.log(`Exported signatures (${sigs.images.length} images) to: ${sigsPath}`);

  await mongoose.disconnect();
  console.log('--- SEEDING & AUDIT COMPLETE ---');
}

main().catch(err => {
  console.error('Fatal error during seeding:', err);
  process.exit(1);
});
