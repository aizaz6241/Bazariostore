// Safety lock for the one-off maintenance / seed scripts in this folder.
//
// These scripts were written to be run once by hand. Several of them insert, overwrite or delete
// records, and they connect to whatever database MONGO_URI points at (the live one, on the
// server). So none of them does anything unless it is run on purpose:
//
//   ALLOW_DB_SCRIPT=yes MONGO_URI="mongodb+srv://..." node src/<script>.js
//
// No database address or password is kept in the code any more: it comes from the environment
// (or from server/.env on your own computer).
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../.env') });
dotenv.config({ path: path.resolve(here, '../../.env') });

const script = path.basename(process.argv[1] || 'script');

if (process.env.ALLOW_DB_SCRIPT !== 'yes') {
  console.error(`\n⛔ ${script} is locked.`);
  console.error('   It is a one-off script that can change the database it connects to.');
  console.error('   To run it on purpose, set ALLOW_DB_SCRIPT=yes for that one command.\n');
  process.exit(1);
}

const uri = process.env.MONGO_URI || process.env.MONGODB_URI || '';
if (!uri) {
  console.error(`\n⛔ ${script}: MONGO_URI is not set. Nothing was done.\n`);
  process.exit(1);
}
if (!process.env.MONGO_URI) process.env.MONGO_URI = uri;

let host = 'unknown host';
try {
  host = uri.replace(/^mongodb(\+srv)?:\/\/[^@]*@/, '').split(/[/?]/)[0];
} catch {}
console.log(`\n⚠️  ${script} is running against the database at: ${host}\n`);
