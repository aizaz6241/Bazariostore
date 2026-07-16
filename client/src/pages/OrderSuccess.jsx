import { Link, Navigate, useLocation } from 'react-router-dom';
import { money } from '../api.js';
import { PAYMENT_LABELS } from '../data.js';
import Ic from '../components/Icons.jsx';
import { TrustStrip } from '../components/Bits.jsx';

export default function OrderSuccess() {
  const { state } = useLocation();
  const order = state?.order;
  if (!order) return <Navigate to="/" replace />;
  const payLabel = PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod;

  return (
    <>
      <div className="container section success-page">
        <div className="success-ic"><Ic name="check" size={38} stroke={2.4} /></div>
        <h1 className="serif">Thank You! Your Order Has Been Placed</h1>
        <p className="muted">
          Order number: <b className="order-num">{order.orderNumber}</b>
        </p>
        <p className="success-note">
          Aap ka order receive ho gaya hai. Hamari team jald confirmation ke liye <b>{order.contact?.phone}</b> par
          rabta karegi. Payment method: <b>{payLabel}</b>.
        </p>
        {order.payment?.message && order.paymentMethod !== 'cod' && (
          <div className="alert-info"><Ic name="wallet" size={15} /> {order.payment.message}</div>
        )}
        <div className="success-actions">
          <Link
            className="btn-primary"
            to={`/track-order?order=${order.orderNumber}&phone=${encodeURIComponent(order.contact?.phone || '')}`}
          >
            TRACK YOUR ORDER
          </Link>
          <Link className="btn-outline" to="/shop">CONTINUE SHOPPING</Link>
        </div>

        <div className="card success-summary">
          <h3>Order Summary</h3>
          {order.items.map((i, n) => (
            <div className="os-item" key={n}>
              <span className="cart-thumb"><img src={i.image} alt="" /></span>
              <span className="os-name">{i.name}{i.size ? ` ${i.size}` : ''}{i.variant ? ` — ${i.variant}` : ''}<small className="muted">Qty: {i.qty}</small></span>
              <b>{money(i.price * i.qty)}</b>
            </div>
          ))}
          <div className="sum-row"><span>Subtotal</span><span>{money(order.subtotal)}</span></div>
          <div className="sum-row"><span>Shipping ({order.shipping?.name})</span><span className={order.shipping?.cost ? '' : 'free'}>{order.shipping?.cost ? money(order.shipping.cost) : 'FREE'}</span></div>
          {(order.discounts || []).map((d, i) => (
            <div className="sum-row discount" key={i}><span>{d.label}{d.code ? ` (${d.code})` : ''}</span><span>- {money(d.amount)}</span></div>
          ))}
          <div className="sum-total"><span>Total ({payLabel})</span><b>{money(order.total)}</b></div>
          <p className="muted-sm">
            Delivery to: {order.shippingAddress?.fullName}, {order.shippingAddress?.street}, {order.shippingAddress?.city},{' '}
            {order.shippingAddress?.state}
          </p>
        </div>
      </div>
      <TrustStrip />
    </>
  );
}
