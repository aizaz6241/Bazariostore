import mongoose from 'mongoose';

const DEFAULT_ATLAS_URI = 'mongodb+srv://aizazkhan6241_db_user:98av24298@cluster0.ijpphlb.mongodb.net/bazario?retryWrites=true&w=majority&appName=Cluster0';
const uri = process.env.MONGO_URI || process.env.MONGODB_URI || DEFAULT_ATLAS_URI;

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    console.log('Connected to DB:', mongoose.connection.name);

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log('\n--- Collections and Document Counts ---');
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments();
      console.log(`- ${col.name}: ${count} documents`);
    }

    const admins = await db.collection('admins').find({}).toArray();
    console.log('\n--- Active Admins ---');
    console.log(admins.map(a => ({ email: a.email, name: a.name, role: a.role })));

    const sellers = await db.collection('sellers').find({}).toArray();
    console.log('\n--- Active Sellers ---');
    console.log(sellers.map(s => ({ email: s.email, storeName: s.storeName, owner: s.ownerName })));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('\nDone.');
  }
}

run().then(() => process.exit(0));


