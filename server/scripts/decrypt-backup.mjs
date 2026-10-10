// Opens an encrypted cloud backup (.bzbk) → plain backup .json (the same file the admin panel's
// "Upload & restore" accepts).   Usage:  node server/scripts/decrypt-backup.mjs <file.bzbk> [out.json]
// The key is read from BACKUP_ENCRYPTION_KEY (environment) or server/.env.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const input = process.argv[2];
if (!input) {
  console.log('Usage: node server/scripts/decrypt-backup.mjs <file.bzbk> [out.json]');
  process.exit(1);
}
let keyHex = process.env.BACKUP_ENCRYPTION_KEY || '';
if (!keyHex) {
  try {
    const env = fs.readFileSync(path.join(here, '..', '.env'), 'utf8');
    keyHex = (env.match(/^BACKUP_ENCRYPTION_KEY=(.*)$/m) || [])[1] || '';
  } catch {}
}
keyHex = keyHex.trim();
if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
  console.log('BACKUP_ENCRYPTION_KEY not found (64 hex characters).');
  process.exit(1);
}
const buf = fs.readFileSync(input);
if (buf.subarray(0, 5).toString() !== 'BZBK1') {
  console.log('Not a Bazario cloud backup file.');
  process.exit(1);
}
const iv = buf.subarray(5, 17);
const tag = buf.subarray(buf.length - 16);
const body = buf.subarray(17, buf.length - 16);
const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
decipher.setAuthTag(tag);
let gz;
try {
  gz = Buffer.concat([decipher.update(body), decipher.final()]);
} catch {
  console.log('Wrong key or damaged file.');
  process.exit(1);
}
const out = process.argv[3] || input.replace(/\.bzbk$/i, '') + '.json';
fs.writeFileSync(out, zlib.gunzipSync(gz));
console.log('Done:', out);
