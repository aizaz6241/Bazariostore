import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import Member from '@/lib/models/Member';
import SellerAssignment from '@/lib/models/SellerAssignment';
import FinanceSplit from '@/lib/models/FinanceSplit';
import WalletTransaction from '@/lib/models/WalletTransaction';
import RewardClaim from '@/lib/models/RewardClaim';
import { Seller, Withdrawal } from '@/lib/models/SharedModels';
import { computeSplit, computeBonusSplit, r2, r6 } from '@/lib/utils/financeSplit';

/**
 * USDT FINANCE LEDGER — single source of truth for "how much is in Binance and whose is it".
 *
 * Only REAL Binance USDT counts:
 *   IN  = approved seller deposits that carry the real USDT received (`usdtAmount`)
 *   OUT = approved seller withdrawals (real USDT sent) + payouts to members / partners
 *
 * Milestone bonuses move nothing on Binance: the member's wallet goes up and the two partners
 * pay for it 50 / 50, so the total stays the same.
 *
 * Not counted: test accounts, anything before FINANCE_START, helping amounts (they never
 * reach Binance), and deposits whose real USDT has not been entered yet (shown as "pending").
 *
 * Invariant shown on the Finance screen:  Binance balance = sum of every wallet.
 */

// Fresh start: 1 October 2026 (00:00 India time). Override with FINANCE_START_DATE if needed.
export const FINANCE_START = new Date(process.env.FINANCE_START_DATE || '2026-09-30T18:30:00.000Z');

// The admin panel used to pre-fill "INR = $ x 83.50" and "rate = 90.00". A record that still
// carries exactly those numbers was never really entered by a person, so it is not trusted.
const OLD_DEFAULT_RATE = 90;
const OLD_DEFAULT_INR_PER_USD = 83.5;

const CACHE_MS = 8000;

function cacheStore() {
  if (!global.__financeLedgerCache) global.__financeLedgerCache = { at: 0, data: null };
  return global.__financeLedgerCache;
}

export function invalidateLedger() {
  const c = cacheStore();
  c.at = 0;
  c.data = null;
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const sid = (v) => (v ? String(v) : '');

function isRealSeller(seller) {
  if (!seller) return false;
  if (seller.isTestAccount === true) return false;
  if (seller.accountType === 'test') return false;
  return true;
}

function grossOf(doc) {
  return doc.approvedAmount !== null && doc.approvedAmount !== undefined ? num(doc.approvedAmount) : num(doc.amount);
}

function looksAutoFilled(doc) {
  if (doc.finConfirmed === true) return false;
  if (num(doc.binanceRate) !== OLD_DEFAULT_RATE) return false;
  return Math.abs(num(doc.inrAmount) - grossOf(doc) * OLD_DEFAULT_INR_PER_USD) <= 1;
}

/**
 * Build the whole ledger. Cached for a few seconds because several screens ask for it at once.
 */
export async function buildLedger({ fresh = false } = {}) {
  const cache = cacheStore();
  if (!fresh && cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;

  await connectDB();

  const [partnerDocs, memberDocs, sellers, assignments, docs, splitDocs, payoutDocs, claimDocs] = await Promise.all([
    Member.find({ role: 'admin', active: true }).sort({ createdAt: 1 }).select('name username email').lean(),
    Member.find({}).select('name username role commissionLabel active').lean(),
    Seller.find({}).select('storeName ownerName wallet isTestAccount accountType isPreviousStoreSeller').lean(),
    SellerAssignment.find({ status: 'active' }).select('sellerId memberId').lean(),
    Withdrawal.find({
      type: { $in: ['deposit', 'withdrawal'] },
      status: { $in: ['approved', 'completed'] },
      $or: [{ processedAt: { $gte: FINANCE_START } }, { createdAt: { $gte: FINANCE_START } }],
    })
      .sort({ createdAt: 1 })
      .lean(),
    FinanceSplit.find({}).lean(),
    WalletTransaction.find({ type: 'debit', date: { $gte: FINANCE_START } }).sort({ date: 1 }).lean(),
    RewardClaim.find({ status: 'approved' }).sort({ approvedAt: 1 }).lean(),
  ]);

  const partners = partnerDocs.map((p) => ({ id: sid(p._id), name: p.name, email: p.email || '' }));
  const partnersOk = partners.length === 2;

  const memberMap = new Map(memberDocs.map((m) => [sid(m._id), m]));
  const sellerMap = new Map(sellers.map((s) => [sid(s._id), s]));
  const ownerBySeller = new Map(assignments.map((a) => [sid(a.sellerId), sid(a.memberId)]));
  const splitMap = new Map(splitDocs.map((s) => [sid(s.sourceId), s]));

  const entries = [];
  const pending = [];
  const skipped = [];

  for (const doc of docs) {
    const when = new Date(doc.processedAt || doc.createdAt);
    if (when < FINANCE_START) continue;

    const seller = sellerMap.get(sid(doc.seller));
    if (!isRealSeller(seller)) continue; // test accounts and deleted sellers are fully out

    const kind = doc.type === 'deposit' ? 'deposit' : 'seller_withdrawal';
    const id = sid(doc._id);
    const usdt = r6(num(doc.usdtAmount));
    const inr = num(doc.inrAmount);
    const pkrRate = num(doc.pkrRate);
    const previousStore = seller.isPreviousStoreSeller === true;
    const existing = splitMap.get(id);

    // Owner is locked by the first split; before that it follows the current assignment.
    let owner = null;
    if (existing) {
      if (existing.ownerId) {
        owner = { id: sid(existing.ownerId), name: existing.ownerName, role: existing.ownerRole, deal: existing.ownerDeal };
      }
    } else {
      const m = memberMap.get(ownerBySeller.get(sid(doc.seller)) || '');
      if (m) owner = { id: sid(m._id), name: m.name, role: m.role, deal: m.commissionLabel || 'pkr_1to1' };
    }

    const base = {
      id,
      kind,
      date: when,
      sellerId: sid(doc.seller),
      storeName: seller.storeName || doc.storeName || 'Store',
      walletAmount: grossOf(doc), // what the seller sees in the store wallet ($)
      helping: num(doc.helpingAmount),
      inr,
      usdt,
      rate: usdt > 0 && inr > 0 ? r2(inr / usdt) : 0,
      pkrRate,
      previousStore,
      isManual: doc.isManualAdjustment === true,
      owner,
      ref: doc.depositRef || doc.transactionRef || '',
    };

    if (doc.finSkip === true) {
      skipped.push(base);
      continue;
    }

    let reason = '';
    if (!(usdt > 0)) reason = 'usdt';
    else if (looksAutoFilled(doc)) reason = 'auto_default';

    if (reason) {
      // A manual wallet debit with no USDT is only a store-wallet correction, not a Binance payout.
      if (kind === 'seller_withdrawal' && base.isManual) continue;
      pending.push({ ...base, reason });
      continue;
    }

    const unchanged =
      existing &&
      r6(existing.usdt) === usdt &&
      num(existing.inr) === inr &&
      num(existing.pkrRate) === pkrRate &&
      existing.previousStore === previousStore &&
      Array.isArray(existing.shares) &&
      existing.shares.length > 0;

    let shares;
    if (unchanged) {
      shares = existing.shares.map((s) => ({ ...s, userId: sid(s.userId) }));
    } else {
      const split = computeSplit({ kind, usdt, inr, pkrRate, owner, partners, previousStore });
      if (!split.ok) {
        pending.push({ ...base, reason: split.reason });
        continue;
      }
      shares = split.shares;
      try {
        await FinanceSplit.updateOne(
          { sourceId: doc._id },
          {
            $set: {
              kind,
              sellerId: doc.seller,
              storeName: base.storeName,
              date: when,
              usdt,
              inr,
              pkrRate,
              previousStore,
              ownerId: owner ? owner.id : null,
              ownerName: owner ? owner.name : '',
              ownerRole: owner ? owner.role : '',
              ownerDeal: owner ? owner.deal || '' : '',
              shares,
            },
          },
          { upsert: true }
        );
      } catch (e) {
        console.error('[finance] could not lock split for', id, e.message);
      }
    }

    entries.push({ ...base, shares });
  }

  // ─── Milestone bonuses: member +bonus, partners pay 50 / 50 ───
  for (const claim of claimDocs) {
    const amountPKR = num(claim.amountPKR);
    if (!(amountPKR > 0)) continue;

    const id = sid(claim._id);
    const m = memberMap.get(sid(claim.memberId));
    if (!m) continue;

    const pkrRate = num(claim.finPkrRate); // PKR per 1 USDT on the day the bonus was approved
    const usdt = pkrRate > 0 ? r6(amountPKR / pkrRate) : 0;
    const base = {
      id,
      kind: 'bonus',
      date: new Date(claim.approvedAt || claim.createdAt),
      sellerId: '',
      storeName: claim.title || 'Milestone bonus',
      walletAmount: 0,
      helping: 0,
      inr: 0,
      amountPKR,
      usdt,
      rate: 0,
      pkrRate,
      previousStore: false,
      isManual: false,
      owner: { id: sid(m._id), name: m.name, role: m.role, deal: m.commissionLabel || 'pkr_1to1' },
      ref: claim.rewardType || '',
    };

    if (claim.finSkip === true) {
      skipped.push(base);
      continue;
    }
    if (!(usdt > 0)) {
      pending.push({ ...base, reason: 'bonus_rate' });
      continue;
    }

    const existing = splitMap.get(id);
    let shares;
    if (existing && r6(existing.usdt) === usdt && Array.isArray(existing.shares) && existing.shares.length > 0) {
      shares = existing.shares.map((s) => ({ ...s, userId: sid(s.userId) }));
    } else {
      const split = computeBonusSplit({ usdt, member: base.owner, partners });
      if (!split.ok) {
        pending.push({ ...base, reason: split.reason });
        continue;
      }
      shares = split.shares;
      try {
        await FinanceSplit.updateOne(
          { sourceId: claim._id },
          {
            $set: {
              kind: 'bonus',
              sellerId: null,
              storeName: base.storeName,
              date: base.date,
              usdt,
              inr: 0,
              pkrRate,
              previousStore: false,
              ownerId: base.owner.id,
              ownerName: base.owner.name,
              ownerRole: base.owner.role,
              ownerDeal: base.owner.deal,
              shares,
            },
          },
          { upsert: true }
        );
      } catch (e) {
        console.error('[finance] could not lock bonus split for', id, e.message);
      }
    }

    entries.push({ ...base, shares });
  }

  entries.sort((a, b) => new Date(a.date) - new Date(b.date));

  // ─── Payouts to members / partners (real USDT that left Binance) ───
  const payouts = [];
  for (const tx of payoutDocs) {
    if ((tx.currency || '').toUpperCase() === 'PKR') continue; // PKR payouts belong to the PKR bonus wallet
    const amountUSDT = r6(num(tx.amountUSDT) || ((tx.currency || '').toUpperCase() === 'USDT' ? num(tx.amount) : 0));
    if (!(amountUSDT > 0)) continue;
    const m = memberMap.get(sid(tx.userId));
    payouts.push({
      id: sid(tx._id),
      userId: sid(tx.userId),
      name: m ? m.name : 'Unknown',
      amountUSDT,
      date: new Date(tx.date || tx.createdAt),
      note: tx.note || '',
      description: tx.description || '',
      processedBy: tx.processedBy || '',
    });
  }

  // ─── Wallets ───
  const walletMap = new Map();
  const walletOf = (userId, fallbackName, fallbackRole) => {
    if (!walletMap.has(userId)) {
      const m = memberMap.get(userId);
      walletMap.set(userId, {
        userId,
        name: m ? m.name : fallbackName || 'Unknown',
        role: m ? (m.role === 'admin' ? 'partner' : 'member') : fallbackRole || 'member',
        deal: m && m.role === 'member' ? m.commissionLabel || 'pkr_1to1' : '',
        earnedUSDT: 0,
        bonusUSDT: 0,
        bonusCostUSDT: 0,
        sellerWithdrawUSDT: 0,
        payoutUSDT: 0,
        balanceUSDT: 0,
      });
    }
    return walletMap.get(userId);
  };

  partners.forEach((p) => walletOf(p.id, p.name, 'partner'));
  memberDocs.filter((m) => m.role === 'member' && m.active !== false).forEach((m) => walletOf(sid(m._id)));

  let inUSDT = 0;
  let sellerOutUSDT = 0;
  let inINR = 0;
  let depositCount = 0;
  let withdrawalCount = 0;
  let bonusUSDT = 0;
  let bonusCount = 0;

  for (const e of entries) {
    if (e.kind === 'deposit') {
      inUSDT += e.usdt;
      inINR += e.inr;
      depositCount += 1;
    } else if (e.kind === 'seller_withdrawal') {
      sellerOutUSDT += e.usdt;
      withdrawalCount += 1;
    } else {
      bonusUSDT += e.usdt;
      bonusCount += 1;
    }
    for (const s of e.shares) {
      const w = walletOf(s.userId, s.name, s.role);
      if (e.kind === 'deposit') w.earnedUSDT += s.amountUSDT;
      else if (e.kind === 'seller_withdrawal') w.sellerWithdrawUSDT += s.amountUSDT;
      else if (s.role === 'member') w.bonusUSDT += s.amountUSDT;
      else w.bonusCostUSDT += s.amountUSDT;
    }
  }

  let payoutUSDT = 0;
  for (const p of payouts) {
    payoutUSDT += p.amountUSDT;
    walletOf(p.userId, p.name).payoutUSDT += p.amountUSDT;
  }

  const wallets = [...walletMap.values()].map((w) => ({
    ...w,
    earnedUSDT: r6(w.earnedUSDT),
    bonusUSDT: r6(w.bonusUSDT),
    bonusCostUSDT: r6(w.bonusCostUSDT),
    sellerWithdrawUSDT: r6(w.sellerWithdrawUSDT),
    payoutUSDT: r6(w.payoutUSDT),
    // may be negative: settles from next deposits
    balanceUSDT: r6(w.earnedUSDT + w.bonusUSDT - w.bonusCostUSDT - w.sellerWithdrawUSDT - w.payoutUSDT),
  }));
  wallets.sort((a, b) => (a.role === b.role ? b.balanceUSDT - a.balanceUSDT : a.role === 'partner' ? -1 : 1));

  const balanceUSDT = r6(inUSDT - sellerOutUSDT - payoutUSDT);
  const walletsUSDT = r6(wallets.reduce((s, w) => s + w.balanceUSDT, 0));

  // ─── What real sellers can still ask to withdraw (store wallet, in $) ───
  let liabilityUSD = 0;
  let pendingWithdrawalUSD = 0;
  let realSellerCount = 0;
  for (const s of sellers) {
    if (!isRealSeller(s)) continue;
    realSellerCount += 1;
    liabilityUSD += num(s.wallet?.balance);
    pendingWithdrawalUSD += num(s.wallet?.pendingWithdrawal);
  }

  const data = {
    start: FINANCE_START,
    generatedAt: new Date(),
    partners,
    partnersOk,
    totals: {
      inUSDT: r6(inUSDT),
      inINR: r2(inINR),
      sellerOutUSDT: r6(sellerOutUSDT),
      payoutUSDT: r6(payoutUSDT),
      balanceUSDT,
      walletsUSDT,
      diffUSDT: r6(balanceUSDT - walletsUSDT),
      depositCount,
      withdrawalCount,
      bonusUSDT: r6(bonusUSDT),
      bonusCount,
    },
    wallets,
    entries,
    pending,
    skipped,
    payouts,
    sellerLiability: {
      totalUSD: r2(liabilityUSD),
      pendingWithdrawalUSD: r2(pendingWithdrawalUSD),
      sellerCount: realSellerCount,
    },
  };

  // Keep the small wallet numbers on each member document in step (dashboard cards read them).
  try {
    await Promise.all(
      wallets.map((w) =>
        Member.updateOne(
          { _id: w.userId },
          {
            $set: {
              'wallet.balanceUSDT': r2(w.balanceUSDT),
              'wallet.totalEarnedUSDT': r2(w.earnedUSDT + w.bonusUSDT),
              'wallet.totalWithdrawnUSDT': r2(w.sellerWithdrawUSDT + w.bonusCostUSDT + w.payoutUSDT),
              'wallet.balanceINR': 0,
              'wallet.totalEarnedINR': 0,
              'wallet.totalWithdrawnINR': 0,
            },
          }
        )
      )
    );
  } catch (e) {
    console.error('[finance] wallet sync error:', e.message);
  }

  cache.at = Date.now();
  cache.data = data;
  return data;
}

/**
 * Admin action on one deposit / seller withdrawal from the Finance screen.
 *   save    -> store the real Binance USDT (and INR / PKR rate) on the transaction
 *   skip    -> "no real money moved" (e.g. helping-only credit, old-store balance)
 *   unskip  -> bring it back to the pending list
 *   resplit -> drop the locked split so it is recalculated from the current assignment
 */
export async function updateFinanceEntry({ id, kind, action, usdtAmount, inrAmount, pkrRate, by = '' }) {
  await connectDB();
  if (!id || !mongoose.Types.ObjectId.isValid(id)) throw new Error('Valid transaction id is required');
  const _id = new mongoose.Types.ObjectId(id);

  // Milestone bonus: only the PKR rate of that day is needed.
  if (kind === 'bonus') {
    const claims = RewardClaim.collection;
    const claim = await claims.findOne({ _id });
    if (!claim) throw new Error('Bonus not found');
    if (claim.status !== 'approved') throw new Error('Only approved bonuses can be edited here');

    if (action === 'save') {
      const rate = Number(pkrRate);
      if (!Number.isFinite(rate) || rate <= 0) throw new Error('Enter the PKR rate of that day (PKR per 1 USDT)');
      await claims.updateOne({ _id }, { $set: { finPkrRate: rate, finSkip: false, finEditedBy: by, finEditedAt: new Date() } });
    } else if (action === 'skip') {
      await claims.updateOne({ _id }, { $set: { finSkip: true, finEditedBy: by, finEditedAt: new Date() } });
      await FinanceSplit.deleteOne({ sourceId: _id });
    } else if (action === 'unskip') {
      await claims.updateOne({ _id }, { $set: { finSkip: false, finEditedBy: by, finEditedAt: new Date() } });
    } else if (action === 'resplit') {
      await FinanceSplit.deleteOne({ sourceId: _id });
    } else {
      throw new Error('Unknown action');
    }

    invalidateLedger();
    return buildLedger({ fresh: true });
  }

  const col = mongoose.connection.db.collection('withdrawals');

  const doc = await col.findOne({ _id });
  if (!doc) throw new Error('Transaction not found');
  if (!['deposit', 'withdrawal'].includes(doc.type)) throw new Error('Only deposits and withdrawals can be edited here');
  if (!['approved', 'completed'].includes(doc.status)) throw new Error('Only approved transactions can be edited here');

  if (action === 'save') {
    const usdt = Number(usdtAmount);
    if (!Number.isFinite(usdt) || usdt <= 0) throw new Error('Enter the real USDT amount (greater than 0)');
    const set = { usdtAmount: r6(usdt), finConfirmed: true, finSkip: false, finEditedBy: by, finEditedAt: new Date() };
    if (inrAmount !== undefined && inrAmount !== null && inrAmount !== '') {
      const inr = Number(inrAmount);
      if (!Number.isFinite(inr) || inr < 0) throw new Error('INR amount is not valid');
      set.inrAmount = inr;
      if (inr > 0) set.binanceRate = r2(inr / usdt);
    }
    if (pkrRate !== undefined && pkrRate !== null && pkrRate !== '') {
      const rate = Number(pkrRate);
      if (!Number.isFinite(rate) || rate <= 0) throw new Error('PKR rate is not valid');
      set.pkrRate = rate;
    }
    await col.updateOne({ _id }, { $set: set });
  } else if (action === 'skip') {
    await col.updateOne({ _id }, { $set: { finSkip: true, finEditedBy: by, finEditedAt: new Date() } });
    await FinanceSplit.deleteOne({ sourceId: _id });
  } else if (action === 'unskip') {
    await col.updateOne({ _id }, { $set: { finSkip: false, finEditedBy: by, finEditedAt: new Date() } });
  } else if (action === 'resplit') {
    await FinanceSplit.deleteOne({ sourceId: _id });
  } else {
    throw new Error('Unknown action');
  }

  invalidateLedger();
  return buildLedger({ fresh: true });
}
