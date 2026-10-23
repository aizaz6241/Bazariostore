import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { sapi } from '../api.js';
import { getSocket } from '../socket.js';
import Ic from '../components/Icons.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';

/**
 * AT STAKE — the live banner on the dashboard and the orders page: each waiting order with a
 * countdown to its warning time / deadline, what the store loses if it waits (points, freeze, the
 * running bonus week, its level) and a one-tap Confirm / Deposit. Hidden when nothing is waiting.
 * Data: GET /api/sellers/health/at-stake.
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
const SHOW = 4;

export default function AtStake({ where = 'dashboard' }) {
  const { formatMoney } = useCurrency();
  const [d, setD] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [all, setAll] = useState(false);
  const timer = useRef(null);

  const load = useCallback(() => {
    sapi('/sellers/health/at-stake')
      .then((x) => setD(x))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const socket = getSocket();
    const onChange = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(load, 800);
    };
    const events = ['order:new', 'order:update', 'wallet:update', 'seller:health_update', 'seller:status_update'];
    events.forEach((e) => socket?.on(e, onChange));
    const tick = setInterval(() => setNow(Date.now()), 30000);
    const refresh = setInterval(load, 5 * 60000);
    return () => {
      events.forEach((e) => socket?.off(e, onChange));
      clearTimeout(timer.current);
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [load]);

  if (!d || !d.count) return null;

  const orders = [...d.orders].sort((a, b) => new Date(a.risk?.at || 0) - new Date(b.risk?.at || 0));
  const worst = orders.some((o) => o.stage === 'overdue') ? 'overdue' : orders.some((o) => o.stage === 'warning') ? 'warning' : 'ok';
  const tone = worst === 'ok' ? (d.shortBy > 0 ? 'amber' : 'calm') : 'red';
  const lose = Math.abs(d.pointsAtRisk || 0);
  const title =
    worst === 'overdue'
      ? 'Overdue — your score drops again every day'
      : worst === 'warning'
        ? 'Act now — a deadline is close'
        : d.shortBy > 0
          ? 'Deposit now to confirm on time'
          : `${d.count} order${d.count > 1 ? 's' : ''} waiting — confirm before the warning time`;
  const shown = all ? orders : orders.slice(0, SHOW);

  return (
    <section className={`ast tone-${tone} at-${where}`} aria-label="What is at stake">
      <div className="ast-head">
        <span className="ast-ico">
          <Ic name={tone === 'calm' ? 'clock' : 'alert'} size={18} />
        </span>
        <div className="ast-title">
          <b>{title}</b>
          <p>
            Waiting too long can cost you{' '}
            {lose > 0 && <em className="ast-chip neg">−{lose} points</em>}
            {d.freeze && <em className="ast-chip neg">store freeze</em>}
            {d.bonus && (
              <em className="ast-chip gold">
                ${d.bonus.amount} bonus · day {d.bonus.day}/{d.bonus.days}
              </em>
            )}
            {d.level?.dropTo && (
              <em className="ast-chip lvl">
                {d.level.icon} {d.level.label} → {d.level.dropTo.icon} {d.level.dropTo.label}
              </em>
            )}
          </p>
        </div>
        <div className="ast-score" title="Your score now → if these orders miss their deadline">
          <span>{d.score}</span>
          <i>→</i>
          <span className="neg">{d.scoreIfMissed}</span>
        </div>
      </div>

      {d.shortBy > 0 && (
        <div className="ast-short">
          <Ic name="wallet" size={16} />
          <p>
            Your wallet is short by <b>{formatMoney(d.shortBy)}</b> for {d.count > 1 ? 'these orders' : 'this order'}
            {d.waitingDeposits > 0 && <span> (your deposit of {formatMoney(d.waitingDeposits)} waiting for approval is counted)</span>}.
          </p>
          <Link to={`/seller/wallet?tab=deposit&amount=${d.shortBy}`} className="ast-btn dep">
            <Ic name="banknote" size={14} /> Deposit {formatMoney(d.shortBy)}
          </Link>
        </div>
      )}

      <ul className="ast-list">
        {shown.map((o) => {
          const left = new Date(o.risk?.at || 0).getTime() - now;
          return (
            <li key={o.id} className={`st-${o.stage}`}>
              <div className="ast-ord">
                <b>#{o.orderNumber}</b>
                <span>{formatMoney(o.value)}</span>
              </div>
              <div className="ast-when">
                {o.stage === 'ok' && (
                  <>
                    <strong>{span(left)}</strong> left to confirm on time <small>(after that {o.risk.points} points)</small>
                  </>
                )}
                {o.stage === 'warning' && (
                  <>
                    Deadline in <strong>{span(left)}</strong> <small>({o.risk.points} points and store freeze)</small>
                  </>
                )}
                {o.stage === 'overdue' && (
                  <>
                    Overdue — <strong>{o.risk.points} again in {span(left)}</strong>
                  </>
                )}
              </div>
              <Link to={`/seller/orders?open=${o.id}`} className="ast-btn">
                Confirm
              </Link>
            </li>
          );
        })}
      </ul>
      {orders.length > SHOW && (
        <button type="button" className="ast-more" onClick={() => setAll((x) => !x)}>
          {all ? 'Show less' : `Show all ${orders.length} orders`}
        </button>
      )}
    </section>
  );
}
