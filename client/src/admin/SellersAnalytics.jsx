import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { api, money } from '../api.js';
import { STATUS_LABELS } from '../data.js';
import { ErrorBox } from './ui.jsx';

// Wallet movement series, in legend order (checked for colour-blind separation)
const MOVE_SERIES = [
  { key: 'deposits', name: 'Deposits', color: '#2563eb', group: 'cash' },
  { key: 'released', name: 'Order releases', color: '#0d9488', group: 'orders' },
  { key: 'withdrawals', name: 'Withdrawals', color: '#d97706', group: 'cash' },
  { key: 'locked', name: 'Locked for orders', color: '#7c3aed', group: 'orders' },
];
// one hue, lighter → darker as orders get older
const AGING_COLORS = ['#fed7aa', '#fb923c', '#ea580c', '#9a3412'];
const HEALTH_SLICES = [
  { key: 'healthy', name: 'Healthy (80+)', color: '#16a34a' },
  { key: 'watch', name: 'Watch (31–79)', color: '#eab308' },
  { key: 'atRisk', name: 'At risk (21–30)', color: '#ea580c' },
  { key: 'critical', name: 'Critical (≤20)', color: '#dc2626' },
];
const GRID = '#eef2f7';
// legend text stays in ink colour; the swatch next to it carries the series colour
const legendText = (v) => <span style={{ color: '#334155' }}>{v}</span>;
const AXIS = { fontSize: 11, stroke: '#94a3b8', tickLine: false, axisLine: false };

const COLLAPSE_KEY = 'admin.sellers.analytics.collapsed';
// Charts start folded on phones (the KPI tiles stay visible) unless the admin chose otherwise
const readCollapsed = () => {
  let saved = null;
  try {
    saved = localStorage.getItem(COLLAPSE_KEY);
  } catch {
    /* storage blocked */
  }
  if (saved !== null) return saved === '1';
  return typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 768px)').matches;
};

const shortMoney = (v) => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
};

function Kpi({ label, value, sub, tone = 'neutral' }) {
  return (
    <div className={`sa-kpi sa-tone-${tone}`}>
      <span className="sa-kpi-label">{label}</span>
      <b className="sa-kpi-value">{value}</b>
      {sub && <span className="sa-kpi-sub">{sub}</span>}
    </div>
  );
}

function ChartCard({ title, hint, wide, children, empty }) {
  return (
    <div className={`sa-card${wide ? ' sa-wide' : ''}`}>
      <div className="sa-card-head">
        <h3>{title}</h3>
        {hint && <span className="sa-card-hint">{hint}</span>}
      </div>
      {empty ? <div className="sa-empty">{empty}</div> : children}
    </div>
  );
}

function TopStores({ rows, valueKey, countKey, countLabel, color, onOpen }) {
  if (!rows?.length) return <div className="sa-empty">No data yet</div>;
  const max = Math.max(...rows.map((r) => r[valueKey]), 1);
  return (
    <ol className="sa-top-list">
      {rows.map((r, i) => (
        <li key={r._id}>
          <button type="button" onClick={() => onOpen?.(r._id)} title="Open seller profile">
            <span className="sa-top-rank">{i + 1}</span>
            <span className="sa-top-main">
              <span className="sa-top-row">
                <span className="sa-top-name">{r.storeName}</span>
                <b className="sa-top-val">{money(r[valueKey])}</b>
              </span>
              <span className="sa-top-bar">
                <span style={{ width: `${Math.max(3, (r[valueKey] / max) * 100)}%`, background: color }} />
              </span>
              {countKey && (
                <span className="sa-top-sub">
                  {r[countKey]} {countLabel}
                </span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

export default function SellersAnalytics({ onOpenSeller, refreshKey }) {
  const [scope, setScope] = useState('client');
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [moveView, setMoveView] = useState('cash'); // 'cash' = deposits/withdrawals, 'orders' = locked/released

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    api(`/sellers/analytics/overview?scope=${scope}&days=${days}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [scope, days, refreshKey]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* storage blocked: only this visit remembers it */
      }
      return !c;
    });
  };

  const d = data;
  const salesTotal = d ? d.salesTrend.reduce((a, b) => a + b.sales, 0) : 0;
  const salesOrders = d ? d.salesTrend.reduce((a, b) => a + b.orders, 0) : 0;
  const netFlow = d ? d.moveTotals.deposits - d.moveTotals.withdrawals : 0;
  const healthPie = d ? HEALTH_SLICES.map((h) => ({ ...h, value: d.health[h.key] || 0 })).filter((h) => h.value > 0) : [];
  const pendingStatusRows = d ? d.pendingByStatus.map((p) => ({ ...p, name: STATUS_LABELS[p.status] || p.status })) : [];
  const moveSeries = MOVE_SERIES.filter((s) => (moveView === 'cash' ? s.group === 'cash' : s.group === 'orders'));
  const hasMoves = d && d.movesTrend.some((m) => moveSeries.some((s) => m[s.key]));

  return (
    <section className="sa-panel">
      <div className="sa-toolbar">
        <div className="sa-title">
          <h3>📊 Seller Analytics</h3>
          <span>
            {d ? `${d.sellerCount} stores · last ${d.days} days` : 'Loading…'}
            {d?.newSellers ? ` · ${d.newSellers} new` : ''}
          </span>
        </div>
        <div className="sa-controls">
          <div className="sa-seg" role="group" aria-label="Which sellers to count">
            <button type="button" className={scope === 'client' ? 'on' : ''} onClick={() => setScope('client')} title="Real client stores only (no test or previous-store accounts)">
              Real clients
            </button>
            <button type="button" className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')} title="Every approved store, test accounts included">
              All stores
            </button>
          </div>
          <div className="sa-seg" role="group" aria-label="Time range">
            {[7, 30, 90].map((n) => (
              <button key={n} type="button" className={days === n ? 'on' : ''} onClick={() => setDays(n)}>
                {n}d
              </button>
            ))}
          </div>
          <button type="button" className="sa-collapse" onClick={toggleCollapsed} aria-expanded={!collapsed}>
            {collapsed ? 'Show charts ▾' : 'Hide charts ▴'}
          </button>
        </div>
      </div>

      <ErrorBox error={error} />

      {d && (
        <div className={`sa-kpis${loading ? ' sa-dim' : ''}`}>
          <Kpi label="Wallet balance" value={money(d.wallet.balance)} sub={`Available · ${d.sellerCount} stores`} tone="green" />
          <Kpi label="Locked in processing" value={money(d.wallet.processingFund)} sub="Held for confirmed orders" tone="violet" />
          <Kpi
            label="Pending orders value"
            value={money(d.pending.amount)}
            sub={`${d.pending.orders} open orders · ${money(d.pending.expectedProfit)} profit due`}
            tone="orange"
          />
          <Kpi
            label="Withdrawal requests"
            value={money(d.requests.withdrawals.amount)}
            sub={`${d.requests.withdrawals.count} waiting for approval`}
            tone={d.requests.withdrawals.count ? 'red' : 'neutral'}
          />
          <Kpi
            label="Deposit requests"
            value={money(d.requests.deposits.amount)}
            sub={`${d.requests.deposits.count} waiting for approval`}
            tone="blue"
          />
          <Kpi label={`Sales · ${d.days}d`} value={money(salesTotal)} sub={`${salesOrders} orders`} tone="brand" />
        </div>
      )}

      {d && !collapsed && (
        <div className={`sa-grid${loading ? ' sa-dim' : ''}`}>
          <ChartCard title="Sales trend" hint={`Order value per day · ${money(salesTotal)}`} wide empty={!salesOrders && 'No orders in this period'}>
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={d.salesTrend} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="saSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e0446e" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#e0446e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" {...AXIS} minTickGap={18} />
                <YAxis {...AXIS} tickFormatter={shortMoney} />
                <Tooltip formatter={(v, n) => (n === 'Sales' ? money(v) : v)} />
                <Area type="monotone" dataKey="sales" name="Sales" stroke="#e0446e" strokeWidth={2} fill="url(#saSales)" activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Seller health" hint={`${d.status.active} active · ${d.status.frozen + d.status.suspended} frozen/suspended · ${d.status.warned} warned`} empty={!healthPie.length && 'No stores'}>
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={healthPie} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2} stroke="#fff" strokeWidth={2}>
                  {healthPie.map((h) => (
                    <Cell key={h.key} fill={h.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" formatter={legendText} itemSorter={(item) => HEALTH_SLICES.findIndex((h) => h.name === item.value)} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Wallet movements"
            hint={
              <span className="sa-hint-row">
                <span className="sa-seg sa-seg-sm" role="group" aria-label="Which movements">
                  <button type="button" className={moveView === 'cash' ? 'on' : ''} onClick={() => setMoveView('cash')}>
                    Deposits &amp; withdrawals
                  </button>
                  <button type="button" className={moveView === 'orders' ? 'on' : ''} onClick={() => setMoveView('orders')}>
                    Order funds
                  </button>
                </span>
                {moveView === 'cash' ? `Net ${netFlow >= 0 ? '+' : ''}${money(netFlow)}` : `Released ${money(d.moveTotals.released)}`}
              </span>
            }
            wide
            empty={!hasMoves && 'No wallet movement in this period'}
          >
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={d.movesTrend} margin={{ top: 6, right: 8, left: -12, bottom: 0 }} barGap={2}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" {...AXIS} minTickGap={18} />
                <YAxis {...AXIS} tickFormatter={shortMoney} />
                <Tooltip formatter={(v) => money(v)} cursor={{ fill: '#f1f5f9' }} />
                <Legend iconType="square" formatter={legendText} wrapperStyle={{ fontSize: 11 }} />
                {moveSeries.map((s) => (
                  <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={14} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={`Money moved · ${d.days}d`} hint="Settled wallet lines">
            <ul className="sa-flow">
              {MOVE_SERIES.map((s) => (
                <li key={s.key}>
                  <span className="sa-dot" style={{ background: s.color }} />
                  <span>{s.name}</span>
                  <b>{money(d.moveTotals[s.key])}</b>
                </li>
              ))}
              <li>
                <span className="sa-dot" style={{ background: '#94a3b8' }} />
                <span>Cancelled-order refunds</span>
                <b>{money(d.moveTotals.refunded)}</b>
              </li>
              <li>
                <span className="sa-dot" style={{ background: '#94a3b8' }} />
                <span>Admin adjustments</span>
                <b>{money(d.moveTotals.adjustments)}</b>
              </li>
            </ul>
            <div className="sa-flow-life">
              <div><span>Lifetime deposited</span><b>{money(d.wallet.totalDeposited)}</b></div>
              <div><span>Lifetime withdrawn</span><b>{money(d.wallet.totalWithdrawn)}</b></div>
              <div><span>Lifetime earned</span><b>{money(d.wallet.totalEarned)}</b></div>
              <div><span>Profit paid (20%)</span><b>{money(d.wallet.totalProfitEarned)}</b></div>
            </div>
          </ChartCard>

          <ChartCard title="Pending orders by stage" hint={`${d.pending.orders} orders · ${money(d.pending.amount)}`} wide empty={!pendingStatusRows.length && 'No open orders 🎉'}>
            <ResponsiveContainer width="100%" height={Math.max(160, pendingStatusRows.length * 34)}>
              <BarChart data={pendingStatusRows} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" {...AXIS} tickFormatter={shortMoney} />
                <YAxis type="category" dataKey="name" {...AXIS} width={110} />
                <Tooltip formatter={(v) => money(v)} labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload?.count ?? 0} orders`} />
                <Bar dataKey="amount" name="Order value" fill="#ea580c" radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="How long orders are waiting" hint="Open order value by age" empty={!d.pending.orders && 'No open orders'}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={d.aging} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis {...AXIS} tickFormatter={shortMoney} />
                <Tooltip formatter={(v) => money(v)} labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload?.count ?? 0} orders`} />
                <Bar dataKey="amount" name="Order value" radius={[4, 4, 0, 0]} barSize={34}>
                  {d.aging.map((a, i) => (
                    <Cell key={a.label} fill={AGING_COLORS[i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={`Top stores by sales · ${d.days}d`}>
            <TopStores rows={d.topBySales} valueKey="sales" countKey="orders" countLabel="orders" color="#e0446e" onOpen={onOpenSeller} />
          </ChartCard>

          <ChartCard title="Most money in pending orders">
            <TopStores rows={d.topByPending} valueKey="pendingAmount" countKey="pendingOrders" countLabel="open orders" color="#ea580c" onOpen={onOpenSeller} />
          </ChartCard>

          <ChartCard title="Highest wallet balances">
            <TopStores rows={d.topByBalance} valueKey="balance" color="#16a34a" onOpen={onOpenSeller} />
          </ChartCard>
        </div>
      )}

      {!d && loading && <div className="sa-empty">Loading analytics…</div>}
    </section>
  );
}
