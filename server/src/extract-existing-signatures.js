import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}
import mongoose from 'mongoose';
import fs from 'fs';
import TreasuryProduct from './models/TreasuryProduct.js';
import Category from './models/Category.js';

const URI = 'mongodb+srv://aizazkhan6241_db_user:98av24298@cluster0.ijpphlb.mongodb.net/bazario?retryWrites=true&w=majority&appName=Cluster0';

async function main() {
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 15000 });
  const all = await TreasuryProduct.find({}).lean();
  const cats = await Category.find({}).lean();

  const data = {
    total: all.length,
    images: all.map(p => p.image).filter(Boolean),
    skus: all.map(p => p.sku).filter(Boolean),
    slugs: all.map(p => p.slug).filter(Boolean),
    names: all.map(p => p.name.toLowerCase().trim()),
    categories: cats.map(c => ({ id: c._id.toString(), name: c.name, slug: c.slug }))
  };

  fs.writeFileSync('server/src/data/existing-signatures.json', JSON.stringify(data, null, 2));
  console.log(`Saved signatures for ${all.length} products to server/src/data/existing-signatures.json`);
  console.log(`Unique existing images: ${new Set(data.images).size}`);
  console.log(`Unique existing SKUs: ${new Set(data.skus).size}`);
  console.log(`Unique existing slugs: ${new Set(data.slugs).size}`);

  await mongoose.disconnect();
}
main().catch(console.error);
