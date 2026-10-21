import { useEffect, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { api, money } from '../api.js';
import { PAYMENT_LABELS } from '../data.js';
import { ErrorBox } from './ui.jsx';
import {
  Kpi, KpiGrid, Card, ChartGrid, Seg, RankList, SplitBar, ChartTip, Avatar, Meter, Empty,
  SERIES, STATUS, GRID, AXIS, shortMoney, delta,
} from './insights.jsx';

const FULFILLMENT = ['confirmed', 'processing', 'packed', 'out_from_warehouse', 'delivery_warehouse', 'shipped', 'out_for_delivery', 'delivery_failed', 'returned_to_warehouse'];
// one hue, lighter → darker as open orders get older
const AGE_STEPS = ['#fed7aa', '#fb923c', '#ea580c', '#9a3412'];

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
  const busiest = d ? d.hours.reduce((best, h) => (h.orders > best.orders ? h : best), { orders: -1 }) : null;
  const lb = d?.leaderboard || [];
  const lbMax = Math.max(1, ...lb.map((r) => r.gmv));

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

            <Card title="Seller leaderboard" hint="Click a store to filter the orders below" full pad={false} empty={!lb.length && 'No seller orders in this period'}>
              <div className="ins-table-scroll">
                <table className="ins-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Store</th>
                      <th className="num">Orders</th>
                      <th style={{ minWidth: 170 }}>Order value</th>
                      <th className="num">Avg order</th>
                      <th className="num">Delivered</th>
                      <th className="num">Cancelled</th>
                      <th className="num">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lb.slice(0, 10).map((r, i) => (
                      <tr key={r._id || i} onClick={() => r._id && onPickSeller?.(r._id)} style={{ cursor: r._id ? 'pointer' : 'default' }} title={r._id ? 'Show only this store’s orders' : undefined}>
                        <td><span className="ins-rank-n" style={i === 0 ? { background: '#0f172a', color: '#fff' } : undefined}>{i + 1}</span></td>
                        <td>
                          <div className="ins-cell-who">
                            <Avatar name={r.storeName} size={30} />
                            <div>
                              <b className="ins-clip">{r.storeName}</b>
                              <span className="ins-sub">{r.ownerName || (r.isTestAccount ? 'Test account' : '—')}</span>
                            </div>
                          </div>
                        </td>
                        <td className="num">{r.orders}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <b style={{ minWidth: 82, fontVariantNumeric: 'tabular-nums' }}>{money(r.gmv)}</b>
                            <Meter value={r.gmv} max={lbMax} color={SERIES[0]} height={6} label="Share of the top store" />
                          </div>
                        </td>
                        <td className="num">{money(r.aov)}</td>
                        <td className="num" style={{ color: r.deliveryRate >= 60 ? '#006300' : undefined }}>{r.deliveryRate}%</td>
                        <td className="num" style={{ color: r.cancelRate >= 20 ? '#a72929' : undefined, fontWeight: r.cancelRate >= 20 ? 700 : 400 }}>{r.cancelRate}%</td>
                        <td className="num">{r.open}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Open orders by age" hint="Every order not yet delivered or cancelled" empty={!d.openTotal && 'No open orders 🎉'}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={d.aging} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" {...AXIS} />
                  <YAxis {...AXIS} allowDecimals={false} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTip />} />
                  <Bar dataKey="count" name="Open orders" radius={[4, 4, 0, 0]} maxBarSize={38}>
                    {d.aging.map((a, i) => (
                      <Cell key={a.label} fill={AGE_STEPS[i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Busiest hours" hint={busiest && busiest.orders > 0 ? `Peak around ${busiest.label} (your time)` : 'Your local time'} empty={!t.orders && 'No orders'}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={d.hours} margin={{ top: 6, right: 4, left: -24, bottom: 0 }} barCategoryGap={2}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" {...AXIS} interval={5} />
                  <YAxis {...AXIS} allowDecimals={false} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTip />} />
                  <Bar dataKey="orders" name="Orders" fill={SERIES[6]} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Payment methods">
              <RankList
                rows={d.payment.map((p) => ({ key: p.method, label: PAYMENT_LABELS[p.method] || p.method, value: p.orders, sub: `${money(p.gmv)} order value` }))}
                color={SERIES[2]}
                format={(v) => `${v} orders`}
                empty="No orders"
              />
            </Card>

            <Card title="Top products" hint="By order value">
              <RankList
                rows={d.topProducts.map((p, i) => ({ key: `${p.name}-${i}`, label: p.name, value: p.gmv, sub: `${p.qty} sold${p.storeName ? ` · ${p.storeName}` : ''}` }))}
                color={SERIES[1]}
                empty="No products sold"
              />
            </Card>

            <Card title="Top cities" hint="By number of orders">
              {d.topCities.length ? (
                <RankList
                  rows={d.topCities.map((c) => ({ key: c.city, label: `${c.city}${c.state ? `, ${c.state}` : ''}`, value: c.orders, sub: money(c.gmv) }))}
                  color={SERIES[3]}
                  format={(v) => `${v}`}
                />
              ) : (
                <Empty text="No delivery cities yet" />
              )}
            </Card>
          </ChartGrid>
        )}

        {!d && loading && <Empty icon="⏳" text="Loading order analytics…" />}
      </div>
    </section>
  );
}
