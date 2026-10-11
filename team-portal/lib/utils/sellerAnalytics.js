import { buildLedger } from '@/lib/utils/finance';
import { Seller } from '@/lib/models/SharedModels';

/**
 * SELLER ANALYTICS (Sellers screen)
 *
 * Built only from the finance ledger, so every number is real Binance USDT (test accounts and
 * helping amounts are never in it), and "my share" is exactly what reached the viewer's wallet.
 *
 *   scope 'mine' -> the sellers the viewer owns (a member's sellers, or a partner's own sellers)
 *   scope 'all'  -> every real client seller of the business (partners only)
 *
 * "My share" of a seller = the viewer's own share of its deposits − his share of its
 * withdrawals. Referral commissions are not part of a seller's numbers (a referred member sees
 * his share exactly as his wallet shows it, and nothing about the referral).
 */

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sid = (v) => (v === null || v === undefined ? '' : String(v));
const IST_MS = 5.5 * 3600 * 1000;
const DAY_MS = 86400000;
const dayKey = (d) => new Date(new Date(d).getTime() + IST_MS).toISOString().slice(0, 10);
const monthKey = (d) => dayKey(d).slice(0, 7);
const shiftDay = (key, n) => new Date(new Date(`${key}T00:00:00.000Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);
const shiftMonth = (key, n) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

/** The viewer's own share in one ledger entry (+ for a deposit, − for a seller withdrawal). */
function myShareOf(e, viewerId) {
  let v = 0;
  for (const s of e.shares || []) {
    if (sid(s.userId) !== viewerId || s.referralOf) continue;
    v += Number(s.amountUSDT) || 0;
  }
  return e.kind === 'deposit' ? v : -v;
}

function emptyRow(id, name) {
  return {
    sellerId: id,
    storeName: name || 'Store',
    ownerId: '',
    ownerName: '',
    ownerRole: '',
    depositUSDT: 0,
    depositINR: 0,
    deposits: 0,
    withdrawUSDT: 0,
    withdrawals: 0,
    netUSDT: 0,
    myEarnedUSDT: 0, // my share of its deposits
    myWithdrawUSDT: 0, // my share of its withdrawals
    myNetUSDT: 0,
    rateINR: 0,
    rateUSDT: 0,
    firstDepositAt: null,
    lastDepositAt: null,
    lastWithdrawalAt: null,
    biggestDepositUSDT: 0,
  };
}

/**
 * @param viewer   the signed-in member (session)
 * @param scope    'mine' | 'all' ('all' only for partners)
 * @param sellerId one seller in detail (series + its transactions), optional
 */
export async function sellerAnalytics({ viewer, scope = 'mine', sellerId = '' }) {
  const viewerId = sid(viewer._id);
  const isPartner = viewer.role === 'admin';
  const all = isPartner && scope === 'all';
  const ledger = await buildLedger();

  // Who owns which seller now (real client sellers only: test accounts are not in this list)
  const options = ledger.sellerOptions || [];
  const nameOfPerson = new Map((ledger.people || []).map((p) => [p.id, p]));
  const ownedNow = new Map(options.map((o) => [o.id, o.assignedTo || '']));

  const inScope = (sellerKey, entryOwnerId) => {
    if (all) return true;
    // my sellers: assigned to me now, or the entry was divided for me as the owner
    return ownedNow.get(sellerKey) === viewerId || entryOwnerId === viewerId;
  };

  const rows = new Map();
  for (const o of options) {
    if (!inScope(o.id, '')) continue;
    if (sellerId && o.id !== sid(sellerId)) continue;
    const row = emptyRow(o.id, o.storeName);
    const owner = nameOfPerson.get(o.assignedTo);
    row.ownerId = o.assignedTo || '';
    row.ownerName = owner ? owner.name : '';
    row.ownerRole = owner ? owner.role : '';
    rows.set(o.id, row);
  }

  // Series: the last 12 months and the last 30 days (India days, like the rest of finance)
  const todayKey = dayKey(new Date());
  const thisMonth = todayKey.slice(0, 7);
  const months = [];
  for (let i = 11; i >= 0; i -= 1) months.push({ key: shiftMonth(thisMonth, -i), depositUSDT: 0, withdrawUSDT: 0, myNetUSDT: 0, deposits: 0 });
  const monthIdx = new Map(months.map((m, i) => [m.key, i]));
  const days = [];
  for (let i = 29; i >= 0; i -= 1) days.push({ key: shiftDay(todayKey, -i), depositUSDT: 0, withdrawUSDT: 0, myNetUSDT: 0, deposits: 0 });
  const dayIdx = new Map(days.map((d, i) => [d.key, i]));
  const byOwner = new Map();

  const one = sid(sellerId);
  const detailTx = [];
  const last7From = shiftDay(todayKey, -6);
  const prev7From = shiftDay(todayKey, -13);
  let last7 = 0;
  let prev7 = 0;
  let monthIn = 0;

  for (const e of ledger.entries || []) {
    if (e.kind !== 'deposit' && e.kind !== 'seller_withdrawal') continue;
    const key = sid(e.sellerId);
    if (!key) continue;
    const entryOwner = e.owner ? sid(e.owner.id) : '';
    if (!inScope(key, entryOwner)) continue;
    if (one && key !== one) continue;

    if (!rows.has(key)) {
      const row = emptyRow(key, e.storeName);
      row.ownerId = entryOwner;
      row.ownerName = e.owner ? e.owner.name : '';
      row.ownerRole = e.owner ? (e.owner.role === 'partner' || e.owner.role === 'admin' ? 'partner' : 'member') : '';
      rows.set(key, row);
    }
    const row = rows.get(key);
    const mine = myShareOf(e, viewerId);
    const usdt = Number(e.usdt) || 0;
    const dk = dayKey(e.date);
    const mk = monthKey(e.date);
    const mi = monthIdx.get(mk);
    const di = dayIdx.get(dk);

    if (e.kind === 'deposit') {
      row.depositUSDT += usdt;
      row.depositINR += Number(e.inr) || 0;
      row.deposits += 1;
      row.myEarnedUSDT += mine;
      if ((Number(e.inr) || 0) > 0 && usdt > 0) {
        row.rateINR += Number(e.inr);
        row.rateUSDT += usdt;
      }
      if (!row.firstDepositAt || new Date(e.date) < new Date(row.firstDepositAt)) row.firstDepositAt = e.date;
      if (!row.lastDepositAt || new Date(e.date) > new Date(row.lastDepositAt)) row.lastDepositAt = e.date;
      if (usdt > row.biggestDepositUSDT) row.biggestDepositUSDT = usdt;
      if (mi !== undefined) {
        months[mi].depositUSDT += usdt;
        months[mi].deposits += 1;
      }
      if (di !== undefined) {
        days[di].depositUSDT += usdt;
        days[di].deposits += 1;
      }
      if (dk >= last7From) last7 += usdt;
      else if (dk >= prev7From) prev7 += usdt;
      if (mk === thisMonth) monthIn += usdt;
    } else {
      row.withdrawUSDT += usdt;
      row.withdrawals += 1;
      row.myWithdrawUSDT += -mine;
      if (!row.lastWithdrawalAt || new Date(e.date) > new Date(row.lastWithdrawalAt)) row.lastWithdrawalAt = e.date;
      if (mi !== undefined) months[mi].withdrawUSDT += usdt;
      if (di !== undefined) days[di].withdrawUSDT += usdt;
    }
    if (mi !== undefined) months[mi].myNetUSDT += mine;
    if (di !== undefined) days[di].myNetUSDT += mine;

    if (all) {
      const ok = entryOwner || 'none';
      if (!byOwner.has(ok)) {
        byOwner.set(ok, { id: ok, name: e.owner ? e.owner.name : 'No owner', role: e.owner ? (e.owner.role === 'member' ? 'member' : 'partner') : '', depositUSDT: 0, withdrawUSDT: 0, sellers: new Set() });
      }
      const o = byOwner.get(ok);
      if (e.kind === 'deposit') o.depositUSDT += usdt;
      else o.withdrawUSDT += usdt;
      o.sellers.add(key);
    }

    if (one) {
      detailTx.push({
        id: e.id,
        kind: e.kind,
        date: e.date,
        usdt: r2(usdt),
        inr: r2(e.inr || 0),
        rate: e.rate || 0,
        myShareUSDT: r2(mine),
        ownerName: e.owner ? e.owner.name : '',
      });
    }
  }

  // Store meta: since when the seller is with us, and its store wallet (what it can still ask for)
  const ids = [...rows.keys()];
  const meta = ids.length
    ? await Seller.find({ _id: { $in: ids } })
        .select('storeName ownerName status createdAt wallet.balance wallet.pendingWithdrawal')
        .lean()
        .catch(() => [])
    : [];
  const metaOf = new Map(meta.map((m) => [sid(m._id), m]));

  const now = Date.now();
  const sellers = [...rows.values()].map((r) => {
    const m = metaOf.get(r.sellerId);
    return {
      sellerId: r.sellerId,
      storeName: r.storeName,
      sellerName: m?.ownerName || '',
      status: m?.status || '',
      joinedAt: m?.createdAt || null,
      // partners only: who the seller belongs to
      ...(isPartner ? { ownerId: r.ownerId, ownerName: r.ownerName, ownerRole: r.ownerRole } : {}),
      depositUSDT: r2(r.depositUSDT),
      depositINR: r2(r.depositINR),
      deposits: r.deposits,
      withdrawUSDT: r2(r.withdrawUSDT),
      withdrawals: r.withdrawals,
      netUSDT: r2(r.depositUSDT - r.withdrawUSDT),
      myEarnedUSDT: r2(r.myEarnedUSDT),
      myWithdrawUSDT: r2(r.myWithdrawUSDT),
      myNetUSDT: r2(r.myEarnedUSDT - r.myWithdrawUSDT),
      avgRate: r.rateUSDT > 0 ? r2(r.rateINR / r.rateUSDT) : 0,
      avgDepositUSDT: r.deposits > 0 ? r2(r.depositUSDT / r.deposits) : 0,
      biggestDepositUSDT: r2(r.biggestDepositUSDT),
      firstDepositAt: r.firstDepositAt,
      lastDepositAt: r.lastDepositAt,
      lastWithdrawalAt: r.lastWithdrawalAt,
      daysSinceDeposit: r.lastDepositAt ? Math.floor((now - new Date(r.lastDepositAt).getTime()) / DAY_MS) : null,
      storeBalanceUSD: r2(m?.wallet?.balance || 0),
      storePendingWithdrawalUSD: r2(m?.wallet?.pendingWithdrawal || 0),
    };
  });
  sellers.sort((a, b) => b.depositUSDT - a.depositUSDT || a.storeName.localeCompare(b.storeName));

  const sum = (k) => r2(sellers.reduce((s, x) => s + (Number(x[k]) || 0), 0));
  const depositUSDT = sum('depositUSDT');
  const deposits = sellers.reduce((s, x) => s + x.deposits, 0);
  const rateINR = [...rows.values()].reduce((s, r) => s + r.rateINR, 0);
  const rateUSDT = [...rows.values()].reduce((s, r) => s + r.rateUSDT, 0);

  const totals = {
    sellers: sellers.length,
    activeSellers: sellers.filter((s) => s.deposits > 0).length,
    quietSellers: sellers.filter((s) => s.deposits > 0 && s.daysSinceDeposit !== null && s.daysSinceDeposit >= 7).length,
    neverDeposited: sellers.filter((s) => s.deposits === 0).length,
    depositUSDT,
    depositINR: sum('depositINR'),
    deposits,
    withdrawUSDT: sum('withdrawUSDT'),
    withdrawals: sellers.reduce((s, x) => s + x.withdrawals, 0),
    netUSDT: r2(depositUSDT - sum('withdrawUSDT')),
    myEarnedUSDT: sum('myEarnedUSDT'),
    myWithdrawUSDT: sum('myWithdrawUSDT'),
    myNetUSDT: sum('myNetUSDT'),
    avgRate: rateUSDT > 0 ? r2(rateINR / rateUSDT) : 0,
    avgDepositUSDT: deposits > 0 ? r2(depositUSDT / deposits) : 0,
    last7USDT: r2(last7),
    prev7USDT: r2(prev7),
    monthUSDT: r2(monthIn),
    storeBalanceUSD: sum('storeBalanceUSD'),
  };

  const startDay = ledger.start ? dayKey(new Date(new Date(ledger.start).getTime() + 3600000)) : '0000-00-00';
  const startMonth = startDay.slice(0, 7);
  const out = {
    scope: all ? 'all' : 'mine',
    viewerRole: isPartner ? 'partner' : 'member',
    start: ledger.start,
    totals,
    // nothing is counted before the finance start: those days / months are left out of the charts
    months: months
      .filter((m) => m.key >= startMonth)
      .map((m) => ({ ...m, depositUSDT: r2(m.depositUSDT), withdrawUSDT: r2(m.withdrawUSDT), myNetUSDT: r2(m.myNetUSDT) })),
    days: days
      .filter((d) => d.key >= startDay)
      .map((d) => ({ ...d, depositUSDT: r2(d.depositUSDT), withdrawUSDT: r2(d.withdrawUSDT), myNetUSDT: r2(d.myNetUSDT) })),
    sellers,
  };
  if (all) {
    out.byOwner = [...byOwner.values()]
      .map((o) => ({ id: o.id, name: o.name, role: o.role, depositUSDT: r2(o.depositUSDT), withdrawUSDT: r2(o.withdrawUSDT), sellers: o.sellers.size }))
      .sort((a, b) => b.depositUSDT - a.depositUSDT);
  }
  if (one) {
    out.seller = sellers.find((s) => s.sellerId === one) || null;
    out.transactions = detailTx.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 200);
  }
  return out;
}
