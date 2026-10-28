import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bandOf } from '../utils/healthBands.js';
import PerfectBonus from './PerfectBonus.jsx';
import AtStake from './AtStake.jsx';
import LevelCard from './LevelCard.jsx';
import { Link, useOutletContext } from 'react-router-dom';
import {
  ResponsiveContainer, ComposedChart, Area, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell,
} from 'recharts';
import { sapi, fmtDate } from '../api.js';
import Ic from '../components/Icons.jsx';
import SellerAppModal from '../components/SellerAppModal.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';
import { getSocket } from '../socket.js';
import GettingStarted from './onboarding/GettingStarted.jsx';
import VerifiedStoreBadge from '../components/VerifiedStoreBadge.jsx';
import { getLiveStoreVisitors } from '../utils/liveMetrics.js';
import SellerCalendar from './dashboard/SellerCalendar.jsx';
import { useDiamondOffers, OfferCard, RewardProgress, usd } from './DiamondOfferParts.jsx';
import { dayKey, startOfDay, addDays, shortDay, makeCompact, statusMeta, isClosed } from './dashboard/dashUtils.js';

const RANGES = [
  { id: 7, label: '7D' },
  { id: 30, label: '30D' },
  { id: 90, label: '90D' },
];
const C = { sales: '#2563eb', profit: '#10b981', orders: '#f59e0b', grid: '#eef2f7', axis: '#94a3b8' };
const STATUS_SLICES = [
  { key: 'delivered', name: 'Delivered', color: '#10b981' },
  { key: 'inTransit', name: 'In transit', color: '#6366f1' },
  { key: 'preparing', name: 'Preparing', color: '#3b82f6' },
  { key: 'pending', name: 'Awaiting confirmation', color: '#f59e0b' },
  { key: 'cancelled', name: 'Cancelled', color: '#94a3b8' },
  { key: 'refunded', name: 'Refunded', color: '#ef4444' },
];

// bands of the account monitoring (utils/healthBands.js, same as the server)
function healthOf(score) {
  const b = bandOf(score);
  return { tier: b.tier, label: b.label, desc: b.desc };
}

const pctChange = (now, before) => {
  if (!before) return now > 0 ? null : 0;
  return Math.round(((now - before) / before) * 100);
};

export default function SellerDashboard() {
  // Diamond offers: the running offer, progress to the reward, the price locked on a request
  const [dOffers, reloadOffers] = useDiamondOffers(true);
  // account health overview (perfect-health bonus progress in the health card)
  const [healthInfo, setHealthInfo] = useState(null);
  useEffect(() => {
    const loadHealth = () => sapi('/sellers/health').then(setHealthInfo).catch(() => {});
    loadHealth();
    const sock = getSocket();
    sock?.on('seller:health_update', loadHealth);
    sock?.on('wallet:update', loadHealth);
    return () => {
      sock?.off('seller:health_update', loadHealth);
      sock?.off('wallet:update', loadHealth);
    };
  }, []);
  const { formatMoney, convert, currentCurrency } = useCurrency();
  const compact = useMemo(() => makeCompact(convert, currentCurrency.symbol), [convert, currentCurrency.symbol]);
  const { seller: me } = useOutletContext() || {};
  const [data, setData] = useState(null);
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [range, setRange] = useState(30);
  const [appModalOpen, setAppModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [liveShoppers, setLiveShoppers] = useState(() => getLiveStoreVisitors());
  const timer = useRef(null);

  const loadData = useCallback(() => {
    sapi('/sellers/dashboard')
      .then((res) => { setData(res); setErr(''); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  // last 90 days of activity (two 30-day windows for the comparisons + the 90D chart)
  const loadActivity = useCallback(() => {
    const today = startOfDay(new Date());
    const from = addDays(today, -89);
    const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 0, 0, 0, -1);
    sapi(`/sellers/dashboard/activity?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)
      .then(setActivity)
      .catch(() => setActivity((a) => a || { orders: [], money: [] }));
  }, []);

  useEffect(() => {
    loadData();
    loadActivity();
    const socket = getSocket();
    // several events often arrive together (order + wallet): one refresh for the burst
    const onSync = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        loadData();
        loadActivity();
        setRefreshKey((k) => k + 1);
      }, 700);
    };
    const events = ['order:new', 'order:update', 'wallet:update', 'seller:health_update', 'seller:status_update', 'seller:targets_update'];
    events.forEach((e) => socket.on(e, onSync));
    return () => {
      clearTimeout(timer.current);
      events.forEach((e) => socket.off(e, onSync));
    };
  }, [loadData, loadActivity]);

  const sellerId = data?.seller?._id;
  const productCount = data?.stats?.totalProducts || 10;
  useEffect(() => {
    const id = setInterval(() => setLiveShoppers(getLiveStoreVisitors(sellerId, productCount)), 4500);
    return () => clearInterval(id);
  }, [sellerId, productCount]);

  // ── activity grouped into the seller's own days ──
  const daily = useMemo(() => {
    const today = startOfDay(new Date());
    const map = new Map();
    for (let i = 89; i >= 0; i--) {
      const k = dayKey(addDays(today, -i));
      map.set(k, { key: k, label: shortDay(k), sales: 0, profit: 0, orders: 0 });
    }
    for (const o of activity?.orders || []) {
      const row = map.get(dayKey(o.t));
      if (!row || isClosed(o.status)) continue;
      row.sales += o.total;
      row.profit += o.profit;
      row.orders += 1;
    }
    return [...map.values()];
  }, [activity]);

  const chartData = useMemo(
    () => daily.slice(-range).map((r) => ({ ...r, salesC: convert(r.sales), profitC: convert(r.profit) })),
    [daily, range, convert]
  );

  const windows = useMemo(() => {
    const sum = (rows, f) => rows.reduce((a, r) => a + r[f], 0);
    const cur = daily.slice(-30);
    const prev = daily.slice(-60, -30);
    return {
      sales: sum(cur, 'sales'), salesPrev: sum(prev, 'sales'),
      profit: sum(cur, 'profit'), profitPrev: sum(prev, 'profit'),
      orders: sum(cur, 'orders'), ordersPrev: sum(prev, 'orders'),
      spark: daily.slice(-14),
    };
  }, [daily]);

  const rangeTotals = useMemo(() => ({
    sales: chartData.reduce((a, r) => a + r.sales, 0),
    profit: chartData.reduce((a, r) => a + r.profit, 0),
    orders: chartData.reduce((a, r) => a + r.orders, 0),
  }), [chartData]);

  if (loading && !data) {
    return (
      <div className="sd">
        <div className="sd-skel-head" />
        <div className="sd-kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="sd-card sd-skel" />)}</div>
        <div className="sd-row-main"><div className="sd-card sd-skel tall" /><div className="sd-card sd-skel tall" /></div>
      </div>
    );
  }
  if (err && !data) {
    return (
      <div className="sd">
        <div className="sd-card sd-error-card">
          <Ic name="alert" size={22} />
          <div><b>Dashboard could not load</b><p>{err}</p></div>
          <button type="button" className="sd-btn sd-btn-dark" onClick={() => { setLoading(true); loadData(); loadActivity(); }}>Retry</button>
        </div>
      </div>
    );
  }

  const { stats = {}, topProducts = [], recentOrders = [], lowStockProducts = [], statusCounts = {} } = data || {};
  const seller = data?.seller || {};
  const isDiamond = (me?.tier || seller.tier) === 'diamond';
  const profitPct = isDiamond ? 35 : 20;
  const isVerified = Boolean(seller.verified || seller.status === 'active');
  const wallet = seller.wallet || {};
  const balance = stats.availableBalance ?? wallet.balance ?? 0;
  const processing = stats.processingFund ?? wallet.processingFund ?? 0;
  const frozen = stats.frozenFund ?? wallet.frozenFund ?? 0;
  const pendingPayout = stats.pendingWithdrawal ?? wallet.pendingWithdrawal ?? 0;
  const security = stats.securityDeposit || seller.securityDeposit?.amount || 0;
  const health = seller.accountHealth || {};
  const score = Number.isFinite(health.score) ? health.score : 100;
  const h = healthOf(score);
  const targets = Array.isArray(seller.targets) ? seller.targets : [];
  // running targets first (closest to the goal on top), then the ones reached in the last 14 days
  // and ended in the last 3 days; cancelled and old ones are not shown
  const nowMs = Date.now();
  const tState = (t) => {
    if (t.status === 'completed' || t.status === 'claimed') return 'done';
    if (t.status === 'cancelled') return 'cancelled';
    if (t.status === 'expired' || (t.expiresAt && new Date(t.expiresAt).getTime() < nowMs)) return 'expired';
    return 'active';
  };
  const tProgress = (t) => {
    const sales = t.metric === 'sales';
    const cur = sales ? Number(t.currentAmount) || 0 : Number(t.currentOrders ?? t.currentOrderCount) || 0;
    const goal = sales ? Number(t.targetAmount) || 0 : Number(t.targetOrders || t.targetOrderCount) || 0;
    return { sales, cur, goal, pct: goal > 0 ? Math.min(100, Math.floor((cur / goal) * 100)) : 0, left: Math.max(0, goal - cur) };
  };
  const activeTargets = targets
    .filter((t) => {
      const st = tState(t);
      if (st === 'active') return true;
      if (st === 'done') return nowMs - new Date(t.completedAt || t.createdAt).getTime() < 14 * 86400000;
      if (st === 'expired') return nowMs - new Date(t.expiresAt || t.createdAt).getTime() < 3 * 86400000;
      return false;
    })
    .sort((a, b) => {
      const order = { active: 0, done: 1, expired: 2 };
      return order[tState(a)] - order[tState(b)] || tProgress(b).pct - tProgress(a).pct;
    });
  const awaiting = stats.awaitingConfirmation || 0;
  const tierStatus = me?.tierRequest?.status;
  const diamondPending = ['pending', 'awaiting_approval'].includes(tierStatus);
  const showDiamond = !isDiamond && (me?.status || seller.status) !== 'pending_approval';
  const diamondExtra = (windows.sales * (35 - 20)) / 100;
  const firstName = (seller.ownerName || '').split(' ')[0];
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const statusData = STATUS_SLICES.map((s) => ({ ...s, value: statusCounts[s.key] || 0 })).filter((s) => s.value > 0);
  const statusTotal = statusData.reduce((a, s) => a + s.value, 0);
  const walletParts = [
    { key: 'Available', v: balance, c: '#10b981' },
    { key: 'Processing', v: processing, c: '#3b82f6' },
    { key: 'Pending payout', v: pendingPayout, c: '#8b5cf6' },
    { key: 'Frozen', v: frozen, c: '#94a3b8' },
  ];
  const walletTotal = walletParts.reduce((a, p) => a + Math.max(0, p.v), 0);
  const topMax = Math.max(1, ...topProducts.map((p) => p.revenue || 0));

  const kpis = [
    { label: 'Available balance', value: formatMoney(balance), icon: 'wallet', tone: 'green', sub: <Link to="/seller/wallet?tab=withdraw">Request payout →</Link> },
    { label: 'Sales · last 30 days', value: formatMoney(windows.sales), icon: 'trend', tone: 'blue', change: pctChange(windows.sales, windows.salesPrev), spark: 'sales', color: C.sales },
    { label: `Expected profit · 30 days`, value: formatMoney(windows.profit), icon: 'sparkle', tone: 'emerald', change: pctChange(windows.profit, windows.profitPrev), spark: 'profit', color: C.profit },
    { label: 'Orders · last 30 days', value: windows.orders.toLocaleString(), icon: 'package', tone: 'amber', change: pctChange(windows.orders, windows.ordersPrev), spark: 'orders', color: C.orders, sub: <span>{stats.pendingOrders || 0} to fulfil</span> },
  ];

  return (
    <div className="sd">
      {/* ── Header ── */}
      <header className="sd-head">
        <div className="sd-head-text">
          <p className="sd-eyebrow">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <h1>{greet}{firstName ? `, ${firstName}` : ''}</h1>
          <div className="sd-head-meta">
            <span className="sd-store">{seller.storeName}</span>
            {isVerified && <VerifiedStoreBadge variant="pill" size={13} text="Verified" />}
            <Link to="/seller/diamond" className={`sd-plan ${isDiamond ? 'diamond' : ''}`}>{isDiamond ? '💎 Diamond' : 'Basic plan'}</Link>
            <span className="sd-live" title="Shoppers browsing your catalog right now"><i />{liveShoppers} browsing now</span>
          </div>
        </div>
        <div className="sd-head-actions">
          <Link to="/seller/products" className="sd-btn sd-btn-primary"><Ic name="plus" size={15} /> Add product</Link>
          <Link to="/seller/wallet?tab=deposit" className="sd-btn sd-btn-ghost"><Ic name="banknote" size={15} /> Deposit</Link>
          <Link to="/seller/support" className="sd-btn sd-btn-ghost"><Ic name="headset" size={15} /> Support</Link>
        </div>
      </header>

      {/* ── What is at stake right now (waiting orders, deadlines, shortfall) ── */}
      <AtStake where="dashboard" />

      {/* ── First steps for new stores (hides itself when done) ── */}
      <GettingStarted />

      {/* ── Diamond upgrade (Basic stores): a running offer, else the plan strip with the reward progress ── */}
      {showDiamond && !diamondPending && dOffers?.offer ? (
        <OfferCard offer={dOffers.offer} variant="dash" onEnd={reloadOffers} />
      ) : showDiamond && (
        <section className={`sd-dia ${diamondPending ? 'is-pending' : ''} ${!diamondPending && dOffers?.progress?.enabled ? 'has-reward' : ''}`} aria-label="Diamond plan">
          <div className="sd-dia-gem" aria-hidden="true">💎</div>
          <div className="sd-dia-body">
            <p className="sd-dia-kicker">{diamondPending ? 'Upgrade in progress' : 'Diamond plan'}</p>
            <h2>{diamondPending ? 'Your Diamond upgrade request is with our team' : 'Earn 35% on every order — not 20%'}</h2>
            {diamondPending ? (
              <>
                <p className="sd-dia-text">Our support team will contact you in chat with the next step. Your new rate starts on the orders placed after the upgrade.</p>
                {dOffers?.locked && (
                  <span className="sd-dia-lock">
                    <Ic name="lock" size={14} /> Your price is locked: {usd(dOffers.locked.price)} <s style={{ opacity: 0.6 }}>{usd(dOffers.locked.regular)}</s>
                  </span>
                )}
              </>
            ) : (
              <ul className="sd-dia-perks">
                <li><Ic name="check" size={13} /> 35% profit per order</li>
                <li><Ic name="check" size={13} /> 72 hours to confirm</li>
                <li><Ic name="check" size={13} /> Fast 3–5 day delivery</li>
                <li><Ic name="check" size={13} /> Remove products anytime</li>
              </ul>
            )}
          </div>
          <div className="sd-dia-side">
            {!diamondPending && (dOffers?.numbers?.extra > 0 ? (
              <div className="sd-dia-stat">
                <span>Extra on your last 30 days</span>
                <b>+{usd(dOffers.numbers.extra)}</b>
              </div>
            ) : windows.sales > 0 ? (
              <div className="sd-dia-stat">
                <span>Extra on your last 30 days</span>
                <b>+{formatMoney(diamondExtra)}</b>
              </div>
            ) : null)}
            {diamondPending ? (
              <Link to="/seller/support" className="sd-dia-btn ghost">Open support chat</Link>
            ) : (
              <Link to="/seller/diamond" className="sd-dia-btn">Upgrade to Diamond <Ic name="arrowRight" size={15} /></Link>
            )}
          </div>
          {!diamondPending && dOffers?.progress?.enabled && (
            <div className="sd-dia-reward">
              <RewardProgress progress={dOffers.progress} regular={dOffers.regular} compact />
            </div>
          )}
        </section>
      )}

      {/* ── Things that need attention ── */}
      {(awaiting > 0 || lowStockProducts.length > 0) && (
        <div className="sd-alerts">
          {awaiting > 0 && (
            <Link to="/seller/orders" className="sd-alert tone-amber">
              <Ic name="clock" size={16} />
              <span><b>{awaiting} order{awaiting === 1 ? '' : 's'}</b> waiting for your confirmation</span>
              <em>Confirm →</em>
            </Link>
          )}
          {lowStockProducts.length > 0 && (
            <Link to="/seller/products" className="sd-alert tone-red">
              <Ic name="alert" size={16} />
              <span><b>{stats.lowStockCount || lowStockProducts.length} product{(stats.lowStockCount || lowStockProducts.length) === 1 ? '' : 's'}</b> running low on stock</span>
              <em>Restock →</em>
            </Link>
          )}
        </div>
      )}

      {/* ── KPIs ── */}
      <div className="sd-kpis">
        {kpis.map((k) => (
          <div key={k.label} className="sd-card sd-kpi">
            <div className="sd-kpi-top">
              <span className="sd-kpi-label">{k.label}</span>
              <span className={`sd-kpi-icon tone-${k.tone}`}><Ic name={k.icon} size={16} /></span>
            </div>
            <div className="sd-kpi-value">{k.value}</div>
            <div className="sd-kpi-foot">
              {k.change !== undefined && (
                k.change === null
                  ? <span className="sd-delta up">New</span>
                  : <span className={`sd-delta ${k.change > 0 ? 'up' : k.change < 0 ? 'down' : ''}`}>{k.change > 0 ? '▲' : k.change < 0 ? '▼' : '•'} {Math.abs(k.change)}%</span>
              )}
              {k.change !== undefined && <span className="sd-kpi-vs">vs prev. 30d</span>}
              {k.sub && <span className="sd-kpi-sub">{k.sub}</span>}
            </div>
            {k.spark && (
              <div className="sd-spark" aria-hidden="true">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={windows.spark} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                    {k.spark === 'orders'
                      ? <Bar dataKey="orders" fill={k.color} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                      : <Area type="monotone" dataKey={k.spark} stroke={k.color} strokeWidth={1.75} fill={k.color} fillOpacity={0.12} isAnimationActive={false} />}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Performance chart + account health ── */}
      <div className="sd-row-main">
        <section className="sd-card sd-chart-card">
          <div className="sd-card-head">
            <div>
              <h3 className="sd-card-title"><Ic name="chart" size={16} /> Sales performance</h3>
              <div className="sd-legend-inline">
                <span><i style={{ background: C.sales }} /> Sales <b>{formatMoney(rangeTotals.sales)}</b></span>
                <span><i style={{ background: C.profit }} /> Profit <b>{formatMoney(rangeTotals.profit)}</b></span>
                <span><i style={{ background: C.orders }} /> Orders <b>{rangeTotals.orders}</b></span>
              </div>
            </div>
            <div className="sd-seg" role="tablist" aria-label="Chart range">
              {RANGES.map((r) => (
                <button key={r.id} type="button" role="tab" aria-selected={range === r.id} className={range === r.id ? 'on' : ''} onClick={() => setRange(r.id)}>{r.label}</button>
              ))}
            </div>
          </div>
          <div className="sd-chart">
            {!activity ? <div className="sd-skel fill" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="sdSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.sales} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={C.sales} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={C.grid} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: C.axis }} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis yAxisId="m" tickLine={false} axisLine={false} width={52} tick={{ fontSize: 11, fill: C.axis }} tickFormatter={(v) => compact(v / (convert(1) || 1))} />
                  <YAxis yAxisId="o" orientation="right" hide allowDecimals={false} domain={[0, (max) => Math.max(4, max * 3)]} />
                  <Tooltip content={<ChartTip formatMoney={formatMoney} />} cursor={{ stroke: '#cbd5e1', strokeDasharray: '3 3' }} />
                  <Bar yAxisId="o" dataKey="orders" fill={C.orders} fillOpacity={0.55} radius={[3, 3, 0, 0]} maxBarSize={14} />
                  <Area yAxisId="m" type="monotone" dataKey="salesC" stroke={C.sales} strokeWidth={2.25} fill="url(#sdSales)" activeDot={{ r: 4, strokeWidth: 0 }} />
                  <Area yAxisId="m" type="monotone" dataKey="profitC" stroke={C.profit} strokeWidth={2} fill="none" activeDot={{ r: 4, strokeWidth: 0 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className={`sd-card sd-health tier-${h.tier}`}>
          <div className="sd-card-head">
            <div>
              <h3 className="sd-card-title"><Ic name="shield" size={16} /> Account health</h3>
              <p className="sd-card-sub">Bazario Account Monitoring</p>
            </div>
            <span className={`sd-tag tone-${h.tier === 'healthy' ? 'green' : h.tier === 'warning' ? 'amber' : 'red'}`}>{h.label}</span>
          </div>
          <Gauge score={score} tier={h.tier} />
          <p className="sd-health-desc">{h.desc}</p>
          <dl className="sd-health-stats">
            <div><dt>Policy notices</dt><dd>{health.policyViolations || 0}</dd></div>
            <div><dt>Defect rate</dt><dd>{((health.orderDefectRate || 0) * 100).toFixed(1)}%</dd></div>
            <div><dt>Rating</dt><dd>{seller.rating ? `★ ${Number(seller.rating).toFixed(1)}` : '—'}</dd></div>
            <div><dt>Refunds</dt><dd>{stats.refundCount || 0}</dd></div>
          </dl>
          {Array.isArray(health.history) && health.history.length > 0 && (
            <ul className="sd-health-log">
              {health.history.slice(0, 2).map((x, i) => (
                <li key={i}>
                  <span className={`sd-delta ${x.delta >= 0 ? 'up' : 'down'}`}>{x.delta >= 0 ? `+${x.delta}` : x.delta}</span>
                  <span className="sd-health-reason" title={x.reason}>{x.reason || 'Routine evaluation'}</span>
                  <small>{fmtDate(x.createdAt)}</small>
                </li>
              ))}
            </ul>
          )}
          <PerfectBonus compact bonus={healthInfo?.perfectBonus} score={score} />
          <LevelCard mini level={healthInfo?.level} standing={healthInfo?.standing} score={score} />
          <p className="sd-health-foot">
            <Link to="/seller/health" className="sd-health-more">See every entry and how your score comes back →</Link>
            <br />
            {health.lastEvaluatedAt ? `Evaluated ${fmtDate(health.lastEvaluatedAt)}` : '90+ excellent · 75+ good · 60+ warning · 40+ at risk · below 40 critical'}
          </p>
        </section>
      </div>

      {/* ── Calendar + wallet & order mix ── */}
      <div className="sd-row-main">
        <SellerCalendar refreshKey={refreshKey} storeSince={seller.createdAt} />

        <div className="sd-stack">
          <section className="sd-card">
            <div className="sd-card-head">
              <div>
                <h3 className="sd-card-title"><Ic name="wallet" size={16} /> Wallet</h3>
                <p className="sd-card-sub">Where your money is right now</p>
              </div>
              <Link to="/seller/wallet" className="sd-link">Open →</Link>
            </div>
            <div className="sd-wallet-total">
              <span>Available to withdraw</span>
              <b>{formatMoney(balance)}</b>
            </div>
            <div className="sd-stackbar" role="img" aria-label="Wallet breakdown">
              {walletTotal > 0
                ? walletParts.filter((p) => p.v > 0).map((p) => <span key={p.key} style={{ flexGrow: p.v, background: p.c }} title={`${p.key}: ${formatMoney(p.v)}`} />)
                : <span style={{ flexGrow: 1, background: '#e2e8f0' }} />}
            </div>
            <ul className="sd-wallet-list">
              {walletParts.map((p) => (
                <li key={p.key}><i style={{ background: p.c }} /><span>{p.key}</span><b>{formatMoney(p.v)}</b></li>
              ))}
              <li className="sep"><i className="ring" /><span>Security deposit</span><b>{formatMoney(security)}</b></li>
              <li><i style={{ background: '#10b981' }} /><span>Profit earned ({profitPct}%) · lifetime</span><b className="t-green">+{formatMoney(stats.totalProfitEarned || 0)}</b></li>
            </ul>
            <div className="sd-wallet-actions">
              <Link to="/seller/wallet?tab=deposit" className="sd-btn sd-btn-ghost sm">Add deposit</Link>
              <Link to="/seller/wallet?tab=withdraw" className="sd-btn sd-btn-dark sm">Request payout</Link>
            </div>
          </section>

          <section className="sd-card">
            <div className="sd-card-head">
              <div>
                <h3 className="sd-card-title"><Ic name="layers" size={16} /> Order status</h3>
                <p className="sd-card-sub">All {stats.totalOrders || 0} orders</p>
              </div>
            </div>
            {statusTotal === 0 ? <p className="sd-empty">No orders yet.</p> : (
              <div className="sd-donut-wrap">
                <div className="sd-donut">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusData} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="100%" paddingAngle={statusData.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
                        {statusData.map((s) => <Cell key={s.key} fill={s.color} />)}
                      </Pie>
                      <Tooltip formatter={(v, n) => [`${v} orders`, n]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="sd-donut-center"><b>{statusTotal}</b><span>orders</span></div>
                </div>
                <ul className="sd-donut-legend">
                  {statusData.map((s) => (
                    <li key={s.key}><i style={{ background: s.color }} /><span>{s.name}</span><b>{s.value}</b><small>{Math.round((s.value / statusTotal) * 100)}%</small></li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ── Targets ── */}
      {activeTargets.length > 0 && (
        <section className="sd-card">
          <div className="sd-card-head">
            <div>
              <h3 className="sd-card-title"><Ic name="gift" size={16} /> Targets &amp; bonuses</h3>
              <p className="sd-card-sub">Reach the goal with delivered orders — the cash bonus lands in your wallet automatically</p>
            </div>
          </div>
          <div className="sd-targets">
            {activeTargets.map((t) => {
              const st = tState(t);
              const done = st === 'done';
              const expired = st === 'expired';
              const p = tProgress(t);
              const leftDays = t.expiresAt ? Math.ceil((new Date(t.expiresAt).getTime() - nowMs) / 86400000) : null;
              const leftLabel = p.sales ? `${formatMoney(p.left)} more in delivered orders` : `${p.left} more order${p.left === 1 ? '' : 's'} to deliver`;
              return (
                <div key={t._id || t.title} className={`sd-target ${done ? 'done' : expired ? 'expired' : ''}`}>
                  <div className="sd-target-top">
                    <b>{t.title}</b>
                    <span className={`sd-tag tone-${done ? 'green' : expired ? 'slate' : 'amber'}`}>{done ? 'Completed' : expired ? 'Ended' : `${p.pct}%`}</span>
                  </div>
                  {(t.description || t.adminNote) && <p>{t.description || t.adminNote}</p>}
                  <div className="sd-progress"><span style={{ width: `${p.pct}%` }} /></div>
                  <div className="sd-target-foot">
                    <span>{p.sales ? <><b>{formatMoney(p.cur)}</b> / {formatMoney(p.goal)}</> : <><b>{p.cur}</b> / {p.goal}</>} delivered</span>
                    <b className="t-green">+{formatMoney(t.bonusAmount || 0)}</b>
                  </div>
                  {!done && !expired && (
                    <small className="t-amber">
                      {leftLabel}
                      {leftDays !== null ? ` · ${leftDays <= 1 ? 'last day' : `${leftDays} days left`}` : ''}
                    </small>
                  )}
                  {expired && <small className="t-muted">Ended {new Date(t.expiresAt).toLocaleDateString()} — not reached this time</small>}
                  {done && <small className="t-green">{t.paidTo === 'frozen' ? 'Bonus earned — held until your account is active again' : 'Bonus credited to your wallet'}</small>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Recent orders + top products ── */}
      <div className="sd-row-main">
        <section className="sd-card sd-orders">
          <div className="sd-card-head">
            <div>
              <h3 className="sd-card-title"><Ic name="package" size={16} /> Recent orders</h3>
              <p className="sd-card-sub">Latest orders for your store</p>
            </div>
            <Link to="/seller/orders" className="sd-link">View all ({stats.totalOrders || 0}) →</Link>
          </div>
          {recentOrders.length === 0 ? <p className="sd-empty">No orders placed yet.</p> : (
            <div className="sd-table-wrap">
              <table className="sd-table">
                <thead>
                  <tr><th>Order</th><th>Items</th><th>Customer</th><th className="r">Amount</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {recentOrders.map((ord) => {
                    const items = (ord.items || []).filter((it) => String(it.seller) === String(sellerId));
                    const total = items.reduce((a, b) => a + (b.price || 0) * (b.qty || 1), 0);
                    const st = statusMeta(items[0]?.itemStatus || ord.status);
                    return (
                      <tr key={ord._id}>
                        <td><Link to="/seller/orders" className="sd-order-no">#{ord.orderNumber}</Link><small>{fmtDate(ord.createdAt)}</small></td>
                        <td className="sd-td-items">{items.map((it, i) => <span key={i}><em>{it.qty || 1}×</em> {it.name}</span>)}</td>
                        <td>{ord.shippingAddress?.fullName || 'Customer'}<small>{ord.shippingAddress?.city || ''}</small></td>
                        <td className="r"><b>{formatMoney(total)}</b></td>
                        <td><span className={`sd-tag tone-${st.tone}`}>{st.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="sd-card">
          <div className="sd-card-head">
            <div>
              <h3 className="sd-card-title"><Ic name="star" size={16} /> Top products</h3>
              <p className="sd-card-sub">By revenue, all time</p>
            </div>
            <Link to="/seller/products" className="sd-link">Catalog →</Link>
          </div>
          {topProducts.length === 0 ? <p className="sd-empty">No sales yet. Publish products to start tracking.</p> : (
            <ul className="sd-top">
              {topProducts.map((p, i) => (
                <li key={p.id || i}>
                  <span className="sd-rank">{i + 1}</span>
                  <img src={p.image || '/img/products/serum.svg'} alt="" loading="lazy" />
                  <div className="sd-top-info">
                    <div className="sd-top-row"><b title={p.name}>{p.name}</b><span>{formatMoney(p.revenue)}</span></div>
                    <div className="sd-progress thin"><span style={{ width: `${Math.max(4, (p.revenue / topMax) * 100)}%` }} /></div>
                    <small>{p.qty} units sold</small>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <dl className="sd-mini-stats">
            <div><dt>Gross sales</dt><dd>{formatMoney(stats.grossRevenue || 0)}</dd></div>
            <div><dt>Units sold</dt><dd>{(stats.totalItemsSold || 0).toLocaleString()}</dd></div>
            <div><dt>Products</dt><dd>{stats.totalProducts || 0}</dd></div>
          </dl>
        </section>
      </div>

      {/* ── Mobile app ── */}
      <section className="sd-card sd-app">
        <span className="sd-app-icon"><Ic name="phone" size={20} /></span>
        <div>
          <b>Bazario Merchant app</b>
          <p>Sound alerts on every new order, faster fulfilment and admin chat on the go.</p>
        </div>
        <div className="sd-app-actions">
          <button type="button" className="sd-btn sd-btn-dark sm" onClick={() => setAppModalOpen(true)}><Ic name="download" size={14} /> Install app</button>
          <a href="/downloads/bazario-seller.apk" download="bazario-seller.apk" className="sd-btn sd-btn-ghost sm">Download APK</a>
        </div>
      </section>

      <SellerAppModal isOpen={appModalOpen} onClose={() => setAppModalOpen(false)} />
    </div>
  );
}

function ChartTip({ active, payload, formatMoney }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="sd-tip">
      <b>{r.label}</b>
      <div><i style={{ background: C.sales }} />Sales<span>{formatMoney(r.sales)}</span></div>
      <div><i style={{ background: C.profit }} />Profit<span>{formatMoney(r.profit)}</span></div>
      <div><i style={{ background: C.orders }} />Orders<span>{r.orders}</span></div>
    </div>
  );
}

// semicircle score gauge, 0–100
function Gauge({ score, tier }) {
  const s = Math.max(0, Math.min(100, score));
  const R = 70;
  const len = Math.PI * R;
  return (
    <div className="sd-gauge">
      <svg viewBox="0 0 180 100" role="img" aria-label={`Health score ${s} out of 100`}>
        <path d="M20 90 A70 70 0 0 1 160 90" fill="none" stroke="#eef2f7" strokeWidth="14" strokeLinecap="round" />
        <path d="M20 90 A70 70 0 0 1 160 90" fill="none" className={`sd-gauge-arc tier-${tier}`} strokeWidth="14" strokeLinecap="round" strokeDasharray={`${(s / 100) * len} ${len}`} />
      </svg>
      <div className="sd-gauge-val"><b>{s}</b><span>/100</span></div>
    </div>
  );
}
