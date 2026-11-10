import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, fmtDate } from '../api.js';
import { STATUS_LABELS, ALL_STATUSES, PAYMENT_LABELS, STATUS_WARNINGS } from '../data.js';
import { ErrorBox } from './ui.jsx';
import Ic from '../components/Icons.jsx';
import { getSocket } from '../socket.js';
import StoreLink from './hub/StoreLink.jsx';
import { Avatar } from './insights.jsx';

/**
 * "Manage" popup for one order — opened from the Orders list instead of a separate page,
 * so the list's filters, page and scroll position stay exactly as they were.
 *
 * props:
 *   orderId   – the order to manage
 *   initial   – the row from the list (shown at once while the full order loads)
 *   onClose   – close the popup
 *   onChanged – called with the fresh order after every change (status / payment / refund)
 */
export default function OrderManageModal({ orderId, initial, onClose, onChanged }) {
  const [order, setOrder] = useState(initial || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(initial?.status || '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [refundOpen, setRefundOpen] = useState(false);
  const [refund, setRefund] = useState({ amount: initial?.total || '', reason: '' });
  const [refunding, setRefunding] = useState(false);

  // some responses return the seller as a bare id: keep the store details we already have
  const orderRef = useRef(order);
  orderRef.current = order;
  const apply = (o) => {
    if (!o) return;
    const seller = o.seller && typeof o.seller === 'object' ? o.seller : orderRef.current?.seller;
    const merged = { ...o, seller };
    setOrder(merged);
    setStatus(merged.status);
    onChanged?.(merged);
  };

  // full order (the list row has no status history / payment details)
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api(`/orders/${orderId}`)
      .then((o) => {
        if (!alive) return;
        setOrder(o);
        setStatus(o.status);
        setRefund({ amount: o.total, reason: '' });
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [orderId]);

  // live updates for this order (another admin / the automatic lifecycle)
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onUpdate = (payload) => {
      const u = payload?.order || payload;
      if (u && u._id === orderId) {
        setOrder((prev) => ({ ...(prev || {}), ...u, seller: u.seller && typeof u.seller === 'object' ? u.seller : prev?.seller }));
        if (u.status) setStatus(u.status);
      }
    };
    socket.on('order:update', onUpdate);
    socket.on('order:status_update', onUpdate);
    return () => {
      socket.off('order:update', onUpdate);
      socket.off('order:status_update', onUpdate);
    };
  }, [orderId]);

  // Esc closes (the refund form first, if open); the page behind does not scroll while the popup is open
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const refundOpenRef = useRef(refundOpen);
  refundOpenRef.current = refundOpen;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (refundOpenRef.current) setRefundOpen(false);
      else closeRef.current?.();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const seller = useMemo(() => {
    if (!order) return null;
    if (order.seller && typeof order.seller === 'object' && order.seller.storeName) return order.seller;
    const it = (order.items || []).find((i) => i.sellerName || i.seller);
    if (it) return { _id: it.seller, storeName: it.sellerName || 'Merchant Store', ownerName: it.ownerName || '' };
    return null;
  }, [order]);

  const flash = (msg) => {
    setSaved(msg);
    setTimeout(() => setSaved(''), 2500);
  };

  const updateStatus = async () => {
    if (!order || status === order.status) return;
    // these move money at once and cannot simply be clicked back
    if (STATUS_WARNINGS[status] && !window.confirm(STATUS_WARNINGS[status])) return;
    setSaving(true);
    setError('');
    try {
      const o = await api(`/orders/${orderId}/status`, { method: 'PATCH', body: { status, note } });
      apply(o);
      setNote('');
      flash('Status updated');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async () => {
    setError('');
    try {
      apply(await api(`/orders/${orderId}/payment`, { method: 'PATCH', body: { paymentStatus: 'paid' } }));
      flash('Payment marked as received');
    } catch (e) {
      setError(e.message);
    }
  };

  const createRefund = async (e) => {
    e.preventDefault();
    setRefunding(true);
    setError('');
    try {
      await api('/refunds', { method: 'POST', body: { orderId, amount: Number(refund.amount), reason: refund.reason } });
      setRefundOpen(false);
      apply(await api(`/orders/${orderId}`));
      flash('Refund entry created');
    } catch (err) {
      setError(err.message);
    } finally {
      setRefunding(false);
    }
  };

  const payState = (order?.paymentStatus || 'pending').replace(/_/g, ' ');
  const isPaid = order?.paymentStatus === 'paid';
  const addr = order?.shippingAddress || {};
  const itemsCount = (order?.items || []).reduce((n, i) => n + (Number(i.qty) || 0), 0);
  const dirty = order && status !== order.status;

  return (
    <div className="omm-overlay" onClick={onClose} role="presentation">
      <div className="omm-box" role="dialog" aria-modal="true" aria-labelledby="omm-title" onClick={(e) => e.stopPropagation()}>
        {/* ── header ── */}
        <header className="omm-head">
          <div className="omm-head-main">
            <div className="omm-title-row">
              <h3 id="omm-title">Order <b>{order?.orderNumber || '…'}</b></h3>
              {order && <span className={`status-pill st-${order.status}`}>{STATUS_LABELS[order.status] || order.status}</span>}
              {order && (
                <span className={`omm-pay ${isPaid ? 'paid' : ''}`}>
                  {(PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod || 'COD')} · {payState}
                </span>
              )}
            </div>
            {order && (
              <p className="omm-sub">
                <Ic name="clock" size={12} /> Placed {fmtDate(order.createdAt)}
                <span className="omm-dot">•</span>
                {itemsCount} item{itemsCount === 1 ? '' : 's'}
                <span className="omm-dot">•</span>
                Total <b>{money(order.total)}</b>
              </p>
            )}
          </div>
          <button type="button" className="omm-close" onClick={onClose} aria-label="Close">
            <Ic name="x" size={18} />
          </button>
        </header>

        {/* ── seller strip: whose order this is ── */}
        <div className="omm-seller">
          <Avatar name={seller?.storeName || 'Bazario'} size={38} />
          <div className="omm-seller-text">
            <span className="omm-seller-label">Seller</span>
            <span className="omm-seller-name">
              {seller ? <StoreLink id={seller._id} name={seller.storeName} /> : 'Bazario Direct'}
              {seller?.tier === 'diamond' && <span className="omm-tier">Diamond</span>}
            </span>
            {seller?.ownerName && <span className="omm-seller-owner">{seller.ownerName}</span>}
          </div>
          {seller?.phone && <span className="omm-seller-meta"><Ic name="phone" size={12} /> {seller.phone}</span>}
          {seller?.email && <span className="omm-seller-meta"><Ic name="mail" size={12} /> {seller.email}</span>}
        </div>

        {saved && <div className="omm-flash"><Ic name="check" size={13} /> {saved}</div>}
        <div className="omm-error"><ErrorBox error={error} /></div>

        {!order && loading && <p className="omm-loading">Loading order…</p>}

        {order && (
          <div className="omm-body">
            {/* ── left: what was ordered ── */}
            <div className="omm-col">
              <section className="omm-card">
                <h4><Ic name="package" size={14} /> Items</h4>
                <ul className="omm-items">
                  {(order.items || []).map((i, n) => (
                    <li key={n}>
                      <span className="omm-thumb">{i.image ? <img src={i.image} alt="" loading="lazy" /> : <Ic name="image" size={16} />}</span>
                      <span className="omm-item-text">
                        <span className="omm-item-name" title={i.name}>{i.name}{i.size ? ` · ${i.size}` : ''}{i.variant ? ` — ${i.variant}` : ''}</span>
                        <small>{money(i.price)} × {i.qty}</small>
                      </span>
                      <b>{money(i.price * i.qty)}</b>
                    </li>
                  ))}
                </ul>
                <div className="omm-sums">
                  <div><span>Subtotal</span><span>{money(order.subtotal)}</span></div>
                  <div><span>Shipping{order.shipping?.name ? ` (${order.shipping.name})` : ''}</span><span>{order.shipping?.cost ? money(order.shipping.cost) : 'FREE'}</span></div>
                  {(order.discounts || []).map((d, i) => (
                    <div className="omm-discount" key={i}><span>{d.label}{d.code ? ` (${d.code})` : ''}</span><span>− {money(d.amount)}</span></div>
                  ))}
                  <div className="omm-total"><span>Total{order.paymentMethod === 'cod' ? ' to collect (COD)' : ''}</span><b>{money(order.total)}</b></div>
                </div>
              </section>

              <section className="omm-card">
                <h4><Ic name="clock" size={14} /> Status history</h4>
                {order.statusHistory?.length ? (
                  <ol className="omm-history">
                    {[...order.statusHistory].reverse().map((h, i) => (
                      <li key={i} className={i === 0 ? 'now' : ''}>
                        <i />
                        <div>
                          <b>{STATUS_LABELS[h.status] || h.status}</b>
                          <small>{fmtDate(h.at)}{h.by ? ` · by ${h.by}` : ''}</small>
                          {h.note && <p>{h.note}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="omm-empty">No history yet.</p>
                )}
              </section>
            </div>

            {/* ── right: actions + who ── */}
            <div className="omm-col">
              <section className="omm-card omm-card-action">
                <h4><Ic name="refresh" size={14} /> Update status</h4>
                <label className="omm-label">New status</label>
                <select className="omm-select" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {ALL_STATUSES
                    // a delivered order was already paid out: it goes back only through a refund
                    .filter((s) => !(s === 'cancelled' && order.status === 'delivered'))
                    .map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
                <label className="omm-label">Note <small>(customer sees it on the tracking page)</small></label>
                <input className="omm-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. courier name, tracking number" />
                <button type="button" className={`omm-btn omm-btn-primary ${dirty ? '' : 'is-quiet'}`} onClick={updateStatus} disabled={saving || !dirty}>
                  {saving ? 'Updating…' : dirty ? `Change to ${STATUS_LABELS[status] || status}` : 'Status unchanged'}
                </button>
              </section>

              <section className="omm-card">
                <h4><Ic name="wallet" size={14} /> Payment</h4>
                <dl className="omm-kv">
                  <dt>Method</dt><dd>{PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod || '—'}</dd>
                  <dt>Status</dt><dd className={isPaid ? 'ok' : ''}>{payState}</dd>
                  {order.payment?.reference && <><dt>Reference</dt><dd>{order.payment.reference}</dd></>}
                  {order.payment?.walletNumber && <><dt>Wallet</dt><dd>{order.payment.walletNumber}</dd></>}
                  {order.payment?.paidAt && <><dt>Paid at</dt><dd>{fmtDate(order.payment.paidAt)}</dd></>}
                </dl>
                {!isPaid && order.paymentStatus !== 'refunded' && (
                  <button type="button" className="omm-btn omm-btn-outline" onClick={markPaid}><Ic name="check" size={14} /> Mark payment received</button>
                )}
              </section>

              <section className="omm-card">
                <h4><Ic name="user" size={14} /> Customer</h4>
                <p className="omm-cust-name">{addr.fullName || 'Customer'}</p>
                <p className="omm-cust-line"><Ic name="phone" size={12} /> {order.contact?.phone || addr.phone || '—'}</p>
                <p className="omm-cust-line"><Ic name="mail" size={12} /> {order.contact?.email || '—'}</p>
                <p className="omm-cust-line omm-addr">
                  <Ic name="mapPin" size={12} />
                  <span>
                    {addr.street}{addr.apartment ? `, ${addr.apartment}` : ''}<br />
                    {[addr.city, addr.state].filter(Boolean).join(', ')} {addr.postalCode}<br />
                    {addr.country}
                  </span>
                </p>
              </section>

              <section className="omm-card">
                <h4><Ic name="banknote" size={14} /> Refund</h4>
                {order.refundId ? (
                  <p className="omm-empty">A refund entry exists for this order. <Link className="row-link" to="/admin/refunds">Open Refunds →</Link></p>
                ) : (
                  <button type="button" className="omm-btn omm-btn-outline" onClick={() => setRefundOpen(true)}><Ic name="refresh" size={14} /> Create refund</button>
                )}
              </section>
            </div>
          </div>
        )}

        <footer className="omm-foot">
          <small className="omm-foot-hint">Changes save instantly · the list behind keeps its filters</small>
          <button type="button" className="omm-btn omm-btn-ghost" onClick={onClose}>Close</button>
        </footer>

        {/* ── refund form (inside the same popup) ── */}
        {refundOpen && order && (
          <div className="omm-sheet-back" onClick={() => setRefundOpen(false)}>
            <form className="omm-sheet" onSubmit={createRefund} onClick={(e) => e.stopPropagation()}>
              <h4>Create refund — {order.orderNumber}</h4>
              <label className="omm-label">Amount</label>
              <input className="omm-input" type="number" value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} max={order.total} min={1} required />
              <label className="omm-label">Reason</label>
              <textarea className="omm-input" rows={3} value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} placeholder="Why is this order being refunded?" />
              <div className="omm-sheet-actions">
                <button type="button" className="omm-btn omm-btn-ghost" onClick={() => setRefundOpen(false)}>Cancel</button>
                <button type="submit" className="omm-btn omm-btn-primary" disabled={refunding}>{refunding ? 'Creating…' : 'Create refund'}</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
