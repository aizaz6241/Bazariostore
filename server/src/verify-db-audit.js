import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import mongoose from 'mongoose';
import TreasuryProduct from './models/TreasuryProduct.js';

const URI = 'mongodb+srv://aizazkhan6241_db_user:98av24298@cluster0.ijpphlb.mongodb.net/bazario?retryWrites=true&w=majority&appName=Cluster0';

async function check() {
  await mongoose.connect(URI);
  const products = await TreasuryProduct.find({}).lean();
  console.log('Total Treasury Products in DB:', products.length);

  const imgMap = {};
  for (const p of products) {
    const img = p.image || '';
    imgMap[img] = (imgMap[img] || 0) + 1;
  }
  console.log('Total Unique Image URLs in DB:', Object.keys(imgMap).length);
  console.log('Difference (duplicates):', products.length - Object.keys(imgMap).length);

  const dupes = Object.entries(imgMap).filter(([img, count]) => count > 1);
  console.log('Duplicate image groups:', dupes.length);
  if (dupes.length > 0) {
    console.log(`Duplicate URLs count: ${dupes.length}`);
    dupes.forEach(([u, c], idx) => {
      const prods = products.filter(p => p.image === u);
      console.log(`\n[#${idx+1}] Count ${c}: ${u.slice(0, 60)}...`);
      prods.forEach(p => console.log(`   - [${p.sku}] ${p.name}`));
    });
  } else {
    console.log('🎉 100% CLEAN: ZERO duplicate images in the entire database!');
  }

  // Check the specific items from screenshot:
  const checkSkus = [
    'TRZ-TRV-BIO-STV2',
    'TRZ-TRV-STN-40OZ',
    'TRZ-TRV-YET-T45',
    'TRZ-TRV-PKD-ED20',
    'TRZ-TRV-OSP-FP40',
    'TRZ-TRV-MTD-BST28',
    'TRZ-TRV-NTC-NB10K',
    'TRZ-HLT-DYS-NURL',
    'TRZ-HLT-OMR-PLAT'
  ];

  console.log('\n=== VERIFYING SCREENSHOT ITEMS ===');
  for (const sku of checkSkus) {
    const item = products.find(p => p.sku === sku);
    console.log(`[${sku}] ${item?.name}`);
    console.log(`       Image: ${item?.image}`);
  }

  // Check cosmetics count
  const cosmetics = products.filter(p => p.sku && p.sku.startsWith('TRZ-COS-'));
  console.log(`\n=== COSMETICS PRODUCTS IN DB: ${cosmetics.length} ===`);
  cosmetics.slice(0, 5).forEach(c => console.log(`  - [${c.sku}] ${c.name} ($${c.price})`));

  await mongoose.disconnect();
}

check().catch(console.error);
