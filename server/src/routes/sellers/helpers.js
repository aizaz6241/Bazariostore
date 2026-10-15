import mongoose from 'mongoose';
import Seller from '../../models/Seller.js';

export function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}

export function calculateHealthStatus(score) {
  const s = Number(score) || 0;
  if (s >= 80) return 'healthy';
  if (s >= 31) return 'at_risk';
  if (s > 20) return 'critical_risk';
  return 'suspended';
}

/**
 * A FROZEN store can log in and LOOK (dashboard, orders, wallet) and use the support chat, but
 * cannot do anything: no order confirming / processing, no deposits or withdrawals, no product /
 * coupon / shipping / store-settings changes, no Treasury imports, no refund decisions.
 * (A suspended store is stopped even earlier, by the login check.) An admin acting for the store passes.
 */
export function blockWhenFrozen(what) {
  return async (req, res, next) => {
    if (req.admin) return next();
    try {
      const id = String(req.seller?.id || req.seller?._id || '');
      const s = mongoose.Types.ObjectId.isValid(id) ? await Seller.findById(id).select('status freezeReason').lean() : null;
      if (s?.status === 'frozen' || s?.status === 'suspended') {
        return res.status(403).json({
          frozen: true,
          message: `Your store is ${s.status}, so ${what} is not possible. Reason: ${s.freezeReason || 'compliance review'}. Please contact support to resolve it.`,
        });
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}
