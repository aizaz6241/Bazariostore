import mongoose from 'mongoose';
import Seller from '../models/Seller.js';

/**
 * SELLER WALLET — every change goes through here, as ONE database step.
 *
 * Before, each route read the whole wallet, changed a number in memory and saved the whole wallet
 * back. Two actions at the same moment (an order confirmed while a withdrawal is requested, two
 * clicks on Approve...) then overwrote each other, and money appeared or vanished.
 *
 * Now a change is "add this much to that field", done by the database itself (`$inc`), with an
 * optional condition ("only if the balance is at least X"). Nothing is read first, so nothing can
 * be overwritten, and two actions at once simply both apply.
 */

const FIELDS = ['balance', 'processingFund', 'totalProfitEarned', 'totalEarned', 'totalDeposited', 'pendingDeposit', 'pendingWithdrawal', 'totalWithdrawn', 'totalHelpingAmount'];
// counters that must never show below zero (old records can be out of step)
const NEVER_NEGATIVE = ['processingFund', 'pendingDeposit', 'pendingWithdrawal', 'totalHelpingAmount'];
const EPS = 1e-6;

const toId = (v) => (v instanceof mongoose.Types.ObjectId ? v : new mongoose.Types.ObjectId(String(v)));

/**
 * @param {string|ObjectId} sellerId
 * @param {object} change        e.g. { balance: -50, processingFund: +50 }
 * @param {object} [opts]
 * @param {number} [opts.requireBalance]  apply only if the available balance is at least this
 * @param {string} [opts.opId]            name of this step; a step with the same name is applied once only
 * @param {object} [opts.extraInc]        other seller counters to add to in the same step
 * @returns {Promise<{wallet:object, storeName:string, already?:boolean}|null>}  the wallet AFTER
 *          the change (already:true = this step had been applied before, nothing was added now),
 *          or null when the seller does not exist or the balance condition was not met
 */
export async function walletApply(sellerId, change, { requireBalance = null, opId = '', extraInc = null } = {}) {
  if (!sellerId || !mongoose.Types.ObjectId.isValid(String(sellerId))) return null;
  const $inc = {};
  for (const [field, raw] of Object.entries(change || {})) {
    if (!FIELDS.includes(field)) throw new Error(`Unknown wallet field: ${field}`);
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`Wallet change for ${field} is not a number`);
    if (n !== 0) $inc[`wallet.${field}`] = n;
  }

  // other counters on the seller that belong to the same step (e.g. successful withdrawals)
  for (const [path, raw] of Object.entries(extraInc || {})) {
    const n = Number(raw);
    if (Number.isFinite(n) && n !== 0) $inc[path] = n;
  }

  const filter = { _id: toId(sellerId) };
  if (requireBalance !== null && requireBalance !== undefined) filter['wallet.balance'] = { $gte: Number(requireBalance) - EPS };

  const update = {};
  if (Object.keys($inc).length > 0) update.$inc = $inc;
  // ONCE-ONLY steps: the step's id is written on the seller in the same database step as the
  // money. If the same id comes again (a retry after a crash, a double click, two servers) the
  // filter no longer matches and nothing is added twice.
  if (opId) {
    filter.walletOps = { $ne: String(opId) };
    update.$push = { walletOps: { $each: [String(opId)], $slice: -300 } };
  }

  let doc;
  if (Object.keys(update).length === 0) {
    doc = await Seller.findOne(filter).select('wallet storeName').lean();
  } else {
    doc = await Seller.findOneAndUpdate(filter, update, { new: true, projection: { wallet: 1, storeName: 1 } }).lean();
  }
  if (!doc) {
    if (opId) {
      const seen = await Seller.findOne({ _id: toId(sellerId), walletOps: String(opId) }).select('wallet storeName').lean();
      if (seen) return { wallet: seen.wallet || {}, storeName: seen.storeName || '', already: true };
    }
    return null;
  }
  doc.wallet = doc.wallet || {};

  for (const f of NEVER_NEGATIVE) {
    if (Number(doc.wallet[f] || 0) < 0) {
      await Seller.updateOne({ _id: doc._id, [`wallet.${f}`]: { $lt: 0 } }, { $set: { [`wallet.${f}`]: 0 } });
      doc.wallet[f] = 0;
    }
  }
  return { wallet: doc.wallet, storeName: doc.storeName || '' };
}

/** The wallet as it is right now. */
export async function walletNow(sellerId) {
  return walletApply(sellerId, {});
}
