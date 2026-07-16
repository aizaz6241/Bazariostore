import { Router } from 'express';
import AuditLog from '../models/AuditLog.js';
import { authAdmin } from '../middleware/auth.js';

const router = Router();

// GET /api/audit?q=&action=&limit=
router.get('/', authAdmin('audit'), async (req, res) => {
  const { q, action } = req.query;
  const filter = {};
  if (action) filter.action = action;
  if (q?.trim()) {
    const rx = { $regex: q.trim(), $options: 'i' };
    filter.$or = [{ 'admin.name': rx }, { 'admin.email': rx }, { action: rx }, { entity: rx }, { entityId: rx }];
  }
  const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(Number(req.query.limit) || 200);
  const actions = await AuditLog.distinct('action');
  res.json({ logs, actions });
});

export default router;
