import { Router } from 'express';
import multer from 'multer';
import { authAdmin } from '../middleware/auth.js';
import { uploadBuffers, deleteKeys } from '../services/uploads.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 8 } });

// POST /api/uploads — multipart "files" -> [{ url, key }] (stored on UploadThing)
router.post('/', authAdmin(), upload.array('files', 8), async (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ message: 'No files received' });
    const bad = req.files.find((f) => !f.mimetype?.startsWith('image/'));
    if (bad) return res.status(400).json({ message: 'Only image files are allowed' });
    const uploaded = await uploadBuffers(req.files);
    res.json(uploaded);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// DELETE /api/uploads/:key — frees the file on UploadThing
router.delete('/:key', authAdmin(), async (req, res) => {
  await deleteKeys([req.params.key]);
  res.json({ ok: true });
});

export default router;
