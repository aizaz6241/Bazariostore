import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authSellerOrAdmin } from '../middleware/auth.js';
import { uploadBuffers, deleteKeys } from '../services/uploads.js';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { limit } from '../utils/rateLimit.js';

const router = Router();

const serverUploadsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads');
const rootUploadsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');
try { if (!fs.existsSync(serverUploadsDir)) fs.mkdirSync(serverUploadsDir, { recursive: true }); } catch {}
try { if (!fs.existsSync(rootUploadsDir)) fs.mkdirSync(rootUploadsDir, { recursive: true }); } catch {}

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 5 }, // 15 MB
});

// ----------------------------------------------------------------------------------------
// What a file really IS is read from its first bytes, never from the name or the type the
// browser claims. Only real pictures (JPEG, PNG, GIF, WEBP, BMP, AVIF / HEIC) and PDFs pass.
// An HTML page or an SVG (both can carry scripts) renamed to ".png", or sent with a fake
// "image/..." type, is refused.
// ----------------------------------------------------------------------------------------
function sniff(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const b = buffer;
  const ascii = (from, to) => b.subarray(from, to).toString('latin1');
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: 'image', mime: 'image/jpeg', ext: '.jpg' };
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return { type: 'image', mime: 'image/png', ext: '.png' };
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return { type: 'image', mime: 'image/gif', ext: '.gif' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { type: 'image', mime: 'image/webp', ext: '.webp' };
  if (ascii(0, 2) === 'BM' && b.readUInt32LE(2) === b.length) return { type: 'image', mime: 'image/bmp', ext: '.bmp' };
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (['avif', 'avis'].includes(brand)) return { type: 'image', mime: 'image/avif', ext: '.avif' };
    if (['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(brand)) return { type: 'image', mime: 'image/heic', ext: '.heic' };
  }
  // "%PDF-" within the first kilobyte (some PDFs start with a few stray bytes)
  if (b.subarray(0, 1024).includes(Buffer.from('%PDF-'))) return { type: 'pdf', mime: 'application/pdf', ext: '.pdf' };
  return null;
}

const safeName = (name, ext) => {
  const base = path
    .basename(String(name || 'file'))
    .replace(/\.[^.]*$/, '')
    .replace(/[^A-Za-z0-9 _.-]/g, '')
    .trim()
    .slice(0, 80);
  return `${base || 'file'}${ext}`;
};

// Files uploaded during the last hours, and by whom: lets a seller remove a file they have just
// uploaded (before it is attached to anything) without being able to remove anyone else's.
const recentUploads = new Map(); // key -> { owner, at }
const RECENT_MS = 6 * 60 * 60 * 1000;
const rememberUpload = (key, owner) => {
  if (!key) return;
  recentUploads.set(String(key), { owner, at: Date.now() });
  if (recentUploads.size > 5000) {
    const cut = Date.now() - RECENT_MS;
    for (const [k, v] of recentUploads) if (v.at < cut) recentUploads.delete(k);
  }
};
const ownerOf = (req) => (req.admin ? `admin:${req.admin.id}` : `seller:${req.seller?.id}`);

const uploadLimit = limit({ name: 'uploads', max: 60, windowMs: 10 * 60 * 1000, message: 'Too many uploads. Please wait a few minutes.' });

// POST /api/uploads — Upload images and PDF files (For Chat, Products, KYC, etc.)
router.post('/', authSellerOrAdmin, uploadLimit, upload.array('files', 5), async (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ message: 'No files uploaded' });

    // Validate by content
    const kinds = req.files.map((f) => sniff(f.buffer));
    if (kinds.some((k) => !k)) {
      return res.status(400).json({ message: 'Only Image files (PNG, JPG, WEBP, GIF) and PDF documents are allowed' });
    }
    // from here on the name and the type are ours, not the uploader's
    req.files.forEach((f, i) => {
      f.originalname = safeName(f.originalname, kinds[i].ext);
      f.mimetype = kinds[i].mime;
    });

    let results = [];

    // Attempt UploadThing first if token configured
    if (process.env.UPLOADTHING_TOKEN) {
      try {
        const utResults = await uploadBuffers(req.files);
        results = utResults.map((r, i) => ({
          url: r.url,
          key: r.key,
          name: req.files[i].originalname,
          type: kinds[i].type,
          size: req.files[i].size,
        }));
      } catch (utErr) {
        console.warn('UploadThing upload failed, falling back to local storage:', utErr.message);
      }
    }

    // Fallback: save to local disk if UploadThing was skipped or failed
    if (!results.length) {
      for (let i = 0; i < req.files.length; i += 1) {
        const f = req.files[i];
        const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${kinds[i].ext}`;
        try {
          fs.writeFileSync(path.join(serverUploadsDir, filename), f.buffer);
          fs.writeFileSync(path.join(rootUploadsDir, filename), f.buffer);
        } catch (e) {
          console.error('Error writing local upload:', e);
        }

        results.push({
          url: `/uploads/${filename}`,
          key: filename,
          name: f.originalname,
          type: kinds[i].type,
          size: f.size,
        });
      }
    }

    const owner = ownerOf(req);
    results.forEach((r) => rememberUpload(r.key, owner));

    res.json(results);
  } catch (err) {
    console.error('Upload handler error:', err);
    res.status(500).json({ message: 'File upload failed' });
  }
});

/** May this seller remove this file? Only their own: just uploaded by them, or used by their own records. */
async function sellerOwnsKey(sellerId, key) {
  const recent = recentUploads.get(key);
  if (recent && recent.owner === `seller:${sellerId}` && Date.now() - recent.at < RECENT_MS) return true;
  if (!mongoose.Types.ObjectId.isValid(String(sellerId))) return false;
  const sid = new mongoose.Types.ObjectId(String(sellerId));
  const inUrl = { $regex: key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') };
  const db = mongoose.connection;
  if (await db.collection('products').findOne({ seller: sid, $or: [{ 'images.key': key }, { image: inUrl }] }, { projection: { _id: 1 } })) return true;
  if (await db.collection('messages').findOne({ seller: sid, sender: 'seller', attachment: inUrl }, { projection: { _id: 1 } })) return true;
  if (await db.collection('sellers').findOne({ _id: sid, $or: [{ logo: inUrl }, { banner: inUrl }] }, { projection: { _id: 1 } })) return true;
  return false;
}

// DELETE /api/uploads/:key — frees file
router.delete('/:key', authSellerOrAdmin, async (req, res) => {
  try {
    const rawKey = req.params.key || '';
    const safeKey = path.basename(rawKey);
    if (!safeKey || safeKey === '.' || safeKey === '..' || safeKey.length < 6 || !/^[A-Za-z0-9._-]+$/.test(safeKey)) {
      return res.status(400).json({ message: 'Invalid file key' });
    }

    // An admin may remove any file. A seller only their own (before, any seller could remove
    // anybody's picture just by knowing or guessing its key).
    if (!req.admin && !(await sellerOwnsKey(req.seller?.id, safeKey))) {
      return res.status(403).json({ message: 'You can only remove your own files' });
    }

    if (process.env.UPLOADTHING_TOKEN) {
      await deleteKeys([safeKey]);
    }
    const localFile1 = path.join(serverUploadsDir, safeKey);
    const localFile2 = path.join(rootUploadsDir, safeKey);

    // Boundary check: ensure resolved path starts with uploads directory
    if (localFile1.startsWith(serverUploadsDir) && fs.existsSync(localFile1)) {
      fs.unlinkSync(localFile1);
    }
    if (localFile2.startsWith(rootUploadsDir) && fs.existsSync(localFile2)) {
      fs.unlinkSync(localFile2);
    }
    recentUploads.delete(safeKey);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Could not remove the file' });
  }
});

export default router;
