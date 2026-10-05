import './_script-guard.js';
import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import mongoose from 'mongoose';
import TreasuryProduct from './models/TreasuryProduct.js';
import Product from './models/Product.js';
import { MAP_82 } from './build-82-perfect.js';

const URI = process.env.MONGO_URI;

async function applyMasterFix() {
  console.log('🚀 Connecting to MongoDB Atlas...');
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 20000 });
  console.log('Connected to MongoDB Atlas');

  let updatedTreasury = 0;
  let updatedSellerProducts = 0;

  console.log(`Applying updates for all ${Object.keys(MAP_82).length} products...`);
  for (const [sku, imgUrl] of Object.entries(MAP_82)) {
    const resT = await TreasuryProduct.updateOne(
      { sku },
      {
        $set: {
          image: imgUrl,
          images: [{ url: imgUrl, key: null }]
        }
      }
    );
    if (resT.modifiedCount > 0) updatedTreasury++;

    const resP = await Product.updateMany(
      { sku: new RegExp(`^${sku}`, 'i') },
      {
        $set: {
          image: imgUrl,
          images: [{ url: imgUrl, key: null }]
        }
      }
    );
    updatedSellerProducts += resP.modifiedCount;
  }

  console.log(`✅ TreasuryProduct updated: ${updatedTreasury}`);
  console.log(`✅ Seller Products updated: ${updatedSellerProducts}`);

  // Comprehensive Database Audit
  console.log('\n================ AUDIT REPORT ================');
  const allProducts = await TreasuryProduct.find({}).lean();
  console.log(`Total Treasury Products in DB: ${allProducts.length}`);

  const imgMap = {};
  for (const p of allProducts) {
    const img = p.image || '';
    imgMap[img] = (imgMap[img] || 0) + 1;
  }
  const uniqueCount = Object.keys(imgMap).length;
  console.log(`Total Unique Image URLs: ${uniqueCount}`);
  console.log(`Difference (duplicates): ${allProducts.length - uniqueCount}`);

  const dupes = Object.entries(imgMap).filter(([_, count]) => count > 1);
  if (dupes.length === 0) {
    console.log('🎉 PERFECT: ZERO duplicate images in the entire Treasury catalog!');
    console.log(`🎉 100% of ${allProducts.length} products have dedicated, unique photos!`);
  } else {
    console.error(`⚠️ Found ${dupes.length} remaining duplicate image groups:`, dupes);
  }

  // Verify Screenshot Items Specifically:
  const screenshotSkus = [
    'TRZ-TRV-BIO-STV2', // BioLite CampStove 2+
    'TRZ-TRV-STN-40OZ', // Stanley Quencher Tumbler
    'TRZ-TRV-YET-T45',  // YETI Tundra 45 Cooler
    'TRZ-TRV-PKD-ED20', // Peak Design Everyday Backpack
    'TRZ-TRV-OSP-FP40', // Osprey Farpoint 40 Travel Backpack
    'TRZ-TRV-MTD-BST28',// Matador Beast28 Mountain Backpack
    'TRZ-TRV-NTC-NB10K',// Nitecore Carbon Fiber Power Bank
    'TRZ-HLT-DYS-NURL', // Dyson Supersonic Hair Dryer
    'TRZ-HLT-OMR-PLAT'  // Omron Blood Pressure Monitor
  ];

  console.log('\n=== VERIFYING SCREENSHOT ITEMS ===');
  for (const sku of screenshotSkus) {
    const item = allProducts.find(p => p.sku === sku);
    const count = imgMap[item?.image] || 0;
    console.log(`[${sku}] ${item?.name}`);
    console.log(`       Image: ${item?.image}`);
    console.log(`       Is Unique: ${count === 1 ? '✅ YES (1 of 1)' : '❌ DUPLICATE (' + count + ')'}`);
  }

  // Verify Cosmetics Catalog
  const cosmetics = allProducts.filter(p => p.sku && p.sku.startsWith('TRZ-COS-'));
  console.log(`\n=== COSMETICS & PERSONAL CARE CATALOG: ${cosmetics.length} Products ===`);
  const cosDupes = cosmetics.filter(c => (imgMap[c.image] || 0) > 1);
  console.log(`Cosmetics Duplicates: ${cosDupes.length === 0 ? '✅ ZERO (All Unique)' : '❌ ' + cosDupes.length}`);

  await mongoose.disconnect();
  console.log('\nDone.');
}

applyMasterFix().catch(console.error);
