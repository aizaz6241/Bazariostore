import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, money, fmtDate } from '../api.js';
import { STATUS_LABELS, ALL_STATUSES, PAYMENT_LABELS } from '../data.js';
import { Modal, ErrorBox } from './ui.jsx';
import Ic from '../components/Icons.jsx';

export default function OrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [refundModal, setRefundModal] = useState(false);
  const [refund, setRefund] = useState({ amount: '', reason: '' });

  useEffect(() => {
    api(`/orders/${id}`)
      .then((o) => {
        setOrder(o);
        setStatus(o.status);
        setRefund({ amount: o.total, reason: '' });
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const update = async () => {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const o = await api(`/orders/${id}/status`, { method: 'PATCH', body: { status, note } });
      setOrder(o);
      setNote('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async () => {
    try {
      setOrder(await api(`/orders/${id}/payment`, { method: 'PATCH', body: { paymentStatus: 'paid' } }));
    } catch (e) {
      setError(e.message);
    }
  };

  const createRefund = async (e) => {
    e.preventDefault();
    try {
      await api('/refunds', { method: 'POST', body: { orderId: id, amount: Number(refund.amount), reason: refund.reason } });
      setRefundModal(false);
      setOrder(await api(`/orders/${id}`));
    } catch (err) {
      setError(err.message);
    }
  };

  if (error && !order) return <ErrorBox error={error} />;
  if (!order) return <p className="muted">Loading…</p>;

  return (
    <>
      <Link to="/admin/orders" className="back-link"><Ic name="arrowLeft" size={14} /> All orders</Link>
      <div className="detail-head">
        <h1 className="admin-h1">Order {order.orderNumber}</h1>
        <span className={`status-pill st-${order.status}`}>{STATUS_LABELS[order.status]}</span>
        <span className={'pay-chip' + (order.paymentStatus === 'paid' ? ' pay-paid' : '')}>
          {(PAYMENT_LABELS[order.paymentMethod] || '').toUpperCase()} — {order.paymentStatus.replace('_', ' ').toUpperCase()}
        </span>
      </div>
      <p className="muted-sm">Placed on {fmtDate(order.createdAt)}</p>

      <div className="detail-grid">
        <div className="detail-col">
          <div className="card">
            <h3>Items</h3>
            {order.items.map((i, n) => (
              <div className="os-item" key={n}>
                <span className="cart-thumb"><img src={i.image} alt="" /></span>
                <span className="os-name">{i.name}{i.size ? ` ${i.size}` : ''}{i.variant ? ` — ${i.variant}` : ''}<small className="muted">{money(i.price)} × {i.qty}</small></span>
                <b>{money(i.price * i.qty)}</b>
              </div>
            ))}
            <div className="sum-row"><span>Subtotal</span><span>{money(order.subtotal)}</span></div>
            <div className="sum-row"><span>Shipping ({order.shipping?.name})</span><span>{order.shipping?.cost ? money(order.shipping.cost) : 'FREE'}</span></div>
            {(order.discounts || []).map((d, i) => (
              <div className="sum-row discount" key={i}><span>{d.label}{d.code ? ` (${d.code})` : ''}</span><span>- {money(d.amount)}</span></div>
            ))}
            <div className="sum-total"><span>Total {order.paymentMethod === 'cod' ? 'to collect (COD)' : ''}</span><b>{money(order.total)}</b></div>
          </div>

          <div className="card">
            <h3>Status History</h3>
            <ul className="history">
              {[...order.statusHistory].reverse().map((h, i) => (
                <li key={i}>
                  <b>{STATUS_LABELS[h.status] || h.status}</b> — {fmtDate(h.at)}{h.by ? ` · by ${h.by}` : ''}
                  {h.note && <small>{h.note}</small>}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="detail-col">
          <div className="card">
            <h3>Update Status</h3>
            <ErrorBox error={error} />
            <div className="field">
              <label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Note (customer tracking page par nazar aayega)</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Courier: TCS, Tracking # 12345" />
            </div>
            <button className="btn-primary btn-block" onClick={update} disabled={saving}>
              {saving ? 'Updating…' : 'UPDATE STATUS'}
            </button>
            {saved && <small className="promo-ok"><Ic name="check" size={13} /> Status updated</small>}
          </div>

          <div className="card">
            <h3>Payment</h3>
            <p className="addr">
              Method: <b>{PAYMENT_LABELS[order.paymentMethod]}</b><br />
              Status: <b>{order.paymentStatus.replace('_', ' ')}</b>
              {order.payment?.reference && <><br />Reference: <b>{order.payment.reference}</b></>}
              {order.payment?.walletNumber && <><br />Wallet: <b>{order.payment.walletNumber}</b></>}
              {order.payment?.paidAt && <><br />Paid at: <b>{fmtDate(order.payment.paidAt)}</b></>}
            </p>
            {order.paymentStatus !== 'paid' && order.paymentStatus !== 'refunded' && (
              <button className="btn-outline" onClick={markPaid}><Ic name="check" size={14} /> MARK PAYMENT RECEIVED</button>
            )}
          </div>

          <div className="card">
            <h3>Customer</h3>
            <p className="addr">
              <b>{order.shippingAddress?.fullName}</b><br />
              <Ic name="phone" size={13} /> {order.contact?.phone}<br />
              <Ic name="mail" size={13} /> {order.contact?.email}
            </p>
            <h4>Shipping Address</h4>
            <p className="addr">
              {order.shippingAddress?.street}{order.shippingAddress?.apartment ? ', ' + order.shippingAddress.apartment : ''}<br />
              {order.shippingAddress?.city}, {order.shippingAddress?.state} {order.shippingAddress?.postalCode}<br />
              {order.shippingAddress?.country}
            </p>
          </div>

          <div className="card">
            <h3>Refund</h3>
            {order.refundId ? (
              <p className="muted-sm">Is order ki refund entry mojood hai. <Link className="row-link" to="/admin/refunds">Refunds module kholen →</Link></p>
            ) : (
              <button className="btn-outline" onClick={() => setRefundModal(true)}><Ic name="refresh" size={14} /> CREATE REFUND</button>
            )}
          </div>
        </div>
      </div>

      {refundModal && (
        <Modal title={`Create Refund — ${order.orderNumber}`} onClose={() => setRefundModal(false)}>
          <form onSubmit={createRefund}>
            <div className="field">
              <label>Amount (Rs)</label>
              <input type="number" value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} max={order.total} min={1} />
            </div>
            <div className="field">
              <label>Reason</label>
              <textarea rows={3} value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} placeholder="Refund ki wajah…" />
            </div>
            <div className="form-actions">
              <button className="btn-primary">CREATE REFUND</button>
              <button type="button" className="btn-outline" onClick={() => setRefundModal(false)}>CANCEL</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
