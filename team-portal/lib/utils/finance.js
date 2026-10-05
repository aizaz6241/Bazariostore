import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import Member from '@/lib/models/Member';
import SellerAssignment from '@/lib/models/SellerAssignment';
import FinanceSplit from '@/lib/models/FinanceSplit';
import WalletTransaction from '@/lib/models/WalletTransaction';
import RewardClaim from '@/lib/models/RewardClaim';
import { Seller, Withdrawal } from '@/lib/models/SharedModels';
import { computeSplit, computeBonusSplit, r2, r6 } from '@/lib/utils/financeSplit';
import { getLiveVersion, forgetLiveVersion, hashOf } from '@/lib/utils/liveVersion';

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
 * reach Binance), deposits whose real USDT has not been entered yet, and sellers that are not
 * assigned to anyone (every client seller must have an owner). Those show as "pending".
 *
 * Invariant shown on the Finance screen:  Binance balance = sum of every wallet.
 */

// Fresh start: 1 October 2026 (00:00 India time). Override with FINANCE_START_DATE if needed.
export const FINANCE_START = new Date(process.env.FINANCE_START_DATE || '2026-09-30T18:30:00.000Z');

// The admin panel used to pre-fill "INR = $ x 83.50" and "rate = 90.00". A record that still
// carries exactly those numbers was never really entered by a person, so it is not trusted.
const OLD_DEFAULT_RATE = 90;
const OLD_DEFAULT_INR_PER_USD = 83.5;

// The cached ledger is reused only while the database still looks the same (see liveVersion.js),
// so a deposit approved on the seller website shows up here at once. The time limits below are a
// safety net: CACHE_MAX_MS when the version check works, CACHE_MS if it ever cannot be read.
const CACHE_MS = 15000;
const CACHE_MAX_MS = 30000;

function cacheStore() {
  if (!global.__financeLedgerCache) global.__financeLedgerCache = { at: 0, data: null, version: '', building: null };
  return global.__financeLedgerCache;
}

export function invalidateLedger() {
  const c = cacheStore();
  c.at = 0;
  c.data = null;
  c.version = '';
  forgetLiveVersion();
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
 * The whole ledger. Served from memory while nothing has changed in the database; rebuilt the
 * moment something has (a deposit approved, funds added, a payout, a new assignment, ...).
 */
export async function buildLedger({ fresh = false } = {}) {
  const cache = cacheStore();
  await connectDB();

  let version = '';
  try {
    version = (await getLiveVersion({ force: fresh })).full;
  } catch (e) {
    console.error('[finance] live version check failed:', e.message);
  }

  if (!fresh && cache.data) {
    const age = Date.now() - cache.at;
    const stillGood = version ? cache.version === version && age < CACHE_MAX_MS : age < CACHE_MS;
    if (stillGood) return cache.data;
  }

  // Several screens ask at the same moment: build once and share the result.
  if (!fresh && cache.building) return cache.building;

  const run = (async () => {
    const { data, wrote } = await computeLedger();
    let builtVersion = version;
    if (wrote) {
      // Building locked some new splits, which is itself a change in the database: note the
      // version as it is now, otherwise the next request would rebuild for nothing.
      try {
        builtVersion = (await getLiveVersion({ force: true })).full;
      } catch (e) {
        builtVersion = '';
      }
    }
    cache.at = Date.now();
    cache.data = data;
    cache.version = builtVersion;
    return data;
  })();

  if (!fresh) {
    cache.building = run;
    run.then(
      () => {
        if (cache.building === run) cache.building = null;
      },
      () => {
        if (cache.building === run) cache.building = null;
      }
    );
  }
  return run;
}

async function computeLedger() {
  let wrote = false;

  const [partnerDocs, memberDocs, sellers, assignments, docs, splitDocs, payoutDocs, claimDocs] = await Promise.all([
    Member.find({ role: 'admin', active: true }).sort({ createdAt: 1 }).select('name username email').lean(),
    Member.find({}).select('name username role commissionLabel active wallet').lean(),
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
  // Money movements of TEST accounts: never counted, but listed so that nothing can be hidden
  // by switching a seller to "test".
  const excludedMap = new Map();

  for (const doc of docs) {
    const when = new Date(doc.processedAt || doc.createdAt);
    if (when < FINANCE_START) continue;

    const seller = sellerMap.get(sid(doc.seller));
    if (!isRealSeller(seller)) {
      // test accounts and deleted sellers are fully out
      if (seller) {
        const key = sid(doc.seller);
        if (!excludedMap.has(key)) {
          excludedMap.set(key, { sellerId: key, storeName: seller.storeName || doc.storeName || 'Store', deposits: 0, depositUSD: 0, withdrawals: 0, withdrawalUSD: 0, usdt: 0, lastDate: when });
        }
        const x = excludedMap.get(key);
        if (doc.type === 'deposit') {
          x.deposits += 1;
          x.depositUSD += grossOf(doc);
        } else {
          x.withdrawals += 1;
          x.withdrawalUSD += grossOf(doc);
        }
        x.usdt += num(doc.usdtAmount);
        if (when > x.lastDate) x.lastDate = when;
      }
      continue;
    }

    const kind = doc.type === 'deposit' ? 'deposit' : 'seller_withdrawal';
    const id = sid(doc._id);
    const usdt = r6(num(doc.usdtAmount));
    const inr = num(doc.inrAmount);
    const pkrRate = num(doc.pkrRate);
    const previousStore = seller.isPreviousStoreSeller === true;
    // A previous-store seller's withdrawal is paid by the two partners whoever the seller belongs to.
    const partnersPayAll = kind === 'seller_withdrawal' && previousStore;

    // A split made while the seller had no owner is not kept: it is redone once the seller is assigned.
    let existing = splitMap.get(id);
    if (existing && !existing.ownerId && !partnersPayAll) existing = null;

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
      editedBy: doc.finEditedBy || '',
      editedAt: doc.finEditedAt || null,
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

    // Every client seller must belong to someone before its money can be divided.
    if (!owner && !partnersPayAll) {
      pending.push({ ...base, reason: 'unassigned' });
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
        wrote = true;
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
      editedBy: claim.finEditedBy || '',
      editedAt: claim.finEditedAt || null,
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
        wrote = true;
      } catch (e) {
        console.error('[finance] could not lock bonus split for', id, e.message);
      }
    }

    entries.push({ ...base, shares });
  }

  // ─── Entries typed in by an admin on the Finance screen ───
  for (const sp of splitDocs) {
    if (sp.manual !== true) continue;
    const usdt = r6(num(sp.usdt));
    const inr = num(sp.inr);
    entries.push({
      id: sid(sp.sourceId),
      kind: sp.kind,
      date: new Date(sp.date),
      sellerId: sid(sp.sellerId),
      storeName: sp.storeName || 'Manual entry',
      walletAmount: 0,
      helping: 0,
      inr,
      usdt,
      rate: usdt > 0 && inr > 0 ? r2(inr / usdt) : 0,
      pkrRate: num(sp.pkrRate),
      previousStore: sp.previousStore === true,
      isManual: true,
      manual: true,
      note: sp.note || '',
      owner: sp.ownerId ? { id: sid(sp.ownerId), name: sp.ownerName, role: sp.ownerRole, deal: sp.ownerDeal } : null,
      ref: 'manual',
      shares: (sp.shares || []).map((x) => ({ ...x, userId: sid(x.userId) })),
    });
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

  // ─── Choices for the "Add entry" form, and client sellers that still have no owner ───
  const sellerOptions = sellers
    .filter(isRealSeller)
    .map((x) => ({
      id: sid(x._id),
      storeName: x.storeName || 'Store',
      ownerName: x.ownerName || '',
      assignedTo: ownerBySeller.get(sid(x._id)) || '',
      previousStore: x.isPreviousStoreSeller === true,
    }))
    .sort((a, b) => a.storeName.localeCompare(b.storeName));

  const people = memberDocs
    .filter((m) => m.active !== false)
    .map((m) => ({
      id: sid(m._id),
      name: m.name,
      role: m.role === 'admin' ? 'partner' : 'member',
      deal: m.role === 'member' ? m.commissionLabel || 'pkr_1to1' : '',
    }))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'partner' ? -1 : 1));

  const unassignedSellers = sellerOptions.filter((x) => !x.assignedTo || !memberMap.get(x.assignedTo));

  const data = {
    start: FINANCE_START,
    sellerOptions,
    people,
    unassignedSellers,
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
    excludedTest: [...excludedMap.values()]
      .map((x) => ({ ...x, depositUSD: r2(x.depositUSD), withdrawalUSD: r2(x.withdrawalUSD), usdt: r6(x.usdt) }))
      .sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate)),
    payouts,
    sellerLiability: {
      totalUSD: r2(liabilityUSD),
      pendingWithdrawalUSD: r2(pendingWithdrawalUSD),
      sellerCount: realSellerCount,
    },
  };

  // Keep the small wallet numbers on each member document in step (dashboard cards read them).
  // Written only when a number really changed, so an ordinary page load does no writes.
  try {
    const changed = wallets.filter((w) => {
      const cur = memberMap.get(w.userId)?.wallet || {};
      return (
        num(cur.balanceUSDT) !== r2(w.balanceUSDT) ||
        num(cur.totalEarnedUSDT) !== r2(w.earnedUSDT + w.bonusUSDT) ||
        num(cur.totalWithdrawnUSDT) !== r2(w.sellerWithdrawUSDT + w.bonusCostUSDT + w.payoutUSDT) ||
        num(cur.balanceINR) !== 0 ||
        num(cur.balancePKR) !== 0
      );
    });
    await Promise.all(
      changed.map((w) =>
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
              'wallet.balancePKR': 0,
            },
          }
        )
      )
    );
  } catch (e) {
    console.error('[finance] wallet sync error:', e.message);
  }

  // Short signature of everything the screens show. Open pages compare it to know that their
  // numbers are out of date (see /api/live).
  data.sig = hashOf([
    data.totals,
    data.sellerLiability,
    data.partners.map((p) => [p.id, p.name]),
    wallets.map((w) => [w.userId, w.name, w.deal, w.earnedUSDT, w.bonusUSDT, w.bonusCostUSDT, w.sellerWithdrawUSDT, w.payoutUSDT]),
    entries.map((e) => [e.id, e.kind, e.usdt, e.inr, e.pkrRate, e.owner ? e.owner.id : '', new Date(e.date).getTime(), e.storeName]),
    pending.map((e) => [e.id, e.reason, e.usdt, e.inr, e.owner ? e.owner.id : '']),
    skipped.map((e) => e.id),
    data.excludedTest.map((x) => [x.sellerId, x.deposits, x.withdrawals, x.depositUSD, x.withdrawalUSD]),
    payouts.map((p) => [p.id, p.amountUSDT]),
    unassignedSellers.map((x) => x.id),
  ]);

  return { data, wrote };
}

/**
 * "Add entry" on the Finance screen: an admin types in a deposit or a seller withdrawal by hand.
 * It only changes the finance ledger (who owns how much of the Binance USDT); the seller's
 * store wallet is not touched.
 */
export async function createManualEntry({ kind, sellerId, ownerId, inrAmount, usdtAmount, pkrRate, date, note = '', by = '' }) {
  await connectDB();

  if (!['deposit', 'seller_withdrawal'].includes(kind)) throw new Error('Choose deposit or seller withdrawal');
  if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) throw new Error('Choose a seller');

  const usdt = Number(usdtAmount);
  if (!Number.isFinite(usdt) || usdt <= 0) throw new Error('Enter the real USDT amount (greater than 0)');
  const inr = inrAmount === undefined || inrAmount === null || inrAmount === '' ? 0 : Number(inrAmount);
  if (!Number.isFinite(inr) || inr < 0) throw new Error('INR amount is not valid');
  const rate = pkrRate === undefined || pkrRate === null || pkrRate === '' ? 0 : Number(pkrRate);
  if (!Number.isFinite(rate) || rate < 0) throw new Error('PKR rate is not valid');

  const when = date ? new Date(date) : new Date();
  if (Number.isNaN(when.getTime())) throw new Error('Date is not valid');

  const seller = await Seller.findById(sellerId).select('storeName isTestAccount accountType isPreviousStoreSeller').lean();
  if (!seller) throw new Error('Seller not found');
  if (!isRealSeller(seller)) throw new Error('Test accounts are not part of the finance ledger');

  const partnerDocs = await Member.find({ role: 'admin', active: true }).sort({ createdAt: 1 }).select('name').lean();
  const partners = partnerDocs.map((p) => ({ id: sid(p._id), name: p.name }));

  const previousStore = seller.isPreviousStoreSeller === true;
  const partnersPayAll = kind === 'seller_withdrawal' && previousStore;

  let owner = null;
  if (ownerId && mongoose.Types.ObjectId.isValid(ownerId)) {
    const m = await Member.findById(ownerId).select('name role commissionLabel active').lean();
    if (!m || m.active === false) throw new Error('Selected person was not found');
    owner = { id: sid(m._id), name: m.name, role: m.role, deal: m.commissionLabel || 'pkr_1to1' };
  }
  if (!owner && !partnersPayAll) throw new Error('Choose who this seller belongs to');

  const split = computeSplit({ kind, usdt, inr, pkrRate: rate, owner, partners, previousStore });
  if (!split.ok) {
    const why = {
      partners: 'Exactly 2 finance partners are required',
      pkr_rate: 'For a 1:1 PKR member enter the INR amount and that day’s PKR rate',
      usdt: 'Enter the real USDT amount',
    };
    throw new Error(why[split.reason] || 'Could not split this entry');
  }

  await FinanceSplit.create({
    sourceId: new mongoose.Types.ObjectId(),
    kind,
    sellerId: seller._id,
    storeName: seller.storeName || 'Store',
    date: when,
    usdt: r6(usdt),
    inr,
    pkrRate: rate,
    previousStore,
    ownerId: owner ? owner.id : null,
    ownerName: owner ? owner.name : '',
    ownerRole: owner ? owner.role : '',
    ownerDeal: owner ? owner.deal || '' : '',
    shares: split.shares,
    manual: true,
    note: String(note || '').trim().slice(0, 300),
    createdBy: by,
  });

  invalidateLedger();
  return buildLedger({ fresh: true });
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

  // Hand-typed entry: it can only be removed (add it again to change it).
  if (kind === 'manual') {
    if (action !== 'delete') throw new Error('Manual entries can only be deleted');
    const gone = await FinanceSplit.deleteOne({ sourceId: _id, manual: true });
    if (!gone || gone.deletedCount === 0) throw new Error('Manual entry not found');
    invalidateLedger();
    return buildLedger({ fresh: true });
  }

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
