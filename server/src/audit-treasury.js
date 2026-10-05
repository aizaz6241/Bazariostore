import './_script-guard.js';
import mongoose from 'mongoose';
import TreasuryProduct from './models/TreasuryProduct.js';
import Category from './models/Category.js';

const URI = process.env.MONGO_URI;

async function audit() {
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 15000 });
  console.log('Connected to MongoDB Atlas');

  const products = await TreasuryProduct.find({}).populate('category', 'name slug').sort({ createdAt: -1 });
  console.log(`Total Treasury Products: ${products.length}`);

  // Count image frequencies
  const imgFreq = {};
  products.forEach(p => {
    const img = p.image || 'EMPTY';
    imgFreq[img] = (imgFreq[img] || 0) + 1;
  });

  const dupes = Object.entries(imgFreq).filter(([img, count]) => count > 1).sort((a,b) => b[1] - a[1]);
  console.log(`\n=== DUPLICATE IMAGES DETECTED: ${dupes.length} distinct URLs shared by multiple products ===`);
  
  dupes.forEach(([img, count], i) => {
    console.log(`\n[#${i+1}] Shared ${count} times: ${img.slice(0, 90)}...`);
    const prods = products.filter(p => p.image === img);
    prods.forEach(p => {
      console.log(`    - [${p._id}] "${p.name}" (SKU: ${p.sku}, Cat: ${p.category?.name || p.category})`);
    });
  });

  // Check categories in database
  const categories = await Category.find({});
  console.log(`\n=== EXISTING CATEGORIES IN DB (${categories.length}) ===`);
  categories.forEach(c => console.log(`  - ${c.name} (slug: "${c.slug}", _id: ${c._id})`));

  await mongoose.disconnect();
}

audit().catch(console.error);
