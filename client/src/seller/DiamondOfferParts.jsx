import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { sapi } from '../api.js';
import Ic from '../components/Icons.jsx';
import { getSocket } from '../socket.js';

/**
 * 💎 Diamond offers on the seller side (server: utils/diamondOffers.js).
 *   useDiamondOffers()   the /sellers/tier answer's `offers` part, refreshed when a notification arrives
 *   Countdown            the real time left on an offer
 *   OfferCard            the offer (price, timer, button) — dashboard and Diamond page
 *   RewardProgress       how close the store is to its reward (orders + days of great health)
 *   DiamondOfferPopup    "You earned it" — shown once per personal offer (lives in the layout)
 * Prices are US dollars (the Diamond fee is set in dollars).
 */
export const usd = (n) => {
  const v = Math.round(Number(n || 0) * 100) / 100;
  const d = Number.isInteger(v) ? 0 : 2;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};
const fmtWhen = (d) =>
  new Date(d).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export function useDiamondOffers(enabled = true) {
  const [data, setData] = useState(null);
  const load = useCallback(() => {
    if (!enabled) return Promise.resolve();
    return sapi('/sellers/tier')
      .then((d) => setData(d?.offers || null))
      .catch(() => {});
  }, [enabled]);
  useEffect(() => {
    load();
    if (!enabled) return undefined;
    const socket = getSocket();
    const onNotify = (n) => {
      if (String(n?.link || '').includes('/seller/diamond')) load();
    };
    socket?.on('notify', onNotify);
    // the timer may run out while the page is open: look again every 10 minutes
    const t = setInterval(load, 10 * 60 * 1000);
    return () => {
      socket?.off('notify', onNotify);
      clearInterval(t);
    };
  }, [load, enabled]);
  return [data, load];
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function Countdown({ endsAt, tone = 'dark', onEnd }) {
  const now = useNow(1000);
  const left = Math.max(0, new Date(endsAt).getTime() - now);
  useEffect(() => {
    if (left === 0 && onEnd) onEnd();
  }, [left === 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = Math.floor(left / 86400000);
  const h = Math.floor((left % 86400000) / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  const s = Math.floor((left % 60000) / 1000);
  const parts = d > 0 ? [[d, d === 1 ? 'day' : 'days'], [h, 'hours'], [m, 'min']] : [[h, 'hours'], [m, 'min'], [s, 'sec']];
  return (
    <div className={`dof-timer ${tone}`} role="timer" aria-label={`${d} days ${h} hours ${m} minutes left`}>
      {parts.map(([v, l]) => (
        <div key={l}>
          <b>{String(v).padStart(2, '0')}</b>
          <small>{l}</small>
        </div>
      ))}
    </div>
  );
}

/** The offer: badge, old → new price, real timer, one button. `variant`: 'page' | 'dash'. */
export function OfferCard({ offer, variant = 'page', onClaim, busy, disabled, note, onEnd }) {
  if (!offer) return null;
  const btn = (
    <>
      💎 {variant === 'dash' ? 'Claim my offer' : `Upgrade for ${usd(offer.price)}`}
      <Ic name="arrowRight" size={15} />
    </>
  );
  return (
    <section className={`dof-card ${variant} ${offer.festival && !offer.personal ? 'is-fest' : ''}`} aria-label="Diamond offer">
      <div className="dof-card-main">
        <span className="dof-badge">{offer.badge}</span>
        <h2>
          Diamond for <span className="dof-new">{usd(offer.price)}</span>
        </h2>
        <div className="dof-price">
          <s>{usd(offer.regular)}</s>
          <span className="dof-save">Save {usd(offer.save)}</span>
        </div>
        <p className="dof-ends">Offer ends {fmtWhen(offer.endsAt)}</p>
      </div>
      <div className="dof-card-side">
        <Countdown endsAt={offer.endsAt} tone="dark" onEnd={onEnd} />
        {onClaim ? (
          <button type="button" className="dof-cta" onClick={onClaim} disabled={busy || disabled}>
            {busy ? 'Sending…' : btn}
          </button>
        ) : (
          <Link to="/seller/diamond" className="dof-cta">{btn}</Link>
        )}
        {note && <small className="dof-note">{note}</small>}
      </div>
    </section>
  );
}

/** Progress to the automatic reward. Hidden when the reward is off. */
export function RewardProgress({ progress, regular = 1500, compact = false }) {
  if (!progress?.enabled) return null;
  const p = progress;
  const ordersLeft = Math.max(0, p.ordersNeeded - p.orders);
  const daysLeft = Math.max(0, p.daysNeeded - p.days);
  const healthLow = p.score < p.healthMin;
  return (
    <div className={`dof-progress ${compact ? 'compact' : ''}`}>
      <div className="dof-progress-head">
        <span className="dof-kicker">🏆 Diamond reward</span>
        <b>
          {p.discount} — Diamond for {usd(p.price)} <s>{usd(regular)}</s>
        </b>
      </div>
      <div className="dof-bar-row">
        <span>Orders confirmed (last {p.daysNeeded} days)</span>
        <b>{p.orders} / {p.ordersNeeded}</b>
      </div>
      <div className="dof-bar"><i style={{ width: `${Math.min(100, (p.orders / p.ordersNeeded) * 100)}%` }} /></div>
      <div className="dof-bar-row">
        <span>Days in a row with great health ({p.healthMin}+)</span>
        <b>{p.days} / {p.daysNeeded}</b>
      </div>
      <div className="dof-bar"><i style={{ width: `${Math.min(100, (p.days / p.daysNeeded) * 100)}%` }} /></div>
      <p className="dof-progress-text">
        {p.nextAt
          ? `Your next reward can unlock from ${new Date(p.nextAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}. Keep going!`
          : healthLow
          ? `Bring your account health back to ${p.healthMin}+ to start counting days again.`
          : ordersLeft === 0 && daysLeft === 0
          ? 'Done! Your reward unlocks within the next few minutes.'
          : `${[ordersLeft ? `${ordersLeft} more order${ordersLeft === 1 ? '' : 's'}` : '', daysLeft ? `${daysLeft} more day${daysLeft === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ')} — then Diamond is ${usd(p.price)} for ${Math.round(p.hours / 24) >= 1 ? `${Math.round(p.hours / 24)} day${Math.round(p.hours / 24) === 1 ? '' : 's'}` : `${p.hours} hours`}.`}
      </p>
    </div>
  );
}

/** The store's own last 30 days: 20% vs 35%. */
export function OwnNumbers({ numbers, price }) {
  if (!numbers || !(numbers.orders > 0) || !(numbers.extra > 0)) return null;
  const perWeek = (numbers.extra / 30) * 7;
  const weeks = perWeek > 0 ? Math.max(1, Math.ceil(price / perWeek)) : null;
  return (
    <div className="dof-numbers">
      <span className="dof-kicker">With your own orders · last 30 days</span>
      <div className="dof-num-grid">
        <div><small>You earned (20%)</small><b>{usd(numbers.earned)}</b></div>
        <div><small>On Diamond (35%)</small><b className="g">{usd(numbers.diamond)}</b></div>
        <div><small>Extra per month</small><b className="g">+{usd(numbers.extra)}</b></div>
        {weeks && <div><small>Fee back in</small><b>~{weeks} week{weeks === 1 ? '' : 's'}</b></div>}
      </div>
      <p>Based on your {numbers.orders} delivered order{numbers.orders === 1 ? '' : 's'} of the last 30 days.</p>
    </div>
  );
}

/** "You earned it" — once for each personal offer (the layout hosts it). */
export function DiamondOfferPopup({ seller }) {
  const active = Boolean(seller) && seller.tier !== 'diamond' && seller.status === 'active';
  const [data] = useDiamondOffers(active);
  const [closedKey, setClosedKey] = useState('');
  const navigate = useNavigate();
  const offer = data?.offer;
  const show = active && offer?.personal && !offer.seen && closedKey !== offer.key && new Date(offer.endsAt) > new Date();
  useEffect(() => {
    if (!show) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  if (!show) return null;
  const seen = () => sapi('/sellers/tier/offer-seen', { method: 'POST', body: { key: offer.key } }).catch(() => {});
  const close = () => {
    setClosedKey(offer.key);
    seen();
  };
  const claim = () => {
    setClosedKey(offer.key);
    seen();
    navigate('/seller/diamond');
  };
  const leftMs = Math.max(0, new Date(offer.endsAt).getTime() - Date.now());
  const leftD = Math.floor(leftMs / 86400000);
  const leftH = Math.floor((leftMs % 86400000) / 3600000);
  const leftText = leftD > 0 ? `${leftD}d ${leftH}h left` : `${Math.max(1, leftH)}h left`;
  return createPortal(
    <div className="dof-pop-root" role="dialog" aria-modal="true" aria-labelledby="dof-pop-title">
      <button type="button" className="dof-pop-backdrop" onClick={close} aria-label="Close" tabIndex={-1} />
      <div className="dof-pop">
        <button type="button" className="dof-pop-x" onClick={close} aria-label="Close"><Ic name="x" size={18} /></button>
        <div className="dof-confetti" aria-hidden="true" />
        <div className="dof-gem" aria-hidden="true">💎</div>
        <span className="dof-pill">{offer.kind === 'milestone' ? '🏆 Milestone reached' : '🏆 You earned it'}</span>
        <h3 id="dof-pop-title">{usd(offer.save)} off Diamond — just for you</h3>
        <p className="dof-pop-text">
          {offer.kind === 'milestone'
            ? `You reached ${offer.title.replace(/ milestone$/, '')}. Here is your reward.`
            : 'Great account health and orders confirmed on time. Here is your reward.'}
        </p>
        <div className="dof-pop-price">
          <s>{usd(offer.regular)}</s>
          <b>{usd(offer.price)}</b>
        </div>
        <Countdown endsAt={offer.endsAt} tone="light" />
        <ul className="dof-perks">
          <li><Ic name="check" size={13} /> 35% profit on every new order (now 20%)</li>
          <li><Ic name="check" size={13} /> Fast 3–5 day shipping — we handle it</li>
          <li><Ic name="check" size={13} /> 72 hours to confirm orders</li>
        </ul>
        <button type="button" className="dof-cta big" onClick={claim}>💎 Claim my {usd(offer.price)} Diamond</button>
        <button type="button" className="dof-later" onClick={close}>Maybe later · {leftText}</button>
      </div>
    </div>,
    document.body
  );
}
