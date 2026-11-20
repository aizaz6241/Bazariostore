'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Send,
  Search,
  X,
  CalendarDays,
  Store,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Gift,
  Landmark,
  Undo2,
  Loader2,
  Inbox,
} from 'lucide-react';
import { firstMonthKey, monthsSince, monthLabel, monthKeyOf, monthRange, addMonths, movementMonthKey } from '@/lib/utils/payoutMonths';

/**
 * Wallet: totals (earned / deducted / paid out, each opens a month-by-month breakdown),
 * filters (period, month, dates, type, store, search) and the transaction history with the
 * wallet balance after every line.
 *
 * Display only: it reads the statement the server already sends (GET /api/wallet?period=all).
 * The balance after each line is added up here from the same lines; it is shown only when it
 * ends exactly at the server's wallet balance, so a wrong number can never be shown.
 */

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdt = (n) => `${Number(n) < -0.004 ? '-' : ''}₮${fmt(Math.abs(Number(n) || 0))}`;
const time12 = (d) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const dayTitle = (d) => {
  const k = dayKey(d);
  if (k === dayKey(new Date())) return 'Today';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (k === dayKey(y)) return 'Yesterday';
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};
const parseDay = (s, end) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
  const [y, m, d] = s.split('-').map(Number);
  return end ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
};
const PAGE = 40;

/* ───────────── kinds of lines ───────────── */

// group: which total the line belongs to. sign: how it counts in that total.
const KINDS = {
  deposit: { label: 'Seller deposits', group: 'earned', sign: 1, chip: 'bg-emerald-50 text-emerald-700' },
  referral_in: { label: 'Referral commission', group: 'earned', sign: 1, chip: 'bg-indigo-50 text-indigo-700' },
  bonus: { label: 'Rewards & bonuses', group: 'earned', sign: 1, chip: 'bg-amber-50 text-amber-700' },
  other_in: { label: 'Other credits', group: 'earned', sign: 1, chip: 'bg-emerald-50 text-emerald-700' },
  withdrawal: { label: 'Seller withdrawals', group: 'deducted', sign: 1, chip: 'bg-rose-50 text-rose-700' },
  referral_out: { label: 'Referral withdrawals', group: 'deducted', sign: 1, chip: 'bg-orange-50 text-orange-700' },
  bonus_cost: { label: 'Reward costs', group: 'deducted', sign: 1, chip: 'bg-orange-50 text-orange-700' },
  reserve_to: { label: 'Moved to reserve pool', group: 'deducted', sign: 1, chip: 'bg-violet-50 text-violet-700' },
  reserve_from: { label: 'Back from reserve pool', group: 'deducted', sign: -1, chip: 'bg-violet-50 text-violet-700' },
  reserve_return: { label: 'Reserve money came back', group: 'deducted', sign: -1, chip: 'bg-violet-50 text-violet-700' },
  other_out: { label: 'Other deductions', group: 'deducted', sign: 1, chip: 'bg-rose-50 text-rose-700' },
  payout: { label: 'Payouts', group: 'paid', sign: 1, chip: 'bg-sky-50 text-sky-700' },
  gift: { label: 'Device gifts', group: 'paid', sign: 1, chip: 'bg-amber-50 text-amber-700' },
  reversed: { label: 'Reversed payouts', group: 'none', sign: 0, chip: 'bg-slate-100 text-slate-500' },
  other: { label: 'Other', group: 'none', sign: 0, chip: 'bg-slate-100 text-slate-500' },
};
const GROUPS = {
  earned: { title: 'Total earned', hint: 'Seller deposits, referral and rewards', icon: ArrowDownLeft, tone: 'emerald' },
  deducted: { title: 'Total deducted', hint: 'Seller withdrawals, reward costs, reserve', icon: ArrowUpRight, tone: 'rose' },
  paid: { title: 'Total paid out', hint: 'Payouts you received', icon: Send, tone: 'sky' },
};

export function kindOf(tx) {
  const cat = String(tx.category || '');
  if (cat === 'deposit_share') return tx.referral ? 'referral_in' : 'deposit';
  if (cat === 'seller_withdrawal_share') return tx.referral ? 'referral_out' : 'withdrawal';
  if (cat === 'bonus_reward') return 'bonus';
  if (cat === 'bonus_cost') return 'bonus_cost';
  if (cat === 'payout_withdrawal') return tx.gift ? 'gift' : 'payout';
  if (cat === 'payout_reversed') return 'reversed';
  if (cat === 'reserve_to' || cat === 'reserve_from' || cat === 'reserve_return') return cat;
  if (tx.type === 'credit') return 'other_in';
  if (tx.type === 'debit') return 'other_out';
  return 'other';
}

/** What the line does to the wallet: + credit, − debit, 0 for lines that are only shown. */
const effectOf = (tx) => {
  if ((tx.currency || 'USDT') !== 'USDT') return 0;
  const a = Number(tx.amount) || 0;
  if (tx.category === 'payout_reversed') return 0;
  if (tx.type === 'credit') return a;
  if (tx.type === 'debit') return -a;
  return 0;
};

/** Balance after every line, oldest to newest. ok = it ends at the server's balance. */
export function runningBalances(transactions, serverBalance) {
  const list = (transactions || []).map((tx, i) => ({ tx, i, t: new Date(tx.date).getTime() }));
  // same moment: money in before money out (a gift is credited and taken in the same second)
  list.sort((a, b) => a.t - b.t || effectOf(b.tx) - effectOf(a.tx) || a.i - b.i);
  const after = new Map();
  let bal = 0;
  for (const { tx } of list) {
    bal += effectOf(tx);
    after.set(tx.id, r2(bal));
  }
  const ok = Number.isFinite(Number(serverBalance)) && Math.abs(r2(bal) - r2(serverBalance)) <= 0.011;
  return { after, ok, end: r2(bal) };
}

/* ───────────── one line ───────────── */

function describe(tx, kind) {
  const pct = (String(tx.description || '').match(/(\d+(?:\.\d+)?)%/) || [])[1];
  const afterColon = (s) => {
    const i = String(s || '').indexOf(': ');
    return i >= 0 ? String(s).slice(i + 2) : String(s || '');
  };
  const rate = (String(tx.details || '').match(/INR @ ([\d.,]+)/) || [])[1];
  // the share line without the INR part in brackets (that part gets its own chip)
  const cleanDetails = String(tx.details || '')
    .replace(/\s*\(₹[^)]*\)/, '')
    .replace(' USDT received on Binance', ' received on Binance')
    .replace(' USDT paid to the seller from Binance', ' paid to the seller');

  switch (kind) {
    case 'deposit':
      return { title: `Deposit share${pct ? ` · ${pct}%` : ''}`, subject: tx.storeName, detail: cleanDetails, inr: tx.sellerINR, rate };
    case 'withdrawal':
      return { title: `Seller withdrawal${pct ? ` · ${pct}%` : ''}`, subject: tx.storeName, detail: cleanDetails, inr: tx.sellerINR, rate };
    case 'referral_in':
      return {
        title: `Referral commission${tx.referralPct ? ` · ${tx.referralPct}%` : ''}`,
        subject: `${tx.referralFrom || 'Member'} · ${tx.storeName}`,
        detail: cleanDetails,
        inr: tx.sellerINR,
        rate,
      };
    case 'referral_out':
      return {
        title: `Referral withdrawal${tx.referralPct ? ` · ${tx.referralPct}%` : ''}`,
        subject: `${tx.referralFrom || 'Member'} · ${tx.storeName}`,
        detail: cleanDetails,
        inr: tx.sellerINR,
        rate,
      };
    case 'bonus':
      return { title: 'Milestone reward', subject: afterColon(tx.description), detail: tx.details };
    case 'bonus_cost':
      return { title: 'Reward cost · your 50%', subject: afterColon(tx.description), detail: tx.details };
    case 'payout':
      return { title: `Payout${tx.forMonth ? ` · ${monthLabel(tx.forMonth)}` : ''}`, subject: tx.details && tx.details !== 'Payout withdrawal completed' ? tx.details : 'Paid on Binance', detail: '' };
    case 'gift':
      return { title: 'Device gift', subject: tx.details || 'Given as the device', detail: 'Given as the device, not as money' };
    case 'reversed':
      return { title: 'Payout reversed · not counted', subject: tx.details, detail: '' };
    case 'reserve_to':
    case 'reserve_from':
    case 'reserve_return':
      return { title: KINDS[kind].label, subject: tx.description, detail: tx.details };
    default:
      return { title: tx.description || KINDS[kind].label, subject: tx.storeName, detail: tx.details };
  }
}

function Row({ tx, after, showAfter }) {
  const kind = kindOf(tx);
  const meta = KINDS[kind];
  const eff = effectOf(tx);
  const d = describe(tx, kind);
  const reversed = kind === 'reversed';
  const Icon = kind === 'gift' || kind === 'bonus' ? Gift : kind.startsWith('reserve') ? Landmark : reversed ? Undo2 : kind === 'payout' ? Send : eff >= 0 ? ArrowDownLeft : ArrowUpRight;
  const iconTone = reversed ? 'bg-slate-100 text-slate-400' : eff > 0 ? 'bg-emerald-50 text-emerald-600' : kind === 'payout' ? 'bg-sky-50 text-sky-600' : 'bg-rose-50 text-rose-600';

  return (
    <div className={`px-4 sm:px-5 py-3.5 flex gap-3 ${reversed ? 'opacity-60' : ''}`}>
      <span className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${iconTone}`}>
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-slate-900 leading-snug">{d.title}</p>
            {d.subject && <p className="text-xs font-semibold text-slate-700 leading-snug break-words mt-0.5">{d.subject}</p>}
          </div>
          <div className="text-right shrink-0">
            <p className={`text-sm sm:text-base font-black tabular-nums ${reversed ? 'line-through text-slate-400' : eff > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {reversed ? '' : eff > 0 ? '+' : '-'}
              {usdt(Math.abs(Number(tx.amount) || 0))}
            </p>
            {showAfter && !reversed && (
              <p className="text-[11px] text-slate-400 tabular-nums mt-0.5" title="Wallet balance after this line">
                Bal. <span className="font-semibold text-slate-600">{usdt(after)}</span>
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <span className="text-[11px] text-slate-500 tabular-nums">{time12(tx.date)}</span>
          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${meta.chip}`}>{meta.label}</span>
          {d.inr > 0 && (
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600">
              ₹{Number(d.inr).toLocaleString('en-US', { maximumFractionDigits: 0 })}
              {d.rate ? ` @ ${d.rate}` : ''}
            </span>
          )}
        </div>
        {d.detail && <p className="text-[11px] text-slate-500 mt-1 leading-relaxed break-words">{d.detail}</p>}
      </div>
    </div>
  );
}

/* ───────────── breakdown popup ───────────── */

function Breakdown({ group, txs, firstKey, onClose, onShow }) {
  const [kind, setKind] = useState('all');
  const g = GROUPS[group];
  const kindsHere = Object.keys(KINDS).filter((k) => KINDS[k].group === group);

  const perKind = useMemo(() => {
    const m = new Map();
    for (const tx of txs) {
      const k = kindOf(tx);
      if (KINDS[k].group !== group) continue;
      const x = m.get(k) || { total: 0, count: 0 };
      x.total += KINDS[k].sign * (Number(tx.amount) || 0);
      x.count += 1;
      m.set(k, x);
    }
    return m;
  }, [txs, group]);

  const months = useMemo(() => {
    const m = new Map();
    for (const tx of txs) {
      const k = kindOf(tx);
      if (KINDS[k].group !== group || (kind !== 'all' && k !== kind)) continue;
      const key = movementMonthKey(tx.date, firstKey);
      const x = m.get(key) || { key, total: 0, count: 0 };
      x.total += KINDS[k].sign * (Number(tx.amount) || 0);
      x.count += 1;
      m.set(key, x);
    }
    return [...m.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [txs, group, kind, firstKey]);

  const total = [...perKind.values()].reduce((s, x) => s + x.total, 0);
  const shownTotal = kind === 'all' ? total : perKind.get(kind)?.total || 0;
  const max = months.reduce((m, x) => Math.max(m, Math.abs(x.total)), 0);
  const bar = { emerald: '#059669', rose: '#e11d48', sky: '#0284c7' }[g.tone];

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={g.title}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[88vh] flex flex-col animate-scale-up">
        <div className="px-5 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{g.title}</p>
              <p className="text-3xl font-black text-slate-900 tabular-nums mt-0.5">{usdt(shownTotal)}</p>
              <p className="text-xs text-slate-500 mt-0.5">{kind === 'all' ? g.hint : KINDS[kind].label}</p>
            </div>
            <button type="button" onClick={onClose} className="p-2 -mr-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex gap-1.5 mt-4 overflow-x-auto no-scrollbar">
            {['all', ...kindsHere.filter((k) => perKind.has(k))].map((k) => {
              const on = kind === k;
              const v = k === 'all' ? total : perKind.get(k).total;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`shrink-0 text-left px-3 py-2 rounded-xl border transition ${on ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                >
                  <span className={`block text-[10px] font-bold ${on ? 'text-white/70' : 'text-slate-400'}`}>{k === 'all' ? 'All' : KINDS[k].label}</span>
                  <span className="block text-xs font-extrabold tabular-nums">{usdt(v)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-y-auto px-2 py-2">
          <p className="px-3 pt-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Month by month</p>
          {months.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-slate-400">Nothing here yet</p>
          ) : (
            months.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => onShow({ kind: kind === 'all' ? `g:${group}` : kind, month: m.key })}
                className="w-full text-left px-3 py-2.5 rounded-2xl hover:bg-slate-50 flex items-center gap-3 group"
              >
                <span className="w-24 shrink-0">
                  <span className="block text-sm font-bold text-slate-800">{monthLabel(m.key, true)}</span>
                  <span className="block text-[11px] text-slate-400">
                    {m.count} {m.count === 1 ? 'entry' : 'entries'}
                  </span>
                </span>
                <span className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <span className="block h-full rounded-full" style={{ width: `${max > 0 ? Math.max(3, (Math.abs(m.total) / max) * 100) : 0}%`, background: bar }} />
                </span>
                <span className="w-28 text-right text-sm font-extrabold text-slate-900 tabular-nums shrink-0">{usdt(m.total)}</span>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 shrink-0" />
              </button>
            ))
          )}
        </div>

        <div className="p-4 border-t border-slate-100">
          <button
            type="button"
            onClick={() => onShow({ kind: kind === 'all' ? `g:${group}` : kind, month: '' })}
            className="w-full py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold"
          >
            Show these entries
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────── main ───────────── */

export default function WalletHistory({ data, loading }) {
  const txs = data?.transactions || [];
  const balances = data?.balances || {};
  const firstKey = useMemo(() => firstMonthKey(data?.financeStart), [data?.financeStart]);
  const months = useMemo(() => monthsSince(firstKey), [firstKey]);
  const thisMonth = monthKeyOf(new Date());

  const run = useMemo(() => runningBalances(txs, balances.balanceUSDT), [txs, balances.balanceUSDT]);

  const totals = useMemo(() => {
    const t = { earned: 0, deducted: 0, paid: 0, count: { earned: 0, deducted: 0, paid: 0 } };
    for (const tx of txs) {
      const k = kindOf(tx);
      const m = KINDS[k];
      if (!t.count[m.group] && t.count[m.group] !== 0) continue;
      t[m.group] += m.sign * (Number(tx.amount) || 0);
      t.count[m.group] += 1;
    }
    t.earned = r2(t.earned);
    t.deducted = r2(t.deducted);
    t.paid = r2(t.paid);
    return t;
  }, [txs]);
  const adds = Math.abs(r2(totals.earned - totals.deducted - totals.paid) - r2(balances.balanceUSDT)) <= 0.011;

  // ── filters ──
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all'); // 'all' | 'g:earned' | 'g:deducted' | 'g:paid' | a kind
  const [store, setStore] = useState('');
  const [period, setPeriod] = useState('all'); // 'all' | 'this' | 'last' | 'month' | 'custom'
  const [month, setMonth] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [popup, setPopup] = useState('');
  const listRef = useRef(null);

  useEffect(() => setShown(PAGE), [q, kind, store, period, month, from, to]);

  const stores = useMemo(() => {
    const set = new Set();
    for (const tx of txs) if ((tx.category === 'deposit_share' || tx.category === 'seller_withdrawal_share') && tx.storeName) set.add(tx.storeName);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [txs]);

  const range = useMemo(() => {
    if (period === 'this') return monthRange(thisMonth);
    if (period === 'last') return monthRange(addMonths(thisMonth, -1));
    if (period === 'month' && month) return monthRange(month);
    if (period === 'custom') {
      const a = parseDay(from, false);
      const b = parseDay(to, true);
      if (a && b && a > b) return { from: parseDay(to, false), to: parseDay(from, true) };
      return { from: a, to: b };
    }
    return { from: null, to: null };
  }, [period, month, from, to, thisMonth]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return txs
      .filter((tx) => {
        const k = kindOf(tx);
        if (kind.startsWith('g:')) {
          if (KINDS[k].group !== kind.slice(2)) return false;
        } else if (kind !== 'all' && k !== kind) return false;
        if (store && tx.storeName !== store) return false;
        const t = new Date(tx.date).getTime();
        if (range.from && t < range.from.getTime()) return false;
        if (range.to && t > range.to.getTime()) return false;
        if (needle) {
          const hay = `${tx.description || ''} ${tx.storeName || ''} ${tx.details || ''} ${tx.referralFrom || ''} ${KINDS[k].label}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [txs, q, kind, store, range]);

  const sums = useMemo(() => {
    let inn = 0;
    let out = 0;
    for (const tx of filtered) {
      const e = effectOf(tx);
      if (e > 0) inn += e;
      else out -= e;
    }
    return { inn: r2(inn), out: r2(out), net: r2(inn - out) };
  }, [filtered]);

  const filtersOn = q || kind !== 'all' || store || period !== 'all';
  const clearAll = () => {
    setQ('');
    setKind('all');
    setStore('');
    setPeriod('all');
    setMonth('');
    setFrom('');
    setTo('');
  };

  const showFromPopup = ({ kind: k, month: m }) => {
    setPopup('');
    setKind(k);
    setStore('');
    setQ('');
    if (m) {
      setPeriod('month');
      setMonth(m);
    } else {
      setPeriod('all');
    }
    setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  // group the page of lines by day
  const page = filtered.slice(0, shown);
  const days = [];
  for (const tx of page) {
    const k = dayKey(tx.date);
    if (!days.length || days[days.length - 1].key !== k) days.push({ key: k, date: tx.date, items: [] });
    days[days.length - 1].items.push(tx);
  }

  const periodChips = [
    { key: 'all', label: 'All time' },
    { key: 'this', label: 'This month' },
    { key: 'last', label: 'Last month' },
  ];
  const tone = {
    emerald: { icon: 'bg-emerald-100 text-emerald-700', value: 'text-emerald-700', ring: 'hover:border-emerald-300' },
    rose: { icon: 'bg-rose-100 text-rose-700', value: 'text-rose-600', ring: 'hover:border-rose-300' },
    sky: { icon: 'bg-sky-100 text-sky-700', value: 'text-sky-700', ring: 'hover:border-sky-300' },
  };
  const select = 'w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="space-y-4">
      {/* ── The three totals: tap one for the month-by-month breakdown ── */}
      <section>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
          {Object.entries(GROUPS).map(([key, g]) => {
            const t = tone[g.tone];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setPopup(key)}
                disabled={!data}
                className={`group text-left bg-white rounded-3xl border border-slate-200 p-3.5 sm:p-5 transition hover:shadow-md ${t.ring} disabled:opacity-60 flex items-center gap-3 sm:block`}
              >
                <div className="flex items-center justify-between shrink-0">
                  <span className={`w-10 h-10 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center ${t.icon}`}>
                    <g.icon className="w-[18px] h-[18px]" />
                  </span>
                  <span className="hidden sm:flex text-[11px] font-bold text-slate-400 group-hover:text-slate-700 items-center gap-0.5">
                    Details <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-500 sm:mt-3">{g.title}</p>
                  <p className={`text-xl sm:text-2xl font-black tabular-nums tracking-tight ${t.value}`}>{usdt(totals[key])}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                    {totals.count[key]} {totals.count[key] === 1 ? 'entry' : 'entries'}<span className="hidden sm:inline"> · {g.hint}</span>
                  </p>
                </div>
                <ChevronRight className="sm:hidden w-5 h-5 text-slate-300 group-hover:text-slate-600 shrink-0" />
              </button>
            );
          })}
        </div>
        {data && adds && (
          <p className="text-[11px] text-slate-500 mt-2 px-1 flex items-center gap-1.5 flex-wrap">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Earned {usdt(totals.earned)} − deducted {usdt(totals.deducted)} − paid out {usdt(totals.paid)} ={' '}
            <b className="text-slate-800">{usdt(balances.balanceUSDT)}</b> in your wallet
          </p>
        )}
      </section>

      {/* ── Filters ── */}
      <section ref={listRef} className="scroll-mt-24 bg-white rounded-3xl border border-slate-200 p-3 sm:p-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search store, member, note…"
              className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            />
            {q && (
              <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700" aria-label="Clear search">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMoreOpen(!moreOpen)}
            className={`px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
              moreOpen || kind !== 'all' || store ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            aria-expanded={moreOpen}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Filters</span>
            {(kind !== 'all') + (store ? 1 : 0) > 0 && (
              <span className="min-w-[18px] h-[18px] rounded-full bg-emerald-500 text-white text-[10px] leading-[18px] text-center">{(kind !== 'all') + (store ? 1 : 0)}</span>
            )}
          </button>
        </div>

        {/* period */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-0.5 px-0.5">
          {periodChips.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition ${period === p.key ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {p.label}
            </button>
          ))}
          <select
            value={period === 'month' ? month : ''}
            onChange={(e) => {
              if (e.target.value) {
                setPeriod('month');
                setMonth(e.target.value);
              } else setPeriod('all');
            }}
            aria-label="Pick a month"
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border-0 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
              period === 'month' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            <option value="">Pick month…</option>
            {months.map((k) => (
              <option key={k} value={k}>
                {monthLabel(k)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setPeriod('custom')}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition ${period === 'custom' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            <CalendarDays className="w-3.5 h-3.5" /> Dates
          </button>
        </div>

        {period === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">From</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={select} />
            </label>
            <label className="block">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">To</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={select} />
            </label>
          </div>
        )}

        {moreOpen && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <label className="block">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Type</span>
              <select value={kind} onChange={(e) => setKind(e.target.value)} className={select}>
                <option value="all">Everything</option>
                {Object.entries(GROUPS).map(([gk, g]) => (
                  <optgroup key={gk} label={g.title}>
                    <option value={`g:${gk}`}>All — {g.title.replace('Total ', '')}</option>
                    {Object.keys(KINDS)
                      .filter((k) => KINDS[k].group === gk)
                      .map((k) => (
                        <option key={k} value={k}>
                          {KINDS[k].label}
                        </option>
                      ))}
                  </optgroup>
                ))}
                <option value="reversed">Reversed payouts</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                <Store className="w-3 h-3" /> Store / seller
              </span>
              <select value={store} onChange={(e) => setStore(e.target.value)} className={select}>
                <option value="">All stores</option>
                {stores.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* what the filter adds up to */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2 border-t border-slate-100 text-xs">
          <span className="font-bold text-slate-800">
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
          </span>
          <span className="text-slate-500">
            In <b className="text-emerald-700 tabular-nums">+{usdt(sums.inn)}</b>
          </span>
          <span className="text-slate-500">
            Out <b className="text-rose-600 tabular-nums">-{usdt(sums.out)}</b>
          </span>
          <span className="text-slate-500">
            Net <b className={`tabular-nums ${sums.net < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{sums.net > 0 ? '+' : ''}{usdt(sums.net)}</b>
          </span>
          {filtersOn && (
            <button type="button" onClick={clearAll} className="ml-auto text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1">
              <X className="w-3.5 h-3.5" /> Clear filters
            </button>
          )}
        </div>
      </section>

      {/* ── Transaction history ── */}
      <section className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-900">Transaction history</h2>
          {run.ok ? (
            <span className="text-[11px] text-slate-400">Newest first · balance after each line</span>
          ) : (
            <span className="text-[11px] text-slate-400">Newest first</span>
          )}
        </div>

        {loading && !data ? (
          <div className="py-16 flex flex-col items-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            Loading your statement…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <Inbox className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700 mt-2">No entries {filtersOn ? 'match these filters' : 'yet'}</p>
            {filtersOn && (
              <button type="button" onClick={clearAll} className="mt-3 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            {days.map((d) => (
              <div key={d.key}>
                <div className="sticky top-14 lg:top-16 z-10 px-4 sm:px-5 py-1.5 bg-slate-50/95 backdrop-blur border-y border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {dayTitle(d.date)}
                </div>
                <div className="divide-y divide-slate-100">
                  {d.items.map((tx) => (
                    <Row key={tx.id} tx={tx} after={run.after.get(tx.id)} showAfter={run.ok} />
                  ))}
                </div>
              </div>
            ))}
            {filtered.length > shown && (
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE)}
                className="w-full py-3.5 border-t border-slate-100 text-xs font-bold text-emerald-700 hover:bg-emerald-50 flex items-center justify-center gap-1"
              >
                Show {Math.min(PAGE, filtered.length - shown)} more <ChevronDown className="w-4 h-4" />
              </button>
            )}
          </>
        )}
      </section>

      {popup && <Breakdown group={popup} txs={txs} firstKey={firstKey} onClose={() => setPopup('')} onShow={showFromPopup} />}
    </div>
  );
}
