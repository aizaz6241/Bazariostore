import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { pipeline } from 'stream/promises';
import mongoose from 'mongoose';
import { UTApi, UTFile } from 'uploadthing/server';
import { createBackup } from './backup.service.js';

/**
 * CLOUD BACKUPS — copies of the whole database kept OUTSIDE the Render server.
 *
 * The Render disk is wiped on every deploy / restart, so backups kept only there are lost.
 * Every 6 hours a snapshot is made, compressed (gzip), ENCRYPTED (AES-256-GCM with
 * BACKUP_ENCRYPTION_KEY) and stored on UploadThing. A file link alone is useless without the key.
 * The list lives in the `cloudbackups` collection.
 *
 * Kept: everything from the last 7 days, one per day for 90 days, one per month for ever.
 *
 * File format (.bzbk): "BZBK1" (5 bytes) + IV (12 bytes) + encrypted gzip of the JSON backup + tag (16 bytes)
 * Decrypt on a computer: node scripts/decrypt-backup.mjs <file.bzbk>
 */

const MAGIC = Buffer.from('BZBK1');
const EVERY_MS = 6 * 60 * 60 * 1000;
const col = () => mongoose.connection.db.collection('cloudbackups');

let utapi = null;
const ut = () => {
  if (!process.env.UPLOADTHING_TOKEN) throw new Error('UPLOADTHING_TOKEN is not set');
  if (!utapi) utapi = new UTApi({ token: process.env.UPLOADTHING_TOKEN });
  return utapi;
};

export function backupKey() {
  const raw = String(process.env.BACKUP_ENCRYPTION_KEY || '').trim();
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : null;
  if (!key) throw new Error('BACKUP_ENCRYPTION_KEY is not set (64 hex characters)');
  return key;
}

export const cloudBackupReady = () => {
  try {
    backupKey();
    return !!process.env.UPLOADTHING_TOKEN;
  } catch {
    return false;
  }
};

/** gzip + AES-256-GCM, streamed (memory stays small). */
export async function encryptFile(src, dst, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  fs.writeFileSync(dst, Buffer.concat([MAGIC, iv]));
  await pipeline(fs.createReadStream(src), zlib.createGzip({ level: 9 }), cipher, fs.createWriteStream(dst, { flags: 'a' }));
  fs.appendFileSync(dst, cipher.getAuthTag());
}

let running = null;

/** Make one snapshot and store it in the cloud. Never runs twice at the same time. */
export async function runCloudBackup(reason = 'scheduled') {
  if (running) return running;
  running = (async () => {
    const key = backupKey();
    const snap = await createBackup('cloud');
    const encPath = `${snap.filePath}.bzbk`;
    try {
      await encryptFile(snap.filePath, encPath, key);

      const name = path.basename(snap.filePath).replace(/^backup-cloud-/, 'bazario-db-').replace(/\.json$/, '.bzbk');
      // The file is handed over as a file-backed Blob: it is read from disk while it uploads instead
      // of being loaded into memory whole (a big database made the server run out of memory here).
      const size = fs.statSync(encPath).size;
      const part = typeof fs.openAsBlob === 'function' ? await fs.openAsBlob(encPath) : fs.readFileSync(encPath);
      const [res] = await ut().uploadFiles([new UTFile([part], name, { type: 'application/octet-stream' })]);
      if (!res || res.error) throw new Error(res?.error?.message || 'Upload to cloud failed');

      const doc = {
        name,
        key: res.data.key,
        url: res.data.ufsUrl || res.data.url,
        size,
        rawSize: snap.sizeBytes,
        collectionsCount: snap.collectionsCount,
        documentsCount: snap.documentsCount,
        reason,
        status: 'stored',
        createdAt: new Date(),
      };
      await col().insertOne(doc);
      console.log(`☁️ [Cloud Backup] stored ${name} (${(size / 1024 / 1024).toFixed(2)} MB, ${snap.documentsCount} records)`);
      await applyRetention().catch((e) => console.error('[Cloud Backup] retention warning:', e.message));
      return doc;
    } finally {
      for (const f of [snap.filePath, `${snap.filePath}.meta`, encPath]) {
        try { fs.unlinkSync(f); } catch {}
      }
    }
  })();
  try {
    return await running;
  } finally {
    running = null;
  }
}

/** Last 7 days: all. Up to 90 days: the first of each day. Older: the first of each month. */
export function pickRemovals(list, now = Date.now()) {
  const sorted = [...list].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const seenDay = new Set();
  const seenMonth = new Set();
  const remove = [];
  for (const b of sorted) {
    const t = new Date(b.createdAt).getTime();
    const age = now - t;
    const day = new Date(t).toISOString().slice(0, 10);
    const month = day.slice(0, 7);
    const firstOfDay = !seenDay.has(day);
    const firstOfMonth = !seenMonth.has(month);
    seenDay.add(day);
    seenMonth.add(month);
    if (age <= 7 * 86400000) continue;
    if (age <= 90 * 86400000 ? firstOfDay : firstOfMonth) continue;
    remove.push(b);
  }
  return remove;
}

async function applyRetention() {
  const list = await col().find({ status: 'stored' }).toArray();
  const remove = pickRemovals(list);
  if (!remove.length) return;
  await ut().deleteFiles(remove.map((b) => b.key));
  await col().updateMany({ _id: { $in: remove.map((b) => b._id) } }, { $set: { status: 'removed', removedAt: new Date() } });
}

export async function listCloudBackups() {
  return col().find({ status: 'stored' }).sort({ createdAt: -1 }).limit(500).toArray();
}

/** Every 30 minutes: is the last cloud backup older than 6 hours? Then make one. */
export function scheduleCloudBackups() {
  const tick = async () => {
    try {
      if (mongoose.connection.readyState !== 1) return;
      if (!cloudBackupReady()) {
        console.error('⚠️ [Cloud Backup] not running: set UPLOADTHING_TOKEN and BACKUP_ENCRYPTION_KEY on the server.');
        return;
      }
      const last = await col().find({ status: 'stored' }).sort({ createdAt: -1 }).limit(1).next();
      if (last && Date.now() - new Date(last.createdAt).getTime() < EVERY_MS) return;
      await runCloudBackup('scheduled');
    } catch (e) {
      console.error('❌ [Cloud Backup] failed:', e.message);
    }
  };
  setTimeout(tick, 15 * 60 * 1000);
  setInterval(tick, 30 * 60 * 1000);
}
