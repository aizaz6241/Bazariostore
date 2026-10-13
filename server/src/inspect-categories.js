import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}
import mongoose from 'mongoose';
import Category from './models/Category.js';
import TreasuryProduct from './models/TreasuryProduct.js';

const URI = 'mongodb+srv://aizazkhan6241_db_user:98av24298@cluster0.ijpphlb.mongodb.net/bazario?retryWrites=true&w=majority&appName=Cluster0';

async function main() {
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 15000 });
  const cats = await Category.find({}).lean();
  console.log('Categories count:', cats.length);
  cats.forEach(c => console.log('  ', c._id.toString(), '|', c.name, '|', c.slug));

  const totalTP = await TreasuryProduct.countDocuments({});
  console.log('\nTotal Treasury Products:', totalTP);

  const byCat = await TreasuryProduct.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 } } }
  ]);
  
  const catMap = Object.fromEntries(cats.map(c => [c._id.toString(), c.name]));
  console.log('\nProducts per category:');
  byCat.forEach(b => {
    const name = b._id ? (catMap[b._id.toString()] || 'Unknown ID') : 'No Category';
    console.log(`  ${name} (${b._id}): ${b.count}`);
  });

  await mongoose.disconnect();
}
main().catch(console.error);
