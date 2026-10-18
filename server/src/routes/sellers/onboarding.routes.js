import express from 'express';
import Seller from '../../models/Seller.js';
import Product from '../../models/Product.js';
import Withdrawal from '../../models/Withdrawal.js';
import { authSeller } from '../../middleware/auth.js';

const router = express.Router();

export const TOUR_IDS = ['welcome', 'products', 'orders', 'wallet', 'support'];
const NEW_STORE_DAYS = 30;

// GET /api/sellers/onboarding — the store's getting-started checklist (worked out from its real
// data, so every item ticks itself) and which guided tours it has finished
router.get('/onboarding', authSeller, async (req, res) => {
  try {
    const id = req.seller.id;
    const seller = await Seller.findById(id).select('status createdAt withdrawalMethods logo description onboarding').lean();
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const [hasProduct, hasDeposit, hasConfirmedOrder] = await Promise.all([
      Product.exists({ seller: id }),
      Withdrawal.exists({ seller: id, type: 'deposit', status: { $in: ['approved', 'completed'] } }),
      // confirming an order locks its amount from the wallet: that line proves a confirmed order
      Withdrawal.exists({ seller: id, type: 'order_processing_lock' }),
    ]);
    const wm = seller.withdrawalMethods || {};
    const hasPayout = Object.values(wm).some((m) => m && m.enabled);

    const steps = [
      { key: 'approved', label: 'Your store is approved', done: seller.status !== 'pending_approval' },
      { key: 'product', label: 'Add your first product', done: Boolean(hasProduct), tour: 'products', path: '/seller/treasury' },
      { key: 'profile', label: 'Complete your store profile', done: Boolean(seller.logo || (seller.description || '').trim()), path: '/seller/settings' },
      { key: 'payout', label: 'Add a payout method', done: hasPayout, tour: 'support', path: '/seller/settings' },
      { key: 'deposit', label: 'Make your first deposit', done: Boolean(hasDeposit), tour: 'wallet', path: '/seller/wallet' },
      { key: 'order', label: 'Confirm your first order', done: Boolean(hasConfirmedOrder), tour: 'orders', path: '/seller/orders' },
    ];
    const ageDays = (Date.now() - new Date(seller.createdAt || Date.now()).getTime()) / 86400000;
    const ob = seller.onboarding || {};

    res.json({
      steps,
      doneCount: steps.filter((s) => s.done).length,
      toursDone: ob.toursDone || [],
      welcomeSeen: Boolean(ob.welcomeSeen),
      checklistHidden: Boolean(ob.checklistHidden),
      // the welcome box is for new stores only (a store that is older and already took orders
      // is not interrupted; it can still open any tour from the Help button)
      isNewStore: ageDays <= NEW_STORE_DAYS || !hasConfirmedOrder,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/onboarding { tourDone?, welcomeSeen?, checklistHidden? }
router.post('/onboarding', authSeller, async (req, res) => {
  try {
    const b = req.body || {};
    const set = {};
    const update = {};
    if (b.welcomeSeen !== undefined) set['onboarding.welcomeSeen'] = Boolean(b.welcomeSeen);
    if (b.checklistHidden !== undefined) set['onboarding.checklistHidden'] = Boolean(b.checklistHidden);
    if (Object.keys(set).length) update.$set = set;
    if (b.tourDone !== undefined) {
      if (!TOUR_IDS.includes(b.tourDone)) return res.status(400).json({ message: 'Unknown tour' });
      update.$addToSet = { 'onboarding.toursDone': b.tourDone };
    }
    if (!Object.keys(update).length) return res.status(400).json({ message: 'Nothing to save' });
    const s = await Seller.findByIdAndUpdate(req.seller.id, update, { new: true }).select('onboarding').lean();
    if (!s) return res.status(404).json({ message: 'Seller not found' });
    res.json({ ok: true, onboarding: s.onboarding });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
