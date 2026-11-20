'use client';

import React, { useMemo, useState } from 'react';
import { CalendarDays, CalendarRange, Users } from 'lucide-react';
import {
  firstMonthKey,
  monthsSince,
  monthLabel,
  monthKeyOf,
  movementMonthKey,
  payoutMonthKey,
  walletMonths,
} from '@/lib/utils/payoutMonths';

/**
 * Analytics: money month by month (or week by week), and for partners the team's payouts per
 * month. Reads the same data the Analytics screen already has; display only.
 */

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdt = (n) => `${Number(n || 0) < 0 ? '-' : ''}₮${fmt(Math.abs(Number(n || 0)))}`;
const signed = (n) => `${Number(n || 0) > 0 ? '+' : Number(n || 0) < 0 ? '-' : ''}₮${fmt(Math.abs(Number(n || 0)))}`;
const dash = <span className="text-slate-300">—</span>;
const cell = (n, cls = 'text-slate-700', key = undefined) => <td key={key} className={`py-2.5 px-3 text-right ${cls}`}>{Math.abs(n) > 0.004 ? usdt(n) : dash}</td>;
const WEEKS = 12;
const PAYROLL_MONTHS = 6;

function mondayOf(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
const weekKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const weekLabel = (start) => {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const f = (x) => x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${f(start)} – ${f(end)}`;
};

/** in / deducted / paid out / net per bucket, from analytics events */
function bucketEvents(events, keyOf) {
  const map = new Map();
  for (const ev of events || []) {
    const k = keyOf(ev.t);
    if (k === null) continue;
    if (!map.has(k)) map.set(k, { in: 0, deducted: 0, paid: 0, net: 0, deposits: 0 });
    const b = map.get(k);
    if (ev.kind === 'in') {
      b.in += ev.amount;
      if (ev.isDeposit) b.deposits += 1;
    } else if (ev.kind === 'out') {
      if (ev.group === 'payout') b.paid += ev.amount;
      else b.deducted += ev.amount;
    }
  }
  for (const b of map.values()) b.net = b.in - b.deducted - b.paid;
  return map;
}

function Bar({ value, max, color }) {
  const pct = max > 0 ? Math.max(2, Math.round((Math.max(0, value) / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100 mt-1 overflow-hidden">
      {value > 0 && <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />}
    </div>
  );
}

export default function MonthlyBreakdown({ view, raw, events }) {
  const [unit, setUnit] = useState('month');
  const business = view === 'business';
  const firstKey = useMemo(() => firstMonthKey(business ? raw?.start : raw?.financeStart), [business, raw]);
  const thisMonth = monthKeyOf(new Date());

  const words = business
    ? { in: 'Received', deducted: 'Sent to sellers', paid: 'Paid to team', net: 'Net change' }
    : { in: 'Earned', deducted: 'Deducted', paid: 'Paid out', net: 'Net' };

  // ── month rows ──
  const monthRows = useMemo(() => {
    const keys = monthsSince(firstKey);
    if (business) {
      const m = bucketEvents(events, (t) => movementMonthKey(t, firstKey));
      return keys.map((k) => ({ key: k, ...(m.get(k) || { in: 0, deducted: 0, paid: 0, net: 0, deposits: 0 }) }));
    }
    // my wallet: the same month figures as the payout form (payouts by the month they are for)
    const m = walletMonths(raw?.transactions, firstKey);
    return keys.map((k) => {
      const x = m.get(k) || { earned: 0, deducted: 0, paid: 0, net: 0, left: 0 };
      return { key: k, in: x.earned, deducted: x.deducted, net: x.net, paid: x.paid, left: x.left };
    });
  }, [business, events, raw, firstKey]);

  // ── week rows (last 12 weeks, Monday to Sunday) ──
  const weekRows = useMemo(() => {
    const m = bucketEvents(events, (t) => weekKey(mondayOf(t)));
    const rows = [];
    const start = mondayOf(Date.now());
    for (let i = 0; i < WEEKS; i += 1) {
      const d = new Date(start);
      d.setDate(d.getDate() - i * 7);
      const k = weekKey(d);
      rows.push({ key: k, start: d, ...(m.get(k) || { in: 0, deducted: 0, paid: 0, net: 0, deposits: 0 }) });
    }
    return rows;
  }, [events]);

  const rows = unit === 'month' ? monthRows : weekRows;
  const maxIn = rows.reduce((mx, r) => Math.max(mx, r.in), 0);
  const total = rows.reduce(
    (t, r) => ({ in: t.in + r.in, deducted: t.deducted + r.deducted, paid: t.paid + r.paid, net: t.net + r.net, left: t.left + (r.left || 0) }),
    { in: 0, deducted: 0, paid: 0, net: 0, left: 0 }
  );
  const mineMonthly = !business && unit === 'month';

  // ── team payouts per person per month (partners) ──
  const payroll = useMemo(() => {
    if (!business) return null;
    const months = monthsSince(firstKey).slice(0, PAYROLL_MONTHS).reverse(); // oldest → newest
    const people = new Map();
    const perMonth = new Map(months.map((k) => [k, 0]));
    let older = 0;
    for (const p of raw?.payouts || []) {
      const amount = Number(p.amountUSDT) || 0;
      if (!(amount > 0)) continue;
      const { key } = payoutMonthKey({ date: p.date, forMonth: p.forMonth, gift: p.gift }, firstKey);
      if (!people.has(p.userId)) people.set(p.userId, { id: p.userId, name: p.name || 'Unknown', months: new Map(), total: 0, count: 0 });
      const person = people.get(p.userId);
      person.total += amount;
      person.count += 1;
      if (perMonth.has(key)) {
        person.months.set(key, (person.months.get(key) || 0) + amount);
        perMonth.set(key, perMonth.get(key) + amount);
      } else {
        older += amount;
      }
    }
    const list = [...people.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    return { months, list, perMonth, older, grand: list.reduce((s, p) => s + p.total, 0) };
  }, [business, raw, firstKey]);

  return (
    <>
      <section className="bg-white rounded-3xl border border-slate-200/80 p-4 sm:p-6 min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-slate-900">{unit === 'month' ? 'Month by month' : 'Week by week'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {unit === 'month'
                ? mineMonthly
                  ? 'All months since the start. Payouts are counted for the month they are for — the same numbers as the payout form.'
                  : 'All months since the start, 1st to last day. Payouts by the day they were paid.'
                : `The last ${WEEKS} weeks, Monday to Sunday.`}
            </p>
          </div>
          <div className="inline-flex p-1 rounded-2xl bg-slate-100" role="tablist" aria-label="Group by">
            {[
              { id: 'month', label: 'Monthly', icon: CalendarDays },
              { id: 'week', label: 'Weekly', icon: CalendarRange },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={unit === t.id}
                onClick={() => setUnit(t.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                  unit === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto -mx-4 sm:-mx-6">
          <table className="w-full text-xs min-w-[620px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="font-bold py-2 pl-4 sm:pl-6 pr-3">{unit === 'month' ? 'Month' : 'Week'}</th>
                <th className="font-bold py-2 px-3 text-right w-[22%]">{words.in}</th>
                <th className="font-bold py-2 px-3 text-right">{words.deducted}</th>
                {mineMonthly ? (
                  <>
                    <th className="font-bold py-2 px-3 text-right">Net earned</th>
                    <th className="font-bold py-2 px-3 text-right">Paid for month</th>
                    <th className="font-bold py-2 pl-3 pr-4 sm:pr-6 text-right">Still to pay</th>
                  </>
                ) : (
                  <>
                    <th className="font-bold py-2 px-3 text-right">{words.paid}</th>
                    <th className="font-bold py-2 pl-3 pr-4 sm:pr-6 text-right">{words.net}</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const current = unit === 'month' ? r.key === thisMonth : r === weekRows[0];
                return (
                  <tr key={r.key} className="border-b border-slate-50 hover:bg-slate-50/70">
                    <td className="py-2.5 pl-4 sm:pl-6 pr-3 font-semibold text-slate-700 whitespace-nowrap">
                      {unit === 'month' ? monthLabel(r.key) : weekLabel(r.start)}
                      {current && (
                        <span className="ml-2 text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Running</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                      {r.in > 0.004 ? usdt(r.in) : dash}
                      <Bar value={r.in} max={maxIn} color="#059669" />
                    </td>
                    {cell(r.deducted)}
                    {mineMonthly ? (
                      <>
                        <td className={`py-2.5 px-3 text-right font-bold ${r.net < 0 ? 'text-red-600' : r.net > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                          {Math.abs(r.net) > 0.004 ? signed(r.net) : '—'}
                        </td>
                        {cell(r.paid, 'text-blue-700')}
                        <td className={`py-2.5 pl-3 pr-4 sm:pr-6 text-right font-bold ${r.left > 0.004 ? 'text-amber-700' : 'text-slate-400'}`}>
                          {r.left > 0.004 ? usdt(r.left) : current ? '—' : 'Paid'}
                        </td>
                      </>
                    ) : (
                      <>
                        {cell(r.paid)}
                        <td className={`py-2.5 pl-3 pr-4 sm:pr-6 text-right font-bold ${r.net < 0 ? 'text-red-600' : r.net > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                          {Math.abs(r.net) > 0.004 ? signed(r.net) : '—'}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 font-bold text-slate-900">
                <td className="py-3 pl-4 sm:pl-6 pr-3">{unit === 'month' ? 'Total (all months)' : `Total (${WEEKS} weeks)`}</td>
                <td className="py-3 px-3 text-right">{usdt(total.in)}</td>
                <td className="py-3 px-3 text-right">{usdt(total.deducted)}</td>
                {mineMonthly ? (
                  <>
                    <td className={`py-3 px-3 text-right ${total.net < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{signed(r2(total.net))}</td>
                    <td className="py-3 px-3 text-right text-blue-700">{usdt(total.paid)}</td>
                    <td className="py-3 pl-3 pr-4 sm:pr-6 text-right text-amber-700">{usdt(total.left)}</td>
                  </>
                ) : (
                  <>
                    <td className="py-3 px-3 text-right">{usdt(total.paid)}</td>
                    <td className={`py-3 pl-3 pr-4 sm:pr-6 text-right ${total.net < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{signed(r2(total.net))}</td>
                  </>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
        {mineMonthly && (
          <p className="text-[11px] text-slate-400 mt-3">
            Older payouts without a month: one made on the 1st–10th counts for the month before (paid 1 Nov → October). Reserve moves are not counted here.
          </p>
        )}
      </section>

      {/* ── Partners: who was paid how much, month by month ── */}
      {payroll && (
        <section className="bg-white rounded-3xl border border-slate-200/80 p-4 sm:p-6 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-4">
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" /> Team payouts by month
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Every member and partner, by the month the payout is for. Device gifts included. Older payouts without a month: 1st–10th counts for the month before.
              </p>
            </div>
            <span className="text-xs text-slate-500">
              All time <span className="font-bold text-slate-900">{usdt(payroll.grand)}</span>
            </span>
          </div>

          {payroll.list.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">No payouts yet</p>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:-mx-6">
              <table className="w-full text-xs" style={{ fontVariantNumeric: 'tabular-nums', minWidth: `${260 + payroll.months.length * 110}px` }}>
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    <th className="font-bold py-2 pl-4 sm:pl-6 pr-3">Person</th>
                    {payroll.months.map((k) => (
                      <th key={k} className="font-bold py-2 px-3 text-right whitespace-nowrap">
                        {monthLabel(k, true)}
                      </th>
                    ))}
                    <th className="font-bold py-2 pl-3 pr-4 sm:pr-6 text-right">All time</th>
                  </tr>
                </thead>
                <tbody>
                  {payroll.list.map((p) => (
                    <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/70">
                      <td className="py-2.5 pl-4 sm:pl-6 pr-3 font-semibold text-slate-800 whitespace-nowrap">
                        {p.name}
                        <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                          {p.count} payout{p.count === 1 ? '' : 's'}
                        </span>
                      </td>
                      {payroll.months.map((k) => cell(p.months.get(k) || 0, 'text-slate-700', k))}
                      <td className="py-2.5 pl-3 pr-4 sm:pr-6 text-right font-bold text-slate-900">{usdt(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 font-bold text-slate-900">
                    <td className="py-3 pl-4 sm:pl-6 pr-3">Total</td>
                    {payroll.months.map((k) => (
                      <td key={k} className="py-3 px-3 text-right">
                        {usdt(payroll.perMonth.get(k) || 0)}
                      </td>
                    ))}
                    <td className="py-3 pl-3 pr-4 sm:pr-6 text-right">{usdt(payroll.grand)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {payroll.older > 0.004 && (
            <p className="text-[11px] text-slate-400 mt-3">{usdt(payroll.older)} was paid for months older than the ones shown (it is in “All time”).</p>
          )}
        </section>
      )}
    </>
  );
}
