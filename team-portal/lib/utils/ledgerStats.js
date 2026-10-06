import { buildLedger } from '@/lib/utils/finance';

/**
 * BINANCE NUMBERS FOR THE SCREENS
 *
 * Everything this portal shows about money comes from the finance ledger (real USDT that
 * reached / left Binance since the finance start), never from the store wallets of the seller
 * website: those are the shop's own book-keeping in $, include helping amounts and old
 * balances, and are not what the team is paid from.
 *
 *   by seller -> real USDT deposited by / paid out to each store
 *   by owner  -> real USDT brought in by the stores of each member / partner (the owner an
 *                entry was divided for, so it always matches that person's wallet)
 *
 * Read from the cached ledger: no extra database work.
 */

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sid = (v) => (v ? String(v) : '');

// Days are India days (the sellers' time zone, same as the finance start).
const IST_MS = 5.5 * 3600 * 1000;
const DAY_MS = 86400000;
export const dayKeyIST = (d) => new Date(new Date(d).getTime() + IST_MS).toISOString().slice(0, 10);
const shiftKey = (key, n) => new Date(new Date(`${key}T00:00:00.000Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);

function sellerRow(map, e) {
  const id = sid(e.sellerId);
  if (!map.has(id)) {
    map.set(id, { sellerId: id, storeName: e.storeName || 'Store', ownerId: '', ownerName: '', depositUSDT: 0, depositINR: 0, deposits: 0, withdrawUSDT: 0, withdrawals: 0, netUSDT: 0, lastDepositAt: null });
  }
  return map.get(id);
}

function ownerRow(map, owner) {
  const id = sid(owner.id);
  if (!map.has(id)) {
    map.set(id, { id, name: owner.name || '', role: owner.role === 'admin' ? 'partner' : 'member', deal: owner.role === 'admin' ? '' : owner.deal || '', depositUSDT: 0, depositINR: 0, deposits: 0, withdrawUSDT: 0, withdrawals: 0, sellerIds: new Set() });
  }
  return map.get(id);
}

/** Per-seller and per-owner Binance totals of the whole ledger. */
export async function getLedgerStats() {
  const ledger = await buildLedger();
  const bySeller = new Map();
  const byOwner = new Map();

  for (const e of ledger.entries) {
    if (e.kind !== 'deposit' && e.kind !== 'seller_withdrawal') continue;
    const s = e.sellerId ? sellerRow(bySeller, e) : null;
    const o = e.owner ? ownerRow(byOwner, e.owner) : null;
    if (s && e.owner) {
      s.ownerId = sid(e.owner.id);
      s.ownerName = e.owner.name || '';
    }
    if (e.kind === 'deposit') {
      if (s) {
        s.depositUSDT += e.usdt;
        s.depositINR += e.inr || 0;
        s.deposits += 1;
        if (!s.lastDepositAt || new Date(e.date) > new Date(s.lastDepositAt)) s.lastDepositAt = e.date;
      }
      if (o) {
        o.depositUSDT += e.usdt;
        o.depositINR += e.inr || 0;
        o.deposits += 1;
        if (e.sellerId) o.sellerIds.add(sid(e.sellerId));
      }
    } else {
      if (s) {
        s.withdrawUSDT += e.usdt;
        s.withdrawals += 1;
      }
      if (o) {
        o.withdrawUSDT += e.usdt;
        o.withdrawals += 1;
      }
    }
  }

  for (const s of bySeller.values()) {
    s.depositUSDT = r2(s.depositUSDT);
    s.depositINR = r2(s.depositINR);
    s.withdrawUSDT = r2(s.withdrawUSDT);
    s.netUSDT = r2(s.depositUSDT - s.withdrawUSDT);
  }
  for (const o of byOwner.values()) {
    o.depositUSDT = r2(o.depositUSDT);
    o.depositINR = r2(o.depositINR);
    o.withdrawUSDT = r2(o.withdrawUSDT);
  }

  return { ledger, bySeller, byOwner };
}

export const EMPTY_SELLER_BINANCE = { depositUSDT: 0, depositINR: 0, deposits: 0, withdrawUSDT: 0, withdrawals: 0, netUSDT: 0, lastDepositAt: null };

/** What one seller's row carries on the Sellers / Members screens. */
export function sellerBinance(stats, sellerId) {
  const s = stats.bySeller.get(sid(sellerId));
  if (!s) return { ...EMPTY_SELLER_BINANCE };
  return { depositUSDT: s.depositUSDT, depositINR: s.depositINR, deposits: s.deposits, withdrawUSDT: s.withdrawUSDT, withdrawals: s.withdrawals, netUSDT: s.netUSDT, lastDepositAt: s.lastDepositAt };
}

/**
 * The dashboard's analytics block.
 *   ownerId empty -> the whole business (partners)
 *   ownerId set   -> only what belongs to that member (a member never sees other people's numbers)
 */
export function dashboardFinance(stats, { ownerId = '', days = 14, topN = 8 } = {}) {
  const { ledger, bySeller, byOwner } = stats;
  const mineOnly = !!ownerId;
  const mine = (e) => !mineOnly || (e.owner && sid(e.owner.id) === sid(ownerId));

  const todayKey = dayKeyIST(new Date());
  const firstKey = shiftKey(todayKey, -(days - 1));
  const week0 = shiftKey(todayKey, -6);
  const prevWeek0 = shiftKey(todayKey, -13);
  const monthPrefix = todayKey.slice(0, 7);

  const dayMap = new Map();
  for (let i = 0; i < days; i += 1) dayMap.set(shiftKey(firstKey, i), { key: shiftKey(firstKey, i), usdt: 0, count: 0 });

  let inUSDT = 0;
  let inINR = 0;
  let depositCount = 0;
  let outUSDT = 0;
  let withdrawalCount = 0;
  let todayUSDT = 0;
  let todayCount = 0;
  let last7USDT = 0;
  let prev7USDT = 0;
  let monthUSDT = 0;
  let rateINR = 0;
  let rateUSDT = 0;
  let biggest = null;

  for (const e of ledger.entries) {
    if (!mine(e)) continue;
    if (e.kind === 'seller_withdrawal') {
      outUSDT += e.usdt;
      withdrawalCount += 1;
      continue;
    }
    if (e.kind !== 'deposit') continue;
    inUSDT += e.usdt;
    inINR += e.inr || 0;
    depositCount += 1;
    if (e.inr > 0 && e.usdt > 0) {
      rateINR += e.inr;
      rateUSDT += e.usdt;
    }
    if (!biggest || e.usdt > biggest.usdt) biggest = { usdt: r2(e.usdt), storeName: e.storeName, date: e.date };
    const key = dayKeyIST(e.date);
    if (key === todayKey) {
      todayUSDT += e.usdt;
      todayCount += 1;
    }
    if (key >= week0) last7USDT += e.usdt;
    else if (key >= prevWeek0) prev7USDT += e.usdt;
    if (key.startsWith(monthPrefix)) monthUSDT += e.usdt;
    const d = dayMap.get(key);
    if (d) {
      d.usdt += e.usdt;
      d.count += 1;
    }
  }

  const sellerRows = [...bySeller.values()].filter((s) => !mineOnly || s.ownerId === sid(ownerId));
  const topSellers = sellerRows
    .filter((s) => s.depositUSDT > 0)
    .sort((a, b) => b.depositUSDT - a.depositUSDT)
    .slice(0, topN)
    .map((s) => ({ sellerId: s.sellerId, storeName: s.storeName, ownerName: s.ownerName, depositUSDT: s.depositUSDT, depositINR: s.depositINR, deposits: s.deposits, withdrawUSDT: s.withdrawUSDT, lastDepositAt: s.lastDepositAt }));

  const walletOf = new Map(ledger.wallets.map((w) => [sid(w.userId), w]));
  const owners = mineOnly
    ? []
    : ledger.wallets
        .map((w) => {
          const o = byOwner.get(sid(w.userId));
          return {
            id: sid(w.userId),
            name: w.name,
            role: w.role,
            deal: w.deal || '',
            depositUSDT: o ? o.depositUSDT : 0,
            deposits: o ? o.deposits : 0,
            sellers: o ? o.sellerIds.size : 0,
            earnedUSDT: r2(w.earnedUSDT + w.bonusUSDT),
            balanceUSDT: r2(w.balanceUSDT),
          };
        })
        .filter((o) => o.depositUSDT > 0 || o.earnedUSDT > 0)
        .sort((a, b) => b.depositUSDT - a.depositUSDT);

  // Deposits that are on the seller website but not in the Binance count yet
  const waiting = ledger.pending.filter((p) => p.kind === 'deposit' && mine(p));
  const myWallet = mineOnly ? walletOf.get(sid(ownerId)) : null;

  const activeSellerIds = new Set(sellerRows.filter((s) => s.depositUSDT > 0).map((s) => s.sellerId));
  const allMine = (ledger.sellerOptions || []).filter((s) => !mineOnly || sid(s.assignedTo) === sid(ownerId));

  return {
    scope: mineOnly ? 'mine' : 'all',
    start: ledger.start,
    inUSDT: r2(inUSDT),
    inINR: r2(inINR),
    depositCount,
    outUSDT: r2(outUSDT),
    withdrawalCount,
    payoutUSDT: mineOnly ? r2(myWallet?.payoutUSDT) : r2(ledger.totals.payoutUSDT),
    balanceUSDT: mineOnly ? r2(myWallet?.balanceUSDT) : r2(ledger.totals.balanceUSDT),
    earnedUSDT: mineOnly ? r2((myWallet?.earnedUSDT || 0) + (myWallet?.bonusUSDT || 0)) : 0,
    todayUSDT: r2(todayUSDT),
    todayCount,
    last7USDT: r2(last7USDT),
    prev7USDT: r2(prev7USDT),
    monthUSDT: r2(monthUSDT),
    avgDepositUSDT: depositCount ? r2(inUSDT / depositCount) : 0,
    avgRate: rateUSDT > 0 ? r2(rateINR / rateUSDT) : 0,
    biggest,
    days: [...dayMap.values()].map((d) => ({ key: d.key, usdt: r2(d.usdt), count: d.count })),
    topSellers,
    owners,
    notCounted: { count: waiting.length, walletUSD: r2(waiting.reduce((s, p) => s + (p.walletAmount || 0), 0)) },
    sellersWithDeposits: activeSellerIds.size,
    sellersWithoutDeposits: allMine.filter((s) => !activeSellerIds.has(sid(s.id))).length,
  };
}
