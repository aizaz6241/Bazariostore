'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthProvider';
import { useRealtimeEvent } from './RealtimeProvider';

/**
 * Knows whether a team meeting is live (for the banner on every page, the chat card and the
 * chat header). Asks the portal every 20 s while the page is open, at once when the app comes
 * back to the front, and when a "meeting started" card arrives in the chat.
 */
const CallContext = createContext({ configured: false, active: null, refresh: () => {}, loaded: false });

export function useCall() {
  return useContext(CallContext);
}

export function CallProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState({ configured: false, active: null, loaded: false });
  const busy = useRef(false);
  const last = useRef(0);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('portal_token') : null;
    if (!token) return;
    busy.current = true;
    last.current = Date.now();
    try {
      const res = await fetch('/api/calls', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setState({ configured: !!data.configured, active: data.active || null, loaded: true });
      }
    } catch {
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    refresh();
    const t = setInterval(() => {
      if (!document.hidden) refresh();
    }, 20000);
    const onShow = () => {
      if (!document.hidden && Date.now() - last.current > 3000) refresh();
    };
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('focus', onShow);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('focus', onShow);
    };
  }, [user, refresh]);

  // a "meeting started / ended" card arrived or changed in the team chat
  useRealtimeEvent('chat:message', (p) => {
    if (p?.message?.callId) refresh();
  });
  useRealtimeEvent('chat:changed', (p) => {
    if (!p || p.conversationId === 'main_group') setTimeout(refresh, 400);
  });

  return <CallContext.Provider value={{ ...state, refresh }}>{children}</CallContext.Provider>;
}
