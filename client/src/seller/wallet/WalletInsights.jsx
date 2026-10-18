import { useMemo, useState } from 'react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import Ic from '../../components/Icons.jsx';
import { dayKey, monthKey } from './walletUtils.js';

const C = { deposit: '#3b82f6', payout: '#10b981', withdraw: '#8b5cf6', profit: '#f59e0b', grid: '#eef2f7', axis: '#94a3b8' };
const RANGES = [
  { id: '30d', label: '30D' },
  { id: '6m', label: '6M' },
  { id: '12m', label: '12M' },
];
const done = (m) => m.status === 'approved' || m.status === 'completed';

/** Money-flow chart + where the money came from, from the last 12 months of wallet lines. */
export default function WalletInsights({ insights = [], formatMoney, convert, symbol }) {
  const [range, setRange] = useState('6m');

  const series = useMemo(() => {
    const daily = range === '30d';
    const buckets = new Map();
    const now = new Date();
    if (daily) {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        buckets.set(dayKey(d), { key: dayKey(d), label: d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }), deposit: 0, payout: 0, withdraw: 0, profit: 0 });
      }
    } else {
      const n = range === '6m' ? 6 : 12;
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        buckets.set(monthKey(d), { key: monthKey(d), label: d.toLocaleDateString('en-US', { month: 'short', year: n > 6 ? '2-digit' : undefined }), deposit: 0, payout: 0, withdraw: 0, profit: 0 });
      }
    }
    for (const m of insights) {
      const b = buckets.get(daily ? dayKey(m.t) : monthKey(m.t));
      if (!b) continue;
      if (m.type === 'deposit' && done(m)) b.deposit += m.amount;
      else if (m.type === 'withdrawal' && done(m)) b.withdraw += Math.abs(m.amount);
      else if (m.type === 'order_delivered_release') {
        b.payout += m.amount;
        b.profit += m.profit;
      }
    }
    return [...buckets.values()];
  }, [insights, range]);

  const totals = useMemo(() => series.reduce((a, r) => ({
    deposit: a.deposit + r.deposit, payout: a.payout + r.payout, withdraw: a.withdraw + r.withdraw, profit: a.profit + r.profit,
  }), { deposit: 0, payout: 0, withdraw: 0, profit: 0 }), [series]);

  // where the money came in from, last 12 months
  const sources = useMemo(() => {
    let deposits = 0, principal = 0, profit = 0, credits = 0;
    for (const m of insights) {
      if (m.type === 'deposit' && done(m)) deposits += m.amount;
      else if (m.type === 'order_delivered_release') { principal += Math.max(0, m.amount - m.profit); profit += m.profit; }
      else if ((m.type === 'adjustment' && m.amount > 0) || m.type === 'frozen_release') credits += Math.abs(m.amount);
    }
    return [
      { name: 'Your deposits', value: deposits, color: C.deposit },
      { name: 'Order amounts returned', value: principal, color: '#94a3b8' },
      { name: 'Profit earned', value: profit, color: C.payout },
      { name: 'Admin credits', value: credits, color: C.profit },
    ].filter((s) => s.value > 0.004);
  }, [insights]);
  const sourceTotal = sources.reduce((a, s) => a + s.value, 0);
  const net = totals.deposit + totals.payout - totals.withdraw;

  const compact = (v) => {
    const a = Math.abs(v);
    if (a >= 1e6) return `${symbol}${(v / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${symbol}${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
    return `${symbol}${Math.round(v)}`;
  };
  const chartData = series.map((r) => ({ ...r, depositC: convert(r.deposit), payoutC: convert(r.payout), withdrawC: convert(r.withdraw), profitC: convert(r.profit) }));
  const empty = !series.some((r) => r.deposit || r.payout || r.withdraw);

  return (
    <div className="wl-insights">
      <section className="wl-card wl-flow">
        <div className="wl-card-head">
          <div>
            <h3><Ic name="chart" size={16} /> Money flow</h3>
            <div className="wl-legend">
              <span><i style={{ background: C.deposit }} />Deposits <b>{formatMoney(totals.deposit)}</b></span>
              <span><i style={{ background: C.payout }} />Order payouts <b>{formatMoney(totals.payout)}</b></span>
              <span><i style={{ background: C.withdraw }} />Withdrawn <b>{formatMoney(totals.withdraw)}</b></span>
              <span><i className="line" style={{ background: C.profit }} />Profit <b>{formatMoney(totals.profit)}</b></span>
            </div>
          </div>
          <div className="wl-seg" role="tablist" aria-label="Chart range">
            {RANGES.map((r) => (
              <button key={r.id} type="button" role="tab" aria-selected={range === r.id} className={range === r.id ? 'on' : ''} onClick={() => setRange(r.id)}>{r.label}</button>
            ))}
          </div>
        </div>
        <div className="wl-chart">
          {empty ? (
            <div className="wl-chart-empty"><Ic name="chart" size={20} /><span>No money moved in this period yet.</span></div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap={range === '30d' ? '18%' : '28%'}>
                <CartesianGrid vertical={false} stroke={C.grid} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: C.axis }} interval="preserveStartEnd" minTickGap={14} />
                <YAxis tickLine={false} axisLine={false} width={50} tick={{ fontSize: 11, fill: C.axis }} tickFormatter={(v) => compact(v)} />
                <Tooltip content={<FlowTip formatMoney={formatMoney} />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
                <Bar dataKey="depositC" fill={C.deposit} radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Bar dataKey="payoutC" fill={C.payout} radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Bar dataKey="withdrawC" fill={C.withdraw} radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Line type="monotone" dataKey="profitC" stroke={C.profit} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="wl-flow-foot">
          <span>Net in this period</span>
          <b className={net >= 0 ? 't-green' : 't-red'}>{net >= 0 ? '+' : '−'}{formatMoney(Math.abs(net))}</b>
        </div>
      </section>

      <section className="wl-card wl-sources">
        <div className="wl-card-head">
          <div>
            <h3><Ic name="layers" size={16} /> Money in · 12 months</h3>
            <p className="wl-sub">Where your wallet money came from</p>
          </div>
        </div>
        {sourceTotal <= 0 ? (
          <p className="wl-empty">Nothing came in yet.</p>
        ) : (
          <div className="wl-donut-wrap">
            <div className="wl-donut">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sources} dataKey="value" nameKey="name" innerRadius="70%" outerRadius="100%" paddingAngle={sources.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
                    {sources.map((s) => <Cell key={s.name} fill={s.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="wl-donut-center"><b>{compact(convert(sourceTotal))}</b><span>total in</span></div>
            </div>
            <ul className="wl-donut-legend">
              {sources.map((s) => (
                <li key={s.name}>
                  <i style={{ background: s.color }} />
                  <span>{s.name}</span>
                  <b>{formatMoney(s.value)}</b>
                  <small>{Math.round((s.value / sourceTotal) * 100)}%</small>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function FlowTip({ active, payload, formatMoney }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="wl-tip">
      <b>{r.label}</b>
      <div><i style={{ background: C.deposit }} />Deposits<span>{formatMoney(r.deposit)}</span></div>
      <div><i style={{ background: C.payout }} />Order payouts<span>{formatMoney(r.payout)}</span></div>
      <div><i style={{ background: C.withdraw }} />Withdrawn<span>{formatMoney(r.withdraw)}</span></div>
      <div><i style={{ background: C.profit }} />Profit<span>{formatMoney(r.profit)}</span></div>
    </div>
  );
}
