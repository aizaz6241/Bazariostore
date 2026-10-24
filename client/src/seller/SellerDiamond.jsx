import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useOutletContext } from 'react-router-dom';
import { sapi } from '../api.js';
import Ic from '../components/Icons.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';
import { OfferCard, RewardProgress, OwnNumbers, usd } from './DiamondOfferParts.jsx';

// Fallback numbers until /sellers/tier answers (same as server/src/utils/sellerTier.js)
const DEFAULT_INFO = {
  tier: 'basic',
  upgradeFee: 1500,
  request: { status: 'none', requestedAt: null },
  plans: {
    basic: { label: 'Basic', profitRate: 20, confirmHours: 48, canRemoveProducts: false, deliveryDays: '' },
    diamond: { label: 'Diamond', profitRate: 35, confirmHours: 72, canRemoveProducts: true, deliveryDays: '3–5' },
  },
};
const ORDER_PRESETS = [100, 500, 1000, 5000];
const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export default function SellerDiamond() {
  const { seller, setSeller } = useOutletContext() || {};
  const { formatMoney } = useCurrency();
  const [info, setInfo] = useState(DEFAULT_INFO);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState(null); // { ok, text }
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [orderValue, setOrderValue] = useState(1000);
  const [ordersPerMonth, setOrdersPerMonth] = useState(20);

  const load = () =>
    sapi('/sellers/tier')
      .then((d) => setInfo({ ...DEFAULT_INFO, ...d }))
      .catch(() => {});

  // reload when an admin upgrades the store (the layout receives it live)
  useEffect(() => {
    load();
  }, [seller?.tier, seller?.tierRequest?.status]);

  const basic = info.plans?.basic || DEFAULT_INFO.plans.basic;
  const diamond = info.plans?.diamond || DEFAULT_INFO.plans.diamond;
  const isDiamond = info.tier === 'diamond';
  const reqStatus = info.request?.status || seller?.tierRequest?.status || 'none';
  // 'pending' = request sent to support · 'awaiting_approval' = fee received, being approved
  const pending = !isDiamond && ['pending', 'awaiting_approval'].includes(reqStatus);
  const approving = !isDiamond && reqStatus === 'awaiting_approval';
  const underReview = seller?.status === 'pending_approval';
  const regularNum = Number(info.upgradeFee || 1500);
  // Diamond offers: a running offer (Basic, no request yet) or the price locked on the request
  const offers = info.offers || null;
  const offer = !isDiamond && !pending ? offers?.offer || null : null;
  const locked = !isDiamond && pending ? offers?.locked || null : null;
  const feeNum = Number(locked?.price || offer?.price || regularNum);
  const discounted = feeNum < regularNum;
  const fee = usd(feeNum);

  const value = Math.max(0, Number(orderValue) || 0);
  const perMonth = Math.max(0, Math.round(Number(ordersPerMonth) || 0));
  const basicProfit = (value * basic.profitRate) / 100;
  const diamondProfit = (value * diamond.profitRate) / 100;
  const extraPerOrder = diamondProfit - basicProfit;
  const extraPerMonth = extraPerOrder * perMonth;
  const paybackMonths = extraPerMonth > 0 ? feeNum / extraPerMonth : null;
  const paybackOrders = extraPerOrder > 0 ? Math.ceil(feeNum / extraPerOrder) : null;

  const requestUpgrade = async () => {
    setSending(true);
    setNotice(null);
    try {
      const r = await sapi('/sellers/tier/request-upgrade', { method: 'POST', body: {} });
      setNotice({ ok: true, text: r.message });
      setConfirmOpen(false);
      if (r.tier) setInfo((prev) => ({ ...prev, ...r.tier }));
      load(); // the locked price + the request state
      if (setSeller && !r.already) {
        setSeller((prev) => {
          if (!prev) return prev;
          const next = { ...prev, tierRequest: { status: 'pending', requestedAt: new Date().toISOString() } };
          try {
            localStorage.setItem('ng_seller', JSON.stringify(next));
          } catch {}
          return next;
        });
      }
    } catch (err) {
      setNotice({ ok: false, text: err.message });
      setConfirmOpen(false);
    } finally {
      setSending(false);
    }
  };

  const features = [
    { label: 'Profit on every order', basic: `${basic.profitRate}%`, diamond: `${diamond.profitRate}%`, key: true },
    { label: 'Time to confirm an order', basic: `${basic.confirmHours} hours`, diamond: `${diamond.confirmHours} hours` },
    { label: 'Reminder before the deadline', basic: `at ${basic.confirmHours - 24}h`, diamond: `at ${diamond.confirmHours - 24}h` },
    { label: 'Remove products from My Store', basic: false, diamond: true },
    { label: 'Delivery speed', basic: 'Standard', diamond: `Fast · ${diamond.deliveryDays || '3–5'} days` },
  ];

  const steps = [
    { t: 'Send the request', d: 'Tap “Request Diamond upgrade”. It goes straight to our support chat.' },
    { t: 'Support contacts you', d: 'Our team replies in Support & Helpline with the payment details.' },
    { t: 'Pay the one-time fee', d: `${fee}, paid once. There is no monthly charge.` },
    { t: 'You are Diamond', d: 'Your plan switches and the new benefits start on your next orders.' },
  ];
  const stepNow = isDiamond ? 4 : approving ? 3 : pending ? 2 : 0;

  return (
    <div className="ap">
      <div className="ap-pagehead">
        <div>
          <p className="ap-eyebrow">Account plan</p>
          <h1>Your plan &amp; Diamond</h1>
        </div>
        <span className={`ap-current ${isDiamond ? 'is-diamond' : ''}`}>
          {isDiamond ? '💎 Diamond store' : 'Current plan: Basic'}
        </span>
      </div>

      {/* ── Hero ── */}
      {isDiamond ? (
        <section className="ap-hero is-diamond">
          <div className="ap-hero-main">
            <div className="ap-hero-gem" aria-hidden="true">💎</div>
            <div>
              <p className="ap-hero-kicker">Active{info.tierSince ? ` since ${fmtDay(info.tierSince)}` : ''}</p>
              <h2>You are a Diamond store</h2>
              <p className="ap-hero-text">
                You earn <b>{diamond.profitRate}%</b> on every order placed since your upgrade and have <b>{diamond.confirmHours} hours</b> to confirm each order. Diamond is for life — there is nothing more to pay.
              </p>
            </div>
          </div>
          <div className="ap-hero-stats">
            <div><b>{diamond.profitRate}%</b><span>profit per order</span></div>
            <div><b>{diamond.confirmHours}h</b><span>to confirm</span></div>
            <div><b>{diamond.deliveryDays || '3–5'}d</b><span>fast delivery</span></div>
          </div>
        </section>
      ) : offer ? (
        <OfferCard
          offer={offer}
          variant="page"
          onClaim={() => setConfirmOpen(true)}
          busy={sending}
          disabled={underReview}
          onEnd={load}
          note={underReview ? 'Available once your store registration is approved' : 'One-time payment · no monthly charge · Diamond for life'}
        />
      ) : (
        <section className={`ap-hero ${pending ? 'is-pending' : ''}`}>
          <div className="ap-hero-main">
            <div className="ap-hero-gem" aria-hidden="true">💎</div>
            <div>
              <p className="ap-hero-kicker">{approving ? 'Being approved' : pending ? 'Request sent' : 'Upgrade your store'}</p>
              <h2>
                {approving
                  ? 'Your Diamond upgrade is being approved'
                  : pending
                  ? 'Our team has your Diamond request'
                  : `Earn ${diamond.profitRate}% on every order instead of ${basic.profitRate}%`}
              </h2>
              <p className="ap-hero-text">
                {approving
                  ? 'Your fee has been received. Your store switches to Diamond as soon as the approval is done.'
                  : pending
                  ? `Sent${info.request?.requestedAt ? ` on ${fmtDay(info.request.requestedAt)}` : ''}. Support will contact you in chat with the payment details.`
                  : `Diamond stores keep ${diamond.profitRate - basic.profitRate}% more of every sale, get ${diamond.confirmHours} hours to confirm orders and fast ${diamond.deliveryDays || '3–5'} day delivery. One payment, for life.`}
              </p>
              {locked && (
                <div className="ap-lock">
                  <Ic name="lock" size={16} />
                  <span>
                    Your price is locked: <b>{usd(locked.price)}</b> <s style={{ opacity: 0.65 }}>{usd(locked.regular)}</s>
                    {locked.lockedUntil ? ` · until ${fmtDay(locked.lockedUntil)}` : ''}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="ap-hero-cta">
            {pending ? (
              <Link to="/seller/support" className="ap-btn ap-btn-light"><Ic name="chat" size={16} /> Open support chat</Link>
            ) : (
              <button type="button" className="ap-btn ap-btn-light" onClick={() => setConfirmOpen(true)} disabled={sending || underReview}>
                💎 Request Diamond upgrade
              </button>
            )}
            <small>{underReview && !pending ? 'Available once your store registration is approved' : `One-time fee ${fee} · no monthly charge`}</small>
          </div>
        </section>
      )}

      {notice && (
        <div className={`ap-notice ${notice.ok ? 'is-ok' : 'is-err'}`} role="status">
          <Ic name={notice.ok ? 'checkCircle' : 'alert'} size={17} />
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss"><Ic name="x" size={15} /></button>
        </div>
      )}

      {/* ── Plans ── */}
      <section className="ap-plans" aria-label="Compare plans">
        <article className={`ap-plan ${!isDiamond ? 'is-current' : ''}`}>
          <header>
            <div className="ap-plan-top">
              <h3>Basic</h3>
              {!isDiamond && <span className="ap-tag">Current</span>}
            </div>
            <div className="ap-price"><b>Free</b><span>every new store</span></div>
          </header>
          <ul>
            {features.map((f) => (
              <li key={f.label} className={f.basic === false ? 'is-off' : ''}>
                <span className="ap-ico">{f.basic === false ? <Ic name="x" size={13} /> : <Ic name="check" size={13} />}</span>
                <span className="ap-feat">{f.label}</span>
                <b>{f.basic === false ? 'No' : f.basic}</b>
              </li>
            ))}
          </ul>
        </article>

        <article className={`ap-plan ap-plan-diamond ${isDiamond ? 'is-current' : ''}`}>
          <span className="ap-ribbon">{isDiamond ? 'Your plan' : 'Recommended'}</span>
          <header>
            <div className="ap-plan-top">
              <h3>💎 Diamond</h3>
              {isDiamond && <span className="ap-tag on-dark">Current</span>}
            </div>
            <div className="ap-price">
              <b>{fee}</b>
              {discounted && !isDiamond && <s className="ap-price-was">{usd(regularNum)}</s>}
              <span>one-time · lifetime{discounted && !isDiamond ? <span className="ap-price-tag">Save {usd(regularNum - feeNum)}</span> : null}</span>
            </div>
          </header>
          <ul>
            {features.map((f) => (
              <li key={f.label} className={f.key ? 'is-key' : ''}>
                <span className="ap-ico"><Ic name="check" size={13} /></span>
                <span className="ap-feat">{f.label}</span>
                <b>{f.diamond === true ? 'Yes, anytime' : f.diamond}</b>
              </li>
            ))}
          </ul>
          {!isDiamond && !pending && (
            <button type="button" className="ap-btn ap-btn-diamond" onClick={() => setConfirmOpen(true)} disabled={sending || underReview}>
              {discounted ? `Upgrade for ${fee}` : 'Request upgrade'} <Ic name="arrowRight" size={15} />
            </button>
          )}
          {pending && <div className="ap-plan-note"><Ic name="clock" size={14} /> {approving ? 'Being approved' : 'Request sent — support will contact you'}</div>}
        </article>
      </section>

      {/* ── Reward progress + the store's own numbers (Basic) ── */}
      {!isDiamond && (offers?.numbers || (!offer && !pending && offers?.progress?.enabled)) && (
        <div className="ap-offer-wrap">
          {!offer && !pending && <RewardProgress progress={offers?.progress} regular={regularNum} />}
          <OwnNumbers numbers={offers?.numbers} price={feeNum} />
        </div>
      )}

      {/* ── Calculator ── */}
      <section className="ap-card ap-calc">
        <div className="ap-card-head">
          <div>
            <h3>How much more you earn</h3>
            <p>Try your own numbers. Amounts are in US dollars, the same as your wallet.</p>
          </div>
        </div>
        <div className="ap-calc-grid">
          <div className="ap-calc-inputs">
            <label className="ap-field">
              <span>Average order value</span>
              <div className="ap-input">
                <em>$</em>
                <input type="number" inputMode="decimal" min="0" step="50" value={orderValue} onChange={(e) => setOrderValue(e.target.value)} />
              </div>
            </label>
            <div className="ap-presets">
              {ORDER_PRESETS.map((v) => (
                <button key={v} type="button" className={Number(orderValue) === v ? 'on' : ''} onClick={() => setOrderValue(v)}>${v.toLocaleString('en-US')}</button>
              ))}
            </div>
            <label className="ap-field">
              <span>Orders per month</span>
              <div className="ap-input">
                <input type="number" inputMode="numeric" min="0" step="1" value={ordersPerMonth} onChange={(e) => setOrdersPerMonth(e.target.value)} />
                <em>orders</em>
              </div>
            </label>
          </div>

          <div className="ap-calc-out">
            <div className="ap-bars">
              <div className="ap-bar-row">
                <span>Basic · {basic.profitRate}%</span>
                <div className="ap-bar"><i style={{ width: `${(basic.profitRate / diamond.profitRate) * 100}%` }} /></div>
                <b>{formatMoney(basicProfit)}</b>
              </div>
              <div className="ap-bar-row is-diamond">
                <span>Diamond · {diamond.profitRate}%</span>
                <div className="ap-bar"><i style={{ width: '100%' }} /></div>
                <b>{formatMoney(diamondProfit)}</b>
              </div>
              <p className="ap-bars-cap">Profit on one order of ${value.toLocaleString('en-US')}</p>
            </div>
            <div className="ap-results">
              <div><span>Extra per order</span><b className="t-green">+{formatMoney(extraPerOrder)}</b></div>
              <div><span>Extra per month</span><b className="t-green">+{formatMoney(extraPerMonth)}</b></div>
              <div>
                <span>Fee paid back in</span>
                <b>{paybackOrders ? `${paybackOrders.toLocaleString()} orders` : '—'}</b>
                {paybackMonths != null && <small>≈ {paybackMonths < 1 ? 'under 1 month' : `${paybackMonths.toFixed(1)} months`}</small>}
              </div>
            </div>
          </div>
        </div>
        <p className="ap-fine">The Diamond rate applies to orders placed after your store is upgraded.</p>
      </section>

      {/* ── Steps ── */}
      <section className="ap-card">
        <div className="ap-card-head">
          <div>
            <h3>How the upgrade works</h3>
            <p>Four simple steps, all through your support chat.</p>
          </div>
        </div>
        <ol className="ap-steps">
          {steps.map((s, i) => (
            <li key={s.t} className={i < stepNow ? 'is-done' : i === stepNow && !isDiamond ? 'is-now' : ''}>
              <span className="ap-step-n">{i < stepNow ? <Ic name="check" size={14} /> : i + 1}</span>
              <div>
                <b>{s.t}</b>
                <p>{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── FAQ ── */}
      <section className="ap-card ap-faq">
        <div className="ap-card-head"><div><h3>Questions</h3></div></div>
        <details>
          <summary>Is there a monthly fee?</summary>
          <p>No. Diamond is a one-time payment of {fee}. Your store stays Diamond for life.</p>
        </details>
        <details>
          <summary>Do my old orders get the higher profit?</summary>
          <p>No — the {diamond.profitRate}% rate applies to orders placed after your store is upgraded. Orders placed before keep the {basic.profitRate}% rate.</p>
        </details>
        <details>
          <summary>How do I pay the fee?</summary>
          <p>After you send the request, our support team contacts you in the Support &amp; Helpline chat with the payment details.</p>
        </details>
        <details>
          <summary>Can I go back to Basic?</summary>
          <p>No. Once a store is Diamond it stays Diamond.</p>
        </details>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        fee={fee}
        regular={discounted ? usd(regularNum) : ''}
        lockDays={offer ? offers?.lockDays || 7 : 0}
        sending={sending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={requestUpgrade}
      />
    </div>
  );
}

function ConfirmDialog({ open, fee, regular, lockDays, sending, onCancel, onConfirm }) {
  const okRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !sending) onCancel(); };
    document.addEventListener('keydown', onKey);
    okRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, sending, onCancel]);
  if (!open) return null;
  return createPortal(
    <div className="ap-modal-root" role="dialog" aria-modal="true" aria-labelledby="ap-modal-title">
      <button type="button" className="ap-modal-backdrop" onClick={() => !sending && onCancel()} aria-label="Close" tabIndex={-1} />
      <div className="ap-modal">
        <div className="ap-modal-gem" aria-hidden="true">💎</div>
        <h3 id="ap-modal-title">Request the Diamond upgrade?</h3>
        {regular && (
          <div className="ap-modal-price">
            <s>{regular}</s> <b>{fee}</b>
          </div>
        )}
        <p>
          Your request goes to our support team. They will contact you in chat with the payment details for the one-time fee of <b>{fee}</b>.
          {regular && lockDays ? ` Your offer price is kept for ${lockDays} days after you send the request.` : ''}
        </p>
        <div className="ap-modal-actions">
          <button type="button" className="ap-btn ap-btn-ghost" onClick={onCancel} disabled={sending}>Cancel</button>
          <button type="button" ref={okRef} className="ap-btn ap-btn-diamond" onClick={onConfirm} disabled={sending}>
            {sending ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
