'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { LineChart, LineLegend, DonutChart, BarList, ColumnChart, colorForSlot, compact } from '@/components/Charts';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  Wallet,
  Store,
  TrendingUp,
  TrendingDown,
  Clock,
  ChevronUp,
  ChevronDown,
  X,
  Edit3,
  UserPlus,
  Package,
  Loader2,
  Search,
} from 'lucide-react';

/**
 * Seller analytics: real Binance USDT per seller, and the viewer's own share of each.
 * Used on the Sellers screen for "My sellers" (everyone) and "All sellers" (partners).
 */

export const C_IN = '#1baf7a';
export const C_OUT = '#eb6834';
export const C_MINE = '#2a78d6';

export const usdt = (v, d = 2) => `₮${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const signed = (v) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${usdt(Math.abs(v))}`;
const dateText = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '—' : x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
const ago = (days) => (days === null || days === undefined ? 'never' : days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`);
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return { short: d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }), full: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
};
const dayLabel = (key) => {
  const d = new Date(`${key}T00:00:00.000Z`);
  return { short: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }), full: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) };
};

function Kpi({ icon: Icon, label, value, sub, tone = 'slate', dark = false }) {
  const tones = {
    green: 'text-emerald-600',
    red: 'text-orange-600',
    blue: 'text-blue-700',
    slate: 'text-slate-900',
  };
  if (dark) {
    return (
      <div className="rounded-3xl p-4 sm:p-5 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white min-w-0">
        <span className="text-[10px] uppercase font-bold text-emerald-300 flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5" /> {label}
        </span>
        <p className="text-xl sm:text-2xl font-black mt-1 tabular-nums truncate">{value}</p>
        {sub && <p className="text-[11px] text-slate-300 mt-1 leading-snug">{sub}</p>}
      </div>
    );
  }
  return (
    <div className="rounded-3xl p-4 sm:p-5 bg-white border border-slate-200 min-w-0">
      <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {label}
      </span>
      <p className={`text-xl sm:text-2xl font-black mt-1 tabular-nums truncate ${tones[tone]}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-1 leading-snug">{sub}</p>}
    </div>
  );
}

function Card({ title, sub, right, children, className = '' }) {
  return (
    <div className={`bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 min-w-0 ${className}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Toggle({ value, onChange, options }) {
  return (
    <div className="flex gap-1 shrink-0">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`px-2 py-1 rounded-md text-[11px] font-bold ${value === o.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Deposits / withdrawals / my share over time (30 days or 12 months). */
function TrendCard({ data, title = 'Money in and out', showMine = true }) {
  const [range, setRange] = useState('days');
  const list = range === 'days' ? data.days : data.months;
  const labels = list.map((x) => (range === 'days' ? dayLabel(x.key) : monthLabel(x.key)));
  const series = [
    { key: 'in', name: 'Deposited', color: C_IN, values: list.map((x) => x.depositUSDT) },
    { key: 'out', name: 'Withdrawn', color: C_OUT, values: list.map((x) => x.withdrawUSDT) },
    ...(showMine ? [{ key: 'mine', name: 'My share (net)', color: C_MINE, values: list.map((x) => x.myNetUSDT) }] : []),
  ];
  const total = (k) => list.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  return (
    <Card
      title={title}
      sub={range === 'days' ? 'Day by day (last 30 days) • real USDT' : 'Month by month • real USDT'}
      right={<Toggle value={range} onChange={setRange} options={[{ key: 'days', label: '30 days' }, { key: 'months', label: '12 months' }]} />}
    >
      <LineChart labels={labels} series={series} format={(v) => usdt(v)} height={230} ariaLabel={title} fromZero />
      <div className="mt-2">
        <LineLegend
          items={[
            { name: 'Deposited', color: C_IN, value: usdt(total('depositUSDT')) },
            { name: 'Withdrawn', color: C_OUT, value: usdt(total('withdrawUSDT')) },
            ...(showMine ? [{ name: 'My share (net)', color: C_MINE, value: usdt(total('myNetUSDT')) }] : []),
          ]}
        />
      </div>
    </Card>
  );
}

/** Which sellers the money came from (top 5 keep their colour, the rest are "others"). */
function sellerSlices(sellers, key = 'depositUSDT') {
  const ranked = sellers.filter((s) => (Number(s[key]) || 0) > 0.005).sort((a, b) => b[key] - a[key]);
  const out = ranked.slice(0, 5).map((s, i) => ({ id: s.sellerId, name: s.storeName, value: Number(s[key]), color: colorForSlot(i) }));
  const rest = ranked.slice(5);
  if (rest.length) out.push({ id: '__other', name: rest.length === 1 ? '1 other seller' : `${rest.length} other sellers`, value: rest.reduce((s, x) => s + Number(x[key]), 0), color: colorForSlot(-1) });
  return out;
}

const SORTS = {
  depositUSDT: (a, b) => b.depositUSDT - a.depositUSDT,
  withdrawUSDT: (a, b) => b.withdrawUSDT - a.withdrawUSDT,
  netUSDT: (a, b) => b.netUSDT - a.netUSDT,
  myNetUSDT: (a, b) => b.myNetUSDT - a.myNetUSDT,
  deposits: (a, b) => b.deposits - a.deposits,
  last: (a, b) => (a.daysSinceDeposit ?? 1e9) - (b.daysSinceDeposit ?? 1e9),
  storeName: (a, b) => a.storeName.localeCompare(b.storeName),
};

function SortTh({ k, sort, setSort, children, right = true }) {
  const on = sort.key === k;
  return (
    <th className={`px-3 py-2.5 ${right ? 'text-right' : 'text-left'} whitespace-nowrap`}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : 1 }))}
        className={`inline-flex items-center gap-0.5 uppercase font-bold ${on ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
      >
        {children}
        {on && (sort.dir === 1 ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
      </button>
    </th>
  );
}

/**
 * The whole analytics view for one scope.
 * @param data      answer of /api/sellers/analytics
 * @param directory sellers of /api/sellers by id (alias, orders, assignment), optional
 * @param isPartner partner viewer (owner column, assign button)
 * @param scope     'mine' | 'all'
 */
export function SellerAnalyticsView({ data, directory, isPartner, scope, onNote, onAssign, onOrders, onOpen }) {
  const [sort, setSort] = useState({ key: 'depositUSDT', dir: 1 });
  const [chip, setChip] = useState('all');
  const [q, setQ] = useState('');
  const t = data.totals;
  const all = scope === 'all';

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = data.sellers.filter((s) => {
      const dir = directory?.get(s.sellerId);
      if (needle) {
        const hay = `${s.storeName} ${s.sellerName || ''} ${s.ownerName || ''} ${dir?.assignment?.privateNotes?.customName || ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (chip === 'active') return s.deposits > 0 && (s.daysSinceDeposit ?? 99) < 7;
      if (chip === 'quiet') return s.deposits > 0 && (s.daysSinceDeposit ?? 0) >= 7;
      if (chip === 'none') return s.deposits === 0;
      if (chip === 'unassigned') return !s.ownerId;
      return true;
    });
    const fn = SORTS[sort.key] || SORTS.depositUSDT;
    list = [...list].sort((a, b) => fn(a, b) * sort.dir);
    return list;
  }, [data.sellers, directory, q, chip, sort]);

  const weekChange = t.prev7USDT > 0.004 ? ((t.last7USDT - t.prev7USDT) / t.prev7USDT) * 100 : null;
  const myLabel = all ? 'My share from all sellers' : isPartner ? 'My earnings from my sellers' : 'My earnings from my sellers';
  const unassignedCount = all ? data.sellers.filter((s) => !s.ownerId).length : 0;

  const chips = [
    { key: 'all', label: `All (${data.sellers.length})` },
    { key: 'active', label: 'Deposited this week' },
    { key: 'quiet', label: `Quiet 7+ days (${t.quietSellers})` },
    { key: 'none', label: `No deposit yet (${t.neverDeposited})` },
    ...(all && unassignedCount ? [{ key: 'unassigned', label: `No owner (${unassignedCount})` }] : []),
  ];

  const earnedBars = data.sellers
    .filter((s) => Math.abs(s.myNetUSDT) > 0.005)
    .sort((a, b) => b.myNetUSDT - a.myNetUSDT)
    .slice(0, 8)
    .map((s, i) => ({ id: s.sellerId, name: s.storeName, value: s.myNetUSDT, color: C_MINE, sub: `${s.deposits} deposit${s.deposits === 1 ? '' : 's'} • ${usdt(s.depositUSDT)} in` }));

  const ownerSlices = (data.byOwner || [])
    .filter((o) => o.depositUSDT > 0.005)
    .map((o, i) => ({ id: o.id, name: `${o.name}${o.role === 'partner' ? ' (partner)' : ''}`, value: o.depositUSDT, color: colorForSlot(i < 5 ? i : -1) }));

  return (
    <div className="space-y-4">
      {/* ── Numbers ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={ArrowDownLeft} tone="green" label="Deposited" value={usdt(t.depositUSDT)} sub={`${t.deposits} deposits • ${inr(t.depositINR)}${t.avgRate ? ` • avg rate ${t.avgRate}` : ''}`} />
        <Kpi icon={ArrowUpRight} tone="red" label="Withdrawn" value={usdt(t.withdrawUSDT)} sub={`${t.withdrawals} seller withdrawal${t.withdrawals === 1 ? '' : 's'} paid from Binance`} />
        <Kpi icon={Landmark} label="Net in Binance" value={usdt(t.netUSDT)} sub={`Deposited − withdrawn • this month ${usdt(t.monthUSDT)} in`} />
        <Kpi
          icon={Wallet}
          dark
          label={myLabel}
          value={signed(t.myNetUSDT)}
          sub={`${usdt(t.myEarnedUSDT)} from deposits${t.myWithdrawUSDT > 0.004 ? ` − ${usdt(t.myWithdrawUSDT)} share of withdrawals` : ''}`}
        />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Store} label="Sellers" value={`${t.activeSellers} / ${t.sellers}`} sub={`have deposited • ${t.neverDeposited} not yet`} />
        <Kpi
          icon={weekChange !== null && weekChange < 0 ? TrendingDown : TrendingUp}
          tone={weekChange !== null && weekChange < 0 ? 'red' : 'green'}
          label="Last 7 days"
          value={usdt(t.last7USDT)}
          sub={weekChange === null ? `Week before: ${usdt(t.prev7USDT)}` : `${weekChange >= 0 ? '▲' : '▼'} ${Math.abs(weekChange).toFixed(0)}% vs week before (${usdt(t.prev7USDT)})`}
        />
        <Kpi icon={ArrowDownLeft} label="Average deposit" value={usdt(t.avgDepositUSDT)} sub="per deposit, real USDT" />
        <Kpi icon={Clock} tone={t.quietSellers > 0 ? 'red' : 'slate'} label="Quiet sellers" value={String(t.quietSellers)} sub="no deposit for 7 days or more" />
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <TrendCard data={data} />
        </div>
        <Card title="Where the deposits came from" sub="Share of all deposits, by seller">
          <DonutChart vertical slices={sellerSlices(data.sellers)} format={(v) => usdt(v)} totalLabel="Deposited" emptyText="No deposits yet" />
        </Card>
        <Card title={all ? 'My share, per seller' : 'What I earned, per seller'} sub="Your share of deposits − your share of withdrawals" className={all ? '' : 'lg:col-span-2'}>
          <BarList items={earnedBars} format={(v) => signed(v)} emptyText="Nothing earned from these sellers yet" />
        </Card>
        {all ? (
          <>
            <Card title="Deposits by owner" sub="Which member / partner the sellers belong to">
              <DonutChart vertical slices={ownerSlices} format={(v) => usdt(v)} totalLabel="Deposited" emptyText="No deposits yet" />
            </Card>
            <Card title="Deposits per month" sub="Real USDT that came in, month by month">
              <ColumnChart
                labels={data.months.map((m) => monthLabel(m.key))}
                series={[{ key: 'in', name: 'Deposited', color: C_IN, values: data.months.map((m) => m.depositUSDT) }]}
                format={(v) => usdt(v)}
                height={210}
                ariaLabel="Deposits per month"
              />
              <div className="mt-2 text-[11px] text-slate-500 flex flex-wrap gap-x-4">
                {data.months.slice(-3).map((m) => (
                  <span key={m.key}>
                    {monthLabel(m.key).full}: <b className="text-slate-800">{usdt(m.depositUSDT)}</b> ({m.deposits} dep.)
                  </span>
                ))}
              </div>
            </Card>
          </>
        ) : (
          <Card title="Withdrawals, per seller" sub="What each seller took out of Binance">
            <BarList
              items={data.sellers
                .filter((s) => s.withdrawUSDT > 0.005)
                .sort((a, b) => b.withdrawUSDT - a.withdrawUSDT)
                .slice(0, 8)
                .map((s) => ({ id: s.sellerId, name: s.storeName, value: s.withdrawUSDT, color: C_OUT, sub: `${s.withdrawals} withdrawal${s.withdrawals === 1 ? '' : 's'}` }))}
              format={(v) => usdt(v)}
              emptyText="No withdrawals yet"
            />
          </Card>
        )}
      </div>

      {/* ── Every seller ── */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Every seller</h3>
            <p className="text-[11px] text-slate-400">Tap a seller for its charts and every deposit / withdrawal</p>
          </div>
          <div className="relative sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search seller or owner…"
              className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
        <div className="px-4 sm:px-5 py-2.5 border-b border-slate-100 flex gap-1.5 overflow-x-auto">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setChip(c.key)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap ${chip === c.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* computer: table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 text-[10px]">
              <tr>
                <SortTh k="storeName" sort={sort} setSort={setSort} right={false}>
                  Seller
                </SortTh>
                {isPartner && <th className="px-3 py-2.5 text-left uppercase font-bold">Owner</th>}
                <SortTh k="depositUSDT" sort={sort} setSort={setSort}>
                  Deposited
                </SortTh>
                <SortTh k="withdrawUSDT" sort={sort} setSort={setSort}>
                  Withdrawn
                </SortTh>
                <SortTh k="netUSDT" sort={sort} setSort={setSort}>
                  Net
                </SortTh>
                <SortTh k="myNetUSDT" sort={sort} setSort={setSort}>
                  My share
                </SortTh>
                <SortTh k="last" sort={sort} setSort={setSort}>
                  Last deposit
                </SortTh>
                <th className="px-3 py-2.5 text-right uppercase font-bold">Store wallet</th>
                <th className="px-3 py-2.5 text-center uppercase font-bold">Orders</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    No sellers here.
                  </td>
                </tr>
              )}
              {filtered.map((s) => {
                const dir = directory?.get(s.sellerId);
                const alias = dir?.assignment?.privateNotes?.customName;
                return (
                  <tr key={s.sellerId} className="hover:bg-emerald-50/40 cursor-pointer" onClick={() => onOpen(s)}>
                    <td className="px-3 py-3 pl-4 sm:pl-5">
                      <div className="font-bold text-slate-900 text-[13px]">{alias && alias !== s.storeName ? alias : s.storeName}</div>
                      <div className="text-[11px] text-slate-500">
                        {alias && alias !== s.storeName ? `${s.storeName} • ` : ''}
                        {s.sellerName}
                      </div>
                    </td>
                    {isPartner && (
                      <td className="px-3 py-3">
                        {s.ownerName ? (
                          <span className="font-semibold text-slate-800">{s.ownerName}</span>
                        ) : (
                          <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-md">No owner</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-3 text-right tabular-nums font-bold text-emerald-700">
                      {usdt(s.depositUSDT)}
                      <div className="text-[10px] font-normal text-slate-400">{s.deposits} dep. • {inr(s.depositINR)}</div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-semibold text-orange-600">
                      {s.withdrawUSDT > 0 ? usdt(s.withdrawUSDT) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-bold text-slate-900">{usdt(s.netUSDT)}</td>
                    <td className={`px-3 py-3 text-right tabular-nums font-black ${s.myNetUSDT < 0 ? 'text-red-600' : 'text-blue-700'}`}>
                      {Math.abs(s.myNetUSDT) > 0.004 ? signed(s.myNetUSDT) : <span className="text-slate-300 font-normal">—</span>}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <span className={`text-[11px] font-semibold ${s.daysSinceDeposit === null ? 'text-slate-400' : s.daysSinceDeposit >= 7 ? 'text-orange-600' : 'text-slate-700'}`}>{ago(s.daysSinceDeposit)}</span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-600">${Number(s.storeBalanceUSD || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-3 text-center">
                      {dir ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOrders(dir);
                          }}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${dir.pendingOrdersCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}
                          title="Pending orders and store wallet"
                        >
                          {dir.pendingOrdersCount || 0}
                        </button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {dir && (
                          <button onClick={() => onNote(dir)} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700" title="Memory note">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isPartner && dir && (
                          <button onClick={() => onAssign(dir)} className="p-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700" title={s.ownerId ? 'Owner' : 'Assign'}>
                            <UserPlus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 1 && (
              <tfoot>
                <tr className="bg-slate-50 font-black border-t border-slate-200 text-[12px]">
                  <td className="px-3 py-3 pl-5" colSpan={isPartner ? 2 : 1}>
                    Total ({filtered.length})
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-emerald-700">{usdt(filtered.reduce((s, x) => s + x.depositUSDT, 0))}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-orange-600">{usdt(filtered.reduce((s, x) => s + x.withdrawUSDT, 0))}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{usdt(filtered.reduce((s, x) => s + x.netUSDT, 0))}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-blue-700">{signed(filtered.reduce((s, x) => s + x.myNetUSDT, 0))}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* phone: cards */}
        <div className="md:hidden divide-y divide-slate-100">
          {filtered.length === 0 && <p className="py-10 text-center text-xs text-slate-400">No sellers here.</p>}
          {filtered.map((s) => {
            const dir = directory?.get(s.sellerId);
            const alias = dir?.assignment?.privateNotes?.customName;
            return (
              <button key={s.sellerId} type="button" onClick={() => onOpen(s)} className="w-full text-left px-4 py-3 active:bg-slate-50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-sm truncate">{alias && alias !== s.storeName ? alias : s.storeName}</div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {isPartner ? s.ownerName || 'No owner' : s.sellerName} • last deposit {ago(s.daysSinceDeposit)}
                    </div>
                  </div>
                  <div className={`text-sm font-black tabular-nums shrink-0 ${s.myNetUSDT < 0 ? 'text-red-600' : 'text-blue-700'}`}>{Math.abs(s.myNetUSDT) > 0.004 ? signed(s.myNetUSDT) : ''}</div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2 text-center bg-slate-50 rounded-xl py-2">
                  <div>
                    <div className="text-[9px] uppercase font-bold text-slate-400">In</div>
                    <div className="text-xs font-bold text-emerald-700 tabular-nums">{usdt(s.depositUSDT)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase font-bold text-slate-400">Out</div>
                    <div className="text-xs font-bold text-orange-600 tabular-nums">{usdt(s.withdrawUSDT)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase font-bold text-slate-400">Net</div>
                    <div className="text-xs font-bold text-slate-900 tabular-nums">{usdt(s.netUSDT)}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** One seller: its numbers, charts and every movement, with the viewer's share. */
export function SellerDetailDrawer({ seller, scope, isPartner, dirEntry, onClose, onNote, onOrders }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setData(null);
    setError('');
    const token = (() => {
      try {
        return localStorage.getItem('portal_token') || '';
      } catch {
        return '';
      }
    })();
    fetch(`/api/sellers/analytics?scope=${scope}&sellerId=${seller.sellerId}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.message || 'Could not load this seller');
        return j;
      })
      .then((j) => alive && setData(j))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [seller.sellerId, scope]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const s = data?.seller || seller;
  const alias = dirEntry?.assignment?.privateNotes?.customName;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl h-full bg-slate-50 shadow-2xl flex flex-col animate-fade-in">
        <div className="bg-slate-900 text-white px-4 sm:px-6 py-4 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] uppercase font-bold text-emerald-300">Seller analytics</p>
            <h2 className="text-lg font-extrabold truncate">{alias && alias !== s.storeName ? alias : s.storeName}</h2>
            <p className="text-[11px] text-slate-400 truncate">
              {alias && alias !== s.storeName ? `${s.storeName} • ` : ''}
              {s.sellerName}
              {isPartner && s.ownerName ? ` • owner ${s.ownerName}` : ''}
              {s.joinedAt ? ` • joined ${dateText(s.joinedAt)}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 shrink-0" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {error && <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <Kpi icon={ArrowDownLeft} tone="green" label="Deposited" value={usdt(s.depositUSDT)} sub={`${s.deposits} deposit${s.deposits === 1 ? '' : 's'} • ${inr(s.depositINR)}`} />
            <Kpi icon={ArrowUpRight} tone="red" label="Withdrawn" value={usdt(s.withdrawUSDT)} sub={`${s.withdrawals} withdrawal${s.withdrawals === 1 ? '' : 's'}`} />
            <Kpi icon={Landmark} label="Net in Binance" value={usdt(s.netUSDT)} sub={s.avgRate ? `Avg rate ₹${s.avgRate} per USDT` : 'From this seller'} />
            <Kpi
              icon={Wallet}
              dark
              label="My share from this seller"
              value={signed(s.myNetUSDT)}
              sub={`${usdt(s.myEarnedUSDT)} from deposits${s.myWithdrawUSDT > 0.004 ? ` − ${usdt(s.myWithdrawUSDT)} withdrawals` : ''}`}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-white rounded-2xl border border-slate-200 p-3">
              <div className="text-[9px] uppercase font-bold text-slate-400">Avg deposit</div>
              <div className="text-sm font-black tabular-nums">{usdt(s.avgDepositUSDT)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-3">
              <div className="text-[9px] uppercase font-bold text-slate-400">Biggest</div>
              <div className="text-sm font-black tabular-nums">{usdt(s.biggestDepositUSDT)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-3">
              <div className="text-[9px] uppercase font-bold text-slate-400">Last deposit</div>
              <div className="text-sm font-black">{ago(s.daysSinceDeposit)}</div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-3 text-[11px] text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
            <span>
              Store wallet now: <b className="text-slate-900">${Number(s.storeBalanceUSD || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</b>
            </span>
            {s.storePendingWithdrawalUSD > 0 && (
              <span>
                Asked to withdraw: <b className="text-orange-600">${Number(s.storePendingWithdrawalUSD).toLocaleString('en-US', { maximumFractionDigits: 2 })}</b>
              </span>
            )}
            <span>First deposit: {dateText(s.firstDepositAt)}</span>
          </div>

          {!data && !error ? (
            <div className="py-12 flex items-center justify-center text-xs text-slate-400 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading charts…
            </div>
          ) : data ? (
            <>
              <TrendCard data={data} title="This seller over time" />
              <Card title="Every deposit and withdrawal" sub={`${data.transactions.length} movements • real USDT`}>
                {data.transactions.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">Nothing yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100 -mx-1">
                    {data.transactions.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between gap-3 px-1 py-2.5 text-xs">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${tx.kind === 'deposit' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'}`}>
                              {tx.kind === 'deposit' ? 'Deposit' : 'Withdrawal'}
                            </span>
                            <span className="text-slate-500">{dateText(tx.date)}</span>
                          </div>
                          {tx.inr > 0 && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {inr(tx.inr)}
                              {tx.rate ? ` • rate ${tx.rate}` : ''}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`font-black tabular-nums ${tx.kind === 'deposit' ? 'text-emerald-700' : 'text-orange-600'}`}>
                            {tx.kind === 'deposit' ? '+' : '−'}
                            {usdt(tx.usdt)}
                          </div>
                          {Math.abs(tx.myShareUSDT) > 0.0004 && (
                            <div className={`text-[10px] font-bold tabular-nums ${tx.myShareUSDT < 0 ? 'text-red-600' : 'text-blue-700'}`}>my share {signed(tx.myShareUSDT)}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          ) : null}
        </div>

        {dirEntry && (
          <div className="shrink-0 border-t border-slate-200 bg-white px-4 sm:px-6 py-3 flex gap-2">
            <button onClick={() => onNote(dirEntry)} className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5">
              <Edit3 className="w-4 h-4" /> Memory note
            </button>
            <button onClick={() => onOrders(dirEntry)} className="flex-1 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold flex items-center justify-center gap-1.5">
              <Package className="w-4 h-4" /> Orders & store wallet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export { compact };
