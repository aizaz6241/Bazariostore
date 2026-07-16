import { Router } from 'express';
import { getSetting, setSetting } from '../models/System.js';
import { authAdmin } from '../middleware/auth.js';
import { publicPaymentMethods, getPaymentConfig, PAYMENT_METHODS } from '../services/payments.js';
import { audit } from '../utils/audit.js';

const router = Router();

// public — payment methods for checkout UI
router.get('/payments/methods', async (req, res) => {
  res.json(await publicPaymentMethods());
});

// admin — full settings
router.get('/admin', authAdmin('settings'), async (req, res) => {
  res.json({
    payments: await getPaymentConfig(),
    paymentMeta: PAYMENT_METHODS,
    store: (await getSetting('store', { taxRate: 0, lowStockThreshold: 5 })) || {},
  });
});

router.put('/admin', authAdmin('settings'), async (req, res) => {
  const { payments, store } = req.body || {};
  if (payments) await setSetting('payments', payments);
  if (store) await setSetting('store', store);
  await audit(req, 'settings_updated', 'settings', '', { updated: Object.keys(req.body || {}) });
  res.json({ ok: true });
});

export default router;
