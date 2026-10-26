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
 * ONCE A DAY, at night (03:00–06:00 India time), a snapshot is made, compressed (gzip), ENCRYPTED
 * (AES-256-GCM with BACKUP_ENCRYPTION_KEY) and stored on UploadThing. A file link alone is useless
 * without the key. The list lives in the `cloudbackups` collection.
 *
 * Why once a day (it was every 6 hours): every upload leaves the Render server as OUTBOUND
 * BANDWIDTH (the whole database, ~55 MB, each time). The Render Hobby workspace includes only
 * 5 GB a month; 4 uploads a day alone came to ~7 GB a month. Every snapshot also reads the whole
 * database from Atlas (the free cluster allows 10 GB out per 7 days, then it is slowed down).
 * Between the daily copies the live mirror database (if MIRROR_MONGO_URI is set) and the Render
 * disk snapshots still cover the day. "Back up now" in the admin panel still works any time.
 * Render → Environment can change the rhythm without a code change:
 *   CLOUD_BACKUP_EVERY_HOURS = 24 (default) · 48 = every 2 days · 6..168 allowed
 *
 * Kept (UploadThing free storage is 2 GB, shared with chat pictures):
 *   all from the last 7 days · one per week up to 5 weeks · one per month for
 *   CLOUD_BACKUP_KEEP_MONTHS months (default 12; 0 = for ever).
 *   The PC script (scripts/backup-to-pc.bat) downloads EVERY cloud backup and never deletes, so
 *   the PC / Google Drive folder is the keep-for-ever copy.
 *
 * File format (.bzbk): "BZBK1" (5 bytes) + IV (12 bytes) + encrypted gzip of the JSON backup + tag (16 bytes)
 * Decrypt on a computer: node scripts/decrypt-backup.mjs <file.bzbk>
 */

const MAGIC = Buffer.from('BZBK1');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const numEnv = (name, def, min, max) => {
  const raw = String(process.env[name] ?? '').trim();
  const n = raw === '' ? def : Number(raw);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
export const cloudEveryHours = () => numEnv('CLOUD_BACKUP_EVERY_HOURS', 24, 6, 168);
const keepMonths = () => numEnv('CLOUD_BACKUP_KEEP_MONTHS', 12, 0, 1200);
// Night window in India time (IST = UTC+5:30): quiet hours, nobody waiting on the server
const WINDOW_START_IST = 3;
const WINDOW_END_IST = 6;
const istHour = (t) => (((new Date(t).getUTCHours() * 60 + new Date(t).getUTCMinutes() + 330) / 60) % 24);
const col = () => mongoose.connection.db.collection('cloudbackups');

/**
 * Is the scheduled cloud backup due? (pure — tested)
 *  - never made one → yes
 *  - rhythm under a day → simply when it is old enough
 *  - daily or longer → in the night window, once at least (rhythm − 4 h) has passed
 *  - the server slept / restarted through the window → as soon as it is 6 h overdue
 */
export function isCloudBackupDue(lastAt, now = Date.now(), everyHours = cloudEveryHours()) {
  if (!lastAt) return true;
  const age = now - new Date(lastAt).getTime();
  const every = everyHours * HOUR;
  if (age >= every + 6 * HOUR) return true;
  if (everyHours < 24) return age >= every;
  const h = istHour(now);
  return age >= every - 4 * HOUR && h >= WINDOW_START_IST && h < WINDOW_END_IST;
}

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

/**
 * Last 7 days: all. Up to 5 weeks: the first of each week (Monday–Sunday, UTC).
 * Older: the first of each month, for `months` months (0 = for ever). The newest is never removed.
 */
export function pickRemovals(list, now = Date.now(), months = keepMonths()) {
  const sorted = [...list].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const newest = sorted[sorted.length - 1];
  const seenWeek = new Set();
  const seenMonth = new Set();
  const monthIndex = (t) => new Date(t).getUTCFullYear() * 12 + new Date(t).getUTCMonth();
  const remove = [];
  for (const b of sorted) {
    const t = new Date(b.createdAt).getTime();
    const age = now - t;
    const week = Math.floor((Math.floor(t / DAY) + 3) / 7);
    const month = monthIndex(t);
    const firstOfWeek = !seenWeek.has(week);
    const firstOfMonth = !seenMonth.has(month);
    seenWeek.add(week);
    seenMonth.add(month);
    if (b === newest) continue;
    if (age <= 7 * DAY) continue;
    if (age <= 35 * DAY && firstOfWeek) continue;
    if (firstOfMonth && (months === 0 || monthIndex(now) - month <= months)) continue;
    remove.push(b);
  }
  return remove;
}

async function applyRetention() {
  // notes of failed attempts are only needed for a while
  await col().deleteMany({ status: 'failed', createdAt: { $lt: new Date(Date.now() - 30 * DAY) } }).catch(() => {});
  const list = await col().find({ status: 'stored' }).toArray();
  const remove = pickRemovals(list);
  if (!remove.length) return;
  await ut().deleteFiles(remove.map((b) => b.key));
  await col().updateMany({ _id: { $in: remove.map((b) => b._id) } }, { $set: { status: 'removed', removedAt: new Date() } });
}

export async function listCloudBackups() {
  return col().find({ status: 'stored' }).sort({ createdAt: -1 }).limit(500).toArray();
}

/** For the admin page: the rhythm, cloud space used, and a failed attempt newer than the last good one. */
export async function cloudBackupInfo(list) {
  const newest = list[0] ? new Date(list[0].createdAt).getTime() : 0;
  const failed = await col().find({ status: 'failed' }).sort({ createdAt: -1 }).limit(1).next();
  return {
    everyHours: cloudEveryHours(),
    keepMonths: keepMonths(),
    storedBytes: list.reduce((t, b) => t + (Number(b.size) || 0), 0),
    lastFailure: failed && new Date(failed.createdAt).getTime() > newest ? { at: failed.createdAt, error: failed.error } : null,
  };
}

/**
 * Every 30 minutes: is the scheduled backup due (see isCloudBackupDue)? Then make one.
 * Only SCHEDULED backups set the rhythm: a "Back up now" during the day does not move the
 * night backup.
 */
export function scheduleCloudBackups() {
  let warned = false;
  const tick = async () => {
    try {
      if (mongoose.connection.readyState !== 1) return;
      if (!cloudBackupReady()) {
        if (!warned) console.error('⚠️ [Cloud Backup] not running: set UPLOADTHING_TOKEN and BACKUP_ENCRYPTION_KEY on the server.');
        warned = true;
        return;
      }
      // 'stored' and 'removed' both count: a backup thinned out later was still made at that time
      const last = await col()
        .find({ reason: 'scheduled', status: { $in: ['stored', 'removed'] } }, { projection: { createdAt: 1 } })
        .sort({ createdAt: -1 })
        .limit(1)
        .next();
      if (!isCloudBackupDue(last?.createdAt, Date.now())) return;
      // A failed attempt is not retried every 30 minutes: a half-finished upload still costs
      // bandwidth (e.g. cloud storage full → ~55 MB thrown away every half hour). Wait 3 hours.
      const failed = await col().find({ status: 'failed' }, { projection: { createdAt: 1 } }).sort({ createdAt: -1 }).limit(1).next();
      if (failed && Date.now() - new Date(failed.createdAt).getTime() < 3 * HOUR) return;
      try {
        await runCloudBackup('scheduled');
      } catch (e) {
        await col().insertOne({ status: 'failed', reason: 'scheduled-failed', error: String(e.message || e).slice(0, 500), createdAt: new Date() }).catch(() => {});
        throw e;
      }
    } catch (e) {
      console.error('❌ [Cloud Backup] failed (next try in 3 hours):', e.message);
    }
  };
  setTimeout(tick, 15 * 60 * 1000);
  setInterval(tick, 30 * 60 * 1000);
}
