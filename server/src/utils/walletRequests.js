import Withdrawal from '../models/Withdrawal.js';
import { walletApply } from './wallet.js';

/**
 * Applying an admin's decision (approve / reject) on a seller's deposit or withdrawal request.
 *
 * Two records are involved: the request and the seller's wallet. Before, they were saved one
 * after the other with nothing tying them together, so a server stop in between left a request
 * "approved" with no money credited, or a request stuck in "processing" for ever.
 *
 * Now:
 *   1. the decision is written on the request first (`pendingDecision`),
 *   2. the wallet is changed in one database step named after the request (applied once only,
 *      see utils/wallet.js),
 *   3. the request is marked approved / rejected.
 * If the server stops anywhere in between, finishStuckWalletRequests() completes the SAME
 * decision later. Nothing is credited twice and nothing stays stuck.
 */

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** What a decision does to the wallet (same arithmetic as always). */
export function walletChangeFor(reqDoc, decision) {
  const amount = num(reqDoc.amount);
  const finalAmount = num(decision.finalAmount);
  const approved = decision.status === 'approved';
  const change = {};
  const extraInc = {};

  if (reqDoc.type === 'deposit') {
    change.pendingDeposit = -amount; // always the original requested amount
    if (approved) {
      change.balance = finalAmount;
      change.totalDeposited = finalAmount;
      if (num(decision.helpingAmount) > 0) change.totalHelpingAmount = num(decision.helpingAmount);
    }
  } else {
    change.pendingWithdrawal = -amount;
    if (approved) {
      change.totalWithdrawn = finalAmount;
      extraInc['withdrawalLimit.successfulWithdrawalCount'] = 1; // towards the tier upgrade
      // Partial payout: the part that was not approved goes back to the balance
      if (finalAmount < amount) change.balance = amount - finalAmount;
    } else {
      change.balance = amount; // rejected: the full requested amount goes back
    }
  }
  return { change, extraInc };
}

/** Step 2: move the money, once only for this request. */
export async function applyDecisionToWallet(reqDoc, decision) {
  const { change, extraInc } = walletChangeFor(reqDoc, decision);
  const sellerId = reqDoc.seller?._id || reqDoc.seller;
  return walletApply(sellerId, change, { opId: `req:${reqDoc._id}`, extraInc });
}

/** The fields a decision writes on the request (step 3). */
export function requestFieldsFor(decision, balanceAfter) {
  const approved = decision.status === 'approved';
  const set = {
    status: decision.status,
    approvedAmount: approved ? num(decision.finalAmount) : 0,
    adminNote: decision.adminNote || '',
    transactionRef: decision.transactionRef || '',
    processedAt: decision.at ? new Date(decision.at) : new Date(),
    processedBy: decision.by || 'Admin',
    processedById: decision.byId || '',
    balanceAfter: balanceAfter ?? null,
    pendingDecision: null,
  };
  if (decision.helpingAmount !== undefined) set.helpingAmount = num(decision.helpingAmount);
  if (approved) {
    if (decision.binanceRate !== undefined) set.binanceRate = num(decision.binanceRate);
    if (decision.inrAmount !== undefined) set.inrAmount = num(decision.inrAmount);
    if (decision.usdtAmount !== undefined) set.usdtAmount = num(decision.usdtAmount);
  }
  return set;
}

const STUCK_AFTER_MS = 90 * 1000;
let lastSweep = 0;

/**
 * Finish (or release) requests left in "processing" by a server stop. Cheap; safe to call often.
 * @returns {Promise<number>} how many were sorted out
 */
export async function finishStuckWalletRequests({ force = false } = {}) {
  if (!force && Date.now() - lastSweep < 30 * 1000) return 0;
  lastSweep = Date.now();
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS);
  let fixed = 0;
  try {
    const stuck = await Withdrawal.find({ status: 'processing', updatedAt: { $lt: cutoff } }).limit(50).lean();
    for (const doc of stuck) {
      try {
        if (doc.pendingDecision && ['approved', 'rejected'].includes(doc.pendingDecision.status)) {
          const moved = await applyDecisionToWallet(doc, doc.pendingDecision);
          if (!moved) {
            // the seller no longer exists: nothing to credit; give the request back
            await Withdrawal.updateOne({ _id: doc._id, status: 'processing' }, { $set: { status: 'pending', pendingDecision: null } });
          } else {
            await Withdrawal.updateOne({ _id: doc._id, status: 'processing' }, { $set: requestFieldsFor(doc.pendingDecision, moved.wallet?.balance) });
            console.log(`[wallet-requests] finished interrupted ${doc.type} request ${doc._id} as ${doc.pendingDecision.status}`);
          }
        } else {
          // no decision was recorded yet, so no money moved: simply waiting again
          await Withdrawal.updateOne({ _id: doc._id, status: 'processing' }, { $set: { status: 'pending' } });
        }
        fixed += 1;
      } catch (e) {
        console.error('[wallet-requests] could not finish request', String(doc._id), e.message);
      }
    }
  } catch (e) {
    console.error('[wallet-requests] sweep failed:', e.message);
  }
  return fixed;
}
