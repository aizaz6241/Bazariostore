import { Router } from 'express';
import PushSub from '../models/PushSub.js';
import { authAdmin, authSeller } from '../middleware/auth.js';
import { vapidPublicKey, sendSellerTestPush } from '../utils/push.js';

const router = Router();

router.get('/vapid-key', (req, res) => res.json({ key: vapidPublicKey() }));

async function save(req, res, kind) {
  const { subscription, userAgent } = req.body || {};
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({ message: 'Invalid subscription' });
  }
  const set = {
    keys: { p256dh: String(subscription.keys.p256dh), auth: String(subscription.keys.auth) },
    kind,
    admin: kind === 'admin' ? req.admin?._id || req.admin?.id || null : null,
    seller: kind === 'seller' ? req.seller?._id || null : null,
    userAgent: String(userAgent || '').slice(0, 300),
  };
  await PushSub.updateOne({ endpoint: String(subscription.endpoint) }, { $set: set }, { upsert: true });
  res.json({ ok: true });
}

router.post('/admin/subscribe', authAdmin(), (req, res) => save(req, res, 'admin'));
router.post('/seller/subscribe', authSeller, (req, res) => {
  // an admin "viewing as seller" must not receive that seller's pushes
  if (req.admin) return res.json({ ok: true, skipped: true });
  return save(req, res, 'seller');
});
// "Send test notification" from Seller Central: only to the device that asked, at most once per 20 s
const lastTest = new Map();
router.post('/seller/test', authSeller, async (req, res) => {
  if (req.admin) return res.status(400).json({ message: 'Not available while viewing a store as admin.' });
  const id = String(req.seller?._id || '');
  const now = Date.now();
  if (now - (lastTest.get(id) || 0) < 20000) return res.status(429).json({ message: 'Please wait a few seconds and try again.' });
  lastTest.set(id, now);
  if (lastTest.size > 5000) lastTest.clear();
  const r = await sendSellerTestPush(req.seller._id, req.body?.endpoint);
  if (r === 'off') return res.status(503).json({ message: 'Notifications are not available right now. Please try later.' });
  if (r === 'not-found') return res.status(404).json({ message: 'This device is not registered yet. Turn notifications off and on again.' });
  res.json({ ok: true });
});
router.post('/unsubscribe', async (req, res) => {
  const endpoint = req.body?.endpoint;
  if (endpoint) await PushSub.deleteOne({ endpoint: String(endpoint) });
  res.json({ ok: true });
});

export default router;
