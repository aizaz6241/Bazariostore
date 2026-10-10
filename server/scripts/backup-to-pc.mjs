// BACKUP TO THIS COMPUTER — READ ONLY (nothing in the database is changed or deleted).
//   1. Makes a fresh full snapshot of the database → <folder>/bazario-db-<date>.json.gz
//   2. Downloads every cloud backup this computer does not have yet → <folder>/cloud/
// Files are never deleted here, so this folder keeps a copy of everything.
//
// Run from the project folder:   node server/scripts/backup-to-pc.mjs ["D:\\My Backups\\Bazario"]
// Default folder: <project>/db-backups
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '..');
const require = createRequire(path.join(serverDir, 'package.json'));
const mongoose = require('mongoose');
const { EJSON } = require('bson');

const env = fs.readFileSync(path.join(serverDir, '.env'), 'utf8');
const uri = ((env.match(/^MONGO_URI=(.*)$/m) || env.match(/^MONGODB_URI=(.*)$/m) || [])[1] || '').trim();
if (!uri) {
  console.log('MONGO_URI not found in server/.env');
  process.exit(1);
}
const folder = path.resolve(process.argv[2] || path.join(serverDir, '..', 'db-backups'));
fs.mkdirSync(path.join(folder, 'cloud'), { recursive: true });

const pad = (n) => String(n).padStart(2, '0');
const d = new Date();
const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;

await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000, readPreference: 'secondaryPreferred' });
const db = mongoose.connection.db;

// 1. fresh snapshot (streamed, gzip) — same format as the server backups
const file = path.join(folder, `bazario-db-${stamp}.json.gz`);
const gz = zlib.createGzip({ level: 9 });
const out = fs.createWriteStream(file);
gz.pipe(out);
const write = (s) => new Promise((ok) => (gz.write(s) ? ok() : gz.once('drain', ok)));
let docsCount = 0;
let colsCount = 0;
await write(`{"version":"1.0","format":"bazario-ejson-v1","type":"pc","createdAt":${JSON.stringify(d.toISOString())},"database":${JSON.stringify(db.databaseName)},"collections":{`);
let firstCol = true;
for (const c of await db.listCollections().toArray()) {
  if (c.name.startsWith('system.')) continue;
  await write(`${firstCol ? '' : ','}${JSON.stringify(c.name)}:[`);
  firstCol = false;
  let first = true;
  for await (const doc of db.collection(c.name).find({}, { batchSize: 100 })) {
    await write(`${first ? '' : ','}${EJSON.stringify(doc, { relaxed: false })}`);
    first = false;
    docsCount += 1;
  }
  await write(']');
  colsCount += 1;
}
await write(`},"stats":{"collectionsCount":${colsCount},"documentsCount":${docsCount}}}`);
gz.end();
await new Promise((ok) => out.on('finish', ok));
console.log(`✔ Snapshot: ${file} (${colsCount} collections, ${docsCount} records, ${(fs.statSync(file).size / 1024 / 1024).toFixed(2)} MB)`);

// 2. cloud backups this computer does not have yet
let got = 0;
const cloud = await db.collection('cloudbackups').find({ status: 'stored' }).sort({ createdAt: 1 }).toArray();
for (const b of cloud) {
  const target = path.join(folder, 'cloud', b.name);
  if (fs.existsSync(target)) continue;
  try {
    const res = await fetch(b.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
    got += 1;
  } catch (e) {
    console.log(`  ! could not download ${b.name}: ${e.message}`);
  }
}
console.log(`✔ Cloud backups: ${cloud.length} in the cloud, ${got} new downloaded to ${path.join(folder, 'cloud')}`);
await mongoose.disconnect();
