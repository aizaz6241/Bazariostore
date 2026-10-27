import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, fmtDate } from '../api.js';
import { getSocket } from '../socket.js';
import Ic from '../components/Icons.jsx';
import StoreLink from './hub/StoreLink.jsx';

/**
 * Applications → STORE CLOSURES (server: utils/storeClosure.js, routes/sellers/closure.routes.js).
 * A store asks to close → 7-day review (it must confirm every order on time) → closed (no new
 * orders). Admins see the live review, and can reject it, close at once, or reopen a closed store.
 */
const STATUS = {
  review: { label: 'In review', tone: 'amber' },
  closed: { label: 'Closed', tone: 'slate' },
  failed: { label: 'Review failed', tone: 'red' },
  rejected: { label: 'Rejected', tone: 'red' },
  cancelled: { label: 'Withdrawn', tone: 'grey' },
};
const FILTERS = [
  { v: 'all', l: 'All' },
  { v: 'review', l: 'In review' },
  { v: 'closed', l: 'Closed' },
  { v: 'ended', l: 'Ended' },
];
const ENDED = ['failed', 'rejected', 'cancelled'];

export default function StoreClosures() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [ask, setAsk] = useState(null); // { row, action }
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    api('/sellers/closures')
      .then((d) => {
        setData(d);
        setErr('');
      })
      .catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    load();
    const socket = getSocket();
    socket?.on('closure:changed', load);
    const t = setInterval(load, 2 * 60000);
    return () => {
      socket?.off('closure:changed', load);
      clearInterval(t);
    };
  }, [load]);

  const list = data?.list || [];
  const counts = data?.counts || {};
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return list.filter((r) => {
      if (filter === 'review' && r.status !== 'review') return false;
      if (filter === 'closed' && r.status !== 'closed') return false;
      if (filter === 'ended' && !ENDED.includes(r.status)) return false;
      if (needle && ![r.storeName, r.ownerName, r.email].some((v) => String(v || '').toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [list, filter, q]);
  const ended = ENDED.reduce((t, k) => t + (counts[k] || 0), 0);

  const run = async () => {
    if (!ask) return;
    if (ask.action === 'reject' && !note.trim()) return setErr('Write the reason — the store sees it.');
    setBusy(true);
    setErr('');
    try {
      await api(`/sellers/closures/${ask.row.sellerId}/${ask.action}`, { method: 'POST', body: { note: note.trim() } });
      setMsg(ask.action === 'close' ? `${ask.row.storeName} is now closed.` : ask.action === 'reopen' ? `${ask.row.storeName} is open again.` : `The request of ${ask.row.storeName} was rejected.`);
      setAsk(null);
      setNote('');
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scl">
      <header className="scl-head">
        <div>
          <h1>Store closures</h1>
          <p>
            A store asks to close → <b>7-day review</b> (it keeps getting orders and must confirm each on time) → <b>closed</b> (no new orders). A late order, a freeze
            or health below 90 ends the review by itself.
          </p>
        </div>
        <div className="scl-kpis">
          <div className="k amber">
            <b>{counts.review || 0}</b>
            <span>In review</span>
          </div>
          <div className="k">
            <b>{counts.closed || 0}</b>
            <span>Closed</span>
          </div>
          <div className="k grey">
            <b>{ended}</b>
            <span>Ended</span>
          </div>
        </div>
      </header>

      <div className="scl-bar">
        <div className="scl-filters" role="tablist">
          {FILTERS.map((f) => (
            <button key={f.v} type="button" className={filter === f.v ? 'on' : ''} onClick={() => setFilter(f.v)}>
              {f.l}
              <em>{f.v === 'all' ? list.length : f.v === 'ended' ? ended : counts[f.v] || 0}</em>
            </button>
          ))}
        </div>
        <input type="search" className="scl-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search store, owner or email…" />
      </div>

      {msg && <div className="scl-ok">{msg}</div>}
      {err && !ask && <div className="scl-err">{err}</div>}

      {!data ? (
        <div className="scl-empty">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="scl-empty">
          <span>🏁</span>
          {list.length ? 'Nothing here with this filter.' : 'No store has asked to close yet.'}
        </div>
      ) : (
        <div className="scl-list">
          {shown.map((r) => {
            const st = STATUS[r.status] || { label: r.status, tone: 'grey' };
            const rv = r.review;
            return (
              <article key={r.sellerId} className={`scl-card st-${r.status}`}>
                <div className="scl-top">
                  <div className="scl-name">
                    <b>
                      <StoreLink id={r.sellerId} name={r.storeName} />
                    </b>
                    <small>
                      {r.ownerName} · {r.email} · {r.tier}
                      {r.test ? ' · Test account' : ''}
                    </small>
                  </div>
                  <span className={`scl-badge ${st.tone}`}>{st.label}</span>
                </div>

                <div className="scl-meta">
                  <span>
                    Asked <b>{r.requestedAt ? fmtDate(r.requestedAt) : '—'}</b>
                  </span>
                  <span>
                    Health <b className={r.health < 90 ? 't-red' : 't-green'}>{r.health}/100</b>
                  </span>
                  <span>
                    Store <b>{r.storeStatus}</b>
                  </span>
                  {r.closedAt && (
                    <span>
                      Closed <b>{fmtDate(r.closedAt)}</b>
                    </span>
                  )}
                </div>
                {r.reason && <p className="scl-reason">“{r.reason}”</p>}

                {r.status === 'review' && rv && (
                  <div className="scl-review">
                    <div className="scl-review-row">
                      <b>
                        Day {rv.day} of {rv.days}
                      </b>
                      <span>Ends {fmtDate(rv.endsAt)}</span>
                    </div>
                    <div className="scl-progress">
                      <i style={{ width: `${Math.max(4, rv.progress)}%` }} />
                    </div>
                    <div className="scl-chips">
                      <span>{rv.ordersInReview} orders during the review</span>
                      <span className={rv.waiting ? 'warn' : ''}>{rv.waiting} waiting for confirmation</span>
                      <span className={rv.late ? 'bad' : ''}>{rv.late} past warning time</span>
                      <span className={rv.delays ? 'bad' : 'good'}>{rv.delays ? `${rv.delays} late / missed` : 'No late order'}</span>
                    </div>
                    {rv.waitingForOrders && <p className="scl-hint">7 days are over — it closes as soon as the waiting orders are confirmed.</p>}
                  </div>
                )}

                {ENDED.includes(r.status) && r.endNote && (
                  <p className="scl-end">
                    {r.endNote}
                    {r.endedAt ? ` · ${fmtDate(r.endedAt)}` : ''}
                    {r.by && r.by !== 'system' && r.by !== 'store' ? ` · ${r.by}` : ''}
                  </p>
                )}

                <div className="scl-actions">
                  {r.status === 'review' && (
                    <>
                      <button type="button" className="scl-btn dark" onClick={() => { setAsk({ row: r, action: 'close' }); setNote(''); setErr(''); }}>
                        <Ic name="lock" size={14} /> Close now
                      </button>
                      <button type="button" className="scl-btn" onClick={() => { setAsk({ row: r, action: 'reject' }); setNote(''); setErr(''); }}>
                        Reject
                      </button>
                    </>
                  )}
                  {r.status === 'closed' && (
                    <button type="button" className="scl-btn" onClick={() => { setAsk({ row: r, action: 'reopen' }); setNote(''); setErr(''); }}>
                      <Ic name="refresh" size={14} /> Reopen store
                    </button>
                  )}
                  {r.history?.length > 0 && (
                    <details className="scl-hist">
                      <summary>History</summary>
                      <ul>
                        {r.history.map((h, i) => (
                          <li key={i}>
                            <b>{h.status}</b> · {fmtDate(h.at)} · {h.by}
                            {h.note ? ` — ${h.note}` : ''}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {ask && (
        <div className="admin-modal-overlay" onClick={() => !busy && setAsk(null)}>
          <div className="admin-modal-box scl-modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              {ask.action === 'close' ? 'Close this store now?' : ask.action === 'reopen' ? 'Reopen this store?' : 'Reject the closing request?'}
            </h3>
            <p>
              <b>{ask.row.storeName}</b> —{' '}
              {ask.action === 'close'
                ? 'the review ends now and the store takes no new orders. Orders already confirmed are still delivered and paid.'
                : ask.action === 'reopen'
                  ? 'the store can take new orders again.'
                  : 'the review ends and the store stays open. The store sees your reason.'}
              {ask.action === 'close' && ask.row.review?.waiting > 0 && <span className="scl-warn"> {ask.row.review.waiting} order(s) still wait for its confirmation.</span>}
            </p>
            <label className="scl-field">
              <span>{ask.action === 'reject' ? 'Reason (the store sees it)' : 'Note (optional)'}</span>
              <textarea rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
            </label>
            {err && <div className="scl-err">{err}</div>}
            <div className="scl-modal-actions">
              <button type="button" className="scl-btn" onClick={() => setAsk(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className={`scl-btn ${ask.action === 'reopen' ? 'green' : 'dark'}`} onClick={run} disabled={busy || (ask.action === 'reject' && !note.trim())}>
                {busy ? 'Please wait…' : ask.action === 'close' ? 'Close store' : ask.action === 'reopen' ? 'Reopen' : 'Reject request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
