import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { sapi } from '../api.js';
import { useCurrency } from '../context/CurrencyContext.jsx';

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

const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export default function SellerDiamond() {
  const { seller, setSeller } = useOutletContext() || {};
  const { formatMoney } = useCurrency();
  const [info, setInfo] = useState(DEFAULT_INFO);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState(null); // { ok, text }
  const [orderValue, setOrderValue] = useState(1000);

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
  const pending = !isDiamond && info.request?.status === 'pending';
  const fee = `$${Number(info.upgradeFee || 1500).toLocaleString('en-US')}`;

  const value = Math.max(0, Number(orderValue) || 0);
  const basicProfit = (value * basic.profitRate) / 100;
  const diamondProfit = (value * diamond.profitRate) / 100;

  const requestUpgrade = async () => {
    if (!confirm(`Send a Diamond upgrade request to our support team?\n\nThe Diamond upgrade is a one-time fee of ${fee}. Support will contact you in chat with the payment details.`)) return;
    setSending(true);
    setNotice(null);
    try {
      const r = await sapi('/sellers/tier/request-upgrade', { method: 'POST', body: {} });
      setNotice({ ok: true, text: r.message });
      if (r.tier) setInfo((prev) => ({ ...prev, ...r.tier }));
      if (setSeller) {
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
    } finally {
      setSending(false);
    }
  };

  const rows = [
    { label: 'Profit on every order', basic: `${basic.profitRate}% of order value`, diamond: `${diamond.profitRate}% of order value`, highlight: true },
    { label: 'Time to confirm & process an order', basic: `${basic.confirmHours} hours`, diamond: `${diamond.confirmHours} hours (3 days)` },
    { label: 'Warning before the deadline', basic: `At ${basic.confirmHours - 24} hours`, diamond: `At ${diamond.confirmHours - 24} hours` },
    { label: 'Remove products from My Store', basic: '✕ Not allowed', diamond: '✓ Anytime' },
    { label: 'Delivery speed', basic: 'Standard', diamond: `Fast · ${diamond.deliveryDays || '3–5'} days` },
    { label: 'Plan fee', basic: 'Free', diamond: `${fee} one-time` },
  ];

  return (
    <div className="sdm-page">
      <div className="seller-page-header">
        <div>
          <h2>💎 Account Plan</h2>
          <p>Your store's plan, its benefits, and how to upgrade to Diamond.</p>
        </div>
      </div>

      {/* Current plan */}
      {isDiamond ? (
        <section className="sdm-hero sdm-hero-diamond">
          <div className="sdm-gem" aria-hidden="true">💎</div>
          <div className="sdm-hero-text">
            <span className="sdm-kicker">Your plan</span>
            <h3>Diamond Store</h3>
            <p>
              Active{info.tierSince ? ` since ${fmtDay(info.tierSince)}` : ''}. You earn <b>{diamond.profitRate}%</b> on every order placed from your upgrade on, and you have{' '}
              <b>{diamond.confirmHours} hours</b> to confirm each order.
            </p>
          </div>
        </section>
      ) : (
        <section className="sdm-hero sdm-hero-basic">
          <div className="sdm-hero-text">
            <span className="sdm-kicker">Your plan</span>
            <h3>Basic Store</h3>
            <p>
              You earn <b>{basic.profitRate}%</b> per order and have <b>{basic.confirmHours} hours</b> to confirm each order. Upgrade to 💎 Diamond to earn{' '}
              <b>{diamond.profitRate}%</b> per order.
            </p>
          </div>
          <div className="sdm-hero-cta">
            {pending ? (
              <div className="sdm-pending">
                <b>⏳ Upgrade request sent</b>
                <span>{info.request?.requestedAt ? `on ${fmtDay(info.request.requestedAt)} · ` : ''}Our support team will contact you in chat.</span>
                <Link to="/seller/support" className="sdm-btn sdm-btn-ghost">Open support chat</Link>
              </div>
            ) : (
              <button type="button" className="sdm-btn sdm-btn-diamond" onClick={requestUpgrade} disabled={sending}>
                {sending ? 'Sending…' : '💎 Request Diamond Upgrade'}
              </button>
            )}
            <small>One-time fee · {fee}</small>
          </div>
        </section>
      )}

      {notice && <div className={`sdm-notice ${notice.ok ? 'is-ok' : 'is-err'}`}>{notice.text}</div>}

      {/* Comparison */}
      <section className="seller-card sdm-compare">
        <h3 className="sdm-title">Basic vs Diamond</h3>
        <div className="sdm-table" role="table">
          <div className="sdm-row sdm-row-head" role="row">
            <span role="columnheader">Benefit</span>
            <span role="columnheader" className={!isDiamond ? 'is-current' : ''}>
              Basic {!isDiamond && <em>Current</em>}
            </span>
            <span role="columnheader" className={`sdm-col-diamond ${isDiamond ? 'is-current' : ''}`}>
              💎 Diamond {isDiamond && <em>Current</em>}
            </span>
          </div>
          {rows.map((r) => (
            <div key={r.label} className={`sdm-row ${r.highlight ? 'sdm-row-hi' : ''}`} role="row">
              <span role="cell" className="sdm-label">{r.label}</span>
              <span role="cell" data-plan="Basic">{r.basic}</span>
              <span role="cell" data-plan="Diamond" className="sdm-col-diamond">{r.diamond}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Profit calculator */}
      <section className="seller-card sdm-calc">
        <h3 className="sdm-title">How much more you earn</h3>
        <label className="sdm-calc-input">
          <span>Order value</span>
          <input type="number" min="0" step="50" value={orderValue} onChange={(e) => setOrderValue(e.target.value)} />
        </label>
        <div className="sdm-calc-grid">
          <div className="sdm-calc-box">
            <span>Basic profit ({basic.profitRate}%)</span>
            <b>{formatMoney(basicProfit)}</b>
          </div>
          <div className="sdm-calc-box sdm-calc-diamond">
            <span>💎 Diamond profit ({diamond.profitRate}%)</span>
            <b>{formatMoney(diamondProfit)}</b>
          </div>
          <div className="sdm-calc-box sdm-calc-extra">
            <span>Extra with Diamond</span>
            <b>+{formatMoney(diamondProfit - basicProfit)}</b>
          </div>
        </div>
        <p className="sdm-fine">Order value is entered in US dollars, the same as your wallet. The Diamond rate applies to orders placed after your store is upgraded.</p>
      </section>

      {/* How to upgrade */}
      {!isDiamond && (
        <section className="seller-card sdm-steps">
          <h3 className="sdm-title">How to upgrade</h3>
          <ol>
            <li><b>Send the request.</b> Tap “Request Diamond Upgrade” above. It goes straight to our support chat.</li>
            <li><b>Support contacts you.</b> Our team replies in your Support & Helpline chat with the payment details.</li>
            <li><b>Pay the one-time fee.</b> {fee}, paid once. There is no monthly charge.</li>
            <li><b>Your store becomes Diamond.</b> Once the fee is received, your plan is switched and the new benefits start on your next orders.</li>
          </ol>
        </section>
      )}
    </div>
  );
}
