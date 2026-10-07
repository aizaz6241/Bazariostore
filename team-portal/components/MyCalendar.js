'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveRefresh } from './LiveProvider';
import { readCache, writeCache } from '@/lib/clientCache';
import { dayKey } from '@/lib/utils/analytics';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';

/**
 * "My Calendar" — a person's OWN wallet, day by day (members, and each partner for himself).
 *
 * The numbers are the lines of the person's Wallet statement (real Binance USDT), grouped into
 * calendar days: nothing is worked out again here.
 * A day on which the person earned (share of a deposit, bonus) is filled green with the day's
 * earning under its date. A payout the person took is violet, a share of a seller withdrawal is
 * red (the whole cell when nothing was earned that day, a dot otherwise). Tapping a day opens every transaction of that day.
 */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const fmt = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const cellParts = (n) => {
  const [whole, cents] = (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).split('.');
  return [Number(whole).toLocaleString('en-US'), cents];
};
const monthKeyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const longDay = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};
const timeOf = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// One wallet line -> what it means for the calendar
const EARNED = new Set(['deposit_share', 'bonus_reward']);
const KIND_LABEL = {
  deposit_share: 'Deposit share',
  bonus_reward: 'Bonus',
  seller_withdrawal_share: 'Seller withdrawal',
  bonus_cost: 'Bonus cost',
  payout_withdrawal: 'Payout',
  payout_reversed: 'Payout reversed',
  reserve_to: 'To reserve',
  reserve_from: 'From reserve',
  reserve_return: 'Reserve returned',
};
function lineOf(tx) {
  if ((tx.currency || 'USDT') !== 'USDT') return null;
  const amount = Number(tx.amount) || 0;
  const t = new Date(tx.date).getTime();
  if (!Number.isFinite(t)) return null;
  // side: 'earned' (counts as earning), 'out' (left the wallet), 'in' (came in, not an earning), 'info'
  let side = 'info';
  if (tx.type === 'credit') side = EARNED.has(tx.category) ? 'earned' : 'in';
  else if (tx.type === 'debit') side = 'out';
  return { id: tx.id, t, side, amount, payout: tx.category === 'payout_withdrawal', label: KIND_LABEL[tx.category] || (side === 'out' ? 'Deducted' : 'Added'), title: tx.description || '', details: tx.details || '', store: tx.storeName || '' };
}

export default function MyCalendar() {
  const cacheKey = 'my_calendar';
  const [data, setData] = useState(() => readCache(cacheKey));
  const [loading, setLoading] = useState(() => !readCache(cacheKey));
  const [error, setError] = useState('');
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selected, setSelected] = useState(() => dayKey(new Date()));
  const [panelOpen, setPanelOpen] = useState(false);
  const requestNo = useRef(0);

  const load = useCallback(async (silent = false) => {
    const mine = ++requestNo.current;
    try {
      if (!silent) setError('');
      const token = localStorage.getItem('portal_token');
      const res = await fetch('/api/wallet?period=all', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Could not load your calendar');
      if (mine !== requestNo.current) return;
      // only what the calendar needs is kept
      const lines = (json.transactions || []).map(lineOf).filter(Boolean).sort((a, b) => a.t - b.t);
      const next = { lines };
      setData(next);
      writeCache(cacheKey, next, false);
    } catch (e) {
      if (!silent && mine === requestNo.current) setError(e.message);
    } finally {
      if (mine === requestNo.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(Boolean(readCache(cacheKey)));
  }, [load]);
  // a new deposit share / payout lands on its day by itself
  useLiveRefresh(() => load(true));

  // key -> { earned, out, items }
  const byDay = useMemo(() => {
    const map = new Map();
    for (const l of data?.lines || []) {
      const key = dayKey(l.t);
      if (!map.has(key)) map.set(key, { earned: 0, out: 0, other: 0, items: [] });
      const day = map.get(key);
      if (l.side === 'earned') day.earned += l.amount;
      else if (l.side === 'out' && l.payout) {
        day.out += l.amount;
        day.payout = (day.payout || 0) + l.amount;
      } else if (l.side === 'out') day.out += l.amount;
      else if (l.side === 'in') day.other += l.amount;
      day.items.push(l);
    }
    return map;
  }, [data]);

  const today = dayKey(new Date());
  const thisMonth = monthKeyOf(new Date());
  const firstT = data?.lines?.[0]?.t;
  const firstMonth = firstT ? monthKeyOf(new Date(firstT)) : thisMonth;
  const mKey = monthKeyOf(month);
  const canGoBack = mKey > firstMonth;
  const canGoForward = mKey < thisMonth;

  const cells = useMemo(() => {
    const y = month.getFullYear();
    const m = month.getMonth();
    const lead = (new Date(y, m, 1).getDay() + 6) % 7; // week starts on Monday
    const count = new Date(y, m + 1, 0).getDate();
    const list = [];
    for (let i = 0; i < lead; i++) list.push(null);
    for (let d = 1; d <= count; d++) list.push({ d, key: `${mKey}-${String(d).padStart(2, '0')}` });
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [month, mKey]);

  const totals = useMemo(() => {
    let earned = 0;
    let out = 0;
    let days = 0;
    let best = null;
    let payout = 0;
    for (const [key, day] of byDay) {
      if (!key.startsWith(mKey)) continue;
      earned += day.earned;
      out += day.out;
      payout += day.payout || 0;
      if (day.earned > 0) {
        days += 1;
        if (!best || day.earned > best.earned) best = { key, earned: day.earned };
      }
    }
    return { earned, out, days, best, payout };
  }, [byDay, mKey]);

  const move = (n) => {
    const next = new Date(month.getFullYear(), month.getMonth() + n, 1);
    setMonth(next);
    setSelected(monthKeyOf(next) === thisMonth ? today : '');
    setPanelOpen(false);
  };
  const openDay = (key) => {
    setSelected(key);
    setPanelOpen(true);
  };

  const sel = selected && selected.startsWith(mKey) ? byDay.get(selected) : null;
  const monthName = month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <section className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-4 sm:p-6" aria-label="My calendar">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
            <CalendarDays className="w-5 h-5 text-emerald-600" />
            <span>My Calendar</span>
          </h2>
          <p className="text-xs text-slate-500">What you earned each day (real USDT, same as your Wallet). Tap a day to see its transactions.</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => move(-1)} disabled={!canGoBack} aria-label="Previous month" className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="min-w-[128px] text-center text-sm font-bold text-slate-900" aria-live="polite">
            {monthName}
          </span>
          <button onClick={() => move(1)} disabled={!canGoForward} aria-label="Next month" className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* The month in one line */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs text-slate-600">
        <span>
          Earned this month <b className="text-base font-extrabold text-emerald-700 tabular-nums">₮{fmt(totals.earned)}</b>
        </span>
        <span>
          on <b className="text-slate-900">{totals.days}</b> day{totals.days === 1 ? '' : 's'}
        </span>
        {totals.payout > 0 && (
          <span>
            Payouts taken <b className="text-violet-700 tabular-nums">₮{fmt(totals.payout)}</b>
          </span>
        )}
        {totals.out - totals.payout > 0.004 && (
          <span>
            Seller withdrawals etc. <b className="text-red-700 tabular-nums">₮{fmt(totals.out - totals.payout)}</b>
          </span>
        )}
        {totals.best && (
          <span>
            Best day <b className="text-slate-900">{Number(totals.best.key.slice(8))}</b> (₮{fmt(totals.best.earned)})
          </span>
        )}
      </div>

      {error && (
        <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between gap-2">
          <span>{error}</span>
          <button onClick={() => load()} className="px-2.5 py-1 rounded-lg bg-white border border-red-200 font-bold">
            Try again
          </button>
        </div>
      )}

      {loading && !data ? (
        <div className="py-14 flex flex-col items-center text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          <p className="text-xs mt-2">Loading your calendar…</p>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-7 gap-1 sm:gap-1.5">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-400 pb-1">
                {w}
              </div>
            ))}
            {cells.map((c, i) => {
              if (!c) return <div key={`x${i}`} aria-hidden="true" />;
              const day = byDay.get(c.key);
              const has = !!day && day.earned > 0;
              const onlyOut = !!day && !has && day.out > 0;
              const payout = day?.payout || 0;
              const otherOut = (day?.out || 0) - payout;
              const isToday = c.key === today;
              const isSel = c.key === selected;
              const future = c.key > today;
              const label = `${longDay(c.key)}: ${
                has ? `earned ${fmt(day.earned)} USDT` : onlyOut ? 'nothing earned' : day ? 'other wallet lines' : 'nothing'
              }${payout > 0 ? `, payout taken ${fmt(payout)} USDT` : ''}${otherOut > 0.004 ? `, ${fmt(otherOut)} USDT went out (seller withdrawal etc.)` : ''}`;
              return (
                <button
                  key={c.key}
                  onClick={() => openDay(c.key)}
                  aria-label={label}
                  aria-pressed={isSel}
                  className={`relative h-14 sm:h-16 rounded-xl flex flex-col items-center justify-center leading-none transition-colors ${
                    has
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                      : onlyOut && payout > 0
                      ? 'bg-violet-100 text-violet-900 border border-violet-300 hover:bg-violet-200'
                      : onlyOut
                      ? 'bg-red-50 text-red-900 border border-red-300 hover:bg-red-100'
                      : future
                      ? 'text-slate-300 hover:bg-slate-50'
                      : 'text-slate-600 hover:bg-slate-100'
                  } ${isSel && panelOpen ? 'ring-2 ring-offset-2 ring-slate-900' : isToday ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                >
                  <span className={`text-sm tabular-nums ${has || onlyOut || isToday ? 'font-extrabold' : 'font-medium'}`}>{c.d}</span>
                  {isToday && <span className="absolute top-1 left-1 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white" aria-hidden="true" />}
                  {(has || onlyOut) && (
                    <span className="mt-1 max-w-full font-bold tabular-nums whitespace-nowrap tracking-tighter sm:tracking-normal text-[9px] sm:text-[11px]">
                      {onlyOut && '−'}
                      <span className="hidden sm:inline">₮{cellParts(has ? day.earned : day.out)[0]}</span>
                      <span className="sm:hidden">{cellParts(has ? day.earned : day.out)[0].replace(/,/g, '')}</span>
                      <span className="text-[8px] sm:text-[10px] opacity-90">.{cellParts(has ? day.earned : day.out)[1]}</span>
                    </span>
                  )}
                  {/* something also went out that day */}
                  {payout > 0 && !(onlyOut && payout > 0) && <span className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-violet-500 ring-1 ring-white" aria-hidden="true" />}
                  {otherOut > 0.004 && !(onlyOut && !(payout > 0)) && <span className="absolute bottom-1 left-1 w-2 h-2 rounded-full bg-red-500 ring-1 ring-white" aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-600" /> You earned (day total under the date)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-violet-100 border border-violet-300" />
              <span className="w-2.5 h-2.5 rounded-full bg-violet-500" /> Payout you took
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-red-50 border border-red-300" />
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Seller withdrawal share
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Today
            </span>
          </div>

          <MyDayPanel open={panelOpen && Boolean(selected)} dayKeyValue={selected} day={sel} isFuture={selected > today} isToday={selected === today} onClose={() => setPanelOpen(false)} />
        </>
      )}
    </section>
  );
}

/** The tapped day: every wallet line of that day, with the day's earned / went out / net on top. */
function MyDayPanel({ open, dayKeyValue, day, isFuture, isToday, onClose }) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [present, setPresent] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (open) {
      setPresent(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setPresent(false), 200);
    return () => clearTimeout(t);
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = before;
    };
  }, [open, onClose]);

  const items = useMemo(() => [...(day?.items || [])].sort((a, b) => a.t - b.t), [day]);
  const earned = day?.earned || 0;
  const out = day?.out || 0;
  const payout = day?.payout || 0;
  const otherOut = out - payout;
  const net = earned + (day?.other || 0) - out;

  if (!mounted || !present || !dayKeyValue) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={`My transactions of ${longDay(dayKeyValue)}`}>
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className={`absolute inset-0 w-full h-full bg-slate-900/40 transition-opacity duration-200 cursor-default ${shown ? 'opacity-100' : 'opacity-0'}`}
      />
      <aside className={`absolute inset-y-0 right-0 w-full sm:max-w-md bg-white shadow-2xl flex flex-col transition-transform duration-200 ease-out ${shown ? 'translate-x-0' : 'translate-x-full'}`}>
        <header className="px-4 sm:px-5 pt-4 pb-3 border-b border-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                {isToday && <span className="w-2 h-2 rounded-full bg-blue-500" aria-hidden="true" />}
                {isToday ? 'Today · my wallet' : 'My wallet this day'}
              </p>
              <h3 className="text-base font-bold text-slate-900">{longDay(dayKeyValue)}</h3>
            </div>
            <button ref={closeRef} onClick={onClose} aria-label="Close" className="p-2 -mr-1 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900">
              <X className="w-5 h-5" />
            </button>
          </div>
          {items.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-2.5 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Earned</p>
                <p className="text-xs sm:text-sm font-extrabold text-emerald-800 tabular-nums break-all">₮{fmt(earned)}</p>
              </div>
              <div className="rounded-xl bg-violet-50 border border-violet-200 px-2.5 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Payout taken</p>
                <p className="text-xs sm:text-sm font-extrabold text-violet-900 tabular-nums break-all">₮{fmt(payout)}</p>
              </div>
              <div className="rounded-xl bg-red-50 border border-red-100 px-2.5 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-700">Seller withdrawals etc.</p>
                <p className="text-xs sm:text-sm font-extrabold text-red-800 tabular-nums break-all">₮{fmt(otherOut)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-2.5 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Net</p>
                <p className={`text-xs sm:text-sm font-extrabold tabular-nums break-all ${net < 0 ? 'text-red-800' : 'text-slate-900'}`}>
                  {net < 0 ? '−' : ''}₮{fmt(Math.abs(net))}
                </p>
              </div>
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4">
          {items.length === 0 ? (
            <p className="text-sm text-slate-500 py-10 text-center">{isFuture ? 'This day has not come yet.' : 'Nothing in your wallet on this day.'}</p>
          ) : (
            <>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">All transactions ({items.length})</h4>
              <ul className="mt-1.5 space-y-2">
                {items.map((l) => (
                  <li key={l.id} className={`rounded-xl border px-3 py-2.5 ${l.payout ? 'border-violet-200 bg-violet-50' : l.side === 'out' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 break-words">{l.title || l.label}</p>
                        <p className="text-[11px] text-slate-500">
                          {timeOf(l.t)} ·{' '}
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                              l.payout ? 'bg-violet-200 text-violet-900' : l.side === 'out' ? 'bg-red-200 text-red-900' : l.side === 'earned' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {l.label}
                          </span>
                        </p>
                        {l.details && <p className="text-[11px] text-slate-500 mt-0.5 break-words">{l.details}</p>}
                      </div>
                      <p className={`shrink-0 text-sm font-extrabold tabular-nums ${l.payout ? 'text-violet-800' : l.side === 'out' ? 'text-red-700' : l.side === 'info' ? 'text-slate-400' : 'text-emerald-700'}`}>
                        {l.side === 'out' ? '−' : l.side === 'info' ? '' : '+'}₮{fmt(l.amount)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}
