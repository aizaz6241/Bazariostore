import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '../socket.js';

// "Steve is typing…" between admins in seller / guest support chats.
// The server only passes these signals to other admins who can open chats (never to the seller,
// the guest or the typer's own other devices). Nothing is saved anywhere.

const SEND_EVERY_MS = 2500; // while keys keep coming, refresh the signal this often
const IDLE_STOP_MS = 4000; // no key pressed for this long = stopped typing
const SHOW_FOR_MS = 7000; // a typer not refreshed for this long disappears (lost signal, closed app)

function storedAdmin() {
  try {
    return JSON.parse(localStorage.getItem('ng_admin') || 'null') || null;
  } catch {
    return null;
  }
}
const myAdminId = () => {
  const a = storedAdmin();
  return a ? String(a.id || a._id || '') : '';
};
const myName = () => {
  const n = storedAdmin()?.name;
  return typeof n === 'string' ? n.slice(0, 40) : '';
};

// "Steve is typing…" / "Steve and Ali are typing…" / "3 admins are typing…"
export function typingLabel(list) {
  const names = (list || []).map((t) => t.name || 'Admin');
  if (!names.length) return '';
  if (names.length === 1) return `${names[0]} is typing a reply…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names.length} admins are typing…`;
}

export function useAdminTyping(enabled = true) {
  // { [conversationId]: { [adminId]: { name, at } } }
  const [typers, setTypers] = useState({});
  const outRef = useRef({ convId: null, lastSent: 0, idleTimer: null });

  const emit = (conversationId, typing) => {
    try {
      const s = getSocket();
      // while offline nothing is queued: an old "typing" must never arrive late after a reconnect
      if (!s || !s.connected) return;
      s.emit('admin:typing', { conversationId, typing, name: myName() });
    } catch {
      /* ignore */
    }
  };

  const stopTyping = useCallback(() => {
    const o = outRef.current;
    if (o.idleTimer) clearTimeout(o.idleTimer);
    o.idleTimer = null;
    if (o.convId) emit(o.convId, false);
    o.convId = null;
    o.lastSent = 0;
  }, []);

  // Call on every change of the reply box: (conversation id, new text)
  const noteTyping = useCallback(
    (convId, value) => {
      if (!enabled) return;
      const cid = convId ? String(convId) : '';
      if (!cid || (typeof value === 'string' && !value.trim())) {
        stopTyping();
        return;
      }
      const o = outRef.current;
      if (o.convId && o.convId !== cid) stopTyping();
      const now = Date.now();
      if (o.convId !== cid || now - o.lastSent >= SEND_EVERY_MS) {
        emit(cid, true);
        o.convId = cid;
        o.lastSent = now;
      }
      if (o.idleTimer) clearTimeout(o.idleTimer);
      o.idleTimer = setTimeout(stopTyping, IDLE_STOP_MS);
    },
    [enabled, stopTyping]
  );

  // Receive other admins' signals
  useEffect(() => {
    if (!enabled) return undefined;
    let socket;
    try {
      socket = getSocket();
    } catch {
      return undefined;
    }
    if (!socket) return undefined;

    const onTyping = (p) => {
      if (!p || typeof p.conversationId !== 'string' || !p.adminId) return;
      const aid = String(p.adminId);
      if (aid === myAdminId()) return; // my own other device: never "I am typing"
      const cid = p.conversationId;
      setTypers((prev) => {
        const cur = prev[cid] || {};
        if (p.typing === false) {
          if (!cur[aid]) return prev;
          const rest = { ...cur };
          delete rest[aid];
          const next = { ...prev };
          if (Object.keys(rest).length) next[cid] = rest;
          else delete next[cid];
          return next;
        }
        return { ...prev, [cid]: { ...cur, [aid]: { name: p.name || 'Admin', at: Date.now() } } };
      });
    };

    // Ask who is typing right now (screen opened mid-typing, or the connection came back).
    // The admin room is joined asynchronously after connect, so ask a moment later.
    let syncTimer = null;
    const sync = (delay) => {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        if (!socket.connected) return;
        socket.emit('admin:typing_sync', {}, (list) => {
          if (!Array.isArray(list)) return;
          const now = Date.now();
          const me = myAdminId();
          const next = {};
          for (const t of list) {
            if (!t || typeof t.conversationId !== 'string' || !t.adminId || String(t.adminId) === me) continue;
            if (!next[t.conversationId]) next[t.conversationId] = {};
            next[t.conversationId][String(t.adminId)] = { name: t.name || 'Admin', at: now };
          }
          setTypers(next);
        });
      }, delay);
    };

    const onConnect = () => {
      outRef.current.lastSent = 0; // my next key re-announces at once
      sync(1500);
    };
    const onDisconnect = () => {
      // signals may have been missed while offline: start clean, the sync refills it
      setTypers({});
      const o = outRef.current;
      if (o.idleTimer) clearTimeout(o.idleTimer);
      o.idleTimer = null;
      o.convId = null;
      o.lastSent = 0;
    };

    socket.on('admin:typing', onTyping);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) sync(600);

    // drop typers whose signal stopped coming (their phone lost network, app was killed, ...)
    const prune = setInterval(() => {
      const now = Date.now();
      setTypers((prev) => {
        let changed = false;
        const next = {};
        for (const [cid, m] of Object.entries(prev)) {
          const keep = {};
          for (const [aid, t] of Object.entries(m)) {
            if (now - t.at <= SHOW_FOR_MS) keep[aid] = t;
            else changed = true;
          }
          if (Object.keys(keep).length) next[cid] = keep;
        }
        return changed ? next : prev;
      });
    }, 1000);

    return () => {
      socket.off('admin:typing', onTyping);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      if (syncTimer) clearTimeout(syncTimer);
      clearInterval(prune);
    };
  }, [enabled]);

  // Stop my signal when the app goes to the background, the tab closes, or this screen goes away
  useEffect(() => {
    if (!enabled) return undefined;
    const onHide = () => {
      if (document.visibilityState === 'hidden') stopTyping();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', stopTyping);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', stopTyping);
      stopTyping();
    };
  }, [enabled, stopTyping]);

  const typersIn = useCallback(
    (convId) => (convId && typers[String(convId)] ? Object.values(typers[String(convId)]) : []),
    [typers]
  );

  return { typersIn, noteTyping, stopTyping };
}
