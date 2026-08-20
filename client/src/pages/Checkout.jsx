import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../cart.jsx';
import { useAuth } from '../auth.jsx';
import { api, uapi, money } from '../api.js';
import { PROVINCES, PAYMENT_LABELS } from '../data.js';
import { getGuestId } from '../socket.js';
import Ic from '../components/Icons.jsx';
import { StepsBar, TrustStrip } from '../components/Bits.jsx';

export default function Checkout() {
  const { items, subtotal, clear, showToast } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: user?.email || '', phone: user?.phone || '', newsletter: false,
    fullName: user?.name || '', street: '', apartment: '', city: '', state: '', postalCode: '',
  });
  const [errors, setErrors] = useState({});
  const [shipMethods, setShipMethods] = useState([]);
  const [shipId, setShipId] = useState('');
  const [payMethods, setPayMethods] = useState([]);
  const [payKey, setPayKey] = useState('cod');
  const [walletNumber, setWalletNumber] = useState('');
  const [card, setCard] = useState({ number: '', name: '', expiry: '', cvv: '' }); // UI only — never sent to server
  const [addresses, setAddresses] = useState([]);
  const [promoInput, setPromoInput] = useState('');
  const [coupon, setCoupon] = useState('');
  const [promoMsg, setPromoMsg] = useState(null);
  const [quote, setQuote] = useState(null);
  const [phase, setPhase] = useState('info');
  const [placing, setPlacing] = useState(false);
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    api('/shipping').then((m) => {
      setShipMethods(m);
      if (m.length && !shipId) setShipId(m[0]._id);
    }).catch(() => {});
    api('/settings/payments/methods').then((m) => {
      setPayMethods(m);
      const firstEnabled = m.find((x) => x.enabled);
      if (firstEnabled) setPayKey(firstEnabled.key);
    }).catch(() => {});
    if (user) uapi('/user/me').then((d) => setAddresses(d.user.addresses || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // live totals — discounts auto-apply server-side
  useEffect(() => {
    if (!items.length) return;
    api('/orders/quote', {
      method: 'POST',
      body: { items: items.map((i) => ({ id: i.id, qty: i.qty, size: i.size })), couponCode: coupon, shippingMethodId: shipId || null },
    })
      .then((q) => {
        setQuote(q);
        if (coupon && q.couponError) setPromoMsg({ ok: false, text: q.couponError });
      })
      .catch(() => {});
  }, [items, coupon, shipId]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const useAddress = (a) => {
    setForm({
      ...form,
      fullName: a.fullName || form.fullName,
      phone: a.phone || form.phone,
      street: a.street || '',
      apartment: a.apartment || '',
      city: a.city || '',
      state: a.state || '',
      postalCode: a.postalCode || '',
    });
    showToast(`Address "${a.label}" selected`);
  };

  const applyPromo = () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setCoupon(code);
    setPromoMsg({ ok: true, text: 'Checking coupon…' });
    api('/orders/quote', {
      method: 'POST',
      body: { items: items.map((i) => ({ id: i.id, qty: i.qty, size: i.size })), couponCode: code, shippingMethodId: shipId || null },
    })
      .then((q) => {
        if (q.couponError) {
          setCoupon('');
          setPromoMsg({ ok: false, text: q.couponError });
        } else {
          setPromoMsg({ ok: true, text: `Coupon "${code}" applied!` });
        }
      })
      .catch((e) => setPromoMsg({ ok: false, text: e.message }));
  };

  const validate = () => {
    const er = {};
    if (!/^\S+@\S+\.\S+$/.test(form.email)) er.email = 'Enter a valid email address';
    if (!/^\d{9,12}$/.test(form.phone.replace(/\D/g, ''))) er.phone = 'Enter a valid phone number';
    for (const [k, label] of [
      ['fullName', 'full name'], ['street', 'street address'], ['city', 'city'],
      ['state', 'state / province'], ['postalCode', 'postal code'],
    ]) {
      if (!form[k].trim()) er[k] = `Enter your ${label}`;
    }
    if (['easypaisa', 'jazzcash'].includes(payKey) && !/^\d{10,11}$/.test(walletNumber.replace(/\D/g, ''))) {
      er.wallet = 'Wallet account number required (e.g. 03001234567)';
    }
    setErrors(er);
    return Object.keys(er).length === 0;
  };

  const continueToPayment = () => {
    if (!validate()) {
      showToast('Please fill the required fields');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setPhase('review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const placeOrder = async () => {
    setPlacing(true);
    setServerError('');
    try {
      const order = await uapi('/orders', {
        method: 'POST',
        body: {
          items: items.map((i) => ({ id: i.id, qty: i.qty, size: i.size, variant: i.variant })),
          contact: { email: form.email.trim(), phone: form.phone.trim(), newsletter: form.newsletter },
          shippingAddress: {
            fullName: form.fullName, street: form.street, apartment: form.apartment,
            city: form.city, state: form.state, postalCode: form.postalCode, country: form.country || 'Worldwide',
          },
          shippingMethodId: shipId || null,
          couponCode: coupon,
          paymentMethod: payKey,
          walletNumber: walletNumber.trim(),
          guestId: getGuestId(),
        },
      });
      clear();
      navigate('/order-success', { state: { order } });
    } catch (e) {
      setServerError(e.message);
    } finally {
      setPlacing(false);
    }
  };

  if (items.length === 0)
    return (
      <div className="container section empty-box">
        <Ic name="cart" size={44} stroke={1.2} />
        <p>Your cart is empty — add some products first.</p>
        <Link to="/shop" className="btn-primary">GO TO SHOP</Link>
      </div>
    );

  const field = (k, label, props = {}, span) => (
    <div className={'field' + (span ? ' field-full' : '')}>
      <label>{label} <em>*</em></label>
      <input value={form[k]} onChange={set(k)} className={errors[k] ? 'invalid' : ''} {...props} />
      {errors[k] && <small className="field-err">{errors[k]}</small>}
    </div>
  );

  const shippingCost = quote?.shipping?.cost ?? 0;
  const discountTotal = quote?.discountTotal ?? 0;
  const total = quote?.total ?? subtotal;
  const vat = Math.round(total * 0.12);

  return (
    <>
      <div className="container">
        <div className="checkout-head">
          <h1 className="page-title serif">Checkout</h1>
          <StepsBar active={phase === 'info' ? 2 : 4} />
        </div>

        <div className="checkout-layout">
          <div className="checkout-main">
            {phase === 'info' ? (
              <>
                {!user && (
                  <div className="login-bar">
                    <Ic name="user" size={18} />
                    <span>Have an account? <Link to="/login?next=/checkout">Click here to login</Link></span>
                  </div>
                )}

                <div className="card form-card">
                  <h3>Contact Information</h3>
                  <div className="form-grid">
                    {field('email', 'Email Address', { type: 'email', placeholder: 'Enter your email address' })}
                    <div className="field">
                      <label>Phone Number <em>*</em></label>
                      <div className={'phone-wrap' + (errors.phone ? ' invalid' : '')}>
                        <input value={form.phone} onChange={set('phone')} placeholder="Enter your phone number" />
                      </div>
                      {errors.phone && <small className="field-err">{errors.phone}</small>}
                    </div>
                  </div>
                  <label className="checkbox">
                    <input type="checkbox" checked={form.newsletter} onChange={set('newsletter')} />
                    Email me with news and offers
                  </label>
                </div>

                <div className="card form-card">
                  <h3>Shipping Address</h3>
                  {addresses.length > 0 && (
                    <div className="saved-addr-row">
                      {addresses.map((a) => (
                        <button type="button" key={a._id} className="chip" onClick={() => useAddress(a)}>
                          <Ic name="mapPin" size={12} /> {a.label} — {a.city}{a.isDefault ? ' ★' : ''}
                        </button>
                      ))}
                    </div>
                  )}
                  {field('fullName', 'Full Name', { placeholder: 'Enter your full name' }, true)}
                  {field('street', 'Street Address', { placeholder: 'House no., Street name, Area' }, true)}
                  <div className="field field-full">
                    <input value={form.apartment} onChange={set('apartment')} placeholder="Apartment, suite, unit, etc. (optional)" />
                  </div>
                  <div className="form-grid form-grid-3">
                    {field('city', 'City', { placeholder: 'Enter your city' })}
                    <div className="field">
                      <label>State / Province <em>*</em></label>
                      <select value={form.state} onChange={set('state')} className={errors.state ? 'invalid' : ''}>
                        <option value="">Select state / province</option>
                        {PROVINCES.map((p) => <option key={p}>{p}</option>)}
                      </select>
                      {errors.state && <small className="field-err">{errors.state}</small>}
                    </div>
                    {field('postalCode', 'Postal Code', { placeholder: 'Enter postal code' })}
                  </div>
                  <div className="field" style={{ maxWidth: 260 }}>
                    <label>Country <em>*</em></label>
                    <input value={form.country || ''} onChange={set('country')} placeholder="Enter your country" />
                  </div>
                </div>

                <div className="card form-card">
                  <h3>Shipping Method</h3>
                  {shipMethods.map((m) => {
                    const free = m.cost === 0 || (m.freeAbove != null && subtotal >= m.freeAbove);
                    return (
                      <label key={m._id} className={'method' + (shipId === m._id ? ' on' : '')}>
                        <input type="radio" name="ship" checked={shipId === m._id} onChange={() => setShipId(m._id)} />
                        <i><Ic name="truck" size={22} /></i>
                        <span><b>{m.name}</b><small>{m.etaText}{m.zones?.length ? ` · ${m.zones.join(', ')}` : ''}</small></span>
                        <b className={'method-price' + (free ? ' free' : '')}>{free ? 'FREE' : `Rs. ${m.cost}`}</b>
                      </label>
                    );
                  })}
                </div>

                <div className="card form-card">
                  <h3>Payment Method</h3>
                  <p className="muted-sm pm-note"><Ic name="lock" size={13} /> All transactions are secure and encrypted.</p>
                  {payMethods.map((m) => (
                    <div key={m.key}>
                      <label className={'method' + (payKey === m.key ? ' on' : '') + (!m.enabled ? ' method-disabled' : '')}>
                        <input type="radio" name="pay" checked={payKey === m.key} disabled={!m.enabled} onChange={() => setPayKey(m.key)} />
                        <i className={m.key === 'easypaisa' ? 'pm-easy' : m.key === 'jazzcash' ? 'pm-jazz' : ''}><Ic name={m.icon} size={22} /></i>
                        <span>
                          <b>{m.name}</b>
                          <small>{m.enabled ? m.sub : 'Temporarily unavailable — coming soon'}</small>
                        </span>
                        {m.key.includes('card') && (
                          <span className="mini-pays"><i className="pay pay-visa">VISA</i><i className="pay pay-mc"><s /><s /></i></span>
                        )}
                      </label>

                      {payKey === m.key && ['easypaisa', 'jazzcash'].includes(m.key) && m.enabled && (
                        <div className="pay-extra">
                          <div className="field">
                            <label>{m.name} Account Number <em>*</em></label>
                            <input
                              value={walletNumber}
                              onChange={(e) => setWalletNumber(e.target.value)}
                              placeholder="03XX XXXXXXX"
                              className={errors.wallet ? 'invalid' : ''}
                            />
                            {errors.wallet && <small className="field-err">{errors.wallet}</small>}
                            <small className="muted-sm">Payment request aap ke {m.name} account par bheji jayegi.</small>
                          </div>
                        </div>
                      )}

                      {payKey === m.key && m.key.includes('card') && m.enabled && (
                        <div className="pay-extra">
                          <div className="form-grid">
                            <div className="field field-full">
                              <label>Card Number</label>
                              <input value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} placeholder="4242 4242 4242 4242" inputMode="numeric" />
                            </div>
                            <div className="field">
                              <label>Name on Card</label>
                              <input value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} placeholder="Full name" />
                            </div>
                            <div className="field">
                              <label>Expiry</label>
                              <input value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} placeholder="MM/YY" />
                            </div>
                            <div className="field">
                              <label>CVV</label>
                              <input value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value })} placeholder="•••" type="password" maxLength={4} />
                            </div>
                          </div>
                          <small className="muted-sm"><Ic name="lock" size={12} /> Card details gateway ke secure page par process hoti hain — hamare server par store nahi hoti.</small>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button className="btn-primary btn-block btn-lg" onClick={continueToPayment}>
                  Continue to Payment <Ic name="arrowRight" size={17} />
                </button>
                <Link to="/cart" className="return-link center-link"><Ic name="arrowLeft" size={14} /> Return to Cart</Link>
              </>
            ) : (
              <>
                <div className="card form-card">
                  <h3>Review & Confirm</h3>
                  <div className="review-grid">
                    <div><small>Contact</small><b>{form.email}</b><b>{form.phone}</b></div>
                    <div><small>Ship to</small><b>{form.fullName}</b><b>{form.street}{form.apartment ? ', ' + form.apartment : ''}</b><b>{form.city}, {form.state} {form.postalCode}, {form.country}</b></div>
                    <div><small>Delivery</small><b>{quote?.shipping?.name} ({quote?.shipping?.eta})</b></div>
                    <div><small>Payment</small><b><Ic name="banknote" size={15} /> {PAYMENT_LABELS[payKey] || payKey}</b></div>
                  </div>
                  <button className="edit-link" onClick={() => setPhase('info')}><Ic name="arrowLeft" size={13} /> Edit details</button>
                </div>

                <div className="card form-card">
                  <h3>Your Items</h3>
                  {items.map((i) => (
                    <div className="review-item" key={i.key}>
                      <span className="cart-thumb"><img src={i.image} alt="" /></span>
                      <span className="ri-name">{i.name}{i.size ? ` (${i.size})` : ''}{i.variant ? ` — ${i.variant}` : ''} <small className="muted">× {i.qty}</small></span>
                      <b>{money(i.price * i.qty)}</b>
                    </div>
                  ))}
                </div>

                {serverError && <div className="alert-error"><Ic name="x" size={15} /> {serverError}</div>}

                <button className="btn-buynow btn-block btn-lg" onClick={placeOrder} disabled={placing}>
                  {placing ? 'PLACING ORDER…' : <>PLACE ORDER — {(PAYMENT_LABELS[payKey] || '').toUpperCase()} ({money(total)})</>}
                </button>
                <p className="muted-sm center">By placing this order you agree to our <Link to="/page/terms">Terms & Conditions</Link>.</p>
              </>
            )}
          </div>

          <aside className="checkout-side">
            <div className="card order-summary">
              <div className="os-head"><h3>Order Summary</h3><Link to="/cart">Edit Cart</Link></div>
              {items.map((i) => (
                <div className="os-item" key={i.key}>
                  <span className="cart-thumb"><img src={i.image} alt="" /></span>
                  <span className="os-name">{i.name}{i.size ? ` ${i.size}` : ''}<small className="muted">Qty: {i.qty}</small></span>
                  <b>{money(i.price * i.qty)}</b>
                </div>
              ))}
              <div className="sum-row"><span>Subtotal</span><span>{money(quote?.subtotal ?? subtotal)}</span></div>
              <div className="sum-row"><span>Shipping</span><span className={shippingCost ? '' : 'free'}>{shippingCost ? money(shippingCost) : 'FREE'}</span></div>
              {(quote?.applied || []).map((a, i) => (
                <div className="sum-row discount" key={i}><span>{a.label}{a.code ? ` (${a.code})` : ''}</span><span>{a.amount ? `- ${money(a.amount)}` : '✓'}</span></div>
              ))}
              <div className="sum-total"><span>Total</span><b>{money(total)}</b></div>
              <small className="muted">Including {money(vat)} VAT</small>
            </div>

            <div className="card promo-box">
              <h4>Have a promo code?</h4>
              <div className="promo-input">
                <input value={promoInput} onChange={(e) => setPromoInput(e.target.value)} placeholder="Enter promo code" />
                <button className="btn-primary" onClick={applyPromo}>Apply</button>
              </div>
              {promoMsg && <small className={promoMsg.ok ? 'promo-ok' : 'promo-bad'}>{promoMsg.text}</small>}
            </div>

            <div className="card side-features">
              {[
                { icon: 'badgeCheck', t: '100% Original Products', s: 'Authentic & Genuine' },
                { icon: 'truck', t: 'Fast Worldwide Delivery', s: 'Express Shipping Available' },
                { icon: 'banknote', t: 'Secure Payments', s: 'Multiple Payment Options' },
                { icon: 'refresh', t: 'Easy Returns', s: '14-Day Return Policy' },
                { icon: 'shield', t: 'Buyer Protection', s: '100% Money-Back Guarantee' },
              ].map((f) => (
                <div className="side-feature" key={f.t}>
                  <i><Ic name={f.icon} size={20} /></i>
                  <span><b>{f.t}</b><small>{f.s}</small></span>
                </div>
              ))}
            </div>

            <div className="card privacy-card">
              <div className="privacy-top">
                <Ic name="lock" size={22} />
                <div>
                  <b>We Protect Your Privacy</b>
                  <small>Your personal information is safe with us. We never share your details with anyone.</small>
                </div>
              </div>
              <div className="privacy-badges">
                <span className="sec-badge"><Ic name="lock" size={12} /> SSL SECURE</span>
                <span className="sec-badge"><Ic name="shield" size={12} /> PCI DSS</span>
                <span className="sec-badge"><Ic name="badgeCheck" size={12} /> 100% SECURE</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <TrustStrip />
    </>
  );
}
