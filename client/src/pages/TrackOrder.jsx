import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, money, fmtDate } from '../api.js';
import { STATUS_STEPS, STATUS_LABELS } from '../data.js';
import Ic from '../components/Icons.jsx';
import { TrustStrip } from '../components/Bits.jsx';

const STEP_ICONS = {
  pending: 'clock',
  confirmed: 'checkCircle',
  processing: 'package',
  packed: 'box',
  shipped: 'truck',
  out_for_delivery: 'truck',
  delivered: 'home',
};

export function OrderTimeline({ order }) {
  const reachedIdx = STATUS_STEPS.indexOf(order.status);
  if (order.status === 'cancelled')
    return <div className="alert-error"><Ic name="x" size={15} /> Yeh order cancel ho chuka hai. Kisi bhi sawal ke liye chat support se rabta karein.</div>;
  if (order.status === 'refunded')
    return <div className="alert-info"><Ic name="refresh" size={15} /> Is order ka refund process ho chuka hai.</div>;
  return (
    <div className="timeline">
      {STATUS_STEPS.map((s, i) => {
        const done = i <= reachedIdx;
        const hist = order.statusHistory?.filter((h) => h.status === s).pop();
        return (
          <div key={s} className={'tl-step' + (done ? ' done' : '') + (i === reachedIdx ? ' current' : '')}>
            <span className="tl-dot"><Ic name={STEP_ICONS[s]} size={16} /></span>
            <b>{STATUS_LABELS[s]}</b>
            <small>{done && hist ? fmtDate(hist.at) : ''}</small>
            {i < STATUS_STEPS.length - 1 && <span className="tl-line" />}
          </div>
        );
      })}
    </div>
  );
}

export function OrderDetailCard({ order }) {
  return (
    <div className="track-cols">
      <div className="card">
        <h4>Items</h4>
        {order.items.map((i, n) => (
          <div className="os-item" key={n}>
            <span className="cart-thumb"><img src={i.image} alt="" /></span>
            <span className="os-name">{i.name}{i.size ? ` ${i.size}` : ''}{i.variant ? ` — ${i.variant}` : ''}<small className="muted">Qty: {i.qty}</small></span>
            <b>{money(i.price * i.qty)}</b>
          </div>
        ))}
        {order.discount > 0 && <div className="sum-row discount"><span>Discount{order.couponCode ? ` (${order.couponCode})` : ''}</span><span>- {money(order.discount)}</span></div>}
        <div className="sum-row"><span>Shipping ({order.shipping?.name})</span><span>{order.shipping?.cost ? money(order.shipping.cost) : 'FREE'}</span></div>
        <div className="sum-total"><span>Total ({(order.paymentMethod || 'cod').replace('_', ' ').toUpperCase()})</span><b>{money(order.total)}</b></div>
      </div>
      <div className="card">
        <h4>Delivery Address</h4>
        <p className="addr">
          <b>{order.shippingAddress?.fullName}</b><br />
          {order.shippingAddress?.street}{order.shippingAddress?.apartment ? ', ' + order.shippingAddress.apartment : ''}<br />
          {order.shippingAddress?.city}, {order.shippingAddress?.state} {order.shippingAddress?.postalCode}<br />
          {order.shippingAddress?.country}
        </p>
        <h4>Updates</h4>
        <ul className="history">
          {[...(order.statusHistory || [])].reverse().map((h, i) => (
            <li key={i}>
              <b>{STATUS_LABELS[h.status] || h.status}</b> — {fmtDate(h.at)}
              {h.note && <small>{h.note}</small>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function TrackOrder() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get('order') ? 'order' : 'order');
  const [orderNumber, setOrderNumber] = useState(params.get('order') || '');
  const [phone, setPhone] = useState(params.get('phone') || '');
  const [order, setOrder] = useState(null);
  const [orderList, setOrderList] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const track = async (e, overrideNumber) => {
    e?.preventDefault();
    const num = overrideNumber ?? (mode === 'order' ? orderNumber : '');
    if (!phone.trim() || (mode === 'order' && !num.trim() && !overrideNumber)) {
      return setError(mode === 'order' ? 'Order number aur phone dono required hain' : 'Phone number required hai');
    }
    setLoading(true);
    setError('');
    try {
      if (num?.trim()) {
        const o = await api(`/orders/track?orderNumber=${encodeURIComponent(num.trim())}&phone=${encodeURIComponent(phone.trim())}`);
        setOrder(o);
        setOrderList(null);
      } else {
        const d = await api(`/orders/track?phone=${encodeURIComponent(phone.trim())}`);
        setOrderList(d.orders);
        setOrder(null);
        if (!d.orders.length) setError('Is phone number se koi order nahi mila');
      }
    } catch (err) {
      setOrder(null);
      setOrderList(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (params.get('order') && params.get('phone')) track();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="container section track-page">
        <h1 className="page-title serif center">Track Your Order</h1>
        <p className="muted center">Order number + phone se single order track karein, ya sirf phone number se apne tamam orders dekhein.</p>

        <div className="track-mode">
          <button className={'chip' + (mode === 'order' ? ' chip-on' : '')} onClick={() => setMode('order')}>By Order Number</button>
          <button className={'chip' + (mode === 'phone' ? ' chip-on' : '')} onClick={() => setMode('phone')}>By Phone Number</button>
        </div>

        <form className="card track-form" onSubmit={track}>
          {mode === 'order' && (
            <div className="field">
              <label>Order Number <em>*</em></label>
              <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="e.g. NG-260716-1234" />
            </div>
          )}
          <div className="field">
            <label>Phone Number <em>*</em></label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone used at checkout" />
          </div>
          <button className="btn-primary" disabled={loading}>{loading ? 'Searching…' : 'TRACK ORDER'}</button>
        </form>
        {error && <div className="alert-error center-block"><Ic name="x" size={15} /> {error}</div>}

        {orderList && orderList.length > 0 && (
          <div className="card order-list-card">
            <h3>Is phone number ke orders ({orderList.length})</h3>
            {orderList.map((o) => (
              <button key={o.orderNumber} className="order-list-item" onClick={(e) => { setMode('order'); setOrderNumber(o.orderNumber); track(e, o.orderNumber); }}>
                <span>
                  <b>{o.orderNumber}</b>
                  <small className="muted">{fmtDate(o.createdAt)} · {o.itemCount} item{o.itemCount > 1 ? 's' : ''} · {o.firstItem}</small>
                </span>
                <span className="order-list-right">
                  <b>{money(o.total)}</b>
                  <span className={`status-pill st-${o.status}`}>{STATUS_LABELS[o.status]}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {order && (
          <div className="track-result">
            <div className="card">
              <div className="track-head">
                <div>
                  <h3>Order {order.orderNumber}</h3>
                  <small className="muted">Placed on {fmtDate(order.createdAt)}</small>
                </div>
                <span className={`status-pill st-${order.status}`}>{STATUS_LABELS[order.status]}</span>
              </div>
              <OrderTimeline order={order} />
            </div>
            <OrderDetailCard order={order} />
          </div>
        )}
      </div>
      <TrustStrip />
    </>
  );
}
