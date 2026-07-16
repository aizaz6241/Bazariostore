import { Router } from 'express';
import { getSetting, setSetting } from '../models/System.js';
import { authAdmin } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

const router = Router();

// public — editable site content (texts, hero slides, footer, policies...)
router.get('/', async (req, res) => {
  res.json((await getSetting('siteContent', {})) || {});
});

router.put('/', authAdmin('content'), async (req, res) => {
  const value = req.body || {};
  await setSetting('siteContent', value);
  await audit(req, 'content_updated', 'content', 'siteContent', { sections: Object.keys(value) });
  res.json(value);
});

export default router;
