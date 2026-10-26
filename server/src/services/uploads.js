import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { UTApi, UTFile } from 'uploadthing/server';

let utapi = null;
function getUT() {
  if (!process.env.UPLOADTHING_TOKEN) throw new Error('UPLOADTHING_TOKEN not configured');
  if (!utapi) utapi = new UTApi({ token: process.env.UPLOADTHING_TOKEN });
  return utapi;
}

// files: multer memory files [{ buffer, originalname, mimetype }] -> [{ url, key }]
export async function uploadBuffers(files) {
  const utFiles = files.map(
    (f) => new UTFile([f.buffer], f.originalname || 'image.png', { type: f.mimetype || 'image/png' })
  );
  const results = await getUT().uploadFiles(utFiles);
  return results.map((r) => {
    if (r.error) throw new Error(r.error.message || 'Upload failed');
    return { url: r.data.ufsUrl || r.data.url, key: r.data.key };
  });
}

// Delete files from UploadThing so storage space is freed (called whenever an
// image is replaced/removed or its product/category is deleted).
export async function deleteKeys(keys) {
  const ks = (keys || []).filter(Boolean);
  if (!ks.length) return;
  try {
    await getUT().deleteFiles(ks);
  } catch (e) {
    console.error('UploadThing delete failed:', e.message);
  }
}

/**
 * Which of these UploadThing keys are STILL used somewhere? A picture can be shared: a product a
 * seller imported from Product Treasury points at the treasury item's picture (same key), and so
 * do the copies of every other seller who imported it. Deleting such a key would break the
 * treasury item and all those stores. Checked: products, treasury products, categories, store
 * logos / banners and chat attachments. If the check itself fails, every key counts as used
 * (nothing is deleted — a file left behind costs a little space; a deleted one is lost).
 */
export async function keysStillUsed(keys) {
  const list = [...new Set((keys || []).filter((k) => typeof k === 'string' && k.trim()))];
  const used = new Set();
  if (!list.length) return used;
  const db = mongoose.connection?.db;
  if (!db || mongoose.connection.readyState !== 1) return new Set(list);
  try {
    for (const [col, field] of [['products', 'images.key'], ['treasuryproducts', 'images.key'], ['categories', 'image.key']]) {
      for (const k of await db.collection(col).distinct(field, { [field]: { $in: list } })) used.add(k);
    }
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const left = () => list.filter((k) => !used.has(k));
    const urlChecks = [
      ['products', ['image', 'images.url']],
      ['treasuryproducts', ['image', 'images.url']],
      ['categories', ['image.url']],
      ['sellers', ['logo', 'banner']],
      ['messages', ['attachment']],
    ];
    for (let i = 0; i < left().length; i += 40) {
      const chunk = left().slice(i, i + 40);
      if (!chunk.length) break;
      const re = new RegExp(chunk.map(esc).join('|'));
      for (const [col, fields] of urlChecks) {
        const proj = Object.fromEntries(fields.map((f) => [f, 1]));
        const docs = await db.collection(col).find({ $or: fields.map((f) => ({ [f]: re })) }, { projection: proj }).toArray();
        const text = JSON.stringify(docs);
        for (const k of chunk) if (text.includes(k)) used.add(k);
      }
    }
    return used;
  } catch (e) {
    console.error('[uploads] could not check whether files are still used — nothing deleted:', e.message);
    return new Set(list);
  }
}

/**
 * Free the storage of pictures that NOTHING uses any more. Call it AFTER the record that used
 * them was deleted / saved without them. Never throws.
 * @returns {{ freed: number, kept: number }}
 */
export async function deleteUnusedKeys(keys) {
  const list = [...new Set((keys || []).filter(Boolean))];
  if (!list.length || !process.env.UPLOADTHING_TOKEN) return { freed: 0, kept: list.length };
  const used = await keysStillUsed(list);
  const free = list.filter((k) => !used.has(k));
  await deleteKeys(free);
  return { freed: free.length, kept: list.length - free.length };
}

/** UploadThing keys behind a list of picture URLs (logo, banner, …). Other links give nothing. */
export const keysOfUrls = (urls) =>
  (urls || []).map((u) => attachmentLocation(u)).filter((l) => l?.kind === 'uploadthing').map((l) => l.key);

// helper: keys that were in `before` images but are gone from `after`
export function removedKeys(before = [], after = []) {
  const afterKeys = new Set((after || []).map((i) => i.key).filter(Boolean));
  return (before || []).map((i) => i.key).filter((k) => k && !afterKeys.has(k));
}

// ------------------------------------------------------------------
// Chat attachments: a message only stores the file's URL, so the storage key
// is worked out from the URL when the message (or the whole chat) is deleted.
// ------------------------------------------------------------------
const __dir = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_UPLOAD_DIRS = [path.resolve(__dir, '../uploads'), path.resolve(__dir, '../../uploads')];

/**
 * Where does this attachment live?
 *   { kind: 'uploadthing', key }  https://utfs.io/f/<key>  |  https://<app>.ufs.sh/f/<key>
 *   { kind: 'local', key }        /uploads/<file> (fallback storage on the server disk)
 *   null                          anything else (data: URLs, outside links) — nothing to delete
 */
export function attachmentLocation(url) {
  if (!url || typeof url !== 'string') return null;
  const raw = url.trim();
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return null;

  let pathname = raw;
  let host = '';
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      pathname = u.pathname;
      host = u.hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  const isUploadThing = host === 'utfs.io' || host.endsWith('.ufs.sh') || host === 'uploadthing.com' || host.endsWith('.uploadthing.com');
  if (isUploadThing) {
    const parts = pathname.split('/').filter(Boolean); // f/<key>  or  a/<appId>/<key>
    const key = (parts[0] === 'f' || parts[0] === 'a') && parts.length >= 2 ? decodeURIComponent(parts[parts.length - 1]) : '';
    return key ? { kind: 'uploadthing', key } : null;
  }

  const m = pathname.match(/^\/(?:api\/)?uploads\/([^/?#]+)$/);
  if (m) {
    const key = path.basename(decodeURIComponent(m[1]));
    if (key && key !== '.' && key !== '..') return { kind: 'local', key };
  }
  return null;
}

/**
 * Is this a file stored by this app (UploadThing, or /uploads on this server)? Chat attachments
 * from guests, customers and sellers must be: any other link (a look-alike login page, a tracking
 * address) would otherwise open inside the admin's chat as if it were a document.
 */
export function isStoredUpload(url) {
  if (!url || typeof url !== 'string') return false;
  const raw = url.trim();
  if (/^\/(?:api\/)?uploads\/[A-Za-z0-9._-]+$/.test(raw)) return true;
  if (!/^https:\/\//i.test(raw)) return false;
  return attachmentLocation(raw)?.kind === 'uploadthing';
}

/**
 * Delete the files behind a list of chat attachment URLs so the storage space is really freed.
 * Never throws: a chat must still clear even if the storage service is having a bad moment.
 * @returns {{ requested: number, deleted: number, failed: number, error: string }}
 */
export async function deleteAttachmentFiles(urls) {
  const result = { requested: 0, deleted: 0, failed: 0, error: '' };
  const utKeys = new Set();
  const localKeys = new Set();
  for (const url of urls || []) {
    const loc = attachmentLocation(url);
    if (!loc) continue;
    if (loc.kind === 'uploadthing') utKeys.add(loc.key);
    else localKeys.add(loc.key);
  }
  result.requested = utKeys.size + localKeys.size;

  for (const key of localKeys) {
    let removed = false;
    for (const dir of LOCAL_UPLOAD_DIRS) {
      const file = path.join(dir, key);
      try {
        if (file.startsWith(dir + path.sep) && fs.existsSync(file)) {
          fs.unlinkSync(file);
          removed = true;
        }
      } catch (e) {
        result.error = e.message;
      }
    }
    // Not on this disk any more (e.g. after a redeploy) counts as gone, not as a failure
    if (removed || !result.error) result.deleted += 1;
    else result.failed += 1;
  }

  const keys = [...utKeys];
  for (let i = 0; i < keys.length; i += 100) {
    const batch = keys.slice(i, i + 100);
    try {
      const res = await getUT().deleteFiles(batch);
      if (res && res.success === false) throw new Error('UploadThing did not confirm the delete');
      result.deleted += batch.length;
    } catch (e) {
      result.failed += batch.length;
      result.error = e.message || 'UploadThing delete failed';
      console.error('UploadThing chat attachment delete failed:', result.error);
    }
  }
  return result;
}
