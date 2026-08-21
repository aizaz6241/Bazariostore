import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authSellerOrAdmin } from '../middleware/auth.js';
import { uploadBuffers, deleteKeys } from '../services/uploads.js';

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

// Helper: detect file type (image vs pdf vs file)
function detectType(mimetype, filename = '') {
  if (mimetype?.startsWith('image/')) return 'image';
  if (mimetype === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) return 'pdf';
  return 'file';
}

// POST /api/uploads — Upload images and PDF files (For Chat, Products, KYC, etc.)
router.post('/', authSellerOrAdmin, upload.array('files', 5), async (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ message: 'No files uploaded' });

    // Validate allowed mimetypes
    const allowed = req.files.every((f) => {
      const isImg = f.mimetype?.startsWith('image/');
      const isPdf = f.mimetype === 'application/pdf' || f.originalname?.toLowerCase().endsWith('.pdf');
      return isImg || isPdf;
    });

    if (!allowed) {
      return res.status(400).json({ message: 'Only Image files (PNG, JPG, WEBP) and PDF documents are allowed' });
    }

    let results = [];

    // Attempt UploadThing first if token configured
    if (process.env.UPLOADTHING_TOKEN) {
      try {
        const utResults = await uploadBuffers(req.files);
        results = utResults.map((r, i) => ({
          url: r.url,
          key: r.key,
          name: req.files[i].originalname,
          type: detectType(req.files[i].mimetype, req.files[i].originalname),
          size: req.files[i].size,
        }));
      } catch (utErr) {
        console.warn('UploadThing upload failed, falling back to local storage:', utErr.message);
      }
    }

    // Fallback: save to local disk if UploadThing was skipped or failed
    if (!results.length) {
      for (const f of req.files) {
        const ext = path.extname(f.originalname) || (f.mimetype === 'application/pdf' ? '.pdf' : '.png');
        const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;
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
          type: detectType(f.mimetype, f.originalname),
          size: f.size,
        });
      }
    }

    res.json(results);
  } catch (err) {
    console.error('Upload handler error:', err);
    res.status(500).json({ message: err.message || 'File upload failed' });
  }
});

// DELETE /api/uploads/:key — frees file
router.delete('/:key', authSellerOrAdmin, async (req, res) => {
  try {
    const key = req.params.key;
    if (process.env.UPLOADTHING_TOKEN) {
      await deleteKeys([key]);
    }
    const localFile1 = path.join(serverUploadsDir, key);
    const localFile2 = path.join(rootUploadsDir, key);
    if (fs.existsSync(localFile1)) fs.unlinkSync(localFile1);
    if (fs.existsSync(localFile2)) fs.unlinkSync(localFile2);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

export default router;
