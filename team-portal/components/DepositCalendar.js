'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveRefresh } from './LiveProvider';
import { readCache, writeCache } from '@/lib/clientCache';
import { dayKey } from '@/lib/utils/analytics';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';

/**
 * Deposits calendar (partners' dashboard).
 *
 * One month at a time. A day on which real USDT came into Binance is filled green and carries
 * the day's exact total under its date. Tapping a day opens a panel from the right with every
 * deposit of that day (store, member, INR, USDT) and the day's totals per member.
 * A day that only has deposits still waiting for their real USDT is marked amber.
 * Money that left Binance is shown too: a payout taken by a member / partner in violet, a seller
 * withdrawal in red (a dot on a day that also has deposits, the whole cell when it has none).
 * A milestone bonus given to a member is cyan (it moves between wallets; Binance does not change).
 * Today carries a blue dot.
 */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const fmt = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
// the exact day total for a calendar cell, split so the cents can be drawn smaller: 109.17 -> ['109', '17']
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

export default function DepositCalendar() {
  const cacheKey = 'deposit_calendar';
  const [data, setData] = useState(() => readCache(cacheKey));
  const [loading, setLoading] = useState(() => !readCache(cacheKey));
  const [error, setError] = useState('');
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selected, setSelected] = useState(() => dayKey(new Date()));
  // the day panel (slides in from the right) opens only when a day is tapped
  const [panelOpen, setPanelOpen] = useState(false);
  const requestNo = useRef(0);

  const load = useCallback(async (silent = false) => {
    const mine = ++requestNo.current;
    try {
      if (!silent) setError('');
      const token = localStorage.getItem('portal_token');
      const res = await fetch('/api/calendar', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Could not load the calendar');
      if (mine !== requestNo.current) return;
      setData(json);
      writeCache(cacheKey, json, false);
    } catch (e) {
      if (!silent && mine === requestNo.current) setError(e.message);
    } finally {
      if (mine === requestNo.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(Boolean(readCache(cacheKey)));
  }, [load]);
  // a new deposit shows up on its day by itself
  useLiveRefresh(() => load(true));

  // every day that has deposits: key -> { usdt, counted, waiting, items }
  const byDay = useMemo(() => {
    const map = new Map();
    for (const d of data?.deposits || []) {
      const key = dayKey(d.t);
      if (!map.has(key)) map.set(key, { usdt: 0, counted: 0, waiting: 0, items: [] });
      const day = map.get(key);
      if (d.counted) {
        day.usdt += d.usdt;
        day.counted += 1;
      } else {
        day.waiting += 1;
      }
      day.items.push(d);
    }
    // money that left Binance that day: payouts (member / partner) and seller withdrawals
    for (const o of data?.outs || []) {
      const key = dayKey(o.t);
      if (!map.has(key)) map.set(key, { usdt: 0, counted: 0, waiting: 0, items: [] });
      const day = map.get(key);
      if (o.kind === 'payout') day.payout = (day.payout || 0) + o.usdt;
      else day.sellerOut = (day.sellerOut || 0) + o.usdt;
      (day.outs = day.outs || []).push(o);
    }
    // milestone bonuses given to members that day
    for (const b of data?.bonuses || []) {
      const key = dayKey(b.t);
      if (!map.has(key)) map.set(key, { usdt: 0, counted: 0, waiting: 0, items: [] });
      const day = map.get(key);
      day.bonus = (day.bonus || 0) + b.usdt;
      (day.bonuses = day.bonuses || []).push(b);
    }
    return map;
  }, [data]);

  const today = dayKey(new Date());
  const thisMonth = monthKeyOf(new Date());
  // nothing to look at before the month of the very first deposit
  const firstT = Math.min(data?.deposits?.[0]?.t ?? Infinity, data?.outs?.[0]?.t ?? Infinity, data?.bonuses?.[0]?.t ?? Infinity);
  const firstMonth = Number.isFinite(firstT) ? monthKeyOf(new Date(firstT)) : thisMonth;
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
    let usdt = 0;
    let deposits = 0;
    let days = 0;
    let waiting = 0;
    let best = null;
    let payout = 0;
    let sellerOut = 0;
    let bonus = 0;
    for (const [key, day] of byDay) {
      if (!key.startsWith(mKey)) continue;
      bonus += day.bonus || 0;
      payout += day.payout || 0;
      sellerOut += day.sellerOut || 0;
      usdt += day.usdt;
      deposits += day.counted;
      waiting += day.waiting;
      if (day.counted > 0) {
        days += 1;
        if (!best || day.usdt > best.usdt) best = { key, usdt: day.usdt };
      }
    }
    return { usdt, deposits, days, waiting, best, payout, sellerOut, bonus };
  }, [byDay, mKey]);

  const move = (n) => {
    const next = new Date(month.getFullYear(), month.getMonth() + n, 1);
    setMonth(next);
    // keep a useful day open: today in the current month, otherwise nothing until one is tapped
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
    <section className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-4 sm:p-6" aria-label="Deposits calendar">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
            <CalendarDays className="w-5 h-5 text-emerald-600" />
            <span>Deposits Calendar</span>
          </h2>
          <p className="text-xs text-slate-500">Real USDT received in Binance, day by day. Tap a day to see all its transactions.</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => move(-1)}
            disabled={!canGoBack}
            aria-label="Previous month"
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="min-w-[128px] text-center text-sm font-bold text-slate-900" aria-live="polite">
            {monthName}
          </span>
          <button
            onClick={() => move(1)}
            disabled={!canGoForward}
            aria-label="Next month"
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* The month in one line */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs text-slate-600">
        <span>
          Month total <b className="text-base font-extrabold text-emerald-700 tabular-nums">₮{fmt(totals.usdt)}</b>
        </span>
        <span>
          <b className="text-slate-900">{totals.deposits}</b> deposit{totals.deposits === 1 ? '' : 's'} on <b className="text-slate-900">{totals.days}</b> day{totals.days === 1 ? '' : 's'}
        </span>
        {totals.best && (
          <span>
            Best day <b className="text-slate-900">{Number(totals.best.key.slice(8))}</b> (₮{fmt(totals.best.usdt)})
          </span>
        )}
        {totals.waiting > 0 && (
          <span className="text-amber-700 font-semibold">
            {totals.waiting} waiting for real USDT
          </span>
        )}
        {totals.payout > 0 && (
          <span>
            Payouts <b className="text-violet-700 tabular-nums">₮{fmt(totals.payout)}</b>
          </span>
        )}
        {totals.sellerOut > 0 && (
          <span>
            Seller withdrawals <b className="text-red-700 tabular-nums">₮{fmt(totals.sellerOut)}</b>
          </span>
        )}
        {totals.bonus > 0 && (
          <span>
            Bonuses <b className="text-cyan-700 tabular-nums">₮{fmt(totals.bonus)}</b>
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
          <p className="text-xs mt-2">Loading the calendar…</p>
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
              const has = !!day && day.counted > 0;
              const onlyWaiting = !!day && !has && day.waiting > 0;
              const isToday = c.key === today;
              const isSel = c.key === selected;
              const future = c.key > today;
              const payout = day?.payout || 0;
              const sellerOut = day?.sellerOut || 0;
              // nothing came in that day, but money went out: the cell shows that instead
              const onlyOut = !has && !onlyWaiting && payout + sellerOut > 0;
              const bonus = day?.bonus || 0;
              // only a bonus that day: the cell shows the bonus
              const onlyBonus = !has && !onlyWaiting && !onlyOut && bonus > 0;
              const outText = `${bonus > 0 ? `, bonus ${fmt(bonus)} USDT` : ''}` + `${payout > 0 ? `, payouts ${fmt(payout)} USDT` : ''}${sellerOut > 0 ? `, seller withdrawals ${fmt(sellerOut)} USDT` : ''}`;
              const label = `${longDay(c.key)}: ${
                has ? `${fmt(day.usdt)} USDT from ${day.counted} deposit${day.counted === 1 ? '' : 's'}` : onlyWaiting ? `${day.waiting} deposit${day.waiting === 1 ? '' : 's'} waiting for real USDT` : 'no deposits'
              }${outText}`;
              return (
                <button
                  key={c.key}
                  onClick={() => openDay(c.key)}
                  aria-label={label}
                  aria-pressed={isSel}
                  className={`relative h-14 sm:h-16 rounded-xl flex flex-col items-center justify-center leading-none transition-colors ${
                    has
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                      : onlyWaiting
                      ? 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
                      : onlyOut && payout > 0
                      ? 'bg-violet-100 text-violet-900 border border-violet-300 hover:bg-violet-200'
                      : onlyOut
                      ? 'bg-red-50 text-red-900 border border-red-300 hover:bg-red-100'
                      : onlyBonus
                      ? 'bg-cyan-50 text-cyan-900 border border-cyan-300 hover:bg-cyan-100'
                      : future
                      ? 'text-slate-300 hover:bg-slate-50'
                      : 'text-slate-600 hover:bg-slate-100'
                  } ${isSel && panelOpen ? 'ring-2 ring-offset-2 ring-slate-900' : isToday ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                >
                  <span className={`text-sm tabular-nums ${has || onlyWaiting || onlyOut || onlyBonus || isToday ? 'font-extrabold' : 'font-medium'}`}>{c.d}</span>
                  {isToday && <span className="absolute top-1 left-1 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white" aria-hidden="true" />}
                  {has && (
                    <span className="mt-1 max-w-full font-bold tabular-nums whitespace-nowrap tracking-tighter sm:tracking-normal text-[9px] sm:text-[11px]">
                      {/* phones: no ₮ and no thousands comma, so the whole amount fits the cell */}
                      <span className="hidden sm:inline">₮{cellParts(day.usdt)[0]}</span>
                      <span className="sm:hidden">{cellParts(day.usdt)[0].replace(/,/g, '')}</span>
                      <span className="text-[8px] sm:text-[10px] opacity-90">.{cellParts(day.usdt)[1]}</span>
                    </span>
                  )}
                  {onlyWaiting && <span className="mt-1 text-[9px] sm:text-[10px] font-bold">waiting</span>}
                  {onlyOut && (
                    <span className="mt-1 max-w-full font-bold tabular-nums whitespace-nowrap tracking-tighter sm:tracking-normal text-[9px] sm:text-[11px]">
                      −<span className="hidden sm:inline">₮{cellParts(payout + sellerOut)[0]}</span>
                      <span className="sm:hidden">{cellParts(payout + sellerOut)[0].replace(/,/g, '')}</span>
                      <span className="text-[8px] sm:text-[10px] opacity-90">.{cellParts(payout + sellerOut)[1]}</span>
                    </span>
                  )}
                  {onlyBonus && (
                    <span className="mt-1 max-w-full font-bold tabular-nums whitespace-nowrap tracking-tighter sm:tracking-normal text-[9px] sm:text-[11px]">
                      <span className="hidden sm:inline">₮{cellParts(bonus)[0]}</span>
                      <span className="sm:hidden">{cellParts(bonus)[0].replace(/,/g, '')}</span>
                      <span className="text-[8px] sm:text-[10px] opacity-90">.{cellParts(bonus)[1]}</span>
                    </span>
                  )}
                  {bonus > 0 && !onlyBonus && <span className="absolute top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-cyan-400 ring-1 ring-white" aria-hidden="true" />}
                  {/* money also went out on a day that has deposits (or a second kind on an "out" day) */}
                  {payout > 0 && !(onlyOut && payout > 0) && <span className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-violet-500 ring-1 ring-white" aria-hidden="true" />}
                  {sellerOut > 0 && !(onlyOut && !(payout > 0)) && <span className="absolute bottom-1 left-1 w-2 h-2 rounded-full bg-red-500 ring-1 ring-white" aria-hidden="true" />}
                  {has && day.waiting > 0 && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-300 ring-1 ring-white" aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          {/* What the marks mean */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-600" /> USDT received (exact day total under the date)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-50 border border-amber-300" /> Deposit waiting for real USDT
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-violet-100 border border-violet-300" />
              <span className="w-2.5 h-2.5 rounded-full bg-violet-500" /> Payout taken (member / partner)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-red-50 border border-red-300" />
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Seller withdrawal
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-cyan-50 border border-cyan-300" />
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" /> Bonus given to a member
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Today
            </span>
          </div>

          <DayPanel open={panelOpen && Boolean(selected)} dayKeyValue={selected} day={sel} isFuture={selected > today} isToday={selected === today} onClose={() => setPanelOpen(false)} />
        </>
      )}
    </section>
  );
}

/**
 * The tapped day: a panel that slides in from the right with everything that came in that day.
 * Top: the day's totals. Then one line per member (how many deposits, INR, USDT). Then every
 * deposit: time, store, member, INR and the real USDT.
 */
function DayPanel({ open, dayKeyValue, day, isFuture, isToday, onClose }) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => setMounted(true), []);

  // slide in after the panel is on the page; slide out before it is taken off
  const [present, setPresent] = useState(false);
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
    document.body.style.overflow = 'hidden'; // the page behind does not scroll while the panel is open
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = before;
    };
  }, [open, onClose]);

  const items = useMemo(() => [...(day?.items || [])].sort((a, b) => a.t - b.t), [day]);
  // money that left Binance that day
  const outs = useMemo(() => [...(day?.outs || [])].sort((a, b) => a.t - b.t), [day]);
  const payoutTotal = day?.payout || 0;
  const sellerOutTotal = day?.sellerOut || 0;
  // milestone bonuses given to members that day
  const bonuses = useMemo(() => [...(day?.bonuses || [])].sort((a, b) => a.t - b.t), [day]);
  const bonusTotal = day?.bonus || 0;

  const sums = useMemo(() => {
    let usdt = 0;
    let inr = 0;
    let counted = 0;
    let waiting = 0;
    const people = new Map();
    for (const d of items) {
      const name = d.member || 'Seller not assigned';
      if (!people.has(name)) people.set(name, { name, count: 0, usdt: 0, inr: 0, waiting: 0 });
      const p = people.get(name);
      if (d.counted) {
        usdt += d.usdt;
        inr += d.inr;
        counted += 1;
        p.count += 1;
        p.usdt += d.usdt;
        p.inr += d.inr;
      } else {
        waiting += 1;
        p.waiting += 1;
      }
    }
    return { usdt, inr, counted, waiting, people: [...people.values()].sort((a, b) => b.usdt - a.usdt || a.name.localeCompare(b.name)) };
  }, [items]);

  if (!mounted || !present || !dayKeyValue) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={`Transactions of ${longDay(dayKeyValue)}`}>
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className={`absolute inset-0 w-full h-full bg-slate-900/40 transition-opacity duration-200 cursor-default ${shown ? 'opacity-100' : 'opacity-0'}`}
      />
      <aside
        className={`absolute inset-y-0 right-0 w-full sm:max-w-md bg-white shadow-2xl flex flex-col transition-transform duration-200 ease-out ${shown ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <header className="px-4 sm:px-5 pt-4 pb-3 border-b border-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                {isToday && <span className="w-2 h-2 rounded-full bg-blue-500" aria-hidden="true" />}
                {isToday ? 'Today' : 'Day transactions'}
              </p>
              <h3 className="text-base font-bold text-slate-900">{longDay(dayKeyValue)}</h3>
            </div>
            <button ref={closeRef} onClick={onClose} aria-label="Close" className="p-2 -mr-1 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900">
              <X className="w-5 h-5" />
            </button>
          </div>
          {items.length > 0 && (
            <div className="mt-3 grid grid-cols-[1fr_1.25fr_0.75fr] gap-2">
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-2.5 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">USDT</p>
                <p className="text-xs sm:text-sm font-extrabold text-emerald-800 tabular-nums break-all">₮{fmt(sums.usdt)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-2.5 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">INR</p>
                <p className="text-xs sm:text-sm font-extrabold text-slate-900 tabular-nums break-all">₹{fmt(sums.inr)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-2.5 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Deposits</p>
                <p className="text-sm font-extrabold text-slate-900 tabular-nums">
                  {sums.counted}
                  {sums.waiting > 0 && <span className="block text-[10px] font-bold text-amber-700 whitespace-nowrap">+{sums.waiting} waiting</span>}
                </p>
              </div>
            </div>
          )}
          {bonuses.length > 0 && (
            <div className="mt-2 rounded-xl bg-cyan-50 border border-cyan-200 px-2.5 py-2 flex items-center justify-between gap-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-800">Bonuses to members</p>
              <p className="text-xs sm:text-sm font-extrabold text-cyan-900 tabular-nums">₮{fmt(bonusTotal)}</p>
            </div>
          )}
          {outs.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-violet-50 border border-violet-200 px-2.5 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Payouts</p>
                <p className="text-xs sm:text-sm font-extrabold text-violet-900 tabular-nums break-all">{payoutTotal > 0 ? '−' : ''}₮{fmt(payoutTotal)}</p>
              </div>
              <div className="rounded-xl bg-red-50 border border-red-100 px-2.5 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-700">Seller withdrawals</p>
                <p className="text-xs sm:text-sm font-extrabold text-red-800 tabular-nums break-all">{sellerOutTotal > 0 ? '−' : ''}₮{fmt(sellerOutTotal)}</p>
              </div>
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4">
          {outs.length > 0 && (
            <div className={items.length > 0 || bonuses.length > 0 ? 'mb-5' : ''}>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Money out ({outs.length})</h4>
              <ul className="mt-1.5 space-y-2">
                {outs.map((o) => (
                  <li key={o.id} className={`rounded-xl border px-3 py-2.5 ${o.kind === 'payout' ? 'border-violet-200 bg-violet-50' : 'border-red-200 bg-red-50'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 break-words">{o.kind === 'payout' ? o.name : o.store}</p>
                        <p className="text-[11px] text-slate-500">
                          {timeOf(o.t)} ·{' '}
                          <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold ${o.kind === 'payout' ? 'bg-violet-200 text-violet-900' : 'bg-red-200 text-red-900'}`}>
                            {o.kind === 'payout' ? `Payout${o.role ? ` · ${o.role}` : ''}` : 'Seller withdrawal'}
                          </span>
                          {o.kind === 'seller' && o.member ? <span className="font-semibold text-slate-700"> · {o.member}</span> : ''}
                        </p>
                        {o.kind === 'payout' && o.note && <p className="text-[11px] text-slate-500 mt-0.5 break-words">{o.note}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-sm font-extrabold tabular-nums ${o.kind === 'payout' ? 'text-violet-800' : 'text-red-700'}`}>−₮{fmt(o.usdt)}</p>
                        {o.kind === 'seller' && o.inr > 0 && <p className="text-[11px] text-slate-500 tabular-nums">₹{fmt(o.inr)}</p>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {bonuses.length > 0 && (
            <div className={items.length > 0 ? 'mb-5' : ''}>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Bonuses ({bonuses.length})</h4>
              <ul className="mt-1.5 space-y-2">
                {bonuses.map((b) => (
                  <li key={b.id} className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 break-words">{b.member}</p>
                        <p className="text-[11px] text-slate-500">
                          {timeOf(b.t)} · <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-200 text-cyan-900">Bonus</span>
                          <span className="font-semibold text-slate-700"> · {b.title}</span>
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">Paid by the two partners, half each. The Binance total does not change.</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-extrabold text-cyan-800 tabular-nums">₮{fmt(b.usdt)}</p>
                        {b.pkr > 0 && <p className="text-[11px] text-slate-500 tabular-nums">Rs {fmt(b.pkr, 0)}</p>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {items.length === 0 ? (
            outs.length === 0 && bonuses.length === 0 && <p className="text-sm text-slate-500 py-10 text-center">{isFuture ? 'This day has not come yet.' : 'Nothing on this day.'}</p>
          ) : (
            <>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">By member</h4>
              <table className="mt-1.5 w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-slate-400">
                    <th className="text-left font-bold py-1">Member</th>
                    <th className="text-right font-bold py-1">Deposits</th>
                    <th className="text-right font-bold py-1">INR</th>
                    <th className="text-right font-bold py-1">USDT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sums.people.map((p) => (
                    <tr key={p.name}>
                      <td className="py-1.5 pr-2 font-semibold text-slate-900 break-words">{p.name}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-600">
                        {p.count}
                        {p.waiting > 0 && <span className="text-amber-700"> +{p.waiting}</span>}
                      </td>
                      <td className="py-1.5 pl-2 text-right tabular-nums text-slate-600">₹{fmt(p.inr)}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums font-bold text-slate-900">₮{fmt(p.usdt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h4 className="mt-5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Deposits ({items.length})</h4>
              <ul className="mt-1.5 space-y-2">
                {items.map((d) => (
                  <li key={d.id} className={`rounded-xl border px-3 py-2.5 ${d.counted ? 'border-slate-200 bg-white' : 'border-amber-200 bg-amber-50'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 break-words">{d.store}</p>
                        <p className="text-[11px] text-slate-500">
                          {timeOf(d.t)} · <span className="font-semibold text-slate-700">{d.member || 'Seller not assigned'}</span>
                        </p>
                      </div>
                      {d.counted ? (
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-extrabold text-emerald-700 tabular-nums">₮{fmt(d.usdt)}</p>
                          <p className="text-[11px] text-slate-500 tabular-nums">{d.inr > 0 ? `₹${fmt(d.inr)}` : 'INR not entered'}</p>
                        </div>
                      ) : (
                        <div className="shrink-0 text-right">
                          <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold">Waiting for real USDT</span>
                          <p className="text-[10px] text-slate-500 mt-0.5 tabular-nums">${fmt(Math.max(0, d.wallet - d.helping))} in store wallet</p>
                        </div>
                      )}
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
