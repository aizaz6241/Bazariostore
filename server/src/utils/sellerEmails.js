/**
 * SELLER EMAILS — the important moments only (the free Resend plan allows about 100 a day):
 *   registration received · store approved · order confirmation warning (one email per store per
 *   run, all waiting orders together) · store frozen by the 48h/72h rule · frozen / suspended /
 *   active by the team · Diamond upgrade (found by a 2-minute check, see below) · deposit /
 *   withdrawal approved (with the PDF receipt).
 *   Rejected deposits / withdrawals and official warnings go through notify({ email: true }).
 *
 * Every function runs in the background and never throws: a failed email never breaks an order,
 * a deposit or an approval. Test accounts, and stores without an email, get nothing.
 */
import mongoose from 'mongoose';
import {
  emailEnabled,
  sendSellerApprovedEmail,
  sendOrderWarningEmail,
  sendStoreFrozenEmail,
  sendAccountStatusEmail,
  sendDiamondEmail,
  sendWalletReceiptEmail,
} from '../services/email.service.js';
import { buildReceiptPdf, receiptNumber, hasReceipt, methodLabel, payoutTo } from '../services/receipt.js';
import { getRules, atStake, levelOf } from './healthEngine.js';
import { TIERS } from './sellerTier.js';

const DAY = 86400000;

async function target(sellerId) {
  if (!emailEnabled || !mongoose.Types.ObjectId.isValid(String(sellerId || ''))) return null;
  const s = await mongoose
    .model('Seller')
    .findById(sellerId)
    .select('email ownerName storeName isTestAccount accountType status tier accountHealth.score accountHealth.perfectSince accountHealth.perfectWeeks')
    .lean();
  if (!s?.email || s.isTestAccount || s.accountType === 'test') return null;
  return s;
}
const nameOf = (s) => s.ownerName || s.storeName || 'Seller';
const safe = (label, fn) =>
  Promise.resolve()
    .then(fn)
    .catch((e) => console.error(`[seller-email] ${label}:`, e.message));

/** Store approved: straight to the Seller Central login. */
export function emailSellerApproved(sellerId) {
  return safe('approved', async () => {
    const s = await target(sellerId);
    if (!s) return;
    const { settings } = await getRules().catch(() => ({ settings: {} }));
    const t = TIERS[s.tier === 'diamond' ? 'diamond' : 'basic'];
    await sendSellerApprovedEmail({
      to: s.email,
      name: nameOf(s),
      storeName: s.storeName,
      profitRate: t.profitRate,
      confirmHours: t.confirmHours,
      bonus: Number(settings?.perfectBonusAmount) > 0 ? { amount: Number(settings.perfectBonusAmount), days: Number(settings.perfectBonusDays) || 7 } : null,
    });
  });
}

/** Orders past their warning time: one email with all of them and what is at stake. */
export function emailOrderWarning(sellerId) {
  return safe('order warning', async () => {
    const s = await target(sellerId);
    if (!s || s.status === 'suspended') return;
    const stake = await atStake(sellerId);
    if (!stake?.orders?.some((o) => o.stage === 'warning')) return;
    await sendOrderWarningEmail({ to: s.email, name: nameOf(s), stake });
  });
}

/**
 * The health record BEFORE a deadline penalty (to tell the store what it lost).
 * Call it before recordDeadlineMiss(), pass the result to emailStoreFrozen().
 */
export function healthBefore(seller) {
  const ah = seller?.accountHealth || {};
  return {
    score: Number.isFinite(ah.score) ? ah.score : 100,
    perfectSince: ah.perfectSince || null,
    perfectWeeks: Number(ah.perfectWeeks) || 0,
    wasActive: seller?.status === 'active',
  };
}

/** Frozen by the 48h / 72h rule. Sent only when the store was active (one email per freeze). */
export function emailStoreFrozen(sellerId, { orderNumber, confirmHours, before, score, points }) {
  return safe('frozen', async () => {
    if (before && !before.wasActive) return;
    const s = await target(sellerId);
    if (!s) return;
    const { settings } = await getRules().catch(() => ({ settings: {} }));
    const amount = Number(settings?.perfectBonusAmount) || 0;
    const days = Number(settings?.perfectBonusDays) || 7;
    let bonusLost = null;
    if (before && amount > 0 && before.score === 100 && before.perfectSince) {
      bonusLost = { amount, days, day: Math.min(days, Math.floor((Date.now() - new Date(before.perfectSince).getTime()) / DAY) + 1) };
    }
    let levelChange = null;
    const nowWeeks = Number(s.accountHealth?.perfectWeeks) || 0;
    if (before && before.perfectWeeks > nowWeeks) {
      const a = levelOf(before.perfectWeeks);
      const b = levelOf(nowWeeks);
      levelChange = a.key !== b.key ? `Your level dropped: ${a.icon} ${a.label} → ${b.icon} ${b.label}.` : `Your run of perfect weeks restarted (${before.perfectWeeks} → ${nowWeeks}).`;
    }
    await sendStoreFrozenEmail({
      to: s.email,
      name: nameOf(s),
      orderNumber,
      confirmHours,
      scoreBefore: before?.score,
      score: Number.isFinite(score) ? score : (s.accountHealth?.score ?? 100),
      points: Number.isFinite(Number(points)) ? Number(points) : undefined,
      bonusLost,
      levelChange,
    });
  });
}

/** Frozen / suspended / active again — set by the team. */
export function emailAccountStatus(sellerId, status, reason = '') {
  return safe('status', async () => {
    const s = await target(sellerId);
    if (!s) return;
    await sendAccountStatusEmail({ to: s.email, name: nameOf(s), status, reason });
  });
}

/** The store became Diamond. */
export function emailDiamond(sellerId) {
  return safe('diamond', async () => {
    const s = await target(sellerId);
    if (!s) return;
    const d = TIERS.diamond;
    await sendDiamondEmail({ to: s.email, name: nameOf(s), storeName: s.storeName, profitRate: d.profitRate, confirmHours: d.confirmHours, deliveryDays: d.deliveryDays });
  });
}

/** Deposit / withdrawal approved: the email with the Bazario receipt (PDF) attached. */
export function emailWalletReceipt(lineId) {
  return safe('receipt', async () => {
    const W = mongoose.model('Withdrawal');
    let r = await W.findById(lineId).lean();
    // the approval may still be writing its last step: look once more a moment later
    if (r && !hasReceipt(r) && r.status === 'processing') {
      await new Promise((ok) => setTimeout(ok, 4000));
      r = await W.findById(lineId).lean();
    }
    if (!hasReceipt(r)) return;
    const s = await target(r.seller);
    if (!s) return;
    const pdf = await buildReceiptPdf(r, s).catch((e) => {
      console.error('[seller-email] receipt pdf:', e.message);
      return null;
    });
    await sendWalletReceiptEmail({ to: s.email, name: nameOf(s), r, receiptNo: receiptNumber(r), methodText: methodLabel(r.method), payoutTo: payoutTo(r), pdf });
  });
}

/**
 * DIAMOND EMAIL — a store becomes Diamond in the team portal, after the partners approved the
 * upgrade fee (the portal writes the store's tier itself; this server is not called). So this
 * server looks every 2 minutes for stores that became Diamond in the last 24 hours and were not
 * emailed yet, marks each one first (so it is emailed once, even with two server copies running)
 * and sends the email. It only READS the tier and writes `diamondEmailAt`: nothing in finance,
 * the fee or the wallet is touched. Older Diamond stores (before this) are never emailed.
 */
const DIAMOND_LOOKBACK = DAY;
export async function diamondEmailSweep() {
  if (!emailEnabled || mongoose.connection.readyState !== 1) return;
  const Seller = mongoose.model('Seller');
  const due = await Seller.find({ tier: 'diamond', tierSince: { $gte: new Date(Date.now() - DIAMOND_LOOKBACK) }, diamondEmailAt: null })
    .select('_id')
    .limit(20)
    .lean();
  for (const d of due) {
    const claimed = await Seller.updateOne({ _id: d._id, tier: 'diamond', diamondEmailAt: null }, { $set: { diamondEmailAt: new Date() } });
    if (claimed.modifiedCount) await emailDiamond(d._id); // test accounts are skipped inside
  }
}
let diamondWatch = null;
export function startDiamondEmailWatch() {
  if (diamondWatch) return;
  const run = () => diamondEmailSweep().catch((e) => console.error('[seller-email] diamond check:', e.message));
  setTimeout(run, 60 * 1000);
  diamondWatch = setInterval(run, 2 * 60 * 1000);
}
