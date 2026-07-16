import { Router } from 'express';
import { Conversation, Message } from '../models/Chat.js';
import { authAdmin } from '../middleware/auth.js';

const router = Router();

export function displayName(c) {
  if (c.name?.trim()) return c.name.trim();
  return c.guestNumber ? `Guest #${c.guestNumber}` : 'Guest';
}

// customer thread
router.get('/messages/:guestId', async (req, res) => {
  const messages = await Message.find({ guestId: req.params.guestId }).sort({ createdAt: 1 }).limit(200);
  res.json(messages);
});

router.post('/read/:guestId', async (req, res) => {
  await Conversation.updateOne({ guestId: req.params.guestId }, { $set: { unreadForCustomer: 0 } });
  res.json({ ok: true });
});

// --- admin ---
router.get('/conversations', authAdmin('chat'), async (req, res) => {
  const convos = await Conversation.find({ lastMessage: { $exists: true, $ne: '' } }).sort({ lastAt: -1 }).limit(100);
  res.json(
    convos.map((c) => ({
      ...c.toObject(),
      displayName: displayName(c),
    }))
  );
});

router.get('/conversations/:guestId/messages', authAdmin('chat'), async (req, res) => {
  const messages = await Message.find({ guestId: req.params.guestId }).sort({ createdAt: 1 }).limit(300);
  res.json(messages);
});

router.post('/conversations/:guestId/read', authAdmin('chat'), async (req, res) => {
  await Conversation.updateOne({ guestId: req.params.guestId }, { $set: { unreadForAdmin: 0 } });
  res.json({ ok: true });
});

export default router;
