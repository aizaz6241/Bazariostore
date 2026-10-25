import { useEffect, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { api, money } from '../api.js';
import { ErrorBox } from './ui.jsx';
import {
  Kpi, KpiGrid, Card, ChartGrid, Seg, SplitBar, ChartTip, Avatar, Meter, Empty,
  SERIES, STATUS, GRID, AXIS, shortMoney, delta,
} from './insights.jsx';

const FULFILLMENT = ['confirmed', 'processing', 'packed', 'out_from_warehouse', 'delivery_warehouse', 'shipped', 'out_for_delivery', 'delivery_failed', 'returned_to_warehouse'];

const COLLAPSE_KEY = 'admin.orders.analytics.collapsed';
const readCollapsed = () => {
  try {
    const saved = localStorage.getItem(COLLAPSE_KEY);
    if (saved !== null) return saved === '1';
  } catch {
    /* storage blocked */
  }
  return typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 768px)').matches;
};

export default function OrdersAnalytics({ sellerId, refreshKey, onPickSeller }) {
  const [days, setDays] = useState(30);
  const [scope, setScope] = useState('all');
  const [metric, setMetric] = useState('gmv');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const qs = new URLSearchParams({ days: String(days), scope, tz: String(new Date().getTimezoneOffset()) });
    if (sellerId) qs.set('sellerId', sellerId);
    api(`/orders/analytics/overview?${qs}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [days, scope, sellerId, refreshKey]);

  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* only this visit remembers it */
      }
      return !c;
    });

  const d = data;
  const t = d?.totals;
  const ws = d?.windowStatus || {};
  const mix = d
    ? [
        { label: '⏳ Waiting', value: ws.pending || 0, color: STATUS.warning },
        { label: '🚚 In fulfilment', value: FULFILLMENT.reduce((acc, k) => acc + (ws[k] || 0), 0), color: SERIES[0] },
        { label: '✓ Delivered', value: ws.delivered || 0, color: STATUS.good },
        { label: '✕ Cancelled / refunded', value: (ws.cancelled || 0) + (ws.refunded || 0), color: STATUS.critical },
      ]
    : [];
  const stuck = d ? d.aging.slice(1).reduce((acc, x) => acc + x.count, 0) : 0;
  const lb = d?.leaderboard || [];

  return (
    <section className="ins-card" style={{ overflow: 'visible' }}>
      <div className="ins-card-head" style={{ paddingBottom: 12 }}>
        <div>
          <h3>📊 Order analytics</h3>
          <span className="ins-card-hint">
            {d ? `${t.orders} orders · ${t.activeSellers} selling stores · last ${d.days} days` : 'Loading…'}
            {sellerId && lb[0] ? ` · ${lb[0].storeName} only` : ''}
          </span>
        </div>
        <div className="ins-card-actions">
          <Seg small label="Stores" value={scope} onChange={setScope} options={[{ value: 'all', label: 'All stores' }, { value: 'client', label: 'Real clients', title: 'Leave out test and previous-store accounts' }]} />
          <Seg small label="Time range" value={days} onChange={setDays} options={[{ value: 7, label: '7d' }, { value: 30, label: '30d' }, { value: 90, label: '90d' }, { value: 365, label: '1y' }]} />
          <button type="button" className="ins-btn ins-btn-sm ins-btn-ghost" onClick={toggle} aria-expanded={!collapsed}>
            {collapsed ? 'Show charts ▾' : 'Hide charts ▴'}
          </button>
        </div>
      </div>

      <div className="ins-card-body" style={{ paddingTop: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ErrorBox error={error} />

        {d && (
          <KpiGrid dim={loading}>
            <Kpi icon="box" tone="blue" label="Orders" value={t.orders.toLocaleString('en-US')} change={delta(t.orders, d.previous.orders)} sub={`${t.items} items · ${t.adminPlaced} placed by admin`} />
            <Kpi icon="banknote" tone="aqua" label="Order value (GMV)" value={money(t.gmv)} change={delta(t.gmv, d.previous.gmv)} sub="Cancelled & refunded left out" />
            <Kpi icon="tag" tone="violet" label="Average order" value={money(t.aov)} sub="GMV ÷ live orders" />
            <Kpi icon="checkCircle" tone="green" label="Delivered" value={`${t.deliveryRate}%`} sub={`${t.delivered} orders · ${money(t.deliveredValue)}`} />
            <Kpi
              icon="x"
              tone="red"
              label="Cancelled / refunded"
              value={`${t.cancelRate}%`}
              change={delta(t.cancelled, d.previous.cancelled, { higherIsGood: false })}
              sub={`${t.cancelled} orders`}
            />
            <Kpi icon="clock" tone="orange" label="Open > 24 h" value={stuck} sub={`${d.openTotal} open orders right now`} />
          </KpiGrid>
        )}

        {d && !collapsed && (
          <ChartGrid dim={loading}>
            <Card
              title={metric === 'gmv' ? 'Order value per day' : 'Orders per day'}
              hint={metric === 'gmv' ? `${money(t.gmv)} in ${d.days} days` : `${t.orders} orders in ${d.days} days`}
              wide
              actions={<Seg small label="Metric" value={metric} onChange={setMetric} options={[{ value: 'gmv', label: 'Value' }, { value: 'orders', label: 'Orders' }]} />}
              empty={!t.orders && 'No orders in this period'}
            >
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={d.trend} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ordTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" {...AXIS} minTickGap={18} />
                  <YAxis {...AXIS} tickFormatter={metric === 'gmv' ? shortMoney : undefined} allowDecimals={false} />
                  <Tooltip
                    cursor={{ stroke: '#cbd5e1', strokeDasharray: '3 3' }}
                    content={<ChartTip fmt={(v, n, p) => (metric === 'gmv' ? `${money(v)} · ${p.payload.orders} orders` : `${v} · ${p.payload.delivered} delivered`)} />}
                  />
                  <Area type="monotone" dataKey={metric} name={metric === 'gmv' ? 'Order value' : 'Orders'} stroke={SERIES[0]} strokeWidth={2} fill="url(#ordTrend)" activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Where orders stand" hint={`Orders placed in the last ${d.days} days`} empty={!t.orders && 'No orders'}>
              <SplitBar height={14} parts={mix} />
            </Card>


          </ChartGrid>
        )}

        {!d && loading && <Empty icon="⏳" text="Loading order analytics…" />}
      </div>
    </section>
  );
}
