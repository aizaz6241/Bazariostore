import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { api, money } from '../api.js';
import Ic from '../components/Icons.jsx';

// Series colors (identity): deposits = slot 1, withdrawals = slot 2. Validated as an adjacent pair.
const C_DEPOSIT = '#2a78d6';
const C_WITHDRAW = '#eb6834';
const C_NEUTRAL = '#64748b';
// Status colors (state) — always shown with a label, never color alone
const STATUS_COLORS = { pending: '#fab219', approved: '#0ca30c', rejected: '#d03b3b' };
const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };

const RANGES = [
  { val: 7, label: '7D' },
  { val: 30, label: '30D' },
  { val: 90, label: '90D' },
  { val: 0, label: 'All time' },
];

const METHOD_LABEL = {
  bank: 'Bank Transfer', upi: 'UPI', paytm: 'Paytm', gpay: 'Google Pay',
  phonepe: 'PhonePe', usdt: 'USDT Crypto', other: 'Other', '': 'Not set',
};

const DAY = 24 * 60 * 60 * 1000;
const grossOf = (r) => (r.approvedAmount !== null && r.approvedAmount !== undefined && r.status === 'approved' ? Number(r.approvedAmount) : Number(r.amount)) || 0;
const compact = (n) => {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(1)}k`;
  return `$${Math.round(v)}`;
};
const fmtDuration = (ms) => {
  if (!ms || ms < 0) return '—';
  const m = ms / 60000;
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
};
const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const monthKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
};

function ChartTip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="pa-tip">
      <div className="pa-tip-label">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="pa-tip-row">
          <span className="pa-tip-dot" style={{ background: p.color || p.payload?.fill }} />
          <span>{p.name}</span>
          <b>{p.dataKey === 'count' ? p.value : money(p.value)}</b>
        </div>
      ))}
    </div>
  );
}

export default function PayoutsAnalytics({ refreshKey = 0 }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState(30);
  const [includeManual, setIncludeManual] = useState(false);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    // Real clients only (test / demo / previous-store sellers excluded), same rule as the deposits ledger
    Promise.all([
      api('/sellers/withdrawals/all?type=deposit&status=all&excludeTest=true'),
      api('/sellers/withdrawals/all?type=withdrawal&status=all&excludeTest=true'),
    ])
      .then(([dep, wd]) => {
        if (!alive) return;
        setRows([...(dep.requests || []), ...(wd.requests || [])]);
        setError('');
      })
      .catch((e) => alive && setError(e.message || 'Could not load analytics'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [refreshKey]);

  const scoped = useMemo(() => (includeManual ? rows : rows.filter((r) => !r.isManualAdjustment)), [rows, includeManual]);

  const inRange = useMemo(() => {
    if (!range) return scoped;
    const from = Date.now() - range * DAY;
    return scoped.filter((r) => new Date(r.createdAt).getTime() >= from);
  }, [scoped, range]);

  const stats = useMemo(() => {
    const dep = inRange.filter((r) => r.type === 'deposit');
    const wd = inRange.filter((r) => r.type === 'withdrawal');
    const approved = (list) => list.filter((r) => r.status === 'approved');
    const sum = (list) => list.reduce((s, r) => s + grossOf(r), 0);
    const depApproved = approved(dep);
    const wdApproved = approved(wd);
    const decided = inRange.filter((r) => r.status === 'approved' || r.status === 'rejected');
    const timed = decided.filter((r) => r.processedAt && r.createdAt);
    const avgMs = timed.length
      ? timed.reduce((s, r) => s + (new Date(r.processedAt) - new Date(r.createdAt)), 0) / timed.length
      : 0;
    const sortedTimes = timed.map((r) => new Date(r.processedAt) - new Date(r.createdAt)).sort((a, b) => a - b);
    const medianMs = sortedTimes.length ? sortedTimes[Math.floor(sortedTimes.length / 2)] : 0;
    const partials = wdApproved.filter((r) => grossOf(r) < Number(r.amount));
    return {
      depVolume: sum(depApproved),
      wdVolume: sum(wdApproved),
      depCount: depApproved.length,
      wdCount: wdApproved.length,
      net: sum(depApproved) - sum(wdApproved),
      approvalRate: decided.length ? (inRange.filter((r) => r.status === 'approved').length / decided.length) * 100 : null,
      decidedCount: decided.length,
      avgMs,
      medianMs,
      helping: depApproved.reduce((s, r) => s + (Number(r.helpingAmount) || 0), 0),
      usdtIn: depApproved.reduce((s, r) => s + (Number(r.usdtAmount) || 0), 0),
      usdtOut: wdApproved.reduce((s, r) => s + (Number(r.usdtAmount) || 0), 0),
      avgPayout: wdApproved.length ? sum(wdApproved) / wdApproved.length : 0,
      partials: partials.length,
      partialRefunded: partials.reduce((s, r) => s + (Number(r.amount) - grossOf(r)), 0),
    };
  }, [inRange]);

  // Trend buckets: daily for 7D / 30D, weekly for 90D, monthly for long "all time" spans
  const trend = useMemo(() => {
    const approvedRows = inRange.filter((r) => r.status === 'approved');
    let unit = 'day';
    let start;
    if (range) {
      start = new Date(Date.now() - (range - 1) * DAY);
      if (range > 31) unit = 'week';
    } else {
      const first = approvedRows.reduce((m, r) => Math.min(m, new Date(r.createdAt).getTime()), Date.now());
      start = new Date(first);
      const span = Date.now() - first;
      unit = span > 120 * DAY ? 'month' : span > 31 * DAY ? 'week' : 'day';
    }
    start.setHours(0, 0, 0, 0);
    if (unit === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday
    if (unit === 'month') start.setDate(1);

    const keyOf = (d) => {
      const x = new Date(d);
      if (unit === 'month') return monthKey(x);
      if (unit === 'week') {
        x.setHours(0, 0, 0, 0);
        x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
      }
      return dayKey(x);
    };

    const buckets = new Map();
    const cursor = new Date(start);
    const now = new Date();
    while (cursor <= now) {
      buckets.set(keyOf(cursor), {
        key: keyOf(cursor),
        label: unit === 'month'
          ? cursor.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
          : `${unit === 'week' ? 'Wk ' : ''}${cursor.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`,
        deposits: 0,
        withdrawals: 0,
      });
      if (unit === 'month') cursor.setMonth(cursor.getMonth() + 1, 1);
      else cursor.setDate(cursor.getDate() + (unit === 'week' ? 7 : 1));
    }
    approvedRows.forEach((r) => {
      const b = buckets.get(keyOf(r.createdAt));
      if (!b) return;
      if (r.type === 'deposit') b.deposits += grossOf(r);
      else b.withdrawals += grossOf(r);
    });
    return { unit, data: Array.from(buckets.values()) };
  }, [inRange, range]);

  const statusMix = useMemo(() => {
    const counts = { pending: 0, approved: 0, rejected: 0 };
    inRange.forEach((r) => { if (counts[r.status] !== undefined) counts[r.status] += 1; });
    return Object.entries(counts).map(([k, v]) => ({ key: k, name: STATUS_LABEL[k], value: v, fill: STATUS_COLORS[k] }));
  }, [inRange]);
  const statusTotal = statusMix.reduce((s, x) => s + x.value, 0);

  const methods = useMemo(() => {
    const map = {};
    inRange
      .filter((r) => r.type === 'withdrawal' && r.status === 'approved')
      .forEach((r) => {
        const k = r.method || '';
        map[k] = map[k] || { name: METHOD_LABEL[k] || k.toUpperCase(), volume: 0, count: 0 };
        map[k].volume += grossOf(r);
        map[k].count += 1;
      });
    return Object.values(map).sort((a, b) => b.volume - a.volume);
  }, [inRange]);

  const topSellers = useMemo(() => {
    const map = {};
    inRange
      .filter((r) => r.status === 'approved')
      .forEach((r) => {
        const id = r.seller?._id || r.seller || r.storeName;
        map[id] = map[id] || { id, store: r.storeName || r.seller?.storeName || 'Store', owner: r.seller?.ownerName || '', deposits: 0, withdrawals: 0, count: 0 };
        if (r.type === 'deposit') map[id].deposits += grossOf(r);
        else map[id].withdrawals += grossOf(r);
        map[id].count += 1;
      });
    return Object.values(map)
      .sort((a, b) => b.withdrawals + b.deposits - (a.withdrawals + a.deposits))
      .slice(0, 6);
  }, [inRange]);
  const topMax = topSellers.reduce((m, s) => Math.max(m, s.deposits, s.withdrawals), 0) || 1;

  // Backlog aging is always "right now", independent of the range picker
  const aging = useMemo(() => {
    const bins = [
      { name: '< 1h', max: 1, count: 0 },
      { name: '1–6h', max: 6, count: 0 },
      { name: '6–24h', max: 24, count: 0 },
      { name: '1–3d', max: 72, count: 0 },
      { name: '> 3d', max: Infinity, count: 0 },
    ];
    const pending = scoped.filter((r) => r.status === 'pending');
    pending.forEach((r) => {
      const h = (Date.now() - new Date(r.createdAt).getTime()) / 3600000;
      const bin = bins.find((b) => h < b.max);
      if (bin) bin.count += 1;
    });
    const oldest = pending.reduce((m, r) => Math.min(m, new Date(r.createdAt).getTime()), Infinity);
    return { bins, total: pending.length, oldestMs: Number.isFinite(oldest) ? Date.now() - oldest : 0 };
  }, [scoped]);

  if (loading && rows.length === 0) {
    return (
      <div className="pd-skeleton-grid">
        {[0, 1, 2, 3].map((i) => <div key={i} className="pd-skeleton" />)}
      </div>
    );
  }
  if (error) {
    return (
      <div className="pd-empty">
        <Ic name="alert" size={36} stroke={1.4} />
        <p>Analytics load nahi ho saki: {error}</p>
      </div>
    );
  }

  const hasTrend = trend.data.some((t) => t.deposits > 0 || t.withdrawals > 0);

  return (
    <div className="pa-root">
      {/* Controls */}
      <div className="pd-toolbar">
        <div className="pd-seg" role="tablist" aria-label="Date range">
          {RANGES.map((r) => (
            <button key={r.val} type="button" className={range === r.val ? 'active' : ''} onClick={() => setRange(r.val)}>
              {r.label}
            </button>
          ))}
        </div>
        <label className="pd-switch">
          <input type="checkbox" checked={includeManual} onChange={(e) => setIncludeManual(e.target.checked)} />
          <span className="pd-switch-track"><span /></span>
          <span>Include admin adjustments</span>
        </label>
        <span className="pd-pill pd-pill-green pd-push-right">
          <span className="pd-dot" /> Real clients only
        </span>
      </div>

      {/* KPI tiles */}
      <div className="pa-kpis">
        <div className="pa-kpi">
          <span className="pa-kpi-label"><i style={{ background: C_DEPOSIT }} />Deposits approved</span>
          <b>{money(stats.depVolume)}</b>
          <small>{stats.depCount} transactions</small>
        </div>
        <div className="pa-kpi">
          <span className="pa-kpi-label"><i style={{ background: C_WITHDRAW }} />Payouts approved</span>
          <b>{money(stats.wdVolume)}</b>
          <small>{stats.wdCount} payouts • avg {money(stats.avgPayout)}</small>
        </div>
        <div className="pa-kpi">
          <span className="pa-kpi-label">Net flow</span>
          <b className={stats.net >= 0 ? 'pa-pos' : 'pa-neg'}>
            {stats.net >= 0 ? '+' : '−'}{money(Math.abs(stats.net))}
          </b>
          <small>Deposits minus payouts</small>
        </div>
        <div className="pa-kpi">
          <span className="pa-kpi-label">Approval rate</span>
          <b>{stats.approvalRate === null ? '—' : `${stats.approvalRate.toFixed(1)}%`}</b>
          <small>of {stats.decidedCount} decided requests</small>
        </div>
        <div className="pa-kpi">
          <span className="pa-kpi-label">Avg. processing time</span>
          <b>{fmtDuration(stats.avgMs)}</b>
          <small>median {fmtDuration(stats.medianMs)}</small>
        </div>
        <div className="pa-kpi">
          <span className="pa-kpi-label">USDT moved (Binance)</span>
          <b>₮{stats.usdtIn.toLocaleString('en-US', { maximumFractionDigits: 2 })} <em>in</em></b>
          <small>₮{stats.usdtOut.toLocaleString('en-US', { maximumFractionDigits: 2 })} out • helping {money(stats.helping)}</small>
        </div>
      </div>

      <div className="pa-grid">
        {/* Volume trend */}
        <section className="pd-card pa-span-3">
          <header className="pa-card-head">
            <div>
              <h3>Approved volume over time</h3>
              <p>Deposits vs payouts per {trend.unit}, by request date</p>
            </div>
            <button type="button" className="pd-btn-ghost" onClick={() => setShowTable((v) => !v)}>
              <Ic name={showTable ? 'grid' : 'list'} size={14} /> {showTable ? 'Chart view' : 'Table view'}
            </button>
          </header>
          {!hasTrend ? (
            <div className="pa-nodata">Is range mein koi approved transaction nahi.</div>
          ) : showTable ? (
            <div className="pa-table-scroll">
              <table className="pd-table">
                <thead><tr><th>Period</th><th className="num">Deposits</th><th className="num">Payouts</th><th className="num">Net</th></tr></thead>
                <tbody>
                  {trend.data.filter((t) => t.deposits || t.withdrawals).reverse().map((t) => (
                    <tr key={t.key}>
                      <td>{t.label}</td>
                      <td className="num">{money(t.deposits)}</td>
                      <td className="num">{money(t.withdrawals)}</td>
                      <td className="num">{money(t.deposits - t.withdrawals)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="pa-chart">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={trend.data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
                  <CartesianGrid stroke="#eef2f6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} minTickGap={18} />
                  <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={52} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#475569' }} />
                  <Bar dataKey="deposits" name="Deposits" fill={C_DEPOSIT} radius={[4, 4, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="withdrawals" name="Payouts" fill={C_WITHDRAW} radius={[4, 4, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Status mix */}
        <section className="pd-card">
          <header className="pa-card-head">
            <div>
              <h3>Request outcomes</h3>
              <p>{statusTotal} requests in range</p>
            </div>
          </header>
          {statusTotal === 0 ? (
            <div className="pa-nodata">No requests yet.</div>
          ) : (
            <div className="pa-donut-wrap">
              <div className="pa-donut">
                <ResponsiveContainer width="100%" height={170}>
                  <PieChart>
                    <Pie data={statusMix} dataKey="value" nameKey="name" innerRadius={52} outerRadius={76} paddingAngle={2} stroke="#fff" strokeWidth={2}>
                      {statusMix.map((s) => <Cell key={s.key} fill={s.fill} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [`${v} requests`, n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pa-donut-center">
                  <b>{stats.approvalRate === null ? '—' : `${Math.round(stats.approvalRate)}%`}</b>
                  <small>approved</small>
                </div>
              </div>
              <ul className="pa-legend">
                {statusMix.map((s) => (
                  <li key={s.key}>
                    <span className="pa-legend-dot" style={{ background: s.fill }} />
                    <span>{s.name}</span>
                    <b>{s.value}</b>
                    <small>{statusTotal ? Math.round((s.value / statusTotal) * 100) : 0}%</small>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Payout methods */}
        <section className="pd-card">
          <header className="pa-card-head">
            <div>
              <h3>Payout methods</h3>
              <p>Approved payout volume by channel</p>
            </div>
          </header>
          {methods.length === 0 ? (
            <div className="pa-nodata">No approved payouts in range.</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(140, methods.length * 38 + 20)}>
              <BarChart data={methods} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }} barCategoryGap={8}>
                <CartesianGrid stroke="#eef2f6" horizontal={false} />
                <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#334155' }} tickLine={false} axisLine={false} width={96} />
                <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
                <Bar dataKey="volume" name="Payout volume" fill={C_WITHDRAW} radius={[0, 4, 4, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        {/* Pending backlog aging */}
        <section className="pd-card">
          <header className="pa-card-head">
            <div>
              <h3>Pending backlog age</h3>
              <p>{aging.total} waiting now • oldest {fmtDuration(aging.oldestMs)}</p>
            </div>
          </header>
          {aging.total === 0 ? (
            <div className="pa-nodata pa-nodata-good"><Ic name="checkCircle" size={22} /> Queue clear — kuch pending nahi.</div>
          ) : (
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={aging.bins} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap={6}>
                <CartesianGrid stroke="#eef2f6" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
                <Bar dataKey="count" name="Requests" fill={C_NEUTRAL} radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        {/* Top sellers */}
        <section className="pd-card pa-span-3">
          <header className="pa-card-head">
            <div>
              <h3>Top sellers by money moved</h3>
              <p>Approved deposits and payouts in range</p>
            </div>
            <div className="pa-mini-legend">
              <span><i style={{ background: C_DEPOSIT }} />Deposits</span>
              <span><i style={{ background: C_WITHDRAW }} />Payouts</span>
            </div>
          </header>
          {topSellers.length === 0 ? (
            <div className="pa-nodata">No approved transactions in range.</div>
          ) : (
            <div className="pa-top">
              {topSellers.map((s, i) => (
                <div key={s.id} className="pa-top-row">
                  <span className="pa-rank">{i + 1}</span>
                  <div className="pa-top-name">
                    <b>{s.store}</b>
                    <small>{s.owner} • {s.count} txns</small>
                  </div>
                  <div className="pa-top-bars">
                    <div className="pa-bar-line">
                      <span className="pa-bar" style={{ width: `${(s.deposits / topMax) * 100}%`, background: C_DEPOSIT }} />
                      <small>{money(s.deposits)}</small>
                    </div>
                    <div className="pa-bar-line">
                      <span className="pa-bar" style={{ width: `${(s.withdrawals / topMax) * 100}%`, background: C_WITHDRAW }} />
                      <small>{money(s.withdrawals)}</small>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {stats.partials > 0 && (
        <div className="pd-note">
          <Ic name="alert" size={15} />
          <span>
            Is range mein <b>{stats.partials}</b> partial payouts hue — <b>{money(stats.partialRefunded)}</b> seller balances mein wapas gaya.
          </span>
        </div>
      )}
    </div>
  );
}
