import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api } from '../api.js';
import { getSocket } from '../socket.js';
import { adminCan, idOf } from './hub/hubBus.js';

/**
 * ADMIN-ONLY STORE NICKNAMES (server: routes/sellers/nickname.routes.js).
 * One shared copy for the whole admin panel: loaded once, kept live through the
 * "seller:nickname" socket event, so every screen that shows a store name can show its
 * nickname next to it with <Nick id={sellerId} />. The store never sees any of this.
 */
let map = {};
let loaded = false;
let loading = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f());

function load(force = false) {
  if (!localStorage.getItem('ng_admin_token')) return Promise.resolve(map);
  if (loading) return loading;
  if (loaded && !force) return Promise.resolve(map);
  loading = api('/sellers/nicknames')
    .then((d) => {
      map = { ...(d?.nicknames || {}) };
      loaded = true;
      emit();
      return map;
    })
    .catch(() => map)
    .finally(() => {
      loading = null;
    });
  return loading;
}

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  try {
    const socket = getSocket();
    socket.on('seller:nickname', (p) => {
      const sid = idOf(p?.sellerId);
      if (!sid) return;
      const next = { ...map };
      if (p.nickname) next[sid] = p.nickname;
      else delete next[sid];
      map = next;
      emit();
    });
    // after a reconnect (or another admin logging in on this tab) take a fresh copy
    socket.on('connect', () => loaded && load(true));
  } catch {
    /* no live updates: the copy still loads */
  }
}

function subscribe(fn) {
  subs.add(fn);
  wire();
  load();
  return () => subs.delete(fn);
}
const snapshot = () => map;

/** { sellerId: nickname } for the whole panel (live). */
export function useNicknames() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** The nickname of one store ('' when none). */
export function useNickname(id) {
  const all = useNicknames();
  return all[idOf(id)] || '';
}

/** Plain text, for <option>s, titles and search (call inside a component that used useNicknames). */
export const nickOf = (id) => map[idOf(id)] || '';

/** "Store name · nickname" for search boxes. */
export const withNick = (id, name = '') => {
  const n = nickOf(id);
  return n ? `${name} ${n}` : name;
};

/** Small tag next to a store name. Renders nothing when the store has no nickname. */
export function Nick({ id, className = '', compact = false }) {
  const nick = useNickname(id);
  if (!nick) return null;
  return (
    <span className={`nick-tag${compact ? ' is-compact' : ''} ${className}`} title={`Nickname: ${nick} — only admins see this`}>
      <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
        <path fill="currentColor" d="M2 2.75C2 2.34 2.34 2 2.75 2h4.69c.2 0 .39.08.53.22l5.81 5.81a.75.75 0 0 1 0 1.06l-4.69 4.69a.75.75 0 0 1-1.06 0L2.22 7.97A.75.75 0 0 1 2 7.44V2.75Zm3 3.5a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z" />
      </svg>
      <span className="nick-txt">{nick}</span>
    </span>
  );
}

/**
 * Add / change / remove a store's nickname, inline (store page, quick view).
 * Admins without the "Sellers" permission only see the tag.
 */
export function NickEditor({ id, storeName = '', className = '' }) {
  const sid = idOf(id);
  const nick = useNickname(sid);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef(null);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);
  if (!sid) return null;
  const canEdit = adminCan('sellers');

  const save = async (value) => {
    setBusy(true);
    setErr('');
    try {
      const r = await api(`/sellers/${sid}/nickname`, { method: 'PUT', body: { nickname: value } });
      const next = { ...map };
      if (r?.nickname) next[sid] = r.nickname;
      else delete next[sid];
      map = next;
      emit();
      setEditing(false);
    } catch (e) {
      setErr(e.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <form
        className={`nick-edit ${className}`}
        onSubmit={(e) => {
          e.preventDefault();
          save(val.trim());
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={val}
          maxLength={40}
          placeholder={`Nickname for ${storeName || 'this store'}`}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
          aria-label="Store nickname (only admins see it)"
          disabled={busy}
        />
        <button type="submit" className="nick-btn primary" disabled={busy}>
          {busy ? '…' : 'Save'}
        </button>
        {nick && (
          <button type="button" className="nick-btn" disabled={busy} onClick={() => save('')} title="Remove the nickname">
            Remove
          </button>
        )}
        <button type="button" className="nick-btn ghost" disabled={busy} onClick={() => setEditing(false)} aria-label="Cancel">
          ✕
        </button>
        {err && <small className="nick-err">{err}</small>}
        <small className="nick-hint">Only admins see this.</small>
      </form>
    );
  }

  return (
    <span className={`nick-line ${className}`}>
      {nick ? <Nick id={sid} /> : null}
      {canEdit && (
        <button
          type="button"
          className="nick-add"
          onClick={(e) => {
            e.stopPropagation();
            setVal(nick);
            setEditing(true);
          }}
          title={nick ? 'Change the nickname' : 'Add a nickname only admins see'}
        >
          {nick ? 'Edit' : '+ Nickname'}
        </button>
      )}
    </span>
  );
}
