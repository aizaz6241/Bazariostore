import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}
import mongoose from 'mongoose';
import fs from 'fs';
import './models/Category.js';
import TreasuryProduct from './models/TreasuryProduct.js';

const URI = 'mongodb+srv://aizazkhan6241_db_user:98av24298@cluster0.ijpphlb.mongodb.net/bazario?retryWrites=true&w=majority&appName=Cluster0';

async function exportAll() {
  try {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 15000 });
    console.log('Connected to MongoDB Atlas');

    const products = await TreasuryProduct.find({}).populate('category', 'name slug').lean();
    console.log(`Fetched ${products.length} products`);

    const list = products.map(p => ({
      _id: p._id.toString(),
      name: p.name,
      brand: p.brand,
      sku: p.sku,
      category: p.category?.name || 'Uncategorized',
      categorySlug: p.category?.slug || '',
      price: p.price,
      costPrice: p.costPrice,
      image: p.image,
    }));

    fs.writeFileSync('server/src/data/treasury-all-products.json', JSON.stringify(list, null, 2));
    console.log('Successfully saved to server/src/data/treasury-all-products.json');
  } catch (err) {
    console.error('Export error:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

exportAll();
