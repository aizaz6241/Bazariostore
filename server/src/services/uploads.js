import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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
