import './_script-guard.js';
import 'dotenv/config';
import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}

import mongoose from 'mongoose';
import fs from 'fs';
import TreasuryProduct from './models/TreasuryProduct.js';
import Category from './models/Category.js';

async function main() {
  console.log('⚡ Starting Product Treasury Batch 9 Seeding (380 Products Expansion)...');

  const productsPath = 'server/src/data/batch9-380-products.json';
  if (!fs.existsSync(productsPath)) {
    console.error(`❌ Catalog file not found at: ${productsPath}`);
    process.exit(1);
  }

  const batch9Products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
  console.log(`📦 Loaded ${batch9Products.length} verified products to seed.`);

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('❌ MONGO_URI is not set in environment.');
    process.exit(1);
  }

  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 25000 });
  console.log('✅ Connected to MongoDB Atlas');

  const initialCount = await TreasuryProduct.countDocuments();
  console.log(`🔍 Current initial items in Product Treasury: ${initialCount}`);

  // Cache all categories
  const categories = await Category.find({});
  const catSlugMap = {};
  categories.forEach((c) => {
    catSlugMap[c.slug] = c._id;
  });

  // Verify all categories exist
  for (const item of batch9Products) {
    if (!catSlugMap[item.categorySlug]) {
      console.error(`❌ ERROR: Category missing in DB: ${item.categorySlug} for product: ${item.name}`);
      process.exit(1);
    }
  }
  console.log('✅ All products mapped to valid database Category IDs');

  let addedCount = 0;
  let skippedCount = 0;

  for (const item of batch9Products) {
    const catId = catSlugMap[item.categorySlug];
    const { categorySlug, ...data } = item;

    // Use $setOnInsert to strictly guarantee ZERO modifications to existing records
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
          numReviews: data.numReviews || Math.floor(25 + Math.random() * 85),
        },
      },
      { upsert: true }
    );

    if (res.upsertedCount > 0) {
      addedCount++;
      if (addedCount % 25 === 0 || addedCount === batch9Products.length) {
        console.log(`✨ Added [${addedCount}/${batch9Products.length}]: [${item.brand}] "${item.name}" - $${item.price} (${categorySlug})`);
      }
    } else {
      skippedCount++;
    }
  }

  const finalCount = await TreasuryProduct.countDocuments();
  console.log('\n========================================================');
  console.log(`🎉 Batch 9 Seeding Complete:`);
  console.log(`   Initial Count:  ${initialCount}`);
  console.log(`   Products Added: ${addedCount}`);
  console.log(`   Skipped/Exists: ${skippedCount}`);
  console.log(`   Final DB Count: ${finalCount}`);
  console.log('========================================================\n');

  // Export fresh full treasury to server/src/data/treasury-all-products.json
  console.log('Exporting all treasury products to JSON cache...');
  const allProducts = await TreasuryProduct.find({}).populate('category', 'name slug').lean();
  fs.writeFileSync('server/src/data/treasury-all-products.json', JSON.stringify(allProducts, null, 2));
  console.log(`✅ Saved ${allProducts.length} items to server/src/data/treasury-all-products.json`);

  // Final database audit: check duplicate images across ALL products in DB
  console.log('\nAuditing full database for duplicate images across entire catalog...');
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
    dbImages.add(p.image);

    if (dbSlugs.has(p.slug)) {
      console.error(`Duplicate slug in DB: ${p.slug}`);
      dupSlugs++;
    }
    dbSlugs.add(p.slug);

    if (p.sku && dbSkus.has(p.sku)) {
      console.error(`Duplicate SKU in DB: ${p.sku}`);
      dupSkus++;
    }
    if (p.sku) dbSkus.add(p.sku);
  }

  console.log('\n=== FINAL DATABASE INTEGRITY AUDIT ===');
  console.log(`Total Products in DB:   ${allProducts.length}`);
  console.log(`Unique Image URLs:      ${dbImages.size}`);
  console.log(`Duplicate Images:       ${dupImages}`);
  console.log(`Unique Slugs:           ${dbSlugs.size}`);
  console.log(`Duplicate Slugs:        ${dupSlugs}`);
  console.log(`Unique SKUs:            ${dbSkus.size}`);
  console.log(`Duplicate SKUs:         ${dupSkus}`);
  console.log('======================================');

  // Update existing-signatures.json
  const updatedSignatures = {
    total: allProducts.length,
    images: Array.from(dbImages),
    skus: Array.from(dbSkus),
    slugs: Array.from(dbSlugs),
  };
  fs.writeFileSync('server/src/data/existing-signatures.json', JSON.stringify(updatedSignatures, null, 2));
  console.log('✅ Updated server/src/data/existing-signatures.json with all signatures');

  await mongoose.disconnect();
  console.log('Database disconnected cleanly.');
}

main().catch(console.error);
