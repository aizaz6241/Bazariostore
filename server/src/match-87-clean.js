import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import mongoose from 'mongoose';
import TreasuryProduct from './models/TreasuryProduct.js';
import fs from 'fs';

const URI = 'mongodb+srv://aizazkhan6241_db_user:98av24298@cluster0.ijpphlb.mongodb.net/bazario?retryWrites=true&w=majority&appName=Cluster0';

async function run() {
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 20000 });
  const products = await TreasuryProduct.find({}).lean();
  
  // Find currently used unique URLs
  const usedUrls = new Set();
  const duplicateItems = [];
  
  // Group products by image
  const imgToProducts = {};
  for (const p of products) {
    const img = p.image || '';
    if (!imgToProducts[img]) imgToProducts[img] = [];
    imgToProducts[img].push(p);
  }

  for (const [img, list] of Object.entries(imgToProducts)) {
    // First product gets to keep the image!
    usedUrls.add(img);
    // All other products in this group are duplicates and need a fresh image
    for (let i = 1; i < list.length; i++) {
      duplicateItems.push(list[i]);
    }
  }

  console.log(`Total Products: ${products.length}`);
  console.log(`Unique URLs already kept: ${usedUrls.size}`);
  console.log(`Products needing fresh distinct URL: ${duplicateItems.length}`);

  fs.writeFileSync('server/src/data/87-items-needing-fresh.json', JSON.stringify(duplicateItems.map(p => ({
    sku: p.sku,
    name: p.name,
    category: p.category,
    brand: p.brand
  })), null, 2));

  await mongoose.disconnect();
}

run().catch(console.error);
