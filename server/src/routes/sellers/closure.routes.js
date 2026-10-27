import express from 'express';
import { authSeller, authAdmin } from '../../middleware/auth.js';
import { audit } from '../../utils/audit.js';
import { asText } from '../../middleware/sanitize.js';
import { markShortcutDone } from '../../utils/chatShortcuts.js';
import { closureOverview, applyForClosure, cancelClosure, adminClosureList, adminClosureAction } from '../../utils/storeClosure.js';

/**
 * STORE CLOSURE (utils/storeClosure.js)
 *   GET  /api/sellers/store-closure             the store: requirements, its request, review progress
 *   POST /api/sellers/store-closure/apply       the store asks to close  { reason }
 *   POST /api/sellers/store-closure/cancel      the store withdraws its request (during the review)
 *   GET  /api/sellers/closures?status=          admin: closure requests (Applications → Store closures)
 *   POST /api/sellers/closures/:id/:action      admin: reject | close | reopen  { note }
 */
const router = express.Router();
const fail = (res, e) => res.status(e.status || 500).json({ message: e.message });
const myId = (req) => (req.admin ? '' : String(req.seller?.id || req.seller?._id || ''));

router.get('/store-closure', authSeller, async (req, res) => {
  try {
    const data = await closureOverview(myId(req));
    if (!data) return res.status(404).json({ message: 'Store not found' });
    res.json(data);
  } catch (e) {
    fail(res, e);
  }
});

router.post('/store-closure/apply', authSeller, async (req, res) => {
  try {
    if (req.admin) return res.status(403).json({ message: 'Only the store itself can ask to close.' });
    const data = await applyForClosure(myId(req), asText(req.body?.reason, 500));
    markShortcutDone(myId(req), { key: 'closeStore' }, 'Closing request sent');
    res.json(data);
  } catch (e) {
    fail(res, e);
  }
});

router.post('/store-closure/cancel', authSeller, async (req, res) => {
  try {
    if (req.admin) return res.status(403).json({ message: 'Only the store itself can withdraw its request.' });
    res.json(await cancelClosure(myId(req)));
  } catch (e) {
    fail(res, e);
  }
});

router.get('/closures', authAdmin('sellers'), async (req, res) => {
  try {
    res.json(await adminClosureList({ status: asText(req.query.status, 20) || 'all' }));
  } catch (e) {
    fail(res, e);
  }
});

router.post('/closures/:id/:action', authAdmin('sellers'), async (req, res) => {
  try {
    const action = ['reject', 'close', 'reopen'].includes(req.params.action) ? req.params.action : '';
    if (!action) return res.status(404).json({ message: 'Unknown action' });
    const note = asText(req.body?.note, 300);
    const row = await adminClosureAction(req.params.id, action, req.admin, note);
    audit(req, 'update', 'store_closure', req.params.id, `Store closure ${action} for ${row?.storeName || req.params.id}${note ? `: ${note}` : ''}`);
    res.json({ ok: true, row });
  } catch (e) {
    fail(res, e);
  }
});

export default router;
