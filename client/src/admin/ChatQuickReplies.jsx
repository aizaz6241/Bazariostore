import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const EMPTY = { title: '', text: '', actionKey: '' };

/**
 * Saved replies of the support team (shared by all admins). "Use" puts the text in the message box
 * and, in a store's chat, adds its page button. Anyone with chat access can add / edit / delete.
 */
export default function ChatQuickReplies({ pages = [], canButton, onUse, onClose }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null); // null | { _id?, title, text, actionKey }
  const [saving, setSaving] = useState(false);

  const load = () =>
    api('/chat/admin/quick-replies')
      .then((d) => setList(Array.isArray(d) ? d : []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  useEffect(() => {
    load();
  }, []);

  const pageOf = useMemo(() => new Map(pages.map((p) => [p.key, p])), [pages]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return list;
    return list.filter((r) => `${r.title} ${r.text} ${pageOf.get(r.actionKey)?.label || ''}`.toLowerCase().includes(t));
  }, [list, q, pageOf]);

  const save = async () => {
    setSaving(true);
    setErr('');
    try {
      const body = { title: form.title, text: form.text, actionKey: form.actionKey };
      if (form._id) await api(`/chat/admin/quick-replies/${form._id}`, { method: 'PUT', body });
      else await api('/chat/admin/quick-replies', { method: 'POST', body });
      setForm(null);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`Delete the saved reply “${r.title}” for everyone?`)) return;
    try {
      await api(`/chat/admin/quick-replies/${r._id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setErr(e.message);
    }
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal-box cqr-box" onClick={(e) => e.stopPropagation()}>
        <div className="csp-head">
          <div>
            <h3>⚡ Saved replies</h3>
            <p>Ready answers for common questions{canButton ? ', with their button' : ''}. Shared by the whole support team.</p>
          </div>
          <button type="button" className="csp-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="cqr-tools">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search saved replies…" autoFocus />
          <button type="button" className="cqr-btn primary" onClick={() => setForm({ ...EMPTY })}>
            + New
          </button>
        </div>

        {err && <div className="csp-err">{err}</div>}

        {form && (
          <div className="cqr-form">
            <label>
              Title (only you see it)
              <input value={form.title} onChange={set('title')} placeholder="e.g. How to deposit" maxLength={80} />
            </label>
            <label>
              Message the seller gets
              <textarea value={form.text} onChange={set('text')} placeholder="Write the reply…" maxLength={2000} />
            </label>
            <label>
              Button (optional)
              <select value={form.actionKey} onChange={set('actionKey')}>
                <option value="">No button</option>
                {pages.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="cqr-actions">
              <button type="button" className="cqr-btn primary" onClick={save} disabled={saving || !form.title.trim()}>
                {saving ? 'Saving…' : form._id ? 'Save changes' : 'Add saved reply'}
              </button>
              <button type="button" className="cqr-btn" onClick={() => setForm(null)} disabled={saving}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <ul className="cqr-list">
          {loading && <li className="cqr-empty">Loading…</li>}
          {!loading && !shown.length && <li className="cqr-empty">{q ? 'No saved reply matches.' : 'No saved replies yet. Add one with “+ New”.'}</li>}
          {shown.map((r) => (
            <li key={r._id} className="cqr-item">
              <div className="cqr-item-top">
                <b>{r.title}</b>
                {r.actionKey && pageOf.get(r.actionKey) && <span className="cqr-tag">{pageOf.get(r.actionKey).label}</span>}
              </div>
              {r.text && <p>{r.text}</p>}
              <div className="cqr-actions">
                <button type="button" className="cqr-btn primary" onClick={() => onUse(r, pageOf.get(r.actionKey) || null)}>
                  Use
                </button>
                <button type="button" className="cqr-btn" onClick={() => setForm({ _id: r._id, title: r.title, text: r.text || '', actionKey: r.actionKey || '' })}>
                  Edit
                </button>
                <button type="button" className="cqr-btn danger" onClick={() => remove(r)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
