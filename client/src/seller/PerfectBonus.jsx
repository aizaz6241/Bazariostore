import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fmtDate } from '../api.js';
import Ic from '../components/Icons.jsx';

/**
 * Perfect Health Bonus: $X to the wallet for every N days the store stays at 100/100.
 * `bonus` comes from GET /api/sellers/health (perfectBonus). Full card on the Account Health page,
 * `compact` inside the dashboard's health card.
 */
const span = (ms) => {
  const m = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${min}m`;
  return `${min}m`;
};
const money = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

export default function PerfectBonus({ bonus, score, nextBack, compact = false }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 60000);
    return () => clearInterval(t);
  }, []);
  if (!bonus || !bonus.enabled) return null;

  const now = Date.now();
  const running = bonus.running && bonus.since;
  const total = bonus.days * 86400000;
  const done = running ? Math.min(total, now - new Date(bonus.since).getTime()) : 0;
  const pct = running ? Math.round((done / total) * 100) : 0;
  const left = running ? Math.max(0, new Date(bonus.endsAt).getTime() - now) : 0;
  const ordersOk = bonus.ordersInWeek >= bonus.minOrders;
  const daysDone = Math.floor(done / 86400000);

  if (compact) {
    return (
      <div className={`pb-mini ${running ? 'on' : 'off'}`}>
        <div className="pb-mini-top">
          <span>
            <Ic name="gift" size={14} /> Perfect health bonus
          </span>
          <b>{money(bonus.amount)}</b>
        </div>
        {running ? (
          <>
            <div className="pb-bar">
              <i style={{ width: `${pct}%` }} />
            </div>
            <small>
              {left > 0 ? `${money(bonus.amount)} in ${span(left)}` : 'Paid within the next minutes'}
              {!ordersOk && ` · needs ${bonus.minOrders} confirmed order${bonus.minOrders > 1 ? 's' : ''}`}
            </small>
          </>
        ) : (
          <small>Paused — reach 100/100 to start a new {bonus.days}-day week.</small>
        )}
        <Link to="/seller/health" className="pb-mini-link">
          Details →
        </Link>
      </div>
    );
  }

  return (
    <section className={`sh-card pb ${running ? 'on' : 'off'}`}>
      <div className="pb-head">
        <span className="pb-ico">
          <Ic name="gift" size={20} />
        </span>
        <div className="pb-title">
          <h3>Perfect Health Bonus</h3>
          <p>
            Keep your account health at <b>100/100</b> for <b>{bonus.days} days</b> in a row and get <b>{money(bonus.amount)}</b> in your wallet — every week.
          </p>
        </div>
        <div className="pb-amount">
          <b>{money(bonus.amount)}</b>
          <span>every {bonus.days} days</span>
        </div>
      </div>

      {running ? (
        <div className="pb-progress">
          <div className="pb-row">
            <b>
              Day {Math.min(bonus.days, daysDone + 1)} of {bonus.days}
            </b>
            <span>{left > 0 ? `${money(bonus.amount)} in ${span(left)} · ${fmtDate(bonus.endsAt)}` : 'Your bonus is being paid'}</span>
          </div>
          <div className="pb-bar lg">
            <i style={{ width: `${pct}%` }} />
          </div>
          <div className="pb-days">
            {Array.from({ length: bonus.days }).map((_, i) => (
              <span key={i} className={i < daysDone ? 'done' : i === daysDone ? 'now' : ''} />
            ))}
          </div>
        </div>
      ) : (
        <div className="pb-paused">
          <Ic name="clock" size={16} />
          <p>
            <b>Bonus week paused.</b> Your score is {score}/100. A new {bonus.days}-day week starts as soon as you are back at 100
            {nextBack ? ` — your next points come back on ${fmtDate(nextBack)}` : ''}.
          </p>
        </div>
      )}

      <ul className="pb-checks">
        <li className={score === 100 ? 'ok' : 'no'}>
          <Ic name={score === 100 ? 'checkCircle' : 'x'} size={15} /> Score stays 100/100 (no penalty in the week)
        </li>
        <li className={ordersOk ? 'ok' : 'no'}>
          <Ic name={ordersOk ? 'checkCircle' : 'clock'} size={15} /> At least {bonus.minOrders} confirmed order{bonus.minOrders > 1 ? 's' : ''} this week
          <em>{bonus.ordersInWeek} so far</em>
        </li>
        <li className="ok">
          <Ic name="wallet" size={15} /> Paid straight to your wallet balance
        </li>
      </ul>

      <div className="pb-foot">
        <div>
          <span>Total earned</span>
          <b>{money(bonus.totalEarned)}</b>
          <small>
            {bonus.count} bonus{bonus.count === 1 ? '' : 'es'}
          </small>
        </div>
        <div>
          <span>Last bonus</span>
          <b>{bonus.lastAt ? fmtDate(bonus.lastAt) : '—'}</b>
          <small>{bonus.recent?.length ? `${money(bonus.recent[0].amount)} added` : 'Not yet'}</small>
        </div>
      </div>
    </section>
  );
}
