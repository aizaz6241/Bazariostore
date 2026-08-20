import mongoose from 'mongoose';

const testUsernames = ['abd', 'callcenter', 'abdcallcenter', 'official', 'store', 'root', 'mongo', 'test', 'dev', 'app', 'user1', 'nayab_glow', 'nayab-glow', 'officialnayabglow', 'aizaz_6241', 'aizazkhan', 'aizaz_khan'];
const pass = 'u2IODhWhiXehEOy8';
const cluster = 'cluster0.ijpphlb.mongodb.net';

async function testConnections() {
  for (const u of testUsernames) {
    const uri = `mongodb+srv://${u}:${pass}@${cluster}/amazon-clone?retryWrites=true&w=majority&appName=Cluster0&tlsAllowInvalidCertificates=true`;
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
      console.log(`SUCCESS! Connected with username: ${u}`);
      await mongoose.disconnect();
      return u;
    } catch (err) {
      console.log(`Failed for ${u}: ${err.message}`);
    }
  }
  console.log('No direct username match found.');
}

testConnections().then(() => process.exit(0));
