'use client';

import React from 'react';
import Link from 'next/link';
import { Landmark, CalendarDays, TrendingUp, TrendingDown, Store, Users, AlertTriangle, ArrowRight, Repeat } from 'lucide-react';

/**
 * Dashboard analytics, all in REAL BINANCE USDT (finance ledger):
 * today / 7 days / month, deposits per day, top stores by real deposits and who brought how much.
 * Partners get the whole business; a member gets only their own stores.
 */

const fmt = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const usdt = (n) => `₮${fmt(n)}`;
const shortDay = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};
const dayOf = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—');

function Kpi({ icon: Icon, label, value, sub, tone = 'slate' }) {
  const tones = { emerald: 'text-emerald-600', amber: 'text-amber-600', red: 'text-red-600', slate: 'text-slate-900', blue: 'text-blue-600' };
  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm min-w-0">
      <div className="flex items-center justify-between text-slate-500 mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider truncate">{label}</span>
        <Icon className={`w-4 h-4 shrink-0 ${tones[tone]}`} />
      </div>
      <p className={`text-lg sm:text-xl font-extrabold tabular-nums truncate ${tones[tone]}`}>{value}</p>
      <p className="text-[11px] text-slate-400 mt-0.5 truncate">{sub}</p>
    </div>
  );
}

function Bars({ rows, max, color = 'bg-emerald-500', empty }) {
  if (!rows || rows.length === 0) return <p className="text-xs text-slate-400 py-6 text-center">{empty}</p>;
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div key={r.key} className="text-xs">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">
              <span className="text-slate-400 font-bold mr-1.5">#{i + 1}</span>
              <b className="text-slate-900">{r.title}</b>
              {r.tag && <span className="text-slate-400"> • {r.tag}</span>}
            </span>
            <b className="tabular-nums text-slate-900 shrink-0">{usdt(r.value)}</b>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-1">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${max > 0 ? Math.max(2, (r.value / max) * 100) : 0}%` }} />
          </div>
          {r.note && <div className="text-[10px] text-slate-400 mt-0.5">{r.note}</div>}
        </div>
      ))}
    </div>
  );
}

export default function DashboardInsights({ finance, isAdmin }) {
  if (!finance) return null;
  const f = finance;
  const days = f.days || [];
  const maxDay = Math.max(0, ...days.map((d) => d.usdt));
  const change = f.prev7USDT > 0 ? ((f.last7USDT - f.prev7USDT) / f.prev7USDT) * 100 : null;
  const topSellers = f.topSellers || [];
  const owners = f.owners || [];
  const maxSeller = Math.max(0, ...topSellers.map((s) => s.depositUSDT));
  const maxOwner = Math.max(0, ...owners.map((o) => o.depositUSDT));
  const dealText = (o) => (o.role === 'partner' ? 'Partner' : o.deal === 'inr_50' ? '50% member' : '1:1 PKR member');

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
            <Landmark className="w-5 h-5 text-emerald-600" />
            <span>{isAdmin ? 'Binance Deposits Analytics' : 'My Stores — Binance Deposits'}</span>
          </h2>
          <p className="text-xs text-slate-500">
            Real USDT received in Binance since {f.start ? new Date(f.start).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'the finance start'}. Store-wallet
            amounts of the seller website are not used here.
          </p>
        </div>
        <Link href="/analytics" className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1 self-start sm:self-auto">
          <span>Full analytics</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={CalendarDays} label="Today" value={usdt(f.todayUSDT)} sub={`${f.todayCount || 0} ${f.todayCount === 1 ? 'deposit' : 'deposits'} today`} tone="emerald" />
        <Kpi
          icon={change !== null && change < 0 ? TrendingDown : TrendingUp}
          label="Last 7 days"
          value={usdt(f.last7USDT)}
          sub={change === null ? `Week before: ${usdt(f.prev7USDT)}` : `${change >= 0 ? '+' : ''}${fmt(change, 0)}% vs week before (${usdt(f.prev7USDT)})`}
          tone={change !== null && change < 0 ? 'red' : 'emerald'}
        />
        <Kpi icon={Landmark} label="This month" value={usdt(f.monthUSDT)} sub={`All time: ${usdt(f.inUSDT)} • ${f.depositCount || 0} deposits`} />
        <Kpi
          icon={Repeat}
          label="Average deposit"
          value={usdt(f.avgDepositUSDT)}
          sub={f.avgRate > 0 ? `Avg rate ₹${fmt(f.avgRate)} / USDT${f.biggest ? ` • biggest ${usdt(f.biggest.usdt)}` : ''}` : f.biggest ? `Biggest ${usdt(f.biggest.usdt)} (${f.biggest.storeName})` : 'No deposits yet'}
          tone="blue"
        />
      </div>

      {f.notCounted?.count > 0 && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <b>
                {f.notCounted.count} {f.notCounted.count === 1 ? 'deposit is' : 'deposits are'} not in these numbers yet
              </b>{' '}
              (store wallet ${fmt(f.notCounted.walletUSD)}): the real USDT, the PKR rate or the owner is still missing.
            </span>
          </span>
          {isAdmin && (
            <Link href="/finance" className="font-bold text-amber-900 underline shrink-0">
              Open Finance
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Deposits per day */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Deposits per day — last {days.length} days (USDT)</h3>
            <span className="text-[11px] text-slate-400">India time</span>
          </div>
          {maxDay > 0 ? (
            <div className="flex items-end gap-1 sm:gap-2 h-40">
              {days.map((d) => (
                <div key={d.key} className="flex-1 min-w-0 h-full flex flex-col items-center justify-end" title={`${shortDay(d.key)}: ${usdt(d.usdt)} • ${d.count} ${d.count === 1 ? 'deposit' : 'deposits'}`}>
                  <span className="text-[9px] sm:text-[10px] font-bold text-slate-600 tabular-nums mb-1 truncate max-w-full">{d.usdt > 0 ? fmt(d.usdt, 0) : ''}</span>
                  <div className={`w-full rounded-t-md ${d.usdt > 0 ? 'bg-emerald-500' : 'bg-slate-100'}`} style={{ height: d.usdt > 0 ? `${Math.max(4, (d.usdt / maxDay) * 100)}%` : '3px' }} />
                  <span className="text-[9px] text-slate-400 mt-1 truncate max-w-full">{shortDay(d.key).slice(0, 2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-10 text-center">No deposits counted in the last {days.length} days.</p>
          )}
          {maxDay > 0 && (
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>{shortDay(days[0].key)}</span>
              <span>{shortDay(days[days.length - 1].key)}</span>
            </div>
          )}
        </div>

        {/* Top stores */}
        <div className={`bg-white rounded-3xl border border-slate-200 p-5 shadow-sm ${isAdmin ? '' : 'lg:col-span-2'}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5 text-emerald-600" /> Top stores by real deposits
            </h3>
            <span className="text-[11px] text-slate-400">
              {f.sellersWithDeposits || 0} deposited • {f.sellersWithoutDeposits || 0} not yet
            </span>
          </div>
          <Bars
            max={maxSeller}
            empty="No store has a counted deposit yet."
            rows={topSellers.map((s) => ({
              key: s.sellerId,
              title: s.storeName,
              tag: isAdmin ? s.ownerName || 'no owner' : '',
              value: s.depositUSDT,
              note: `${s.deposits} ${s.deposits === 1 ? 'deposit' : 'deposits'}${s.depositINR > 0 ? ` • ₹${fmt(s.depositINR, 0)}` : ''} • last ${dayOf(s.lastDepositAt)}${s.withdrawUSDT > 0 ? ` • withdrawn ${usdt(s.withdrawUSDT)}` : ''}`,
            }))}
          />
        </div>

        {/* Who brought how much (partners only) */}
        {isAdmin && (
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-purple-600" /> Deposits brought in, by person
              </h3>
              <span className="text-[11px] text-slate-400">their own stores</span>
            </div>
            <Bars
              max={maxOwner}
              color="bg-purple-500"
              empty="Nothing counted yet."
              rows={owners.map((o) => ({
                key: o.id,
                title: o.name,
                tag: dealText(o),
                value: o.depositUSDT,
                note: `${o.sellers} ${o.sellers === 1 ? 'store' : 'stores'} • ${o.deposits} ${o.deposits === 1 ? 'deposit' : 'deposits'} • earned ${usdt(o.earnedUSDT)} • wallet ${usdt(o.balanceUSDT)}`,
              }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
