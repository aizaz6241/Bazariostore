import './_script-guard.js';
import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import mongoose from 'mongoose';
import TreasuryProduct from './models/TreasuryProduct.js';
import fs from 'fs';

const URI = process.env.MONGO_URI;

async function run() {
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 20000 });
  const products = await TreasuryProduct.find({}).lean();
  const imgMap = {};
  for (const p of products) {
    const img = p.image || '';
    if (!imgMap[img]) imgMap[img] = [];
    imgMap[img].push(p);
  }

  const dupes = Object.entries(imgMap).filter(([img, list]) => list.length > 1);
  const secondaryItems = [];
  for (const [img, list] of dupes) {
    // First item keeps image, others need distinct new images!
    for (let i = 1; i < list.length; i++) {
      secondaryItems.push({
        sku: list[i].sku,
        name: list[i].name,
        category: list[i].category,
        brand: list[i].brand,
        sharedWith: list[0].name,
        sharedSku: list[0].sku,
        currentImg: img
      });
    }
  }

  console.log('Total duplicate image groups:', dupes.length);
  console.log('Total secondary items needing unique image:', secondaryItems.length);
  fs.writeFileSync('server/src/data/secondary-dupes.json', JSON.stringify(secondaryItems, null, 2));
  
  secondaryItems.forEach((it, idx) => {
    console.log(`${idx + 1}. [${it.sku}] ${it.name} (Shared with: ${it.sharedSku} - ${it.sharedWith})`);
  });

  await mongoose.disconnect();
}

run().catch(console.error);
