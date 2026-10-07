'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveRefresh } from './LiveProvider';
import { readCache, writeCache } from '@/lib/clientCache';
import { dayKey } from '@/lib/utils/analytics';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

/**
 * Deposits calendar (partners' dashboard).
 *
 * One month at a time. A day on which real USDT came into Binance is filled green and carries
 * the day's total under its date. Tapping a day lists its deposits below the calendar.
 * A day that only has deposits still waiting for their real USDT is marked amber.
 */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const fmt = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
// short enough for a calendar cell on a phone; the exact amount is in the day's list
const short = (n) => {
  const v = Number(n) || 0;
  if (v >= 100000) return `${Math.round(v / 1000)}k`;
  if (v >= 10000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 100) return Math.round(v).toLocaleString('en-US');
  return String(Math.round(v * 10) / 10);
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
    return map;
  }, [data]);

  const today = dayKey(new Date());
  const thisMonth = monthKeyOf(new Date());
  // nothing to look at before the month of the very first deposit
  const firstT = data?.deposits?.[0]?.t;
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
    let usdt = 0;
    let deposits = 0;
    let days = 0;
    let waiting = 0;
    let best = null;
    for (const [key, day] of byDay) {
      if (!key.startsWith(mKey)) continue;
      usdt += day.usdt;
      deposits += day.counted;
      waiting += day.waiting;
      if (day.counted > 0) {
        days += 1;
        if (!best || day.usdt > best.usdt) best = { key, usdt: day.usdt };
      }
    }
    return { usdt, deposits, days, waiting, best };
  }, [byDay, mKey]);

  const move = (n) => {
    const next = new Date(month.getFullYear(), month.getMonth() + n, 1);
    setMonth(next);
    // keep a useful day open: today in the current month, otherwise nothing until one is tapped
    setSelected(monthKeyOf(next) === thisMonth ? today : '');
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
          <p className="text-xs text-slate-500">Real USDT received in Binance, day by day. Tap a day to see its deposits.</p>
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
              const label = `${longDay(c.key)}: ${
                has ? `${fmt(day.usdt)} USDT from ${day.counted} deposit${day.counted === 1 ? '' : 's'}` : onlyWaiting ? `${day.waiting} deposit${day.waiting === 1 ? '' : 's'} waiting for real USDT` : 'no deposits'
              }`;
              return (
                <button
                  key={c.key}
                  onClick={() => setSelected(c.key)}
                  aria-label={label}
                  aria-pressed={isSel}
                  className={`relative h-14 sm:h-16 rounded-xl flex flex-col items-center justify-center leading-none transition-colors ${
                    has
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                      : onlyWaiting
                      ? 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
                      : future
                      ? 'text-slate-300 hover:bg-slate-50'
                      : 'text-slate-600 hover:bg-slate-100'
                  } ${isSel ? 'ring-2 ring-offset-2 ring-slate-900' : isToday ? 'ring-2 ring-emerald-400 ring-offset-1' : ''}`}
                >
                  <span className={`text-sm tabular-nums ${has || onlyWaiting || isToday ? 'font-extrabold' : 'font-medium'}`}>{c.d}</span>
                  {has && <span className="mt-1 text-[10px] sm:text-[11px] font-bold tabular-nums">₮{short(day.usdt)}</span>}
                  {onlyWaiting && <span className="mt-1 text-[9px] sm:text-[10px] font-bold">waiting</span>}
                  {has && day.waiting > 0 && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-300 ring-1 ring-white" aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          {/* What the marks mean */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-600" /> USDT received (day total under the date)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-50 border border-amber-300" /> Deposit waiting for real USDT
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded ring-2 ring-emerald-400" /> Today
            </span>
          </div>

          {/* The tapped day */}
          {selected && selected.startsWith(mKey) && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">{longDay(selected)}</h3>
                {sel && sel.counted > 0 && <span className="text-sm font-extrabold text-emerald-700 tabular-nums">₮{fmt(sel.usdt)}</span>}
              </div>
              {!sel ? (
                <p className="text-xs text-slate-500 mt-1">{selected > today ? 'This day has not come yet.' : 'No deposits on this day.'}</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100">
                  {sel.items.map((d) => (
                    <li key={d.id} className="py-2 flex items-start justify-between gap-3 text-xs">
                      <span className="min-w-0">
                        <b className="text-slate-900 break-words">{d.store}</b>
                        <span className="block text-[11px] text-slate-500">
                          {timeOf(d.t)}
                          {d.member ? ` · ${d.member}` : ' · seller not assigned'}
                          {d.counted && d.inr > 0 ? ` · ₹${fmt(d.inr, 0)}` : ''}
                        </span>
                      </span>
                      {d.counted ? (
                        <b className="tabular-nums text-slate-900 shrink-0">₮{fmt(d.usdt)}</b>
                      ) : (
                        <span className="shrink-0 text-right">
                          <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold">Waiting for real USDT</span>
                          <span className="block text-[10px] text-slate-500 mt-0.5">${fmt(Math.max(0, d.wallet - d.helping))} in store wallet</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
