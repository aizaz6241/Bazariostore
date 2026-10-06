'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthProvider';

/**
 * Realtime channel.
 *
 * One connection per open page to the store server, which pushes news the moment it happens:
 *
 *   chat:message   a new chat message, complete (with its picture / voice note when small)
 *   chat:changed   a conversation changed in another way (read, edited, deleted, cleared)
 *   live:changed   a number on the money screens may have changed
 *   resync         the connection was (re)opened: something may have been missed, re-check once
 *   typing         someone is typing (the server sends this to admins only)
 *
 * `presence` — who has the portal open right now and when each person was last seen. The server
 * sends it to admins only; for everyone else it simply stays empty.
 *
 * `status` says what is being pushed right now. Screens use it to decide how much they still
 * check on their own: while pushed, a slow safety check; while not, the same quick checks as
 * before. So nothing depends on this channel being reachable.
 */

const OFF = { connected: false, chat: false, live: false };
const NOBODY = { known: false, online: {}, lastSeen: {} };

const RealtimeContext = createContext({
  status: OFF,
  presence: NOBODY,
  on: () => () => {},
  emit: () => {},
});

export function RealtimeProvider({ children }) {
  const { user } = useAuth();
  const [status, setStatus] = useState(OFF);
  const [presence, setPresence] = useState(NOBODY);
  const listeners = useRef(new Map());
  const socketRef = useRef(null);

  // Tell the server something small (for example "I am typing"). Lost without complaint when
  // the channel is not connected.
  const emit = useCallback((event, payload) => {
    const s = socketRef.current;
    if (s && s.connected) s.emit(event, payload);
  }, []);

  const on = useCallback((event, fn) => {
    if (!listeners.current.has(event)) listeners.current.set(event, new Set());
    const set = listeners.current.get(event);
    set.add(fn);
    return () => set.delete(fn);
  }, []);

  const userId = user?._id || '';

  useEffect(() => {
    if (!userId) {
      setStatus(OFF);
      setPresence(NOBODY);
      return undefined;
    }

    let stopped = false;
    let socket = null;
    let retryTimer = null;
    let failures = 0;

    const fire = (event, payload) => {
      const set = listeners.current.get(event);
      if (!set) return;
      set.forEach((fn) => {
        try {
          fn(payload);
        } catch (e) {
          console.error(`Realtime listener for ${event} failed:`, e);
        }
      });
    };

    const update = (next) => {
      if (stopped) return;
      setStatus((prev) =>
        prev.connected === next.connected && prev.chat === next.chat && prev.live === next.live ? prev : next
      );
    };

    const getTicket = async () => {
      const token = localStorage.getItem('portal_token');
      if (!token) return null;
      const res = await fetch('/api/realtime/ticket', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) return null;
      return res.json();
    };

    const later = (fn) => {
      clearTimeout(retryTimer);
      // 5s, 10s, 20s ... up to 2 minutes, so a server that is away is not hammered
      const wait = Math.min(120000, 5000 * 2 ** Math.min(failures, 5));
      retryTimer = setTimeout(() => {
        if (!stopped) fn();
      }, wait);
    };

    const boot = async () => {
      let first = null;
      try {
        first = await getTicket();
      } catch (e) {
        first = null;
      }
      if (stopped) return;
      if (!first) {
        failures += 1;
        later(boot);
        return;
      }
      if (!first.enabled || !first.url) return; // realtime is switched off on the server

      let io;
      try {
        ({ io } = await import('socket.io-client'));
      } catch (e) {
        console.error('Realtime client could not be loaded:', e);
        return;
      }
      if (stopped) return;

      let spare = first.ticket;
      socket = io(`${first.url}/portal`, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        randomizationFactor: 0.4,
        timeout: 12000,
        // a fresh pass for every (re)connection
        auth: (cb) => {
          if (spare) {
            const t = spare;
            spare = null;
            cb({ ticket: t });
            return;
          }
          getTicket()
            .then((t) => cb({ ticket: t?.ticket || '' }))
            .catch(() => cb({ ticket: '' }));
        },
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        failures = 0;
        update({ connected: true, chat: false, live: false });
        socket.emit('rt:visible', !document.hidden);
        // whatever happened while we were not connected was not pushed: look once
        fire('resync');
      });
      socket.on('rt:status', (s) => {
        update({ connected: true, chat: !!s?.chat, live: !!s?.live });
      });
      // Admins only (the server sends these to nobody else)
      socket.on('presence:state', (p) => {
        if (stopped) return;
        const online = {};
        (p?.online || []).forEach((id) => {
          online[String(id)] = true;
        });
        setPresence({ known: true, online, lastSeen: { ...(p?.lastSeen || {}) } });
      });
      socket.on('presence:update', (p) => {
        if (stopped || !p?.memberId) return;
        const id = String(p.memberId);
        setPresence((prev) => {
          const online = { ...prev.online };
          if (p.online) online[id] = true;
          else delete online[id];
          const lastSeen = p.lastSeenAt ? { ...prev.lastSeen, [id]: p.lastSeenAt } : prev.lastSeen;
          return { known: true, online, lastSeen };
        });
      });
      socket.on('disconnect', (reason) => {
        update(OFF);
        // we no longer know who is here: better to show nothing than something stale
        setPresence(NOBODY);
        if (reason === 'io server disconnect' && !stopped) later(() => socket.connect());
      });
      socket.on('connect_error', () => {
        update(OFF);
        failures += 1;
        // refused by the server (old pass, channel not there yet): the library stops by itself
        if (!socket.active) later(() => socket.connect());
      });
      ['chat:message', 'chat:changed', 'live:changed', 'typing'].forEach((event) => {
        socket.on(event, (payload) => fire(event, payload));
      });
    };

    const onVisible = () => {
      if (stopped || !socket) return;
      // "online" means the portal is in front of the person, not sitting in a background tab
      if (socket.connected) socket.emit('rt:visible', !document.hidden);
      if (document.hidden) return;
      if (!socket.connected && !socket.active) {
        clearTimeout(retryTimer);
        socket.connect();
      }
    };

    boot();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
      socketRef.current = null;
      setStatus(OFF);
      setPresence(NOBODY);
    };
  }, [userId]);

  return <RealtimeContext.Provider value={{ status, presence, on, emit }}>{children}</RealtimeContext.Provider>;
}

export const useRealtime = () => useContext(RealtimeContext);

/** Run `fn` when the channel delivers `event`. Always calls the latest `fn`. */
export function useRealtimeEvent(event, fn) {
  const { on } = useContext(RealtimeContext);
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => on(event, (payload) => ref.current?.(payload)), [on, event]);
}
