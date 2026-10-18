import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOutletContext } from 'react-router-dom';
import { sapi, fmtDate } from '../api.js';
import Ic from '../components/Icons.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';
import { getSocket } from '../socket.js';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'review', label: 'To review' },
  { key: 'approved', label: 'Approved' },
  { key: 'refunded', label: 'Refunded' },
  { key: 'rejected', label: 'Rejected' },
];

const STATUS = {
  requested: { label: 'New request', tone: 'amber' },
  approved: { label: 'Approved', tone: 'blue' },
  refunded: { label: 'Refunded', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'slate' },
};
const statusOf = (s) => STATUS[s] || { label: String(s || '').replace(/_/g, ' '), tone: 'slate' };

const QUICK_REJECT = [
  'Item was used or damaged by the customer',
  'Return window has passed',
  'Item does not match the return policy',
];

// can the store decide this request itself?
function decidable(r) {
  return r.status === 'requested' && r.requestedBy !== 'admin' && !r.share?.shared;
}

// what happens next, in plain words
function nextStep(r) {
  if (r.status === 'requested') {
    if (r.requestedBy === 'admin') return { tone: 'blue', title: 'Opened by the Bazario team', text: 'Our team started this refund. They will decide it — you can follow it here.' };
    if (r.share?.shared) return { tone: 'blue', title: 'Bazario team decides', text: 'This order has items from other stores too, so our team reviews this return.' };
    return { tone: 'amber', title: 'Waiting for your answer', text: 'Read the customer’s reason and approve or reject the return. The Bazario team handles the payment after that.' };
  }
  if (r.status === 'approved') return { tone: 'blue', title: 'Approved — payment pending', text: 'The return is accepted. The Bazario team will send the money back to the customer.' };
  if (r.status === 'refunded') return { tone: 'green', title: 'Refund completed', text: 'The customer has been paid back and the items were returned to stock.' };
  return { tone: 'slate', title: 'Return rejected', text: 'No refund will be made for this request.' };
}

function walletNote(share) {
  if (!share || !share.items?.length) return 'None of your money is held on this order.';
  if (share.paidOut) return 'Your payout for these items was already paid on delivery. It stays in your wallet.';
  if (share.locked) return 'The amount locked for these items goes back to your available balance once the refund is paid.';
  return 'None of your money is held on this order.';
}

const ago = (d, now) => {
  const mins = Math.max(0, Math.round((now - new Date(d).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
};

function Thumbs({ items }) {
  const list = items || [];
  if (!list.length) return <span className="rf-faint">—</span>;
  const first = list[0];
  return (
    <div className="rf-item">
      <span className="rf-thumb">
        {first.image ? <img src={first.image} alt="" loading="lazy" /> : <Ic name="box" size={18} />}
        {list.length > 1 && <em>+{list.length - 1}</em>}
      </span>
      <span className="rf-item-txt">
        <b title={first.name}>{first.name || 'Item'}</b>
        <small>
          Qty {first.qty}
          {first.size ? ` · ${first.size}` : ''}
          {first.variant ? ` · ${first.variant}` : ''}
        </small>
      </span>
    </div>
  );
}

export default function SellerRefunds() {
  const { formatMoney } = useCurrency();
  const { isFrozen: restricted } = useOutletContext() || {};
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const reloadTimer = useRef(null);

  const load = useCallback(() => {
    sapi('/sellers/refunds')
      .then((data) => {
        setRefunds(Array.isArray(data) ? data : []);
        setLoadErr('');
      })
      .catch((e) => setLoadErr(e.message || 'Could not load return requests'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const socket = getSocket();
    const onChange = () => {
      clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(load, 600);
    };
    const events = ['refunds:changed', 'order:update'];
    events.forEach((e) => socket.on(e, onChange));
    const tick = setInterval(() => setNow(Date.now()), 60000);
    return () => {
      events.forEach((e) => socket.off(e, onChange));
      clearTimeout(reloadTimer.current);
      clearInterval(tick);
    };
  }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const stats = useMemo(() => {
    const s = { review: 0, approved: 0, refunded: 0, refundedValue: 0, rejected: 0, total: refunds.length };
    for (const r of refunds) {
      if (decidable(r)) s.review++;
      if (r.status === 'approved') s.approved++;
      if (r.status === 'rejected') s.rejected++;
      if (r.status === 'refunded') {
        s.refunded++;
        s.refundedValue += Number(r.share?.value) || 0;
      }
    }
    return s;
  }, [refunds]);

  const counts = useMemo(
    () => ({
      all: refunds.length,
      review: refunds.filter((r) => r.status === 'requested').length,
      approved: stats.approved,
      refunded: stats.refunded,
      rejected: stats.rejected,
    }),
    [refunds, stats]
  );

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return refunds.filter((r) => {
      if (tab === 'review' && r.status !== 'requested') return false;
      if (tab !== 'all' && tab !== 'review' && r.status !== tab) return false;
      if (!term) return true;
      const hay = [r.orderNumber, r.reason, r.customerName, ...(r.share?.items || []).map((i) => i.name)].join(' ').toLowerCase();
      return hay.includes(term);
    });
  }, [refunds, tab, q]);

  const open = refunds.find((r) => r._id === openId) || null;

  const decide = async (r, action, reason) => {
    try {
      await sapi(`/sellers/refunds/${r._id}/action`, { method: 'POST', body: { action, reason } });
      setToast({ ok: true, text: `Return for order ${r.orderNumber} ${action === 'approve' ? 'approved' : 'rejected'}. The Bazario team has been told.` });
      setOpenId(null);
      load();
      return true;
    } catch (err) {
      setToast({ ok: false, text: err.message || 'Could not save your answer' });
      load();
      return false;
    }
  };

  return (
    <div className="rf">
      <header className="rf-head">
        <div>
          <p className="rf-eyebrow">After-sales</p>
          <h1>Returns &amp; refunds</h1>
          <p className="rf-sub">Customers ask to return an order here. Review the reason, then approve or reject — the Bazario team handles the payment.</p>
        </div>
        <span className="rf-privacy">
          <Ic name="lock" size={14} /> Customer contact details stay private
        </span>
      </header>

      {restricted && (
        <div className="rf-banner tone-red">
          <Ic name="alert" size={18} />
          <div>
            <b>Your store is restricted</b>
            <p>You can see your return requests, but you cannot approve or reject them until support lifts the restriction.</p>
          </div>
        </div>
      )}

      <section className="rf-stats">
        <button type="button" className={`rf-stat ${stats.review ? 'is-attn' : ''}`} onClick={() => setTab('review')}>
          <span className="rf-stat-lbl"><i className="dot amber" /> Needs your answer</span>
          <b>{stats.review}</b>
          <small>{stats.review ? 'Customers are waiting' : 'You are all caught up'}</small>
        </button>
        <button type="button" className="rf-stat" onClick={() => setTab('approved')}>
          <span className="rf-stat-lbl"><i className="dot blue" /> Approved, payment pending</span>
          <b>{stats.approved}</b>
          <small>Bazario team pays the customer</small>
        </button>
        <button type="button" className="rf-stat" onClick={() => setTab('refunded')}>
          <span className="rf-stat-lbl"><i className="dot green" /> Refunded</span>
          <b>{stats.refunded}</b>
          <small>{formatMoney(stats.refundedValue)} of your items</small>
        </button>
        <button type="button" className="rf-stat" onClick={() => setTab('rejected')}>
          <span className="rf-stat-lbl"><i className="dot slate" /> Rejected</span>
          <b>{stats.rejected}</b>
          <small>{stats.total} requests in total</small>
        </button>
      </section>

      <div className="rf-toolbar">
        <div className="rf-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
              {t.label}
              <span className={`rf-count ${t.key === 'review' && counts.review ? 'attn' : ''}`}>{counts[t.key] || 0}</span>
            </button>
          ))}
        </div>
        <label className="rf-search">
          <Ic name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search order #, product or reason" />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Clear search">
              <Ic name="x" size={14} />
            </button>
          )}
        </label>
      </div>

      <div className="rf-card">
        {loading ? (
          <div className="rf-skel-list">{[0, 1, 2].map((i) => <div key={i} className="rf-skel" />)}</div>
        ) : loadErr ? (
          <div className="rf-empty">
            <span className="rf-empty-ico"><Ic name="alert" size={22} /></span>
            <b>Could not load return requests</b>
            <p>{loadErr}</p>
            <button type="button" className="rf-btn rf-btn-ghost sm" onClick={() => { setLoading(true); load(); }}>Try again</button>
          </div>
        ) : shown.length === 0 ? (
          <div className="rf-empty">
            <span className="rf-empty-ico"><Ic name="refresh" size={22} /></span>
            <b>{refunds.length === 0 ? 'No return requests yet' : 'Nothing here'}</b>
            <p>{refunds.length === 0 ? 'When a customer asks to return an order, it shows up here.' : q ? 'No request matches your search.' : 'No requests with this status.'}</p>
          </div>
        ) : (
          <>
            <table className="rf-table">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Your items</th>
                  <th>Reason</th>
                  <th className="r">Your items value</th>
                  <th>Status</th>
                  <th className="r" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const st = statusOf(r.status);
                  const mine = decidable(r);
                  return (
                    <tr key={r._id} className={mine ? 'is-attn' : ''} onClick={() => setOpenId(r._id)}>
                      <td>
                        <b className="rf-ordno">{r.orderNumber || '—'}</b>
                        <small>{fmtDate(r.createdAt)} · {ago(r.createdAt, now)}</small>
                      </td>
                      <td><Thumbs items={r.share?.items} /></td>
                      <td><p className="rf-reason">{r.reason || <span className="rf-faint">No reason given</span>}</p></td>
                      <td className="r">
                        <b className="rf-num">{formatMoney(r.share?.value || 0)}</b>
                        <small>Refund {formatMoney(r.refundAmount)}</small>
                      </td>
                      <td>
                        <span className={`rf-tag tone-${st.tone}`}>{st.label}</span>
                        {r.status === 'requested' && !mine && <small>Bazario team decides</small>}
                      </td>
                      <td className="r">
                        <button type="button" className={`rf-btn sm ${mine ? 'rf-btn-dark' : 'rf-btn-ghost'}`} onClick={(e) => { e.stopPropagation(); setOpenId(r._id); }}>
                          {mine ? 'Review' : 'View'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <ul className="rf-cards">
              {shown.map((r) => {
                const st = statusOf(r.status);
                const mine = decidable(r);
                return (
                  <li key={r._id} className={mine ? 'is-attn' : ''}>
                    <button type="button" className="rf-c-btn" onClick={() => setOpenId(r._id)}>
                      <div className="rf-c-top">
                        <div>
                          <b className="rf-ordno">{r.orderNumber || '—'}</b>
                          <small>{ago(r.createdAt, now)}</small>
                        </div>
                        <span className={`rf-tag tone-${st.tone}`}>{st.label}</span>
                      </div>
                      <Thumbs items={r.share?.items} />
                      {r.reason && <p className="rf-reason">{r.reason}</p>}
                      <div className="rf-c-foot">
                        <span>Your items <b>{formatMoney(r.share?.value || 0)}</b></span>
                        <span className={`rf-btn sm ${mine ? 'rf-btn-dark' : 'rf-btn-ghost'}`}>{mine ? 'Review' : 'View'}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {open && <RefundDrawer r={open} restricted={restricted} formatMoney={formatMoney} onClose={() => setOpenId(null)} onDecide={decide} />}

      {toast && (
        <div className={`rf-toast ${toast.ok ? 'ok' : 'err'}`} role="status">
          <Ic name={toast.ok ? 'checkCircle' : 'alert'} size={18} />
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Close"><Ic name="x" size={14} /></button>
        </div>
      )}
    </div>
  );
}

function RefundDrawer({ r, restricted, formatMoney, onClose, onDecide }) {
  const [shown, setShown] = useState(false);
  const [mode, setMode] = useState(null); // null | 'approve' | 'reject'
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const decideRef = useRef(null);
  const st = statusOf(r.status);
  const step = nextStep(r);
  const canDecide = decidable(r) && !restricted;
  const items = r.share?.items || [];

  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    const onKey = (e) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, busy]);

  useEffect(() => {
    if (mode) decideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [mode]);

  const submit = async () => {
    const text = note.trim();
    if (mode === 'reject' && text.length < 5) {
      setErr('Please write why you are rejecting it (at least 5 characters).');
      return;
    }
    setErr('');
    setBusy(true);
    const ok = await onDecide(r, mode, text);
    if (!ok) setBusy(false);
  };

  return createPortal(
    <div className="rf-drawer-root" role="dialog" aria-modal="true" aria-label={`Return for order ${r.orderNumber}`}>
      <button type="button" className={`rf-drawer-bg ${shown ? 'on' : ''}`} onClick={() => !busy && onClose()} aria-label="Close" />
      <aside className={`rf-drawer ${shown ? 'on' : ''}`}>
        <div className="rf-dr-head">
          <div>
            <p className="rf-eyebrow">Return request</p>
            <h2>Order {r.orderNumber}</h2>
            <div className="rf-dr-meta">
              <span className={`rf-tag tone-${st.tone}`}>{st.label}</span>
              <span>Requested {fmtDate(r.createdAt)}</span>
              {r.city && <><span className="sep">·</span><span>{r.city}</span></>}
            </div>
          </div>
          <button type="button" className="rf-icon-btn" onClick={onClose} aria-label="Close"><Ic name="x" size={18} /></button>
        </div>

        <div className="rf-dr-body">
          <div className={`rf-callout tone-${step.tone}`}>
            <Ic name={r.status === 'refunded' ? 'checkCircle' : r.status === 'rejected' ? 'x' : 'clock'} size={18} />
            <div>
              <b>{step.title}</b>
              <p>{step.text}</p>
            </div>
          </div>

          <section className="rf-dr-card">
            <h3>Customer’s reason <span>{r.customerName}</span></h3>
            <blockquote className="rf-quote">{r.reason || 'The customer did not give a reason.'}</blockquote>
          </section>

          <section className="rf-dr-card">
            <h3>Your items in this order <span>{items.length} {items.length === 1 ? 'item' : 'items'}</span></h3>
            {items.length ? (
              <ul className="rf-dr-items">
                {items.map((it, i) => (
                  <li key={i}>
                    {it.image ? <img src={it.image} alt="" /> : <span className="rf-noimg"><Ic name="box" size={18} /></span>}
                    <div className="rf-dr-item-txt">
                      <b>{it.name}</b>
                      <small>{formatMoney(it.price)} × {it.qty}{it.size ? ` · ${it.size}` : ''}{it.variant ? ` · ${it.variant}` : ''}</small>
                    </div>
                    <b className="rf-num">{formatMoney(it.price * it.qty)}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rf-fine">The item details for this order are not available.</p>
            )}
          </section>

          <section className="rf-dr-card">
            <h3>Money</h3>
            <div className="rf-receipt">
              <div><span>Your items value</span><b>{formatMoney(r.share?.value || 0)}</b></div>
              <div><span>Your profit on these items</span><b>{formatMoney(r.share?.profit || 0)}</b></div>
              <div className="total"><span>Refund to customer <small>(whole order)</small></span><b>{formatMoney(r.refundAmount)}</b></div>
            </div>
            <p className="rf-fine"><Ic name="wallet" size={14} /> {walletNote(r.share)}</p>
          </section>

          {r.timeline?.length > 0 && (
            <section className="rf-dr-card">
              <h3>History</h3>
              <ol className="rf-timeline">
                {r.timeline.map((t, i) => (
                  <li key={i} className={i === r.timeline.length - 1 ? 'latest' : ''}>
                    <i />
                    <div>
                      <b>{statusOf(t.status).label} <span>· {t.by}</span></b>
                      <small>{fmtDate(t.at)}</small>
                      {t.note && <p>{t.note}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {canDecide && mode && (
            <section ref={decideRef} className={`rf-dr-card rf-decide ${mode}`}>
              <h3>{mode === 'approve' ? 'Approve this return' : 'Reject this return'}</h3>
              {mode === 'reject' && (
                <div className="rf-chips">
                  {QUICK_REJECT.map((t) => (
                    <button key={t} type="button" className={note === t ? 'on' : ''} onClick={() => setNote(t)}>{t}</button>
                  ))}
                </div>
              )}
              <textarea
                rows={3}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={mode === 'approve' ? 'Note for the Bazario team (optional)' : 'Why are you rejecting it? The Bazario team sees this.'}
              />
              {err && <p className="rf-err">{err}</p>}
              <p className="rf-fine">{mode === 'approve' ? 'After you approve, the Bazario team sends the money back to the customer.' : 'Once rejected, only the Bazario team can change it.'}</p>
            </section>
          )}
        </div>

        <div className="rf-dr-foot">
          {canDecide && !mode && (
            <>
              <button type="button" className="rf-btn rf-btn-ghost danger" onClick={() => { setMode('reject'); setNote(''); setErr(''); }}>Reject</button>
              <button type="button" className="rf-btn rf-btn-primary" onClick={() => { setMode('approve'); setNote(''); setErr(''); }}><Ic name="check" size={16} /> Approve return</button>
            </>
          )}
          {canDecide && mode && (
            <>
              <button type="button" className="rf-btn rf-btn-ghost" disabled={busy} onClick={() => { setMode(null); setErr(''); }}>Back</button>
              <button type="button" className={`rf-btn ${mode === 'approve' ? 'rf-btn-primary' : 'rf-btn-danger'}`} disabled={busy} onClick={submit}>
                {busy ? 'Saving…' : mode === 'approve' ? 'Confirm approve' : 'Confirm reject'}
              </button>
            </>
          )}
          {!canDecide && (
            <>
              {decidable(r) && restricted && <span className="rf-foot-note">Your store is restricted — decisions are paused.</span>}
              <button type="button" className="rf-btn rf-btn-ghost" onClick={onClose}>Close</button>
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}
