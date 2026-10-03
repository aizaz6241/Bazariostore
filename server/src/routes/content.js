import { Router } from 'express';
import { getSetting, setSetting } from '../models/System.js';
import { authAdmin } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

const router = Router();

let contentCache = null;
let contentCacheTime = 0;
const CONTENT_CACHE_TTL = 10 * 60 * 1000; // 10 minutes cache

// public — editable site content (texts, hero slides, footer, policies...)
router.get('/', async (req, res) => {
  try {
    const now = Date.now();
    if (contentCache && now - contentCacheTime < CONTENT_CACHE_TTL) {
      res.set('Cache-Control', 'public, max-age=180, stale-while-revalidate=600');
      return res.json(contentCache);
    }
    const content = (await getSetting('siteContent', {})) || {};
    contentCache = content;
    contentCacheTime = now;
    res.set('Cache-Control', 'public, max-age=180, stale-while-revalidate=600');
    res.json(content);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/', authAdmin('content'), async (req, res) => {
  const value = req.body || {};
  contentCache = null;
  contentCacheTime = 0;
  await setSetting('siteContent', value);
  await audit(req, 'content_updated', 'content', 'siteContent', { sections: Object.keys(value) });
  res.json(value);
});

export default router;
