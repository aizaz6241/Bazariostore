import express from 'express';
import mongoose from 'mongoose';
import Seller from '../../models/Seller.js';
import { authSeller, authAdmin } from '../../middleware/auth.js';
import { audit } from '../../utils/audit.js';
import { asText } from '../../middleware/sanitize.js';
import {
  addHealthEvent,
  waiveHealthEvent,
  healthOverview,
  getRules,
  saveRules,
  atStake,
  clearCelebration,
  BANDS,
  DEFAULT_RULES,
  MONITOR_NAME,
} from '../../utils/healthEngine.js';

/**
 * ACCOUNT HEALTH (account monitoring) — see utils/healthEngine.js
 *   GET  /api/sellers/health                       the store's own page (every entry as "Bazario Account Monitoring")
 *   GET  /api/sellers/health/at-stake              the store: waiting orders, deadlines, shortfall, what is at stake
 *   POST /api/sellers/health/celebrated            the store: bonus / level celebration seen
 *   GET  /api/sellers/health/rules                 admin: rules, points, days, bands
 *   PUT  /api/sellers/health/rules                 super admin: change points / days
 *   GET  /api/sellers/:id/health/ledger            admin: the store's entries, with who added each and why
 *   POST /api/sellers/:id/health/entries           admin: add an entry (policy / order issue / review)
 *   POST /api/sellers/health/entries/:entryId/waive  admin: remove an entry after review (stays in history)
 */
const router = express.Router();
const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));
const fail = (res, e) => res.status(e.status || 500).json({ message: e.message });

// the store's own page
router.get('/health', authSeller, async (req, res) => {
  try {
    const id = String(req.seller?.id || req.seller?._id || '');
    const data = await healthOverview(id);
    if (!data) return res.status(404).json({ message: 'Store not found' });
    res.json({ ...data, monitor: MONITOR_NAME });
  } catch (e) {
    fail(res, e);
  }
});

// what the store can lose right now (banner on its dashboard and orders page)
router.get('/health/at-stake', authSeller, async (req, res) => {
  try {
    const id = String(req.seller?.id || req.seller?._id || '');
    const data = await atStake(id);
    if (!data) return res.status(404).json({ message: 'Store not found' });
    res.json(data);
  } catch (e) {
    fail(res, e);
  }
});

// the store closed its celebration (bonus / new level)
router.post('/health/celebrated', authSeller, async (req, res) => {
  try {
    await clearCelebration(String(req.seller?.id || req.seller?._id || ''));
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
});

router.get('/health/rules', authAdmin('sellers'), async (req, res) => {
  try {
    const r = await getRules();
    res.json({ rules: r.rules, settings: r.settings, updatedAt: r.updatedAt || null, updatedBy: r.updatedBy || '', bands: BANDS, defaults: DEFAULT_RULES, canEdit: req.admin?.role === 'super_admin' });
  } catch (e) {
    fail(res, e);
  }
});

router.put('/health/rules', authAdmin('sellers'), async (req, res) => {
  try {
    if (req.admin?.role !== 'super_admin') return res.status(403).json({ message: 'Only the Super Admin can change the health rules.' });
    const r = await saveRules(req.body || {}, req.admin);
    audit(req, 'update', 'health_rules', 'rules', 'Changed the account health rules');
    res.json({ ok: true, rules: r.rules, settings: r.settings });
  } catch (e) {
    fail(res, e);
  }
});

router.get('/:id/health/ledger', authAdmin('sellers'), async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ message: 'Store not found' });
    const data = await healthOverview(req.params.id, { admin: true });
    if (!data) return res.status(404).json({ message: 'Store not found' });
    res.json(data);
  } catch (e) {
    fail(res, e);
  }
});

// categories an admin can add (points limited per category)
const CATEGORIES = {
  policy: { min: -40, max: -10 },
  order_issue: { min: -20, max: -5 },
  manual: { min: -30, max: 20 },
};

router.post('/:id/health/entries', authAdmin('sellers'), async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ message: 'Store not found' });
    const category = Object.prototype.hasOwnProperty.call(CATEGORIES, req.body?.category) ? req.body.category : '';
    if (!category) return res.status(400).json({ message: 'Choose what kind of entry this is.' });
    const { rules } = await getRules();
    const lim = CATEGORIES[category];
    const points = Math.round(Number(req.body?.points ?? rules[category]?.points));
    if (!Number.isFinite(points) || points === 0 || points < lim.min || points > lim.max) {
      return res.status(400).json({ message: `Points for this kind of entry must be between ${lim.min} and ${lim.max} (not 0).` });
    }
    const days = Math.round(Number(req.body?.days ?? rules[category]?.days ?? 21));
    if (!Number.isFinite(days) || days < 1 || days > 90) return res.status(400).json({ message: 'Days must be between 1 and 90.' });
    const title = asText(req.body?.title, 160).trim();
    const detail = asText(req.body?.detail, 400).trim();
    const note = asText(req.body?.note, 500).trim();
    if (!note) return res.status(400).json({ message: 'Write the reason (only admins see it).' });

    const seller = await Seller.findById(req.params.id).select('storeName').lean();
    if (!seller) return res.status(404).json({ message: 'Store not found' });
    const out = await addHealthEvent({
      sellerId: req.params.id,
      code: category,
      points,
      days,
      title: title || undefined,
      detail,
      admin: req.admin,
      note,
      notifySeller: req.body?.notifySeller !== false,
      force: true,
    });
    audit(req, 'update', 'seller_health', req.params.id, `Health ${points > 0 ? '+' : ''}${points} for ${seller.storeName} (${category}): ${note}`);
    res.status(201).json({ ok: true, score: out?.score });
  } catch (e) {
    fail(res, e);
  }
});

router.post('/health/entries/:entryId/waive', authAdmin('sellers'), async (req, res) => {
  try {
    const reason = asText(req.body?.reason, 300).trim();
    if (!reason) return res.status(400).json({ message: 'Write why this entry is removed.' });
    const out = await waiveHealthEvent(req.params.entryId, req.admin, reason);
    audit(req, 'update', 'seller_health', String(out.line.seller), `Removed health entry “${out.line.title}” (${out.line.points}): ${reason}`);
    res.json({ ok: true, score: out.score });
  } catch (e) {
    fail(res, e);
  }
});

export default router;
