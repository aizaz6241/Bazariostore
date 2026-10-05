'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useLiveRefresh, LiveBadge } from '@/components/LiveProvider';
import { LineChart, LineLegend, DonutChart, colorForSlot } from '@/components/Charts';
import { readCache, writeCache } from '@/lib/clientCache';
import {
  eventsFromLedger,
  eventsFromWallet,
  summarize,
  changePct,
  firstEventKey,
  dayKey,
  addDays,
  daysBetween,
} from '@/lib/utils/analytics';
import {
  BarChart3,
  ArrowDownLeft,
  ArrowUpRight,
  Scale,
  Send,
  TrendingUp,
  TrendingDown,
  Minus,
  Landmark,
  Wallet,
  CalendarDays,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

/* ───────────────────────── helpers ───────────────────────── */

const IN_COLOR = '#059669';
const OUT_COLOR = '#ea580c';
const BALANCE_COLOR = '#2a78d6';
const RATE_COLOR = '#4a3aa7';

const fmt = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const usdt = (n) => `${Number(n || 0) < 0 ? '-' : ''}₮${fmt(Math.abs(Number(n || 0)))}`;
const signed = (n) => `${Number(n || 0) > 0 ? '+' : Number(n || 0) < 0 ? '-' : ''}₮${fmt(Math.abs(Number(n || 0)))}`;
const shortDay = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const fullDay = (d) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

const PRESETS = [
  { id: '7', label: '7 days', days: 7 },
  { id: '30', label: '30 days', days: 30 },
  { id: '90', label: '90 days', days: 90 },
  { id: 'all', label: 'All time', days: 0 },
];

// Words for the two views: the whole business (admins) and one person's own wallet
const WORDS = {
  business: {
    in: 'Received',
    inHint: 'Real USDT that came into Binance from seller deposits',
    outSeller: 'Sent to sellers',
    outSellerHint: 'USDT paid out for seller withdrawals',
    outPayout: 'Paid to team',
    outPayoutHint: 'Payouts taken by members and partners',
    net: 'Net change',
    netHint: 'Received minus everything that left Binance',
    balance: 'Binance balance',
    lineTitle: 'Money in and money out, day by day',
    inSeries: 'Received',
    outSeries: 'Sent out',
    sourceTitle: 'Deposits by store',
    sourceHint: 'Which stores the USDT came from',
    balanceTitle: 'Binance balance over time',
    balanceHint: 'USDT held at the end of each day',
  },
  mine: {
    in: 'Earned',
    inHint: 'Your share of seller deposits, plus milestone bonuses',
    outSeller: 'Deducted',
    outSellerHint: 'Your share of seller withdrawals and bonus costs',
    outPayout: 'Paid out to me',
    outPayoutHint: 'USDT you have already received',
    net: 'Net change',
    netHint: 'Earned minus deductions and payouts',
    balance: 'My wallet balance',
    lineTitle: 'Earned and taken out, day by day',
    inSeries: 'Earned',
    outSeries: 'Taken out',
    sourceTitle: 'Where my earnings came from',
    sourceHint: 'Your share, by store',
    balanceTitle: 'My wallet balance over time',
    balanceHint: 'Your USDT balance at the end of each day',
  },
};

function Delta({ now, before, goodWhenUp, periodText }) {
  if (before === null || before === undefined) return null;
  const pct = changePct(now, before);
  if (pct === null) {
    return <p className="text-[11px] text-slate-400 mt-2">Nothing in the {periodText} to compare</p>;
  }
  const flat = Math.abs(pct) < 0.5;
  const up = pct > 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const tone =
    flat || goodWhenUp === null
      ? 'text-slate-600 bg-slate-100'
      : up === goodWhenUp
        ? 'text-emerald-700 bg-emerald-50'
        : 'text-red-700 bg-red-50';
  const text = Math.abs(pct) >= 1000 ? `${up ? '+' : '-'}${(Math.abs(pct) / 100).toFixed(0)}×` : `${up ? '+' : ''}${pct.toFixed(Math.abs(pct) >= 100 ? 0 : 1)}%`;
  return (
    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold ${tone}`}>
        <Icon className="w-3 h-3" />
        {flat ? 'No change' : text}
      </span>
      <span>vs {periodText}</span>
    </p>
  );
}

function StatTile({ icon: Icon, iconClass, label, value, hint, sub, children }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 p-4 sm:p-5 min-w-0" title={hint}>
      <div className="flex items-center gap-2">
        <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}>
          <Icon className="w-4 h-4" />
        </span>
        <span className="text-xs font-semibold text-slate-500 truncate">{label}</span>
      </div>
      <p className="mt-3 text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight truncate">{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
      {children}
    </div>
  );
}

function Card({ title, hint, right, children, className = '' }) {
  return (
    <section className={`bg-white rounded-3xl border border-slate-200/80 p-4 sm:p-6 min-w-0 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-4">
        <div className="min-w-0">
          <h2 className="text-sm sm:text-base font-bold text-slate-900">{title}</h2>
          {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value, sub }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-right">
        <span className="text-sm font-bold text-slate-900">{value}</span>
        {sub && <span className="block text-[11px] text-slate-400">{sub}</span>}
      </span>
    </div>
  );
}

/* ───────────────────────── page ───────────────────────── */

export default function AnalyticsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [scope, setScope] = useState('business'); // admins can switch; members always see their own wallet
  const view = isAdmin ? scope : 'mine';
  const cacheKey = `analytics_${view}_${user?._id || ''}`;

  const [raw, setRaw] = useState(() => readCache(cacheKey));
  const [loading, setLoading] = useState(() => !readCache(cacheKey));
  const [error, setError] = useState('');

  const [preset, setPreset] = useState('30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showQuietDays, setShowQuietDays] = useState(false);

  const requestNo = useRef(0);

  const load = useCallback(
    async (silent = false) => {
      const mine = ++requestNo.current;
      try {
        if (!silent) setError('');
        const token = localStorage.getItem('portal_token');
        const url = view === 'business' ? '/api/finance' : '/api/wallet?period=all';
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || 'Could not load analytics');
        if (mine !== requestNo.current) return;
        setRaw(json);
        writeCache(cacheKey, json, false); // memory only: instant when you come back to this tab
      } catch (e) {
        if (!silent && mine === requestNo.current) setError(e.message);
      } finally {
        if (mine === requestNo.current) setLoading(false);
      }
    },
    [view, cacheKey]
  );

  useEffect(() => {
    if (!user) return;
    const known = readCache(cacheKey);
    setRaw(known);
    setLoading(!known);
    load(Boolean(known));
  }, [user?._id, view]); // eslint-disable-line react-hooks/exhaustive-deps

  // New deposits, added funds, adjustments and payouts redraw the charts by themselves
  useLiveRefresh(() => load(true));

  const words = WORDS[view];
  const today = dayKey(new Date());

  const events = useMemo(() => {
    if (!raw) return [];
    return view === 'business' ? eventsFromLedger(raw) : eventsFromWallet(raw);
  }, [raw, view]);

  // ── chosen period ──
  const range = useMemo(() => {
    if (preset === 'custom') {
      const from = customFrom || customTo || today;
      const to = customTo || today;
      return from <= to ? { fromKey: from, toKey: to } : { fromKey: to, toKey: from };
    }
    const p = PRESETS.find((x) => x.id === preset) || PRESETS[1];
    if (p.days > 0) return { fromKey: addDays(today, -(p.days - 1)), toKey: today };
    const first = firstEventKey(events) || addDays(today, -6);
    // a little room on the left so the first day is not glued to the axis
    return { fromKey: first < today ? first : addDays(today, -6), toKey: today };
  }, [preset, customFrom, customTo, today, events]);

  const comparable = preset !== 'all';
  const stats = useMemo(() => summarize(events, { ...range, compare: comparable }), [events, range, comparable]);

  // ── today so far (does not depend on the chosen period) ──
  const todayStats = useMemo(() => {
    const s = summarize(events, { fromKey: addDays(today, -1), toKey: today, compare: false });
    return { today: s.days[1], yesterday: s.days[0], balance: s.closingBalance };
  }, [events, today]);

  if (!user) return null;

  const periodText =
    preset === 'custom' ? `previous ${stats.length} day${stats.length === 1 ? '' : 's'}` : `previous ${stats.length} days`;
  const prev = stats.previous;

  const labels = stats.days.map((d) => ({ short: shortDay(d.date), full: fullDay(d.date) }));
  const flowSeries = [
    { key: 'in', name: words.inSeries, color: IN_COLOR, values: stats.days.map((d) => d.in) },
    { key: 'out', name: words.outSeries, color: OUT_COLOR, values: stats.days.map((d) => d.out) },
  ];
  const balanceSeries = [{ key: 'balance', name: words.balance, color: BALANCE_COLOR, values: stats.days.map((d) => d.balance) }];
  const rateSeries = [{ key: 'rate', name: 'INR per 1 USDT', color: RATE_COLOR, values: stats.days.map((d) => d.rate) }];
  const rateDays = stats.days.filter((d) => d.rate !== null).length;

  const sourceSlices = stats.bySource.map((s) => ({ ...s, color: colorForSlot(s.slot) }));
  const personSlices = stats.byPerson.map((s) => ({ ...s, color: colorForSlot(s.slot) }));
  const outTypeSlices = [
    { id: 'seller', name: 'Seller withdrawals (my share)', value: stats.totals.outSeller, color: colorForSlot(1) },
    { id: 'payout', name: 'Paid out to me', value: stats.totals.outPayout, color: colorForSlot(0) },
    { id: 'other', name: 'Milestone bonus cost', value: stats.totals.outOther, color: colorForSlot(3) },
  ]
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  const outRows = stats.outBySource.slice(0, 6);
  const outMax = outRows.reduce((m, r) => Math.max(m, r.value), 0);

  const tableDays = [...stats.days].reverse().filter((d) => showQuietDays || d.movements > 0 || d.transfers > 0);
  const nothingYet = raw && events.length === 0;
  const deductedTotal = view === 'mine' ? stats.totals.outSeller + stats.totals.outOther : stats.totals.outSeller;
  const deductedPrev = prev ? (view === 'mine' ? prev.outSeller + prev.outOther : prev.outSeller) : null;

  return (
    <div className="space-y-5 sm:space-y-6 max-w-7xl mx-auto pb-12">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-emerald-600" />
            <span>Analytics</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {view === 'business'
              ? 'Real USDT received on Binance and sent out, day by day. Test accounts are not counted.'
              : 'What your wallet earned and what was taken out, day by day. All in real USDT.'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <LiveBadge />
          {isAdmin && (
            <div className="inline-flex p-1 rounded-2xl bg-slate-100" role="tablist" aria-label="What to show">
              {[
                { id: 'business', label: 'Whole business', icon: Landmark },
                { id: 'mine', label: 'My wallet', icon: Wallet },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={scope === s.id}
                  onClick={() => setScope(s.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    scope === s.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <s.icon className="w-3.5 h-3.5" />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => load()} className="px-3 py-1.5 rounded-xl bg-white border border-red-200 text-xs font-bold">
            Try again
          </button>
        </div>
      )}

      {!raw && loading && (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-16 flex flex-col items-center text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          <p className="text-sm mt-3">Loading analytics…</p>
        </div>
      )}

      {raw && (
        <>
          {/* ── Today so far ── */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-5 sm:p-7 text-white shadow-xl">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
              <div className="col-span-2 lg:col-span-1">
                <p className="text-[11px] uppercase tracking-wider font-bold text-emerald-300">{words.balance} now</p>
                <p className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-1">{usdt(todayStats.balance)}</p>
                <p className="text-[11px] text-slate-400 mt-1">USDT</p>
              </div>
              {[
                { label: `${words.in} today`, value: usdt(todayStats.today.in), was: usdt(todayStats.yesterday.in) },
                { label: `${words.outSeries} today`, value: usdt(todayStats.today.out), was: usdt(todayStats.yesterday.out) },
                { label: 'Net today', value: signed(todayStats.today.net), was: signed(todayStats.yesterday.net) },
              ].map((x) => (
                <div key={x.label} className="min-w-0 lg:border-l lg:border-white/10 lg:pl-6">
                  <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 truncate">{x.label}</p>
                  <p className="text-xl sm:text-2xl font-extrabold tracking-tight mt-1 truncate">{x.value}</p>
                  <p className="text-[11px] text-slate-400 mt-1 truncate">Yesterday {x.was}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Period: one row, scopes everything below ── */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex p-1 rounded-2xl bg-white border border-slate-200/80" role="tablist" aria-label="Period">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={preset === p.id}
                  onClick={() => setPreset(p.id)}
                  className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    preset === p.id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl border bg-white ${
                preset === 'custom' ? 'border-slate-900' : 'border-slate-200/80'
              }`}
            >
              <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="date"
                aria-label="From date"
                value={preset === 'custom' ? customFrom : range.fromKey}
                max={today}
                onChange={(e) => {
                  setCustomFrom(e.target.value);
                  if (preset !== 'custom') setCustomTo(range.toKey);
                  setPreset('custom');
                }}
                className="text-xs font-semibold text-slate-700 bg-transparent outline-none w-[112px]"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                aria-label="To date"
                value={preset === 'custom' ? customTo : range.toKey}
                max={today}
                onChange={(e) => {
                  setCustomTo(e.target.value);
                  if (preset !== 'custom') setCustomFrom(range.fromKey);
                  setPreset('custom');
                }}
                className="text-xs font-semibold text-slate-700 bg-transparent outline-none w-[112px]"
              />
            </div>
            <span className="text-xs text-slate-500">
              {stats.length} day{stats.length === 1 ? '' : 's'} · {stats.totals.movements} movement{stats.totals.movements === 1 ? '' : 's'}
            </span>
          </div>

          {nothingYet ? (
            <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center">
              <BarChart3 className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-800 mt-3">No money has moved yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                {view === 'business'
                  ? 'Charts appear here as soon as the first deposit with its real USDT amount is approved.'
                  : 'Charts appear here as soon as a deposit from one of your sellers is approved.'}
              </p>
            </div>
          ) : (
            <>
              {/* ── Headline numbers for the period ── */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <StatTile
                  icon={ArrowDownLeft}
                  iconClass="bg-emerald-50 text-emerald-700"
                  label={words.in}
                  hint={words.inHint}
                  value={usdt(stats.totals.in)}
                  sub={`${stats.totals.deposits} deposit${stats.totals.deposits === 1 ? '' : 's'}`}
                >
                  <Delta now={stats.totals.in} before={prev ? prev.in : null} goodWhenUp periodText={periodText} />
                </StatTile>
                <StatTile
                  icon={ArrowUpRight}
                  iconClass="bg-orange-50 text-orange-700"
                  label={words.outSeller}
                  hint={words.outSellerHint}
                  value={usdt(deductedTotal)}
                >
                  <Delta now={deductedTotal} before={deductedPrev} goodWhenUp={null} periodText={periodText} />
                </StatTile>
                <StatTile
                  icon={Send}
                  iconClass="bg-blue-50 text-blue-700"
                  label={words.outPayout}
                  hint={words.outPayoutHint}
                  value={usdt(stats.totals.outPayout)}
                >
                  <Delta now={stats.totals.outPayout} before={prev ? prev.outPayout : null} goodWhenUp={null} periodText={periodText} />
                </StatTile>
                <StatTile
                  icon={Scale}
                  iconClass="bg-slate-100 text-slate-700"
                  label={words.net}
                  hint={words.netHint}
                  value={signed(stats.totals.net)}
                >
                  <Delta now={stats.totals.net} before={prev ? prev.net : null} goodWhenUp periodText={periodText} />
                </StatTile>
              </div>

              {/* ── In vs out + quick facts ── */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                <Card
                  className="lg:col-span-2"
                  title={words.lineTitle}
                  hint="USDT per day. Move over the chart to read a day."
                  right={
                    <LineLegend
                      items={[
                        { name: words.inSeries, color: IN_COLOR, value: usdt(stats.totals.in) },
                        { name: words.outSeries, color: OUT_COLOR, value: usdt(stats.totals.out) },
                      ]}
                    />
                  }
                >
                  <LineChart
                    labels={labels}
                    series={flowSeries}
                    format={usdt}
                    ariaLabel={`${words.lineTitle}. ${words.inSeries} ${usdt(stats.totals.in)}, ${words.outSeries} ${usdt(stats.totals.out)}.`}
                    extra={(i) => [{ name: 'Net', value: signed(stats.days[i].net) }]}
                  />
                </Card>

                <Card title="Quick facts" hint="For the chosen period">
                  <div>
                    <Fact
                      label="Best day"
                      value={stats.bestDay ? usdt(stats.bestDay.in) : '—'}
                      sub={stats.bestDay ? fullDay(stats.bestDay.date) : 'No money came in'}
                    />
                    <Fact label={`Average ${words.in.toLowerCase()} per day`} value={usdt(stats.avgPerDay)} />
                    <Fact label={view === 'business' ? 'Average deposit' : 'Average share per deposit'} value={stats.totals.deposits ? usdt(stats.avgDeposit) : '—'} />
                    <Fact label="Days with movement" value={`${stats.activeDays} of ${stats.length}`} />
                    {view === 'business' && (
                      <Fact label="Average INR rate" value={stats.avgRate ? `₹${fmt(stats.avgRate)}` : '—'} sub="INR received per 1 USDT" />
                    )}
                    {stats.totals.transfers > 0 && view === 'business' && (
                      <Fact label="Milestone bonuses" value={usdt(stats.totals.transfers)} sub="Paid by the partners 50 / 50" />
                    )}
                  </div>
                </Card>
              </div>

              {/* ── Part-to-whole ── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <Card title={words.sourceTitle} hint={words.sourceHint}>
                  <DonutChart slices={sourceSlices} format={usdt} totalLabel={words.in} emptyText="No deposits in this period" />
                </Card>
                {view === 'business' ? (
                  <Card title="Who the deposits belong to" hint="How the received USDT was divided between partners and members">
                    <DonutChart slices={personSlices} format={usdt} totalLabel="Divided" emptyText="No deposits in this period" />
                  </Card>
                ) : (
                  <Card title="What was taken out" hint="Everything that reduced your wallet in this period">
                    <DonutChart slices={outTypeSlices} format={usdt} totalLabel="Taken out" emptyText="Nothing was taken out in this period" />
                  </Card>
                )}
              </div>

              {/* ── Balance over time ── */}
              <Card
                title={words.balanceTitle}
                hint={words.balanceHint}
                right={
                  <span className="text-xs text-slate-500">
                    Start <span className="font-bold text-slate-900">{usdt(stats.openingBalance)}</span>
                    <span className="mx-1.5 text-slate-300">→</span>
                    End <span className="font-bold text-slate-900">{usdt(stats.closingBalance)}</span>
                  </span>
                }
              >
                <LineChart
                  labels={labels}
                  series={balanceSeries}
                  format={usdt}
                  area
                  height={220}
                  ariaLabel={`${words.balanceTitle}. From ${usdt(stats.openingBalance)} to ${usdt(stats.closingBalance)}.`}
                />
              </Card>

              {/* ── Business only: INR rate + where the money went ── */}
              {view === 'business' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                  <Card
                    title="INR rate on deposit days"
                    hint="INR received for each 1 USDT (average of that day's deposits)"
                    right={stats.avgRate ? <span className="text-xs text-slate-500">Average <span className="font-bold text-slate-900">₹{fmt(stats.avgRate)}</span></span> : null}
                  >
                    {rateDays > 0 ? (
                      <LineChart
                        labels={labels}
                        series={rateSeries}
                        format={(v) => `₹${fmt(v)}`}
                        height={200}
                        fromZero={false}
                        ariaLabel="INR received per 1 USDT on each deposit day"
                      />
                    ) : (
                      <p className="text-xs text-slate-400 py-10 text-center">No deposits with an INR amount in this period</p>
                    )}
                  </Card>

                  <Card title="Where the money went" hint="USDT that left Binance in this period">
                    {outRows.length === 0 ? (
                      <p className="text-xs text-slate-400 py-10 text-center">Nothing left Binance in this period</p>
                    ) : (
                      <ul className="space-y-3">
                        {outRows.map((r) => (
                          <li key={r.id}>
                            <div className="flex items-baseline justify-between gap-3 text-xs">
                              <span className="text-slate-600 truncate">
                                {r.name}
                                <span className="text-slate-400"> · {String(r.id).startsWith('person_') ? 'payout' : 'seller withdrawal'}</span>
                              </span>
                              <span className="font-bold text-slate-900 shrink-0">{usdt(r.value)}</span>
                            </div>
                            <div className="mt-1.5 h-2 rounded-full bg-slate-100">
                              <div
                                className="h-2 rounded-full"
                                style={{ width: `${Math.max(2, (r.value / outMax) * 100)}%`, background: OUT_COLOR }}
                              />
                            </div>
                          </li>
                        ))}
                        {stats.outBySource.length > outRows.length && (
                          <li className="text-[11px] text-slate-400">
                            and {stats.outBySource.length - outRows.length} more, {usdt(stats.outBySource.slice(6).reduce((s, r) => s + r.value, 0))} in total
                          </li>
                        )}
                      </ul>
                    )}
                  </Card>
                </div>
              )}

              {/* ── Day by day (the same numbers as the charts, as a table) ── */}
              <Card
                title="Day by day"
                hint="Newest first"
                right={
                  <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showQuietDays}
                      onChange={(e) => setShowQuietDays(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Show days with no movement</span>
                  </label>
                }
              >
                <div className="overflow-x-auto -mx-4 sm:-mx-6">
                  <table className="w-full text-xs min-w-[560px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                        <th className="font-bold py-2 pl-4 sm:pl-6 pr-3">Date</th>
                        <th className="font-bold py-2 px-3 text-right">{words.in}</th>
                        <th className="font-bold py-2 px-3 text-right">{words.outSeller}</th>
                        <th className="font-bold py-2 px-3 text-right">{words.outPayout}</th>
                        <th className="font-bold py-2 px-3 text-right">Net</th>
                        <th className={`font-bold py-2 px-3 text-right ${view === 'business' ? '' : 'pr-4 sm:pr-6'}`}>Balance</th>
                        {view === 'business' && <th className="font-bold py-2 pl-3 pr-4 sm:pr-6 text-right">INR rate</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {tableDays.length === 0 && (
                        <tr>
                          <td colSpan={view === 'business' ? 7 : 6} className="py-8 text-center text-slate-400">
                            No movement in this period
                          </td>
                        </tr>
                      )}
                      {tableDays.map((d) => {
                        const deducted = view === 'mine' ? d.outSeller + d.outOther : d.outSeller;
                        return (
                          <tr key={d.key} className="border-b border-slate-50 hover:bg-slate-50/70">
                            <td className="py-2.5 pl-4 sm:pl-6 pr-3 font-semibold text-slate-700 whitespace-nowrap">
                              {fullDay(d.date)}
                              {d.key === today && <span className="ml-2 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Today</span>}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-900">{d.in ? usdt(d.in) : <span className="text-slate-300">—</span>}</td>
                            <td className="py-2.5 px-3 text-right text-slate-700">{deducted ? usdt(deducted) : <span className="text-slate-300">—</span>}</td>
                            <td className="py-2.5 px-3 text-right text-slate-700">{d.outPayout ? usdt(d.outPayout) : <span className="text-slate-300">—</span>}</td>
                            <td className={`py-2.5 px-3 text-right font-bold ${d.net < 0 ? 'text-red-600' : d.net > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                              {d.net ? signed(d.net) : '—'}
                            </td>
                            <td className={`py-2.5 px-3 text-right text-slate-700 ${view === 'business' ? '' : 'pr-4 sm:pr-6'}`}>{usdt(d.balance)}</td>
                            {view === 'business' && (
                              <td className="py-2.5 pl-3 pr-4 sm:pr-6 text-right text-slate-700">{d.rate ? `₹${fmt(d.rate)}` : <span className="text-slate-300">—</span>}</td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                    {tableDays.length > 0 && (
                      <tfoot>
                        <tr className="border-t border-slate-200 font-bold text-slate-900">
                          <td className="py-3 pl-4 sm:pl-6 pr-3">Total for {stats.length} day{stats.length === 1 ? '' : 's'}</td>
                          <td className="py-3 px-3 text-right">{usdt(stats.totals.in)}</td>
                          <td className="py-3 px-3 text-right">{usdt(deductedTotal)}</td>
                          <td className="py-3 px-3 text-right">{usdt(stats.totals.outPayout)}</td>
                          <td className={`py-3 px-3 text-right ${stats.totals.net < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{signed(stats.totals.net)}</td>
                          <td className={`py-3 px-3 text-right ${view === 'business' ? '' : 'pr-4 sm:pr-6'}`}>{usdt(stats.closingBalance)}</td>
                          {view === 'business' && <td className="py-3 pl-3 pr-4 sm:pr-6 text-right">{stats.avgRate ? `₹${fmt(stats.avgRate)}` : '—'}</td>}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
