// Copy a whole database onto another one and make it IDENTICAL (one time).
// Used to switch back after running on the mirror, or to rebuild a copy by hand.
//   node server/scripts/copy-db.mjs "<FROM mongodb uri>" "<TO mongodb uri>"
// Documents that exist only in the TO database are not lost: they are kept in `zz_mirror_archive`.
// Afterwards the counts of every collection are compared and printed.
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '..', 'package.json'));
const { MongoClient } = require('mongodb');
const { syncAll, compareCounts } = await import('../src/services/mirrorCore.js');

const [from, to] = process.argv.slice(2);
if (!from || !to || from === to) {
  console.log('Usage: node server/scripts/copy-db.mjs "<FROM uri>" "<TO uri>"  (two different databases)');
  process.exit(1);
}
const dbName = (u) => new URL(u.replace(/^mongodb(\+srv)?:\/\//, 'http://')).pathname.replace(/^\//, '') || 'bazario';
const a = new MongoClient(from);
const b = new MongoClient(to);
await a.connect();
await b.connect();
const src = a.db(dbName(from));
const dst = b.db(dbName(to));
console.log(`Copying ${src.databaseName} → ${dst.databaseName} …`);
const report = await syncAll(src, dst, (l) => console.log(l));
const diffs = await compareCounts(src, dst);
console.log(`Done: ${report.reduce((t, r) => t + r.copied, 0)} documents in ${report.length} collections.`);
console.log(diffs.length ? `⚠ Different counts: ${JSON.stringify(diffs)}` : '✔ Every collection has the same number of documents.');
await a.close();
await b.close();
