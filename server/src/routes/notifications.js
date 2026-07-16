import { Router } from 'express';
import Notification from '../models/Notification.js';
import { authAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', authAdmin(), async (req, res) => {
  const [items, unread] = await Promise.all([
    Notification.find().sort({ createdAt: -1 }).limit(50),
    Notification.countDocuments({ read: false }),
  ]);
  res.json({ items, unread });
});

router.post('/:id/read', authAdmin(), async (req, res) => {
  await Notification.updateOne({ _id: req.params.id }, { $set: { read: true } });
  res.json({ ok: true });
});

router.post('/read-all', authAdmin(), async (req, res) => {
  await Notification.updateMany({ read: false }, { $set: { read: true } });
  res.json({ ok: true });
});

export default router;
