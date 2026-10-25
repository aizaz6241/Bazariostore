import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

/**
 * Support Desk → "New chat": pick a store and write to it (like WhatsApp "new chat").
 * Works for a store whose chat was deleted (it comes back empty) and for a store that never
 * had a chat. A chat already in the list is just opened.
 *
 * Props:
 *   onClose            close without doing anything
 *   onStarted(result)  { conversation, created, restored } — the parent opens that chat
 */
const STATUS_TAG = { frozen: 'Frozen', suspended: 'Suspended', rejected: 'Rejected', inactive: 'Inactive' };
const ACTION = { open: 'Open chat', deleted: 'Start again', none: 'Start chat' };
const NOTE = { open: 'Chat in your list', deleted: 'Chat was deleted', none: 'No chat yet' };

export default function NewChatModal({ onClose, onStarted }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const reqRef = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && !busyId && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busyId, onClose]);

  // search as you type (a short pause first)
  useEffect(() => {
    const id = ++reqRef.current;
    setLoading(true);
    const t = setTimeout(() => {
      api(`/chat/admin/start-targets${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
        .then((res) => id === reqRef.current && setList(Array.isArray(res) ? res : []))
        .catch((e) => id === reqRef.current && setError(e.message || 'Could not load stores'))
        .finally(() => id === reqRef.current && setLoading(false));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q]);

  const start = async (s) => {
    if (busyId) return;
    setBusyId(String(s._id));
    setError('');
    try {
      const res = await api('/chat/admin/conversations/start', { method: 'POST', body: { sellerId: s._id } });
      onStarted?.(res);
    } catch (e) {
      setError(e.message || 'Could not start the chat');
      setBusyId('');
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={busyId ? undefined : onClose}>
      <div className="admin-modal-box ncm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="New chat">
        <div className="ncm-top">
          <div>
            <h3>New chat</h3>
            <p>Pick a store to write to — also works after its chat was deleted.</p>
          </div>
          <button type="button" onClick={onClose} className="ncm-x" disabled={Boolean(busyId)} aria-label="Close">✕</button>
        </div>

        <label className="ncm-search">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M11 4a7 7 0 1 0 4.2 12.6l3.6 3.6 1.4-1.4-3.6-3.6A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z" fill="currentColor" /></svg>
          <input ref={inputRef} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Store name, owner, email or phone" aria-label="Find a store" />
        </label>

        {error && <p className="ncm-error" role="alert">{error}</p>}

        <ul className={`ncm-list ${loading && list ? 'is-dim' : ''}`} aria-busy={loading}>
          {!list && loading && Array.from({ length: 5 }).map((_, i) => <li key={i} className="ncm-skel" />)}
          {list && list.length === 0 && !loading && <li className="ncm-empty">{q ? 'No store matches.' : 'No approved stores yet.'}</li>}
          {(list || []).map((s) => {
            const busy = busyId === String(s._id);
            return (
              <li key={s._id}>
                <button type="button" className="ncm-row" onClick={() => start(s)} disabled={Boolean(busyId)}>
                  <span className="ncm-av" aria-hidden="true">{(s.storeName || '•').trim()[0]?.toUpperCase() || '•'}</span>
                  <span className="ncm-txt">
                    <b>
                      <span className="ncm-name">{s.storeName}</span>
                      {s.tier === 'diamond' && <span title="Diamond store">💎</span>}
                      {s.isTest && <em className="ncm-tag test">Test</em>}
                      {STATUS_TAG[s.status] && <em className={`ncm-tag ${s.status}`}>{STATUS_TAG[s.status]}</em>}
                    </b>
                    <small>
                      {s.ownerName || '—'} · <span className={`ncm-state ${s.chat}`}>{NOTE[s.chat]}</span>
                    </small>
                  </span>
                  <span className={`ncm-go ${s.chat}`}>{busy ? 'Opening…' : ACTION[s.chat]}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {list && list.length >= 40 && <p className="ncm-more">Showing the first 40 — type to find a store.</p>}
      </div>
    </div>
  );
}
