import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

/**
 * Admin "Clear chat" dialog.
 *
 * Three choices: the whole chat, everything before a date, or a date range (one day = same date twice).
 * Before anything is removed it asks the server how many messages and files are involved, so the
 * admin sees exactly what will go. Clearing is permanent: the messages are deleted from the database
 * and their pictures / PDFs are deleted from storage (UploadThing) too, so the space is really freed.
 *
 * Props:
 *   chatName   who the chat is with (shown in the title)
 *   endpoint   API path that clears this chat, e.g. /chat/admin/conversations/<id>/clear
 *   onClose    close without doing anything
 *   onCleared  called after a successful clear with the server's answer
 */

const pad = (n) => String(n).padStart(2, '0');
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
// Dates are the admin's own calendar days
const startOfDay = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
};
const endOfDay = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
};
const niceDate = (s) => startOfDay(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const optionStyle = (active) => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '11px 14px',
  borderRadius: 10,
  border: `1.5px solid ${active ? '#dc2626' : '#e2e8f0'}`,
  background: active ? '#fef2f2' : '#fff',
  cursor: 'pointer',
  marginBottom: 8,
});
const dateInputStyle = {
  padding: '7px 10px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  fontSize: 13,
  fontWeight: 600,
  color: '#0f172a',
  background: '#fff',
};

export default function ClearChatModal({ chatName, endpoint, onClose, onCleared }) {
  const [mode, setMode] = useState('before');
  const [before, setBefore] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [preview, setPreview] = useState(null); // { messages, files }
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const requestNo = useRef(0);

  const today = todayStr();

  // What the server should clear, or null while the choice is not complete yet
  const buildBody = () => {
    if (mode === 'all') return { mode: 'all' };
    if (mode === 'before') return before ? { mode: 'before', before: startOfDay(before).toISOString() } : null;
    if (!from || !to) return null;
    const a = from <= to ? from : to;
    const b = from <= to ? to : from;
    return { mode: 'range', from: startOfDay(a).toISOString(), to: endOfDay(b).toISOString() };
  };

  // Count first, delete only after the admin has seen the numbers
  useEffect(() => {
    const body = buildBody();
    setPreview(null);
    setError('');
    if (!body || done) return undefined;
    const mine = ++requestNo.current;
    setChecking(true);
    api(endpoint, { method: 'POST', body: { ...body, dryRun: true } })
      .then((res) => {
        if (mine === requestNo.current) setPreview({ messages: res.messages || 0, files: res.files || 0 });
      })
      .catch((e) => {
        if (mine === requestNo.current) setError(e.message || 'Could not check this chat');
      })
      .finally(() => {
        if (mine === requestNo.current) setChecking(false);
      });
    return undefined;
  }, [mode, before, from, to, endpoint]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirm = async () => {
    const body = buildBody();
    if (!body || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await api(endpoint, { method: 'POST', body, timeout: 120000 });
      setDone(res);
      onCleared?.(res);
    } catch (e) {
      setError(e.message || 'Could not clear the chat');
    } finally {
      setBusy(false);
    }
  };

  const whatText =
    mode === 'all'
      ? 'the whole chat'
      : mode === 'before'
        ? before
          ? `everything before ${niceDate(before)}`
          : ''
        : from && to
          ? from === to
            ? `everything sent on ${niceDate(from)}`
            : `everything from ${niceDate(from <= to ? from : to)} to ${niceDate(from <= to ? to : from)}`
          : '';

  const nothing = preview && preview.messages === 0;
  const canDelete = Boolean(preview && preview.messages > 0 && !checking && !busy);

  return (
    <div className="admin-modal-overlay" onClick={busy ? undefined : onClose}>
      <div className="admin-modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🧹</span>
            <div>
              <h3 style={{ margin: 0, fontSize: 16 }}>Clear chat</h3>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                {chatName}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-close-modal" disabled={busy}>
            ✕
          </button>
        </div>

        {done ? (
          <div style={{ padding: '18px 22px' }}>
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 10,
                background: done.files?.failed > 0 ? '#fffbeb' : '#f0fdf4',
                border: `1px solid ${done.files?.failed > 0 ? '#fde68a' : '#bbf7d0'}`,
                fontSize: 13.5,
                color: '#0f172a',
                lineHeight: 1.55,
              }}
            >
              <b style={{ display: 'block', marginBottom: 4 }}>
                {done.deleted > 0 ? `${done.deleted} message${done.deleted === 1 ? '' : 's'} deleted` : 'There was nothing to clear'}
              </b>
              {done.deleted > 0 && (
                <span>
                  {done.files?.deleted || 0} picture / file{(done.files?.deleted || 0) === 1 ? '' : 's'} removed from storage.
                </span>
              )}
              {done.files?.failed > 0 && (
                <span style={{ display: 'block', marginTop: 6, color: '#92400e' }}>
                  {done.files.failed} file{done.files.failed === 1 ? '' : 's'} could not be removed from storage ({done.files.error}). The messages are gone, but
                  that space is not freed yet.
                </span>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '18px 22px' }}>
            <label style={optionStyle(mode === 'before')}>
              <input type="radio" name="clear-mode" checked={mode === 'before'} onChange={() => setMode('before')} style={{ marginTop: 3 }} />
              <div style={{ flex: 1 }}>
                <b style={{ fontSize: 13.5, color: '#0f172a', display: 'block' }}>Older messages</b>
                <small style={{ color: '#64748b', fontSize: 12 }}>Everything before the date you pick. That day and later stay.</small>
                {mode === 'before' && (
                  <div style={{ marginTop: 8 }}>
                    <input type="date" value={before} max={today} onChange={(e) => setBefore(e.target.value)} style={dateInputStyle} aria-label="Delete messages before this date" />
                  </div>
                )}
              </div>
            </label>

            <label style={optionStyle(mode === 'range')}>
              <input type="radio" name="clear-mode" checked={mode === 'range'} onChange={() => setMode('range')} style={{ marginTop: 3 }} />
              <div style={{ flex: 1 }}>
                <b style={{ fontSize: 13.5, color: '#0f172a', display: 'block' }}>Specific date or dates</b>
                <small style={{ color: '#64748b', fontSize: 12 }}>Only the days you pick. For one day, choose the same date twice.</small>
                {mode === 'range' && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      type="date"
                      value={from}
                      max={today}
                      onChange={(e) => {
                        setFrom(e.target.value);
                        if (!to) setTo(e.target.value);
                      }}
                      style={dateInputStyle}
                      aria-label="From date"
                    />
                    <span style={{ fontSize: 12, color: '#64748b' }}>to</span>
                    <input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} style={dateInputStyle} aria-label="To date" />
                  </div>
                )}
              </div>
            </label>

            <label style={optionStyle(mode === 'all')}>
              <input type="radio" name="clear-mode" checked={mode === 'all'} onChange={() => setMode('all')} style={{ marginTop: 3 }} />
              <div style={{ flex: 1 }}>
                <b style={{ fontSize: 13.5, color: '#0f172a', display: 'block' }}>Whole chat</b>
                <small style={{ color: '#64748b', fontSize: 12 }}>Every message in this chat, from the first to the latest.</small>
              </div>
            </label>

            <div
              style={{
                marginTop: 12,
                padding: '12px 14px',
                borderRadius: 10,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                fontSize: 13,
                color: '#334155',
                minHeight: 46,
                lineHeight: 1.5,
              }}
            >
              {!whatText && <span style={{ color: '#64748b' }}>Pick a date to see how much will be deleted.</span>}
              {whatText && checking && <span style={{ color: '#64748b' }}>Counting…</span>}
              {whatText && !checking && nothing && <span>No messages found for {whatText}.</span>}
              {whatText && !checking && preview && preview.messages > 0 && (
                <span>
                  This deletes {whatText}:{' '}
                  <b style={{ color: '#0f172a' }}>
                    {preview.messages} message{preview.messages === 1 ? '' : 's'}
                  </b>{' '}
                  and{' '}
                  <b style={{ color: '#0f172a' }}>
                    {preview.files} picture / file{preview.files === 1 ? '' : 's'}
                  </b>
                  . The files are removed from storage too. It is removed for both sides and cannot be undone.
                </span>
              )}
            </div>

            {error && (
              <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12.5 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button type="button" onClick={onClose} className="btn-cancel" disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={!canDelete}
                style={{
                  padding: '9px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: canDelete ? '#dc2626' : '#fca5a5',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: canDelete ? 'pointer' : 'not-allowed',
                }}
              >
                {busy ? 'Deleting…' : canDelete ? `Delete ${preview.messages} message${preview.messages === 1 ? '' : 's'}` : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
