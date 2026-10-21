import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useOutletContext } from 'react-router-dom';
import { sapi, fmtDate } from '../api.js';
import Ic from '../components/Icons.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';
import { getSocket } from '../socket.js';

const IN_TRANSIT = ['out_from_warehouse', 'delivery_warehouse', 'shipped', 'out_for_delivery', 'delivery_failed', 'returned_to_warehouse'];
const LOCKED = ['confirmed', 'processing', 'packed', ...IN_TRANSIT];

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'To confirm' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'In transit' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
];

const STEPS = [
  { key: 'pending', label: 'Placed' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'processing', label: 'Packing' },
  { key: 'shipped', label: 'In transit' },
  { key: 'delivered', label: 'Delivered' },
];

const STATUS = {
  pending: { label: 'To confirm', tone: 'amber', text: 'Waiting for you to confirm. Confirming locks the order amount from your wallet and sends it to Operations.' },
  confirmed: { label: 'Confirmed', tone: 'blue', text: 'You confirmed this order. Operations has it and is preparing it at the warehouse.' },
  processing: { label: 'Processing', tone: 'blue', text: 'Operations is packing your items and preparing the courier label.' },
  packed: { label: 'Packed', tone: 'blue', text: 'Packed and ready to leave the warehouse.' },
  out_from_warehouse: { label: 'Left warehouse', tone: 'indigo', text: 'Dispatched from the main warehouse and handed over to the courier.' },
  delivery_warehouse: { label: 'At delivery hub', tone: 'indigo', text: 'Reached the local delivery hub for last-mile sorting.' },
  shipped: { label: 'Shipped', tone: 'indigo', text: 'On its way to the customer.' },
  out_for_delivery: { label: 'Out for delivery', tone: 'indigo', text: 'With the courier rider for doorstep delivery.' },
  delivery_failed: { label: 'No response from customer', tone: 'amber', text: 'The courier could not reach the customer. Operations will try to deliver again. Your locked amount stays locked until the order is delivered or cancelled.' },
  returned_to_warehouse: { label: 'Returned to warehouse', tone: 'amber', text: 'Back at the warehouse after a failed delivery. Operations will send it out again. Your locked amount stays locked until the order is delivered or cancelled.' },
  delivered: { label: 'Delivered', tone: 'green', text: 'Delivered. Your locked amount plus profit has been paid into your wallet.' },
  cancelled: { label: 'Cancelled', tone: 'slate', text: 'Cancelled. Any locked amount went back to your available balance.' },
  refunded: { label: 'Refunded', tone: 'red', text: 'Refunded to the customer.' },
};
const statusOf = (s) => STATUS[s] || { label: String(s || '').replace(/_/g, ' '), tone: 'slate', text: '' };

function stepIndex(s) {
  if (s === 'pending') return 0;
  if (s === 'confirmed') return 1;
  if (s === 'processing' || s === 'packed') return 2;
  if (IN_TRANSIT.includes(s)) return 3;
  if (s === 'delivered') return 4;
  return -1;
}
const tabOf = (s) => (s === 'packed' ? 'processing' : IN_TRANSIT.includes(s) ? 'shipped' : s === 'refunded' ? 'cancelled' : s);

// what the store sees for one order (its own items only)
function view(ord) {
  const items = ord.sellerItems || [];
  const status = items[0]?.itemStatus || ord.status || 'pending';
  const total = Number(ord.sellerTotal) || 0;
  const rate = Number(ord.profitRate) || 20;
  const profit = Number(ord.sellerProfit) || Number(((total * rate) / 100).toFixed(2));
  const payout = Number(ord.sellerReturn) || Number((total + profit).toFixed(2));
  const units = items.reduce((a, it) => a + (Number(it.qty) || 1), 0);
  return { items, status, total, rate, profit, payout, units, tracking: items.find((it) => it.trackingNumber)?.trackingNumber };
}

function timeLeft(deadline, now) {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - now;
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  return { ms, text: h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${String(m).padStart(2, '0')}m` };
}
const ago = (d, now) => {
  const mins = Math.max(0, Math.round((now - new Date(d).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
};

export default function SellerOrders() {
  const { formatMoney } = useCurrency();
  const { isFrozen: restricted, seller } = useOutletContext() || {};
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [toast, setToast] = useState(null); // { ok, text }
  const [now, setNow] = useState(() => Date.now());
  const confirmingRef = useRef(new Set());
  const reloadTimer = useRef(null);

  const loadOrders = useCallback(() => {
    sapi('/sellers/orders')
      .then((data) => {
        setOrders(Array.isArray(data) ? data : []);
        setLoadErr('');
      })
      .catch((e) => setLoadErr(e.message || 'Could not load your orders'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadOrders();
    const socket = getSocket();
    // order + wallet events arrive in bursts: one reload for the burst
    const onChange = () => {
      clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(loadOrders, 600);
    };
    const events = ['order:new', 'order:update', 'seller:status_update'];
    events.forEach((e) => socket.on(e, onChange));
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      events.forEach((e) => socket.off(e, onChange));
      clearTimeout(reloadTimer.current);
      clearInterval(tick);
    };
  }, [loadOrders]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const confirmOrder = async (ord) => {
    if (confirmingRef.current.has(ord._id)) return;
    confirmingRef.current.add(ord._id);
    setConfirmingId(ord._id);
    try {
      const res = await sapi(`/sellers/orders/${ord._id}/confirm`, { method: 'POST' });
      const locked = Number(res?.lockedAmount ?? ord.sellerTotal ?? 0);
      setToast({ ok: true, text: res?.alreadyConfirmed ? `Order #${ord.orderNumber} was already confirmed.` : `Order #${ord.orderNumber} confirmed — ${formatMoney(locked)} locked for processing.` });
      loadOrders();
    } catch (err) {
      setToast({ ok: false, text: `Could not confirm #${ord.orderNumber}: ${err.message}` });
    } finally {
      confirmingRef.current.delete(ord._id);
      setConfirmingId(null);
    }
  };

  const rows = useMemo(() => orders.map((o) => ({ ord: o, v: view(o) })), [orders]);

  const counts = useMemo(() => {
    const c = { all: rows.length };
    for (const r of rows) c[tabOf(r.v.status)] = (c[tabOf(r.v.status)] || 0) + 1;
    return c;
  }, [rows]);

  const summary = useMemo(() => {
    let toConfirm = 0, toLock = 0, lockedNow = 0, inFlightPayout = 0, earned = 0, urgent = 0;
    for (const { ord, v } of rows) {
      if (v.status === 'pending') {
        toConfirm++;
        toLock += v.total;
        const left = timeLeft(ord.confirmDeadline, now);
        if (left && left.ms < 24 * 3600000) urgent++;
      } else if (LOCKED.includes(v.status)) {
        lockedNow += v.total;
        inFlightPayout += v.payout;
      } else if (v.status === 'delivered') earned += v.profit;
    }
    return { toConfirm, toLock, lockedNow, inFlightPayout, earned, urgent };
  }, [rows, now]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter(({ ord, v }) => {
      if (tab !== 'all' && tabOf(v.status) !== tab) return false;
      if (!term) return true;
      return String(ord.orderNumber || '').toLowerCase().includes(term) || v.items.some((it) => String(it.name || '').toLowerCase().includes(term));
    });
  }, [rows, tab, q]);

  const selected = useMemo(() => rows.find((r) => r.ord._id === selectedId) || null, [rows, selectedId]);
  const closeDrawer = useCallback(() => setSelectedId(null), []);
  const balance = Number(seller?.wallet?.balance) || 0;

  return (
    <div className="so">
      <header className="so-head">
        <div>
          <p className="so-eyebrow">Orders &amp; dispatch</p>
          <h1>Orders</h1>
          <p className="so-sub">Confirm new orders to lock the amount. Packing, courier and delivery are handled by Bazario Operations.</p>
        </div>
        <div className="so-privacy-note" title="Customer street address, phone and email are only visible to the Bazario team">
          <Ic name="lock" size={14} /> Customer details are private
        </div>
      </header>

      {restricted && (
        <div className="so-banner tone-red">
          <Ic name="lock" size={18} />
          <div>
            <b>Your store is frozen</b>
            <p>Confirm pending orders on time — deposit if your balance is short. Payouts of delivered orders are held until support lifts the freeze.</p>
          </div>
          <Link to="/seller/support" className="so-btn so-btn-ghost sm">Contact support</Link>
        </div>
      )}

      {/* ── Summary ── */}
      <div className="so-stats">
        <button type="button" className={`so-stat ${summary.toConfirm ? 'is-attn' : ''}`} onClick={() => setTab('pending')}>
          <span className="so-stat-lbl"><i className="dot amber" /> To confirm</span>
          <b>{summary.toConfirm}</b>
          <small>{summary.toConfirm ? `${formatMoney(summary.toLock)} to lock${summary.urgent ? ` · ${summary.urgent} due within 24h` : ''}` : 'All caught up'}</small>
        </button>
        <button type="button" className="so-stat" onClick={() => setTab('processing')}>
          <span className="so-stat-lbl"><i className="dot blue" /> Locked in orders</span>
          <b>{formatMoney(summary.lockedNow)}</b>
          <small>{(counts.confirmed || 0) + (counts.processing || 0) + (counts.shipped || 0)} orders in progress</small>
        </button>
        <div className="so-stat">
          <span className="so-stat-lbl"><i className="dot violet" /> Payout on delivery</span>
          <b>{formatMoney(summary.inFlightPayout)}</b>
          <small>Locked amount + profit, when delivered</small>
        </div>
        <button type="button" className="so-stat" onClick={() => setTab('delivered')}>
          <span className="so-stat-lbl"><i className="dot green" /> Profit earned</span>
          <b className="t-green">+{formatMoney(summary.earned)}</b>
          <small>{counts.delivered || 0} delivered orders</small>
        </button>
      </div>

      {/* ── Toolbar ── */}
      <div className="so-toolbar">
        <div className="so-tabs" role="tablist" aria-label="Order status">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
              {t.label}
              <span className={`so-count ${t.key === 'pending' && counts.pending ? 'attn' : ''}`}>{counts[t.key] || 0}</span>
            </button>
          ))}
        </div>
        <label className="so-search">
          <Ic name="search" size={15} />
          <input type="search" placeholder="Order # or product" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search orders" />
        </label>
      </div>

      {loadErr && !loading && (
        <div className="so-banner tone-red">
          <Ic name="alert" size={18} />
          <div><b>Orders could not load</b><p>{loadErr}</p></div>
          <button type="button" className="so-btn so-btn-ghost sm" onClick={() => { setLoading(true); loadOrders(); }}>Retry</button>
        </div>
      )}

      {/* ── List ── */}
      <section className="so-card">
        {loading ? (
          <div className="so-skel-list">{[0, 1, 2, 3].map((i) => <div key={i} className="so-skel" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="so-empty">
            <div className="so-empty-ico"><Ic name="package" size={22} /></div>
            <b>{q ? 'No orders match your search' : tab === 'pending' ? 'Nothing to confirm' : 'No orders here yet'}</b>
            <p>{q ? 'Try another order number or product name.' : 'New orders appear here the moment a customer checks out.'}</p>
          </div>
        ) : (
          <>
            <table className="so-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Items</th>
                  <th>Customer</th>
                  <th className="r">Settlement</th>
                  <th>Progress</th>
                  <th className="r" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ ord, v }) => (
                  <tr key={ord._id} className={v.status === 'pending' ? 'is-pending' : ''} onClick={() => setSelectedId(ord._id)}>
                    <td>
                      <button type="button" className="so-ordno" onClick={(e) => { e.stopPropagation(); setSelectedId(ord._id); }}>#{ord.orderNumber}</button>
                      <small>{fmtDate(ord.createdAt)}</small>
                      <span className={`so-tag tone-${statusOf(v.status).tone}`}>{statusOf(v.status).label}</span>
                    </td>
                    <td><Items items={v.items} units={v.units} formatMoney={formatMoney} /></td>
                    <td><Customer ord={ord} compact /></td>
                    <td className="r"><Money v={v} formatMoney={formatMoney} /></td>
                    <td><Progress ord={ord} v={v} now={now} /></td>
                    <td className="r" onClick={(e) => e.stopPropagation()}>
                      <div className="so-actions">
                        {v.status === 'pending' && (
                          <button type="button" className="so-btn so-btn-primary sm" onClick={() => confirmOrder(ord)} disabled={confirmingId === ord._id}>
                            {confirmingId === ord._id ? 'Confirming…' : 'Confirm'}
                          </button>
                        )}
                        <button type="button" className="so-btn so-btn-ghost sm" onClick={() => setSelectedId(ord._id)}>View</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* phones: one card per order */}
            <ul className="so-cards">
              {filtered.map(({ ord, v }) => (
                <li key={ord._id} className={v.status === 'pending' ? 'is-pending' : ''}>
                  <div className="so-c-top" onClick={() => setSelectedId(ord._id)}>
                    <div>
                      <b className="so-ordno-txt">#{ord.orderNumber}</b>
                      <small>{ago(ord.createdAt, now)}</small>
                    </div>
                    <span className={`so-tag tone-${statusOf(v.status).tone}`}>{statusOf(v.status).label}</span>
                  </div>
                  <Items items={v.items} units={v.units} formatMoney={formatMoney} />
                  <div className="so-c-money">
                    <div><span>Order value</span><b>{formatMoney(v.total)}</b></div>
                    <div><span>+{v.rate}% profit</span><b className="t-green">+{formatMoney(v.profit)}</b></div>
                    <div><span>Payout</span><b className="t-violet">{formatMoney(v.payout)}</b></div>
                  </div>
                  <Progress ord={ord} v={v} now={now} />
                  <div className="so-c-foot">
                    <Customer ord={ord} compact />
                    <div className="so-actions">
                      {v.status === 'pending' && (
                        <button type="button" className="so-btn so-btn-primary sm" onClick={() => confirmOrder(ord)} disabled={confirmingId === ord._id}>
                          {confirmingId === ord._id ? 'Confirming…' : 'Confirm'}
                        </button>
                      )}
                      <button type="button" className="so-btn so-btn-ghost sm" onClick={() => setSelectedId(ord._id)}>View</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {toast && (
        <div className={`so-toast ${toast.ok ? 'ok' : 'err'}`} role="status">
          <Ic name={toast.ok ? 'checkCircle' : 'alert'} size={17} />
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss"><Ic name="x" size={15} /></button>
        </div>
      )}

      <OrderDrawer
        row={selected}
        now={now}
        balance={balance}
        formatMoney={formatMoney}
        confirming={selected && confirmingId === selected.ord._id}
        onConfirm={() => selected && confirmOrder(selected.ord)}
        onClose={closeDrawer}
      />
    </div>
  );
}

function Items({ items, units, formatMoney }) {
  const shown = items.slice(0, 2);
  return (
    <div className="so-items">
      {shown.map((it, i) => (
        <div key={i} className="so-item">
          <span className="so-thumb">
            <img src={it.image || it.product?.image || '/img/products/serum.svg'} alt="" loading="lazy" />
            <em className="so-qty-badge">×{it.qty || 1}</em>
          </span>
          <div className="so-item-txt">
            <b title={it.name}>{it.name}</b>
            <small><span className="so-qty">{it.qty || 1} {Number(it.qty || 1) === 1 ? 'unit' : 'units'}</span> × {formatMoney(it.price)}</small>
          </div>
        </div>
      ))}
      {items.length > 2 && <small className="so-more">+{items.length - 2} more item{items.length - 2 === 1 ? '' : 's'} · {units} units total</small>}
    </div>
  );
}

function Customer({ ord, compact }) {
  const a = ord.shippingAddress || {};
  const place = [a.city, a.state].filter(Boolean).join(', ');
  return (
    <div className={`so-cust ${compact ? 'compact' : ''}`}>
      <b>{a.fullName || 'Customer'}</b>
      {place && <small><Ic name="mapPin" size={11} /> {place}</small>}
      <span className="so-private" title="Street address and phone are visible to the Bazario team only">
        <span className="so-blur" aria-hidden="true">House 24, Street 7 · 0300 1234567</span>
        <span className="so-private-lbl"><Ic name="lock" size={10} /> Private</span>
      </span>
    </div>
  );
}

function Money({ v, formatMoney }) {
  return (
    <div className="so-money">
      <div><span>Order value</span><b>{formatMoney(v.total)}</b></div>
      <div className="t-green"><span>{v.rate >= 35 ? '💎 ' : ''}+{v.rate}% profit</span><b>+{formatMoney(v.profit)}</b></div>
      <div className="so-money-total"><span>Payout</span><b>{formatMoney(v.payout)}</b></div>
    </div>
  );
}

function Progress({ ord, v, now }) {
  if (v.status === 'pending') {
    const left = timeLeft(ord.confirmDeadline, now);
    const hours = Number(ord.confirmHours) || 48;
    if (!left) return <div className="so-prog"><span className="so-prog-lbl tone-amber">Waiting for you</span></div>;
    const pct = Math.max(0, Math.min(100, (left.ms / (hours * 3600000)) * 100));
    const tone = left.ms <= 0 ? 'red' : left.ms < 24 * 3600000 ? 'red' : left.ms < hours * 0.5 * 3600000 ? 'amber' : 'green';
    return (
      <div className="so-prog">
        <span className={`so-prog-lbl tone-${tone}`}><Ic name="clock" size={12} /> {left.ms <= 0 ? `Overdue ${left.text}` : `${left.text} left`}</span>
        <div className={`so-deadline tone-${tone}`}><i style={{ width: `${left.ms <= 0 ? 100 : pct}%` }} /></div>
        <small>Confirm by {new Date(ord.confirmDeadline).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
      </div>
    );
  }
  if (v.status === 'cancelled' || v.status === 'refunded') {
    return <div className="so-prog"><span className="so-prog-lbl tone-slate">Funds returned to wallet</span></div>;
  }
  const idx = stepIndex(v.status);
  return (
    <div className="so-prog">
      <div className="so-steps-mini" aria-label={`Step ${idx + 1} of ${STEPS.length}`}>
        {STEPS.map((s, i) => <i key={s.key} className={i <= idx ? 'on' : ''} />)}
      </div>
      <small>{v.status === 'delivered' ? 'Paid into your wallet' : `${STEPS[idx]?.label || ''} · step ${idx + 1} of ${STEPS.length}`}</small>
      {v.tracking && <small className="so-trk">TRK {v.tracking}</small>}
    </div>
  );
}

function OrderDrawer({ row, now, balance, formatMoney, confirming, onConfirm, onClose }) {
  const open = Boolean(row);
  const [shown, setShown] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) { setShown(false); return undefined; }
    const id = requestAnimationFrame(() => setShown(true));
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = before;
    };
  }, [open, onClose]);

  if (!open) return null;
  const { ord, v } = row;
  const st = statusOf(v.status);
  const idx = stepIndex(v.status);
  const history = Array.isArray(ord.statusHistory) ? [...ord.statusHistory].reverse() : [];
  const whenStep = (key) => {
    const match = (ord.statusHistory || []).find((h) => tabOf(h.status) === key || h.status === key);
    return match?.at;
  };
  const left = v.status === 'pending' ? timeLeft(ord.confirmDeadline, now) : null;
  const short = v.status === 'pending' && balance < v.total;
  const a = ord.shippingAddress || {};

  return createPortal(
    <div className="so-drawer-root" role="dialog" aria-modal="true" aria-label={`Order ${ord.orderNumber}`}>
      <button type="button" className={`so-drawer-bg ${shown ? 'on' : ''}`} onClick={onClose} aria-label="Close" tabIndex={-1} />
      <aside className={`so-drawer ${shown ? 'on' : ''}`}>
        <header className="so-dr-head">
          <div>
            <p className="so-eyebrow">Order</p>
            <h2>#{ord.orderNumber}</h2>
            <div className="so-dr-meta">
              <span className={`so-tag tone-${st.tone}`}>{st.label}</span>
              <span>{fmtDate(ord.createdAt)}</span>
              <span className="sep">·</span>
              <span>{v.units} unit{v.units === 1 ? '' : 's'}</span>
            </div>
          </div>
          <button ref={closeRef} type="button" className="so-icon-btn" onClick={onClose} aria-label="Close"><Ic name="x" size={18} /></button>
        </header>

        <div className="so-dr-body">
          {/* deadline / status message */}
          {v.status === 'pending' ? (
            <div className={`so-callout ${left && left.ms < 24 * 3600000 ? 'tone-red' : 'tone-amber'}`}>
              <Ic name="clock" size={18} />
              <div>
                <b>{left ? (left.ms <= 0 ? `Overdue by ${left.text}` : `Confirm within ${left.text}`) : 'Waiting for your confirmation'}</b>
                <p>Confirming locks <b>{formatMoney(v.total)}</b> from your wallet. Missing the deadline costs account-health points and can freeze the store.</p>
                {short && (
                  <p className="so-short">Your balance is {formatMoney(balance)} — <Link to="/seller/wallet?tab=deposit">deposit {formatMoney(v.total - balance)} more</Link> to confirm.</p>
                )}
              </div>
            </div>
          ) : (
            <div className={`so-callout tone-${st.tone === 'green' ? 'green' : st.tone === 'slate' || st.tone === 'red' ? 'slate' : 'blue'}`}>
              <Ic name={v.status === 'delivered' ? 'checkCircle' : v.status === 'cancelled' ? 'x' : 'truck'} size={18} />
              <div><b>{st.label}</b><p>{st.text}</p></div>
            </div>
          )}

          {/* stepper */}
          {idx >= 0 && (
            <ol className="so-stepper">
              {STEPS.map((s, i) => {
                const at = i === 0 ? ord.createdAt : whenStep(s.key);
                return (
                  <li key={s.key} className={i < idx ? 'done' : i === idx ? 'now' : ''}>
                    <span className="so-st-dot">{i < idx ? <Ic name="check" size={12} /> : i + 1}</span>
                    <b>{s.label}</b>
                    {at && i <= idx && <small>{new Date(at).toLocaleDateString([], { day: 'numeric', month: 'short' })}</small>}
                  </li>
                );
              })}
            </ol>
          )}

          {/* settlement */}
          <section className="so-dr-card">
            <h3>Settlement</h3>
            <div className="so-receipt">
              <div><span>Order value <small>(locked when you confirm)</small></span><b>{formatMoney(v.total)}</b></div>
              <div className="t-green"><span>{v.rate >= 35 ? '💎 Diamond ' : ''}{v.rate}% profit</span><b>+{formatMoney(v.profit)}</b></div>
              <div className="total"><span>Payout on delivery</span><b>{formatMoney(v.payout)}</b></div>
            </div>
            <div className="so-split" aria-hidden="true">
              <i style={{ flexGrow: v.total || 1 }} />
              <i className="profit" style={{ flexGrow: v.profit || 0 }} />
            </div>
            <p className="so-fine">
              {v.status === 'delivered' ? 'Paid into your wallet.' : 'Paid into your wallet automatically when Operations marks the order delivered.'}
              {ord.paymentMethod ? ` Customer payment: ${String(ord.paymentMethod).replace(/_/g, ' ')}${ord.paymentStatus ? ` (${ord.paymentStatus})` : ''}.` : ''}
            </p>
          </section>

          {/* items */}
          <section className="so-dr-card">
            <h3>Items <span>{v.items.length} product{v.items.length === 1 ? '' : 's'} · {v.units} unit{v.units === 1 ? '' : 's'}</span></h3>
            <ul className="so-dr-items">
              {v.items.map((it, i) => (
                <li key={i}>
                  <img src={it.image || it.product?.image || '/img/products/serum.svg'} alt="" />
                  <div className="so-dr-item-txt">
                    <b>{it.name}</b>
                    <small>{formatMoney(it.price)} each</small>
                  </div>
                  <span className="so-dr-qty">×{it.qty || 1}</span>
                  <b className="so-dr-line">{formatMoney((it.price || 0) * (it.qty || 1))}</b>
                </li>
              ))}
            </ul>
          </section>

          {/* delivery */}
          <section className="so-dr-card">
            <h3>Delivery</h3>
            <div className="so-dr-deliv">
              <div className="so-dr-who">
                <span className="so-avatar">{(a.fullName || 'C')[0]}</span>
                <div>
                  <b>{a.fullName || 'Customer'}</b>
                  <small>{[a.city, a.state, a.country].filter(Boolean).join(', ') || '—'}</small>
                </div>
              </div>
              <div className="so-dr-private">
                <div className="so-blur-lines" aria-hidden="true">
                  <span>House 24, Street 7, Block C</span>
                  <span>+00 300 1234567</span>
                </div>
                <div className="so-private-over">
                  <Ic name="lock" size={15} />
                  <div>
                    <b>Address &amp; phone are private</b>
                    <small>Only the Bazario team sees them. Operations delivers the order for you.</small>
                  </div>
                </div>
              </div>
              {v.tracking && (
                <div className="so-dr-trk"><Ic name="truck" size={15} /><span>Courier tracking</span><b>{v.tracking}</b></div>
              )}
            </div>
          </section>

          {/* activity */}
          {history.length > 0 && (
            <section className="so-dr-card">
              <h3>Activity</h3>
              <ul className="so-timeline">
                {history.map((h, i) => (
                  <li key={i} className={i === 0 ? 'latest' : ''}>
                    <i />
                    <div>
                      <b>{statusOf(h.status).label}</b>
                      <small>{fmtDate(h.at)}{h.by ? ` · ${h.by}` : ''}</small>
                      {h.note && <p>{h.note}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <footer className="so-dr-foot">
          <Link to="/seller/support" className="so-btn so-btn-ghost">Need help?</Link>
          {v.status === 'pending' ? (
            <button type="button" className="so-btn so-btn-primary" onClick={onConfirm} disabled={confirming}>
              <Ic name="checkCircle" size={16} /> {confirming ? 'Confirming…' : `Confirm & lock ${formatMoney(v.total)}`}
            </button>
          ) : (
            <button type="button" className="so-btn so-btn-dark" onClick={onClose}>Done</button>
          )}
        </footer>
      </aside>
    </div>,
    document.body
  );
}
