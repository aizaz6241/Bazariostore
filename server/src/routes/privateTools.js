import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { authAdmin } from '../middleware/auth.js';

/**
 * PRIVATE TOOLS — admin-only tools kept OFF the public website.
 *   GET /api/private-tools/create-print   → { files: { "index.html": "...", "app.js": "...", ... } }
 *
 * The tool's files live in server/src/private-tools/create-print/ and are never served as public
 * static files: only a logged-in admin gets them, and the admin panel runs them inside a locked
 * (sandboxed) frame so the tool cannot touch the admin login.
 * To update the tool: replace the files in that folder (or run server/scripts/sync-create-print.mjs).
 */
const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = path.join(__dirname, '..', 'private-tools', 'create-print');
const ALLOWED = /\.(html|js|css)$/i;

let cache = null; // { files, at }

async function loadFiles() {
  if (cache && process.env.NODE_ENV === 'production') return cache.files;
  const names = (await fs.readdir(TOOL_DIR)).filter((n) => ALLOWED.test(n));
  const files = {};
  for (const n of names) files[n] = await fs.readFile(path.join(TOOL_DIR, n), 'utf8');
  cache = { files, at: Date.now() };
  return files;
}

router.get('/create-print', authAdmin(), async (req, res) => {
  try {
    const files = await loadFiles();
    if (!files['index.html']) return res.status(404).json({ message: 'Tool files not found on the server.' });
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.json({ files });
  } catch (err) {
    console.error('[private-tools] could not load create-print:', err?.message || err);
    res.status(500).json({ message: 'Could not load the tool right now.' });
  }
});

export default router;
