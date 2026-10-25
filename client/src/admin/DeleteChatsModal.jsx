import { useEffect, useState } from 'react';
import { api } from '../api.js';

/**
 * Admin "Delete chat" dialog (Seller Support Desk) — for one chat or many picked in the list.
 *
 * Deleting = every message of the chat and its pictures / PDFs are removed for good (also from
 * UploadThing), and the chat leaves the list. If the store or guest writes again later, the chat
 * comes back with only the new message (like WhatsApp). Before anything is removed it asks the
 * server how many messages and files are involved. Deleting many chats at once needs "DELETE" typed.
 *
 * Props:
 *   chats      [{ _id, name }] the chats to delete
 *   onClose    close without doing anything
 *   onDeleted  called after the delete with the server's answer
 */
export default function DeleteChatsModal({ chats, onClose, onDeleted }) {
  const ids = chats.map((c) => c._id);
  const many = chats.length > 1;
  const [preview, setPreview] = useState(null); // { chats, messages, files }
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => {
    let alive = true;
    setChecking(true);
    api('/chat/admin/conversations/delete', { method: 'POST', body: { ids, dryRun: true } })
      .then((res) => alive && setPreview(res))
      .catch((e) => alive && setError(e.message || 'Could not check these chats'))
      .finally(() => alive && setChecking(false));
    return () => {
      alive = false;
    };
  }, [ids.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const typedOk = !many || typed.trim().toUpperCase() === 'DELETE';
  const canDelete = Boolean(preview && !checking && !busy && typedOk);

  const confirm = async () => {
    if (!canDelete) return;
    setBusy(true);
    setError('');
    try {
      const res = await api('/chat/admin/conversations/delete', { method: 'POST', body: { ids }, timeout: 180000 });
      setDone(res);
      onDeleted?.(res);
    } catch (e) {
      setError(e.message || 'Could not delete');
    } finally {
      setBusy(false);
    }
  };

  const title = many ? `Delete ${chats.length} chats` : 'Delete chat';
  const who = many ? `${chats.slice(0, 3).map((c) => c.name).join(', ')}${chats.length > 3 ? ` and ${chats.length - 3} more` : ''}` : chats[0]?.name || 'this chat';

  return (
    <div className="admin-modal-overlay" onClick={busy ? undefined : onClose}>
      <div className="admin-modal-box dcm" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: 22 }} aria-hidden="true">🗑️</span>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
              <p className="muted dcm-who" title={chats.map((c) => c.name).join(', ')}>{who}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-close-modal" disabled={busy} aria-label="Close">
            ✕
          </button>
        </div>

        {done ? (
          <div className="dcm-body">
            <div className={`dcm-note ${done.failed?.length || done.files?.failed ? 'warn' : 'ok'}`}>
              <b>{done.deleted > 0 ? `${done.deleted} chat${done.deleted === 1 ? '' : 's'} deleted` : 'Nothing was deleted'}</b>
              <span>
                {done.messages || 0} message{done.messages === 1 ? '' : 's'} and {done.files?.deleted || 0} picture / file{(done.files?.deleted || 0) === 1 ? '' : 's'} removed.
              </span>
              {done.failed?.length > 0 && <span>Could not delete: {done.failed.map((f) => f.name).join(', ')}. Try those again.</span>}
              {done.files?.failed > 0 && <span>{done.files.failed} file(s) could not be removed from storage yet.</span>}
            </div>
            <div className="dcm-actions">
              <button type="button" className="btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="dcm-body">
            <div className="dcm-note">
              {checking && <span className="muted">Counting…</span>}
              {!checking && preview && (
                <>
                  <span>
                    This deletes{' '}
                    <b>
                      {preview.messages} message{preview.messages === 1 ? '' : 's'}
                    </b>{' '}
                    and{' '}
                    <b>
                      {preview.files} picture / file{preview.files === 1 ? '' : 's'}
                    </b>
                    {many ? ` from ${preview.chats} chats` : ''}, for both sides, and removes {many ? 'them' : 'it'} from the list. It cannot be undone.
                  </span>
                  <span className="muted">If the store or guest writes again later, the chat comes back with only the new message.</span>
                </>
              )}
            </div>

            {many && preview && (
              <label className="dcm-type">
                <span>
                  Type <b>DELETE</b> to confirm
                </span>
                <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" autoComplete="off" autoFocus />
              </label>
            )}

            {error && <div className="dcm-error">{error}</div>}

            <div className="dcm-actions">
              <button type="button" onClick={onClose} className="btn-cancel" disabled={busy}>
                Cancel
              </button>
              <button type="button" className="dcm-danger" onClick={confirm} disabled={!canDelete}>
                {busy ? 'Deleting…' : many ? `Delete ${chats.length} chats` : 'Delete chat'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
