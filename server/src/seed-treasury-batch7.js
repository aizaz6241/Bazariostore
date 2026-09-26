import 'dotenv/config';
import mongoose from 'mongoose';
import TreasuryProduct from './models/TreasuryProduct.js';
import Category from './models/Category.js';
import { ensureCategories } from './seed-treasury-categories.js';
import { PRODUCTS_PART_1 } from './data/treasury-batch7-part1.js';
import { PRODUCTS_PART_2 } from './data/treasury-batch7-part2.js';
import { PRODUCTS_PART_3 } from './data/treasury-batch7-part3.js';

const ALL_NEW_PRODUCTS = [
  ...PRODUCTS_PART_1,
  ...PRODUCTS_PART_2,
  ...PRODUCTS_PART_3,
];

const DEFAULT_ATLAS_URI =
  'mongodb+srv://aizazkhan6241_db_user:98av24298@cluster0.ijpphlb.mongodb.net/bazario?retryWrites=true&w=majority&appName=Cluster0';

export async function runBatch7() {
  console.log('⚡ Starting Product Treasury Batch 7 Import...');
  console.log(`📦 Total new products queued for import: ${ALL_NEW_PRODUCTS.length}`);

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

  if (mongoose.connection.readyState !== 1) {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 20000 });
    console.log('✅ Connected to MongoDB Atlas');
  }

  const initialCount = await TreasuryProduct.countDocuments();
  console.log(`🔍 Current initial items in Product Treasury: ${initialCount}`);

  // 1. Ensure new categories exist without modifying or deleting existing categories
  console.log('Ensuring new categories in database...');
  await ensureCategories();
  console.log('✅ Categories verified');

  // Cache categories
  const categories = await Category.find({});
  const catSlugMap = {};
  categories.forEach((c) => {
    catSlugMap[c.slug] = c._id;
  });

  let addedCount = 0;
  let skippedCount = 0;

  for (const item of ALL_NEW_PRODUCTS) {
    const catId = catSlugMap[item.categorySlug] || null;
    const { categorySlug, ...data } = item;

    // Use $setOnInsert to strictly guarantee that existing products are NEVER modified or corrupted
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
      console.log(`✨ Added: [${item.brand}] "${item.name}" - $${item.price} (Category: ${item.categorySlug})`);
    } else {
      skippedCount++;
      console.log(`ℹ️ Already exists (untouched): "${item.name}"`);
    }
  }

  const finalCount = await TreasuryProduct.countDocuments();
  console.log('\n========================================================');
  console.log(`🎉 Batch 7 Import Summary:`);
  console.log(`   Initial Treasury Items: ${initialCount}`);
  console.log(`   New Products Added:     ${addedCount}`);
  console.log(`   Skipped/Untouched:      ${skippedCount}`);
  console.log(`   Final Total Treasury:   ${finalCount} items`);
  console.log('========================================================\n');

  return { initialCount, addedCount, finalCount };
}

if (process.argv[1]?.endsWith('seed-treasury-batch7.js')) {
  runBatch7()
    .then(async () => {
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('❌ Batch 7 seed error:', err);
      try {
        await mongoose.disconnect();
      } catch {}
      process.exit(1);
    });
}
