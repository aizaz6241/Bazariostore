import ReferralCode from '../models/ReferralCode.js';
import { getSetting } from '../models/System.js';

/**
 * Affiliate (referral) codes, one place for the rules:
 *  - a code is stored and compared in CAPITALS, without spaces
 *  - 3 to 32 characters: letters, digits, "-" and "_" (must start with a letter or digit)
 *  - a seller can only register with the master code or an ACTIVE custom code
 */
export const DEFAULT_MASTER_CODE = 'REF-BAZARIO-2026';
export const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

export function normalizeCode(v) {
  return typeof v === 'string' ? v.replace(/\s+/g, '').toUpperCase() : '';
}

export function codeFormatError(code) {
  if (!code) return 'Security code is required';
  if (!CODE_RE.test(code)) return 'Security code must be 3-32 characters: letters, numbers, "-" or "_" only';
  return '';
}

export async function getMasterCode() {
  const saved = (await getSetting('master_affiliate_code')) || (await getSetting('master_referral_code', DEFAULT_MASTER_CODE));
  return normalizeCode(saved) || DEFAULT_MASTER_CODE;
}

/**
 * Is this a code a seller may use? Returns
 *   { ok: true, code, kind: 'master' | 'custom', record }   or
 *   { ok: false, code, reason: 'format' | 'not_found' | 'inactive', message }
 */
export async function resolveAffiliateCode(raw) {
  const code = normalizeCode(raw);
  if (!code || !CODE_RE.test(code)) {
    return { ok: false, code, reason: 'format', message: 'This security code is not valid. Please check it, or leave the field empty.' };
  }
  if (code === (await getMasterCode())) return { ok: true, code, kind: 'master', record: null };
  const record = await ReferralCode.findOne({ code }).lean();
  if (!record) {
    return { ok: false, code, reason: 'not_found', message: `Security code "${code}" does not exist. Please check it, or leave the field empty.` };
  }
  if (record.status !== 'active') {
    return { ok: false, code, reason: 'inactive', message: `Security code "${code}" is no longer active. Please use another code, or leave the field empty.` };
  }
  return { ok: true, code, kind: 'custom', record };
}

/**
 * Sellers per code (case-insensitive, spaces ignored), split by where they are now.
 * One aggregate instead of one count per code. Returns Map(code -> { total, active, pending, rejected, other, last }).
 */
export async function usageByCode(Seller) {
  const rows = await Seller.aggregate([
    { $project: { status: 1, registrationRejectedAt: 1, createdAt: 1, code: { $toUpper: { $trim: { input: { $ifNull: ['$securityDeposit.referralCode', ''] } } } } } },
    { $match: { code: { $ne: '' } } },
    {
      $group: {
        _id: '$code',
        total: { $sum: 1 },
        // approved = the registration was approved, whatever the store's state now (a store frozen
        // or suspended later used to drop out of this count into "other")
        active: {
          $sum: {
            $cond: [
              { $and: [{ $in: ['$status', ['active', 'frozen', 'suspended']] }, { $not: [{ $ifNull: ['$registrationRejectedAt', false] }] }] },
              1,
              0,
            ],
          },
        },
        rejected: { $sum: { $cond: [{ $and: [{ $ne: ['$status', 'active'] }, { $ifNull: ['$registrationRejectedAt', false] }] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'pending_approval'] }, { $not: [{ $ifNull: ['$registrationRejectedAt', false] }] }] }, 1, 0] } },
        last: { $max: '$createdAt' },
      },
    },
  ]);
  const map = new Map();
  for (const r of rows) {
    const code = normalizeCode(r._id);
    const prev = map.get(code) || { total: 0, active: 0, pending: 0, rejected: 0, other: 0, last: null };
    prev.total += r.total;
    prev.active += r.active;
    prev.pending += r.pending;
    prev.rejected += r.rejected;
    prev.other = prev.total - prev.active - prev.pending - prev.rejected;
    if (!prev.last || (r.last && r.last > prev.last)) prev.last = r.last;
    map.set(code, prev);
  }
  return map;
}
