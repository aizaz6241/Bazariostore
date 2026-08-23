import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../cart.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';
import Ic from '../components/Icons.jsx';
import { StepsBar, TrustStrip } from '../components/Bits.jsx';

export default function CartPage() {
  const { items, setQty, remove, subtotal } = useCart();
  const { formatMoney } = useCurrency();
  const navigate = useNavigate();

  return (
    <>
      <div className="container">
        <div className="checkout-head">
          <h1 className="page-title serif">Shopping Cart</h1>
          <StepsBar active={1} />
        </div>

        {items.length === 0 ? (
          <div className="empty-box">
            <Ic name="cart" size={44} stroke={1.2} />
            <p>Your cart is empty.</p>
            <Link to="/shop" className="btn-primary">CONTINUE SHOPPING</Link>
          </div>
        ) : (
          <div className="cart-layout">
            <div className="cart-items card">
              <div className="cart-row cart-head-row">
                <span>Product</span><span>Price</span><span>Quantity</span><span>Total</span><span />
              </div>
              {items.map((i) => (
                <div className="cart-row" key={i.key}>
                  <div className="cart-prod">
                    <Link to={`/product/${i.slug}`} className="cart-thumb"><img src={i.image} alt="" /></Link>
                    <div>
                      <Link to={`/product/${i.slug}`} className="cart-name">{i.name}</Link>
                      {i.size && <small className="muted">Size: {i.size}</small>}
                    </div>
                  </div>
                  <span data-th="Price">{formatMoney(i.price)}</span>
                  <div className="qty-box" data-th="Qty">
                    <button onClick={() => setQty(i.key, i.qty - 1)} aria-label="Decrease"><Ic name="minus" size={13} /></button>
                    <span>{i.qty}</span>
                    <button onClick={() => setQty(i.key, i.qty + 1)} aria-label="Increase"><Ic name="plus" size={13} /></button>
                  </div>
                  <b data-th="Total">{formatMoney(i.price * i.qty)}</b>
                  <button className="cart-remove" onClick={() => remove(i.key)} aria-label="Remove"><Ic name="x" size={15} /></button>
                </div>
              ))}
            </div>

            <aside className="card order-summary">
              <h3>Order Summary</h3>
              <div className="sum-row"><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div>
              <div className="sum-row"><span>Shipping</span><span className="free">FREE</span></div>
              <div className="sum-row muted-sm"><span>Promo code</span><span>Apply at checkout</span></div>
              <div className="sum-total"><span>Total</span><b>{formatMoney(subtotal)}</b></div>
              <button className="btn-primary btn-block" onClick={() => navigate('/checkout')}>
                PROCEED TO CHECKOUT <Ic name="arrowRight" size={16} />
              </button>
              <Link to="/shop" className="return-link"><Ic name="arrowLeft" size={14} /> Continue Shopping</Link>
            </aside>
          </div>
        )}
      </div>
      <TrustStrip />
    </>
  );
}
