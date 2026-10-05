import 'dotenv/config';
import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}

import mongoose from 'mongoose';
import fs from 'fs';
import TreasuryProduct from './models/TreasuryProduct.js';
import Category from './models/Category.js';
import { ensureCategories } from './seed-treasury-categories.js';
import { FINAL_100_PRODUCTS } from './data/batch8-final-100.js';

const DEFAULT_ATLAS_URI =
  'mongodb+srv://aizazkhan6241_db_user:98av24298@cluster0.ijpphlb.mongodb.net/bazario?retryWrites=true&w=majority&appName=Cluster0';

async function main() {
  console.log('⚡ Starting Product Treasury Batch 8 Seeding (Final 100 Products)...');
  console.log(`📦 Products to seed: ${FINAL_100_PRODUCTS.length}`);

  let mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || DEFAULT_ATLAS_URI;
  if (
    !mongoUri ||
    mongoUri.includes('<db_username>') ||
    mongoUri.includes('<db_password>') ||
    mongoUri.includes('aizaz6241_db_user:') ||
    mongoUri.includes('u2IODhWhiXehEOy8')
  ) {
    mongoUri = DEFAULT_ATLAS_URI;
  }

  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 25000 });
  console.log('✅ Connected to MongoDB Atlas');

  const initialCount = await TreasuryProduct.countDocuments();
  console.log(`🔍 Current initial items in Product Treasury: ${initialCount}`);

  // 1. Ensure categories exist safely
  await ensureCategories();
  
  // Ensure sports category exists if missing
  await Category.updateOne(
    { slug: 'sports' },
    {
      $setOnInsert: {
        name: 'Sports & Outdoors',
        slug: 'sports',
        icon: 'award',
        image: { url: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=600&auto=format&fit=crop&q=80', key: null },
        sortOrder: 21,
        active: true
      }
    },
    { upsert: true }
  );

  // Cache all categories
  const categories = await Category.find({});
  const catSlugMap = {};
  categories.forEach((c) => {
    catSlugMap[c.slug] = c._id;
  });

  // Verify all categories in batch 8 have an _id
  for (const item of FINAL_100_PRODUCTS) {
    if (!catSlugMap[item.categorySlug]) {
      console.error(`ERROR: Category missing in DB: ${item.categorySlug} for product: ${item.name}`);
      process.exit(1);
    }
  }
  console.log('✅ All 100 products have valid Category IDs in database');

  let addedCount = 0;
  let skippedCount = 0;

  for (const item of FINAL_100_PRODUCTS) {
    const catId = catSlugMap[item.categorySlug];
    const { categorySlug, ...data } = item;

    // Use $setOnInsert to strictly guarantee ZERO modifications to existing products
    const res = await TreasuryProduct.updateOne(
      { slug: item.slug },
      {
        $setOnInsert: {
          ...data,
          category: catId,
          active: true,
          sold: data.sold || 0,
          reservedStock: 0,
          primeEligible: true,
          freeDelivery: true,
          rating: data.rating || 4.8,
          numReviews: data.numReviews || Math.floor(18 + Math.random() * 45),
        },
      },
      { upsert: true }
    );

    if (res.upsertedCount > 0) {
      addedCount++;
      console.log(`✨ Added [${addedCount}/100]: [${item.brand}] "${item.name}" - $${item.price} (${item.categorySlug})`);
    } else {
      skippedCount++;
      console.log(`ℹ️ Already exists (untouched): "${item.name}"`);
    }
  }

  const finalCount = await TreasuryProduct.countDocuments();
  console.log('\n========================================================');
  console.log(`🎉 Batch 8 Seeding Complete:`);
  console.log(`   Initial Count:  ${initialCount}`);
  console.log(`   Products Added: ${addedCount}`);
  console.log(`   Skipped/Exists: ${skippedCount}`);
  console.log(`   Final DB Count: ${finalCount}`);
  console.log('========================================================\n');

  // Export fresh full treasury to server/src/data/treasury-all-products.json
  console.log('Exporting all treasury products to JSON cache...');
  const allProducts = await TreasuryProduct.find({}).lean();
  fs.writeFileSync('server/src/data/treasury-all-products.json', JSON.stringify(allProducts, null, 2));
  console.log(`✅ Saved ${allProducts.length} items to server/src/data/treasury-all-products.json`);

  // Final database audit: check duplicate images across ALL products in DB
  console.log('\nAuditing full database for duplicates...');
  const dbImages = new Set();
  const dbSlugs = new Set();
  const dbSkus = new Set();
  let dupImages = 0;
  let dupSlugs = 0;
  let dupSkus = 0;

  for (const p of allProducts) {
    if (dbImages.has(p.image)) {
      console.error(`Duplicate image in DB: ${p.image} (${p.name})`);
      dupImages++;
    }
    if (dbSlugs.has(p.slug)) {
      console.error(`Duplicate slug in DB: ${p.slug}`);
      dupSlugs++;
    }
    if (dbSkus.has(p.sku)) {
      console.error(`Duplicate sku in DB: ${p.sku}`);
      dupSkus++;
    }
    dbImages.add(p.image);
    dbSlugs.add(p.slug);
    dbSkus.add(p.sku);
  }

  console.log(`Total DB items: ${allProducts.length}`);
  console.log(`Duplicate images: ${dupImages}`);
  console.log(`Duplicate slugs: ${dupSlugs}`);
  console.log(`Duplicate SKUs: ${dupSkus}`);

  if (dupImages === 0 && dupSlugs === 0 && dupSkus === 0 && allProducts.length === 447) {
    console.log('\n🌟 ZERO DUPLICATE IMAGES! ALL 447 TREASURY PRODUCTS 100% CLEAN AND UNIQUE! 🌟');
  } else {
    console.warn(`\nWarning: Check results above. Total: ${allProducts.length}, Dupes: ${dupImages}`);
  }

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB Atlas.');
}

main().catch((err) => {
  console.error('Fatal error during seeding:', err);
  process.exit(1);
});
