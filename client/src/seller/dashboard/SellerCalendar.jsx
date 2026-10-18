import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { sapi } from '../../api.js';
import Ic from '../../components/Icons.jsx';
import { useCurrency } from '../../context/CurrencyContext.jsx';
import { dayKey, monthKey, longDay, timeOf, makeCompact, statusMeta, isClosed } from './dashUtils.js';

/**
 * Store Calendar — the store's month, day by day (same idea as "My Calendar" in the team portal).
 *
 * A day's cell is shaded by that day's sales (darker = more), with the sales total under the date.
 * Dots mark money that really moved that day: profit credited (green), deposit approved (amber),
 * payout sent (violet). Tapping a day opens every order and wallet movement of that day.
 * Days are the seller's own days (grouped in the browser, not in UTC).
 */
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function SellerCalendar({ refreshKey = 0, storeSince }) {
  const { formatMoney, convert, currentCurrency } = useCurrency();
  const compact = useMemo(() => makeCompact(convert, currentCurrency.symbol), [convert, currentCurrency.symbol]);
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const cache = useRef(new Map());
  const reqNo = useRef(0);
  const mKey = monthKey(month);

  const load = useCallback(async (force = false) => {
    const key = monthKey(month);
    if (!force && cache.current.has(key)) {
      setData(cache.current.get(key));
      setLoading(false);
      return;
    }
    const mine = ++reqNo.current;
    if (!cache.current.has(key)) setLoading(true);
    try {
      const from = new Date(month.getFullYear(), month.getMonth(), 1);
      const to = new Date(month.getFullYear(), month.getMonth() + 1, 1, 0, 0, 0, -1);
      const res = await sapi(`/sellers/dashboard/activity?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`);
      if (mine !== reqNo.current) return;
      cache.current.set(key, res);
      setData(res);
      setError('');
    } catch (e) {
      if (mine === reqNo.current) setError(e.message || 'Could not load the calendar');
    } finally {
      if (mine === reqNo.current) setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(false); }, [load]);
  // live update (new order, payout…) — only the month on screen is fetched again
  useEffect(() => {
    if (!refreshKey) return;
    cache.current.clear();
    load(true);
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const byDay = useMemo(() => {
    const map = new Map();
    const get = (k) => {
      if (!map.has(k)) map.set(k, { sales: 0, orders: [], profit: 0, deposit: 0, payout: 0, money: [] });
      return map.get(k);
    };
    for (const o of data?.orders || []) {
      const d = get(dayKey(o.t));
      d.orders.push(o);
      if (!isClosed(o.status)) d.sales += o.total;
    }
    for (const m of data?.money || []) {
      const d = get(dayKey(m.t));
      d.money.push(m);
      if (m.type === 'order_delivered_release') d.profit += m.profit;
      else if (m.type === 'deposit') d.deposit += m.amount;
      else if (m.type === 'withdrawal') d.payout += m.amount;
    }
    return map;
  }, [data]);

  const totals = useMemo(() => {
    let sales = 0, orders = 0, profit = 0, payout = 0, deposit = 0, activeDays = 0, max = 0, best = null;
    for (const [k, d] of byDay) {
      sales += d.sales;
      orders += d.orders.length;
      profit += d.profit;
      payout += d.payout;
      deposit += d.deposit;
      if (d.orders.length) activeDays++;
      if (d.sales > max) { max = d.sales; best = k; }
    }
    return { sales, orders, profit, payout, deposit, activeDays, max, best };
  }, [byDay]);

  const today = dayKey(new Date());
  const thisMonth = monthKey(new Date());
  const firstMonth = storeSince ? monthKey(new Date(storeSince)) : '2024-01';
  const canBack = mKey > firstMonth;
  const canForward = mKey < thisMonth;

  const cells = useMemo(() => {
    const y = month.getFullYear();
    const m = month.getMonth();
    const lead = (new Date(y, m, 1).getDay() + 6) % 7;
    const count = new Date(y, m + 1, 0).getDate();
    const list = [];
    for (let i = 0; i < lead; i++) list.push(null);
    for (let d = 1; d <= count; d++) list.push({ d, key: `${mKey}-${String(d).padStart(2, '0')}` });
    while (list.length % 7) list.push(null);
    return list;
  }, [month, mKey]);

  const closePanel = useCallback(() => setSelected(''), []);
  const move = (n) => {
    setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
    setSelected('');
  };
  const level = (sales) => {
    if (!sales || !totals.max) return 0;
    const r = sales / totals.max;
    return r > 0.75 ? 4 : r > 0.45 ? 3 : r > 0.2 ? 2 : 1;
  };
  const monthName = month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <section className="sd-card sd-cal" aria-label="Store calendar">
      <div className="sd-card-head">
        <div>
          <h3 className="sd-card-title"><Ic name="clock" size={16} /> Store Calendar</h3>
          <p className="sd-card-sub">Sales, profit and payouts day by day. Tap a day to see everything that happened.</p>
        </div>
        <div className="sd-cal-nav">
          <button type="button" onClick={() => move(-1)} disabled={!canBack} aria-label="Previous month"><Ic name="chevLeft" size={16} /></button>
          <span aria-live="polite">{monthName}</span>
          <button type="button" onClick={() => move(1)} disabled={!canForward} aria-label="Next month"><Ic name="chevRight" size={16} /></button>
          {mKey !== thisMonth && (
            <button type="button" className="sd-cal-today" onClick={() => { const n = new Date(); setMonth(new Date(n.getFullYear(), n.getMonth(), 1)); }}>Today</button>
          )}
        </div>
      </div>

      <div className="sd-cal-summary">
        <div><span>Sales</span><b className="t-blue">{formatMoney(totals.sales)}</b></div>
        <div><span>Orders</span><b>{totals.orders}</b></div>
        <div><span>Profit credited</span><b className="t-green">{formatMoney(totals.profit)}</b></div>
        <div><span>Payouts</span><b className="t-violet">{formatMoney(totals.payout)}</b></div>
        <div><span>Best day</span><b>{totals.best ? `${Number(totals.best.slice(8))} · ${compact(totals.max)}` : '—'}</b></div>
      </div>

      {error && (
        <div className="sd-inline-error">
          <span>{error}</span>
          <button type="button" onClick={() => load(true)}>Try again</button>
        </div>
      )}

      <div className={`sd-cal-grid ${loading ? 'is-loading' : ''}`}>
        {WEEKDAYS.map((w) => <div key={w} className="sd-cal-wd">{w}</div>)}
        {cells.map((c, i) => {
          if (!c) return <div key={`x${i}`} className="sd-cal-blank" aria-hidden="true" />;
          const d = byDay.get(c.key);
          const lv = level(d?.sales);
          const future = c.key > today;
          const hasOrders = d?.orders.length > 0;
          return (
            <button
              key={c.key}
              type="button"
              disabled={future}
              onClick={() => setSelected(c.key)}
              className={`sd-cal-cell lv-${lv} ${c.key === today ? 'is-today' : ''} ${future ? 'is-future' : ''} ${selected === c.key ? 'is-selected' : ''}`}
              aria-label={`${longDay(c.key)}: ${hasOrders ? `${d.orders.length} orders, ${formatMoney(d.sales)} sales` : 'no orders'}`}
            >
              <span className="sd-cal-d">{c.d}</span>
              {d?.sales > 0 && <span className="sd-cal-v">{compact(d.sales)}</span>}
              {hasOrders && !(d.sales > 0) && <span className="sd-cal-v muted">{d.orders.length} ord</span>}
              <span className="sd-cal-dots">
                {d?.profit > 0 && <i className="dot green" />}
                {d?.deposit > 0 && <i className="dot amber" />}
                {d?.payout > 0 && <i className="dot violet" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="sd-cal-legend">
        <span><i className="sw lv-1" /><i className="sw lv-2" /><i className="sw lv-3" /><i className="sw lv-4" /> Sales (darker = more)</span>
        <span><i className="dot green" /> Profit credited</span>
        <span><i className="dot amber" /> Deposit</span>
        <span><i className="dot violet" /> Payout</span>
        <span><i className="ring" /> Today</span>
      </div>

      <DayPanel
        dayKeyValue={selected}
        day={selected ? byDay.get(selected) : null}
        onClose={closePanel}
        formatMoney={formatMoney}
      />
    </section>
  );
}

function DayPanel({ dayKeyValue, day, onClose, formatMoney }) {
  const open = Boolean(dayKeyValue);
  const [shown, setShown] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) { setShown(false); return undefined; }
    const id = requestAnimationFrame(() => setShown(true));
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = before;
    };
  }, [open, onClose]);

  if (!open) return null;
  const orders = day?.orders || [];
  const money = day?.money || [];
  const moneyLabel = { order_delivered_release: 'Order payout', deposit: 'Deposit approved', withdrawal: 'Payout sent' };

  return createPortal(
    <div className="sd-panel-root" role="dialog" aria-modal="true" aria-label={longDay(dayKeyValue)}>
      <button type="button" className={`sd-panel-backdrop ${shown ? 'on' : ''}`} onClick={onClose} aria-label="Close" tabIndex={-1} />
      <aside className={`sd-panel ${shown ? 'on' : ''}`}>
        <header className="sd-panel-head">
          <div>
            <p className="sd-eyebrow">{dayKeyValue === dayKey(new Date()) ? 'Today' : 'Day details'}</p>
            <h3>{longDay(dayKeyValue)}</h3>
          </div>
          <button ref={closeRef} type="button" className="sd-icon-btn" onClick={onClose} aria-label="Close"><Ic name="x" size={18} /></button>
        </header>

        <div className="sd-panel-stats">
          <div><span>Sales</span><b className="t-blue">{formatMoney(day?.sales || 0)}</b></div>
          <div><span>Orders</span><b>{orders.length}</b></div>
          <div><span>Profit credited</span><b className="t-green">{formatMoney(day?.profit || 0)}</b></div>
          <div><span>Payouts</span><b className="t-violet">{formatMoney(day?.payout || 0)}</b></div>
        </div>

        <div className="sd-panel-body">
          {orders.length === 0 && money.length === 0 && <p className="sd-empty">Nothing happened in your store on this day.</p>}

          {orders.length > 0 && (
            <>
              <h4 className="sd-panel-h">Orders ({orders.length})</h4>
              <ul className="sd-panel-list">
                {orders.map((o) => {
                  const st = statusMeta(o.status);
                  return (
                    <li key={o.id}>
                      <div className="sd-pl-main">
                        <b>#{o.n}</b>
                        <small>{timeOf(o.t)}{o.city ? ` · ${o.city}` : ''}</small>
                        <small className="sd-pl-items">{o.items.join(', ')}</small>
                      </div>
                      <div className="sd-pl-side">
                        <b className={isClosed(o.status) ? 't-muted strike' : ''}>{formatMoney(o.total)}</b>
                        <span className={`sd-tag tone-${st.tone}`}>{st.label}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {money.length > 0 && (
            <>
              <h4 className="sd-panel-h">Wallet movements ({money.length})</h4>
              <ul className="sd-panel-list">
                {money.map((m) => (
                  <li key={m.id}>
                    <div className="sd-pl-main">
                      <b>{moneyLabel[m.type] || 'Wallet'}</b>
                      <small>{timeOf(m.t)}{m.n ? ` · #${m.n}` : ''}</small>
                      {m.type === 'order_delivered_release' && m.profit > 0 && <small className="t-green">incl. {formatMoney(m.profit)} profit</small>}
                    </div>
                    <div className="sd-pl-side">
                      <b className={m.type === 'withdrawal' ? 't-violet' : 't-green'}>{m.type === 'withdrawal' ? '−' : '+'}{formatMoney(m.amount)}</b>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <footer className="sd-panel-foot">
          <Link to="/seller/orders" className="sd-btn sd-btn-ghost">All orders</Link>
          <Link to="/seller/wallet?tab=ledger" className="sd-btn sd-btn-ghost">Wallet ledger</Link>
        </footer>
      </aside>
    </div>,
    document.body
  );
}
