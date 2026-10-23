import { useCallback, useEffect, useRef, useState } from 'react';
import { api, fmtDate } from '../api.js';
import { getSocket } from '../socket.js';

const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');

/**
 * One message (+ an optional button) to a whole group of stores, in each store's own support chat.
 * {storeName}, {balance}… are filled in for every store. Below: earlier broadcasts with how many
 * stores saw the message, tapped the button and did what it asked.
 */
export default function ChatBroadcast({ pages = [], onClose }) {
  const [segments, setSegments] = useState([]);
  const [history, setHistory] = useState([]);
  const [placeholders, setPlaceholders] = useState([]);
  const [segment, setSegment] = useState('');
  const [preview, setPreview] = useState(null);
  const [text, setText] = useState('');
  const [actionKey, setActionKey] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const textRef = useRef(null);

  const load = useCallback(
    () =>
      api('/chat/admin/broadcasts')
        .then((d) => {
          setSegments(d?.segments || []);
          setHistory(d?.broadcasts || []);
        })
        .catch((e) => setErr(e.message)),
    []
  );

  useEffect(() => {
    load();
    api('/chat/admin/placeholders')
      .then((d) => setPlaceholders(Array.isArray(d) ? d : []))
      .catch(() => {});
    const socket = getSocket();
    const onDone = () => load();
    socket?.on('chat:broadcast_done', onDone);
    return () => socket?.off('chat:broadcast_done', onDone);
  }, [load]);

  useEffect(() => {
    if (!segment) {
      setPreview(null);
      return;
    }
    let live = true;
    setPreview({ loading: true });
    api(`/chat/admin/broadcasts/preview?segment=${encodeURIComponent(segment)}`)
      .then((d) => live && setPreview(d))
      .catch((e) => live && setPreview({ error: e.message }));
    return () => {
      live = false;
    };
  }, [segment]);

  const insert = (key) => {
    const tag = `{${key}}`;
    const el = textRef.current;
    const at = el && typeof el.selectionStart === 'number' ? el.selectionStart : text.length;
    const end = el && typeof el.selectionEnd === 'number' ? el.selectionEnd : at;
    setText((t) => `${t.slice(0, at)}${tag}${t.slice(end)}`.slice(0, 2000));
    setTimeout(() => el?.focus(), 0);
  };

  const amt = Math.round((Number(amount) || 0) * 100) / 100;
  const canSend = segment && preview?.count > 0 && (text.trim() || actionKey) && !(actionKey === 'deposit' && amount !== '' && !(amt >= 1 && amt <= 1000000));

  const send = async () => {
    if (!canSend) return;
    const label = segments.find((s) => s.key === segment)?.label || segment;
    if (!window.confirm(`Send this message to ${preview.count} stores (${label})?\n\nIt goes into each store's support chat and cannot be taken back in one step.`)) return;
    setSending(true);
    setErr('');
    setOk('');
    try {
      const d = await api('/chat/admin/broadcasts', {
        method: 'POST',
        body: { segment, text: text.trim(), actionKey, ...(actionKey === 'deposit' && amt > 0 ? { amount: amt } : {}) },
      });
      setOk(d?.message || 'Sending…');
      setText('');
      setActionKey('');
      setAmount('');
      setSegment('');
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal-box cbc-box" onClick={(e) => e.stopPropagation()}>
        <div className="csp-head">
          <div>
            <h3>📣 Broadcast to stores</h3>
            <p>One message (and a button) in the support chat of every store in a group.</p>
          </div>
          <button type="button" className="csp-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {err && <div className="csp-err">{err}</div>}
        {ok && <div className="cbc-ok">✅ {ok}</div>}

        <div className="cbc-form">
          <label>
            Who gets it
            <select value={segment} onChange={(e) => setSegment(e.target.value)}>
              <option value="">Choose a group…</option>
              {segments.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </label>
          {preview && (
            <div className="cbc-preview">
              {preview.loading ? 'Counting stores…' : preview.error ? preview.error : (
                <>
                  <b>{preview.count} stores</b>
                  {preview.sample?.length > 0 && <span> — {preview.sample.join(', ')}{preview.count > preview.sample.length ? '…' : ''}</span>}
                </>
              )}
            </div>
          )}

          <label>
            Message
            <textarea ref={textRef} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="e.g. Hi {ownerName}, you have {pendingOrders} orders waiting ({pendingAmount}). Deposit {shortBy} to confirm them today." />
          </label>
          {placeholders.length > 0 && (
            <div className="cqr-ph">
              <span>Filled in for each store:</span>
              <div>
                {placeholders.map((p) => (
                  <button key={p.key} type="button" onClick={() => insert(p.key)} title={p.label}>{`{${p.key}}`}</button>
                ))}
              </div>
            </div>
          )}

          <div className="cbc-row">
            <label>
              Button (optional)
              <select value={actionKey} onChange={(e) => setActionKey(e.target.value)}>
                <option value="">No button</option>
                {pages.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </label>
            {actionKey === 'deposit' && (
              <label>
                Amount (optional)
                <input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Same for every store" />
              </label>
            )}
          </div>

          <button type="button" className="cqr-btn primary cbc-send" onClick={send} disabled={!canSend || sending}>
            {sending ? 'Sending…' : preview?.count > 0 ? `Send to ${preview.count} stores` : 'Send'}
          </button>
        </div>

        <h4 className="cbc-h">Earlier broadcasts</h4>
        <ul className="cbc-list">
          {!history.length && <li className="cqr-empty">No broadcast sent yet.</li>}
          {history.map((b) => (
            <li key={b._id}>
              <div className="cbc-top">
                <b>{b.segmentLabel}</b>
                <small>{fmtDate(b.createdAt)} · {b.sentBy}{b.status === 'sending' ? ' · sending…' : ''}</small>
              </div>
              {b.text && <p>{b.text.length > 160 ? `${b.text.slice(0, 157)}…` : b.text}</p>}
              {b.action?.label && <span className="cqr-tag">{b.action.label}</span>}
              <div className="cbc-stats">
                <span><b>{b.stats.sent}</b> sent</span>
                <span><b>{b.stats.seen}</b> seen ({pct(b.stats.seen, b.stats.sent)})</span>
                {b.action?.label && <span><b>{b.stats.opened}</b> tapped ({pct(b.stats.opened, b.stats.sent)})</span>}
                {b.action?.label && <span className="ok"><b>{b.stats.done}</b> done ({pct(b.stats.done, b.stats.sent)})</span>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
