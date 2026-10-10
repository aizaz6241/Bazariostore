import { Router } from 'express';
import PushSub from '../models/PushSub.js';
import { authAdmin, authSeller } from '../middleware/auth.js';
import { vapidPublicKey } from '../utils/push.js';

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
router.post('/unsubscribe', async (req, res) => {
  const endpoint = req.body?.endpoint;
  if (endpoint) await PushSub.deleteOne({ endpoint: String(endpoint) });
  res.json({ ok: true });
});

export default router;
