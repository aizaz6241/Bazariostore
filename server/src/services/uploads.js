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
