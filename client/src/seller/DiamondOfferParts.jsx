import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { sapi } from '../api.js';
import Ic from '../components/Icons.jsx';
import { getSocket } from '../socket.js';

/**
 * 💎 Diamond offers on the seller side (server: utils/diamondOffers.js).
 * Design: an offer is a voucher — a clean card with a torn-off price stub (old price, new price,
 * time left). Quiet everywhere else: white cards, one teal accent, gold only for "reward".
 *   useDiamondOffers()   the /sellers/tier answer's `offers` part, refreshed on a notification
 *   OfferCard            the voucher (dashboard + Diamond page)
 *   RewardProgress       how close the store is to its reward (orders + days of great health)
 *   OwnNumbers           the store's last 30 days: what Basic paid vs what Diamond would have paid
 *   DiamondOfferPopup    "You earned $500 off Diamond" — once per personal offer (layout)
 * Prices are US dollars (the Diamond fee is set in dollars).
 */
export const usd = (n) => {
  const v = Math.round(Number(n || 0) * 100) / 100;
  const d = Number.isInteger(v) ? 0 : 2;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};
const fmtWhen = (d) =>
  new Date(d).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

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

/** "2d 22h 59m" — seconds only in the last day. */
function useTimeLeft(endsAt, onEnd) {
  const now = useNow(1000);
  const left = Math.max(0, new Date(endsAt).getTime() - now);
  useEffect(() => {
    if (left === 0 && onEnd) onEnd();
  }, [left === 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = Math.floor(left / 86400000);
  const h = Math.floor((left % 86400000) / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  const s = Math.floor((left % 60000) / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const text = d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m` : `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
  return { left, text, urgent: left < 24 * 3600000 };
}

export function Countdown({ endsAt, onEnd }) {
  const t = useTimeLeft(endsAt, onEnd);
  return (
    <span className={`dvo-count ${t.urgent ? 'is-urgent' : ''}`} role="timer">
      {t.text}
    </span>
  );
}

const Gem = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="dvo-gem">
    <path d="M6.5 3h11l4 5.5L12 21 2.5 8.5 6.5 3Z" fill="currentColor" opacity="0.18" />
    <path d="M6.5 3h11l4 5.5L12 21 2.5 8.5 6.5 3ZM2.5 8.5h19M9 3l3 18M15 3l-3 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

/** The voucher: what it is on the left, the price stub with the time left on the right. */
export function OfferCard({ offer, variant = 'page', onClaim, busy, disabled, note, onEnd }) {
  if (!offer) return null;
  const fest = Boolean(offer.festival) && !offer.personal;
  const combined = Boolean(offer.festival) && offer.personal;
  const label = fest ? `${offer.festival.emoji || ''} ${offer.festival.name} offer`.trim() : combined ? `Your reward + ${offer.festival.name} price` : offer.kind === 'milestone' ? 'Milestone reward' : 'Your reward';
  const title = fest ? `Diamond is ${usd(offer.save)} cheaper for ${offer.festival.name}` : `You earned ${usd(offer.save)} off Diamond`;
  const cta = `Upgrade for ${usd(offer.price)}`;
  return (
    <section className={`dvo ${variant} ${fest ? 'is-fest' : ''}`} aria-label="Diamond offer">
      <div className="dvo-main">
        <p className="dvo-tag">
          <Gem size={15} /> {label}
        </p>
        <h2>{title}</h2>
        <p className="dvo-sub">
          Keep 35% of every new order instead of 20%, ship in 3–5 days and get 72 hours to confirm. One payment, Diamond for life.
        </p>
        <div className="dvo-actions">
          {onClaim ? (
            <button type="button" className="dvo-btn" onClick={onClaim} disabled={busy || disabled}>
              {busy ? 'Sending…' : cta}
            </button>
          ) : (
            <Link to="/seller/diamond" className="dvo-btn">{cta}</Link>
          )}
          {note && <span className="dvo-fine">{note}</span>}
        </div>
      </div>
      <div className="dvo-stub">
        <span className="dvo-was">{usd(offer.regular)}</span>
        <span className="dvo-price">{usd(offer.price)}</span>
        <span className="dvo-save">You save {usd(offer.save)}</span>
        <div className="dvo-time">
          <Countdown endsAt={offer.endsAt} onEnd={onEnd} />
          <span>left, ends {fmtWhen(offer.endsAt)}</span>
        </div>
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
  const days = Math.round(p.hours / 24);
  const lasts = days >= 1 ? `${days} day${days === 1 ? '' : 's'}` : `${p.hours} hours`;
  const status = p.nextAt
    ? `Your next reward can unlock from ${new Date(p.nextAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.`
    : healthLow
    ? `Bring your account health back to ${p.healthMin} to start counting days again.`
    : ordersLeft === 0 && daysLeft === 0
    ? 'Both goals reached. Your reward unlocks in the next few minutes.'
    : `${[ordersLeft ? `${ordersLeft} more order${ordersLeft === 1 ? '' : 's'}` : '', daysLeft ? `${daysLeft} more day${daysLeft === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ')} to go.`;
  const Goal = ({ label, value, need }) => (
    <div className="dvp-goal">
      <div className="dvp-goal-top">
        <span>{label}</span>
        <b>
          {value} <small>of {need}</small>
        </b>
      </div>
      <div className="dvp-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (value / need) * 100)}%` }} /></div>
    </div>
  );
  return (
    <div className={`dvp ${compact ? 'compact' : ''}`}>
      <div className="dvp-head">
        <h3>
          <Gem size={16} /> Unlock {usd(regular - p.price)} off Diamond
        </h3>
        <p>
          Reach both goals and Diamond costs {usd(p.price)} instead of {usd(regular)} for {lasts}.
        </p>
      </div>
      <div className="dvp-goals">
        <Goal label={`Orders confirmed in the last ${p.daysNeeded} days`} value={p.orders} need={p.ordersNeeded} />
        <Goal label={`Days in a row with health ${p.healthMin}+`} value={p.days} need={p.daysNeeded} />
      </div>
      <p className="dvp-status">{status}</p>
    </div>
  );
}

/** The store's own last 30 days: Basic vs Diamond. */
export function OwnNumbers({ numbers, price }) {
  if (!numbers || !(numbers.orders > 0) || !(numbers.extra > 0)) return null;
  const perWeek = (numbers.extra / 30) * 7;
  const weeks = perWeek > 0 ? Math.max(1, Math.ceil(price / perWeek)) : null;
  const max = Math.max(numbers.diamond, numbers.earned, 1);
  return (
    <div className="dvn">
      <div className="dvn-head">
        <h3>What Diamond would have paid you</h3>
        <p>Your {numbers.orders} delivered order{numbers.orders === 1 ? '' : 's'} from the last 30 days.</p>
      </div>
      <div className="dvn-bars">
        <div className="dvn-row">
          <span className="dvn-label">Basic, 20%</span>
          <div className="dvn-track"><i style={{ width: `${(numbers.earned / max) * 100}%` }} /></div>
          <b>{usd(numbers.earned)}</b>
        </div>
        <div className="dvn-row is-dia">
          <span className="dvn-label">Diamond, 35%</span>
          <div className="dvn-track"><i style={{ width: `${(numbers.diamond / max) * 100}%` }} /></div>
          <b>{usd(numbers.diamond)}</b>
        </div>
      </div>
      <p className="dvn-sum">
        That is <b>{usd(numbers.extra)} more</b> a month on the same orders{weeks ? `. At this pace the ${usd(price)} fee comes back in about ${weeks} week${weeks === 1 ? '' : 's'}.` : '.'}
      </p>
    </div>
  );
}

/** "You earned $500 off Diamond" — once for each personal offer (the layout hosts it). */
export function DiamondOfferPopup({ seller }) {
  const active = Boolean(seller) && seller.tier !== 'diamond' && seller.status === 'active';
  const [data] = useDiamondOffers(active);
  const [closedKey, setClosedKey] = useState('');
  const navigate = useNavigate();
  const offer = data?.offer;
  const show = active && offer?.personal && !offer.seen && closedKey !== offer.key && new Date(offer.endsAt) > new Date();
  const seen = () => offer && sapi('/sellers/tier/offer-seen', { method: 'POST', body: { key: offer.key } }).catch(() => {});
  const close = () => {
    setClosedKey(offer.key);
    seen();
  };
  useEffect(() => {
    if (!show) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  if (!show) return null;
  const claim = () => {
    setClosedKey(offer.key);
    seen();
    navigate('/seller/diamond');
  };
  return createPortal(
    <div className="dvx-root" role="dialog" aria-modal="true" aria-labelledby="dvx-title">
      <button type="button" className="dvx-backdrop" onClick={close} aria-label="Close" tabIndex={-1} />
      <div className="dvx">
        <button type="button" className="dvx-close" onClick={close} aria-label="Close"><Ic name="x" size={18} /></button>
        <div className="dvx-mark"><Gem size={30} /></div>
        <p className="dvx-kicker">{offer.kind === 'milestone' ? `You reached ${offer.title.replace(/ milestone$/, '')}` : 'Great health and orders on time'}</p>
        <h3 id="dvx-title">You earned {usd(offer.save)} off Diamond</h3>
        <div className="dvx-ticket">
          <div>
            <span className="dvo-was">{usd(offer.regular)}</span>
            <span className="dvx-price">{usd(offer.price)}</span>
          </div>
          <div className="dvx-left">
            <Countdown endsAt={offer.endsAt} />
            <span>left to use it</span>
          </div>
        </div>
        <ul className="dvx-perks">
          <li><Ic name="check" size={14} /> 35% profit on every new order, not 20%</li>
          <li><Ic name="check" size={14} /> Fast 3–5 day shipping, arranged by us</li>
          <li><Ic name="check" size={14} /> 72 hours to confirm each order</li>
        </ul>
        <button type="button" className="dvo-btn dvx-cta" onClick={claim}>Upgrade for {usd(offer.price)}</button>
        <button type="button" className="dvx-later" onClick={close}>Maybe later</button>
      </div>
    </div>,
    document.body
  );
}
