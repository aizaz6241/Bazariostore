import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sapi, fmtDate } from '../api.js';
import { getSocket } from '../socket.js';
import Ic from '../components/Icons.jsx';

/**
 * CLOSE STORE — the store asks to close (server: utils/storeClosure.js).
 * Requirements → request → 7-day review (every order confirmed on time) → closed (no new orders).
 */
const STEPS = [
  { t: 'Meet the requirements', d: 'Health 90+, no late order in the last 7 days, store not frozen.' },
  { t: '7-day closing review', d: 'You still get orders. Confirm every one on time — a late order restarts the 7 days.' },
  { t: 'Store closed', d: 'No new orders. Confirmed orders are still delivered and paid.' },
];

export default function SellerCloseStore() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelAsk, setCancelAsk] = useState(false);

  const load = useCallback(() => {
    sapi('/sellers/store-closure')
      .then((d) => {
        setData(d);
        setErr('');
      })
      .catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    load();
    const socket = getSocket();
    const events = ['closure:changed', 'seller:health_update', 'order:new', 'order:update', 'seller:status_update'];
    events.forEach((e) => socket?.on(e, load));
    const t = setInterval(load, 5 * 60000);
    return () => {
      events.forEach((e) => socket?.off(e, load));
      clearInterval(t);
    };
  }, [load]);

  const apply = async () => {
    setBusy(true);
    setErr('');
    try {
      const d = await sapi('/sellers/store-closure/apply', { method: 'POST', body: { reason } });
      setData(d);
      setConfirming(false);
      setMsg('Your closing review has started.');
    } catch (e) {
      setErr(e.message);
      load();
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    setErr('');
    try {
      const d = await sapi('/sellers/store-closure/cancel', { method: 'POST' });
      setData(d);
      setCancelAsk(false);
      setMsg('Your request was withdrawn. Your store stays open.');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <div className="cs">
        <div className="cs-card cs-muted">{err ? <><Ic name="alert" size={16} /> {err}</> : 'Loading…'}</div>
      </div>
    );
  }

  const st = data.status;
  const r = data.review;
  const stepNow = st === 'closed' ? 2 : st === 'review' ? 1 : 0;

  return (
    <div className="cs">
      <header className="cs-head">
        <h1>
          <Ic name="lock" size={22} /> Close store
        </h1>
        <p>Closing your store stops new orders. Your login, wallet and payouts stay — nothing is deleted.</p>
      </header>

      <ol className="cs-steps">
        {STEPS.map((s, i) => (
          <li key={s.t} className={`${i < stepNow ? 'done' : ''} ${i === stepNow ? 'now' : ''}`}>
            <span className="cs-step-n">{i < stepNow ? '✓' : i + 1}</span>
            <div>
              <b>{s.t}</b>
              <small>{s.d}</small>
            </div>
          </li>
        ))}
      </ol>

      {msg && <div className="cs-ok">{msg}</div>}
      {err && (
        <div className="cs-err">
          <Ic name="alert" size={15} /> {err}
        </div>
      )}

      {st === 'closed' && (
        <section className="cs-card cs-closed">
          <span className="cs-big-ico">🏁</span>
          <div>
            <h3>Your store is closed</h3>
            <p>
              Closed on <b>{fmtDate(data.closedAt)}</b>. You get no new orders. Orders that were already confirmed are still delivered and paid, and your wallet and
              payouts work as normal.
            </p>
            <p className="cs-sub">
              Want to open it again? <Link to="/seller/support">Contact support</Link>.
            </p>
          </div>
        </section>
      )}

      {st === 'review' && r && (
        <section className="cs-card cs-review">
          <div className="cs-review-head">
            <div>
              <span className="cs-kicker">Closing review</span>
              <h3>
                Day {r.day} of {r.days}
              </h3>
              <p>
                Ends <b>{fmtDate(r.endsAt)}</b>. Your store closes after that, as soon as no order is waiting for your confirmation.
              </p>
            </div>
          </div>
          <div className="cs-bar">
            <i style={{ width: `${Math.max(4, r.progress)}%` }} />
          </div>
          <div className="cs-stats">
            <div>
              <span>Orders during the review</span>
              <b>{r.ordersInReview}</b>
            </div>
            <div>
              <span>Waiting for your confirmation</span>
              <b className={r.waiting ? 't-amber' : ''}>{r.waiting}</b>
            </div>
            <div>
              <span>Account health</span>
              <b className={r.score < data.minHealth ? 't-red' : 't-green'}>{r.score}/100</b>
            </div>
          </div>
          {r.restarts > 0 && r.lastRestartNote && (
            <p className="cs-note cs-restart">
              <Ic name="refresh" size={14} /> <b>The 7 days restarted{r.restarts > 1 ? ` (${r.restarts} times)` : ''}:</b> {r.lastRestartNote} New end date: {fmtDate(r.endsAt)}.
            </p>
          )}
          {r.waitingForOrders && (
            <p className="cs-note">
              <Ic name="clock" size={14} /> The 7 days are over — confirm your waiting order{r.waiting > 1 ? 's' : ''} and the store closes right after.
            </p>
          )}
          <ul className="cs-rules">
            <li>You keep getting orders during the review. Confirm every one before its warning time.</li>
            <li className="warn">A late or missed order (deadline crossed) restarts the 7 days from that moment. You get an email each time.</li>
            <li className="warn">If your account health falls below {data.minHealth}, the review ends and you go back to the requirements. Meet them again, then ask again.</li>
            <li className="warn">If the store is frozen or suspended, the review ends and the store stays open.</li>
          </ul>
          {r.waiting > 0 && (
            <Link to="/seller/orders" className="cs-btn ghost">
              <Ic name="package" size={15} /> Go to my orders
            </Link>
          )}
          {!cancelAsk ? (
            <button type="button" className="cs-link-btn" onClick={() => setCancelAsk(true)}>
              Cancel my closing request
            </button>
          ) : (
            <div className="cs-confirm">
              <p>Withdraw your request? Your store stays open and keeps getting orders.</p>
              <div>
                <button type="button" className="cs-btn ghost" onClick={() => setCancelAsk(false)} disabled={busy}>
                  Keep the request
                </button>
                <button type="button" className="cs-btn danger" onClick={cancel} disabled={busy}>
                  {busy ? 'Please wait…' : 'Yes, withdraw'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {!['review', 'closed'].includes(st) && (
        <>
          {['failed', 'rejected', 'cancelled'].includes(st) && data.endNote && (
            <div className={`cs-last ${st}`}>
              <b>{st === 'failed' ? 'Your last closing review ended' : st === 'rejected' ? 'Your last request was rejected' : 'You withdrew your last request'}</b>
              <span>
                {data.endNote}
                {data.endedAt ? ` · ${fmtDate(data.endedAt)}` : ''}
              </span>
            </div>
          )}

          <section className="cs-card">
            <h3 className="cs-h">Requirements</h3>
            <ul className="cs-checks">
              {data.checks.map((c) => (
                <li key={c.key} className={c.ok ? 'ok' : 'no'}>
                  <span className="cs-ck">{c.ok ? <Ic name="check" size={14} /> : <Ic name="x" size={14} />}</span>
                  <div>
                    <b>{c.label}</b>
                    {c.detail && <small>{c.detail}</small>}
                  </div>
                </li>
              ))}
            </ul>
            {!data.eligible && <p className="cs-sub">Every requirement must be met before you can ask. The list updates by itself.</p>}
          </section>

          {data.retryAt ? (
          <section className="cs-card cs-wait">
            <h3 className="cs-h">Ask to close your store</h3>
            <p className="cs-wait-big">
              <Ic name="clock" size={16} /> You can try again in {Math.max(1, Math.ceil((new Date(data.retryAt).getTime() - Date.now()) / 86400000))} day
              {Math.ceil((new Date(data.retryAt).getTime() - Date.now()) / 86400000) > 1 ? 's' : ''}
            </p>
            <p className="cs-sub">
              Your last request was rejected. We keep monitoring your store for {data.rejectWaitDays} days. From <b>{fmtDate(data.retryAt)}</b>, if every requirement is met, you can ask again and the 7-day review starts again.
            </p>
          </section>
          ) : (
          <section className="cs-card">
            <h3 className="cs-h">Ask to close your store</h3>
            <label className="cs-field">
              <span>
                Why are you closing? <em>(optional)</em>
              </span>
              <textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="A short note for the Bazario team" disabled={!data.eligible} />
            </label>
            {!confirming ? (
              <button type="button" className="cs-btn danger" disabled={!data.eligible} onClick={() => setConfirming(true)}>
                <Ic name="lock" size={15} /> Request to close my store
              </button>
            ) : (
              <div className="cs-confirm">
                <p>
                  Start the <b>7-day closing review</b>? You keep getting orders and must confirm each one on time. After the review your store closes and takes no new orders.
                </p>
                <div>
                  <button type="button" className="cs-btn ghost" onClick={() => setConfirming(false)} disabled={busy}>
                    Not now
                  </button>
                  <button type="button" className="cs-btn danger" onClick={apply} disabled={busy}>
                    {busy ? 'Please wait…' : 'Yes, start the review'}
                  </button>
                </div>
              </div>
            )}
          </section>
          )}
        </>
      )}
    </div>
  );
}
