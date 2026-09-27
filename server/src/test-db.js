import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);
import mongoose from 'mongoose';

const DEFAULT_ATLAS_URI = 'mongodb+srv://aizazkhan6241_db_user:98av24298@cluster0.ijpphlb.mongodb.net/bazario?retryWrites=true&w=majority&appName=Cluster0';
const uri = process.env.MONGO_URI || process.env.MONGODB_URI || DEFAULT_ATLAS_URI;

async function run() {
  try {
    console.log('Connecting to MongoDB Atlas with Google/Cloudflare DNS...');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    console.log('Connected successfully to DB:', mongoose.connection.name);

    const count = await mongoose.connection.db.collection('treasuryproducts').countDocuments();
    console.log(`Treasury Products count: ${count}`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('\nDone.');
  }
}

run().then(() => process.exit(0));
