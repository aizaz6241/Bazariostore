'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthProvider';

/**
 * Live updates for every money screen.
 *
 * While a page is open and visible, the app asks the server every few seconds for a short
 * "version code" (/api/live). The code changes whenever a deposit is approved, funds are added or
 * adjusted on the seller website, a payout is recorded, a seller is assigned, and so on. When it
 * changes, every screen that registered with `useLiveRefresh` reloads its numbers quietly — no
 * page reload, no spinner.
 *
 * It rests while the tab is in the background and checks at once when you come back.
 */

const ACTIVE_MS = 3000; // someone is using the app
const IDLE_MS = 10000; // open and visible, but untouched for a while
const IDLE_AFTER_MS = 120000;

const LiveContext = createContext({
  status: 'connecting', // 'connecting' | 'live' | 'offline'
  lastChangeAt: 0,
  subscribe: () => () => {},
});

export function LiveProvider({ children }) {
  const { user, refreshUser } = useAuth();
  const [status, setStatus] = useState('connecting');
  const [lastChangeAt, setLastChangeAt] = useState(0);
  const listeners = useRef(new Set());
  const refreshUserRef = useRef(refreshUser);
  refreshUserRef.current = refreshUser;

  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  const userId = user?._id || '';

  useEffect(() => {
    if (!userId) return undefined;

    let stopped = false;
    let timer = null;
    let inFlight = false;
    let current = null;
    let lastActive = Date.now();
    let failures = 0;

    const schedule = () => {
      clearTimeout(timer);
      if (stopped || document.hidden) return;
      const idle = Date.now() - lastActive > IDLE_AFTER_MS;
      // back off a little while the server is not answering
      const wait = (idle ? IDLE_MS : ACTIVE_MS) * Math.min(1 + failures, 4);
      timer = setTimeout(check, wait);
    };

    const check = async () => {
      if (stopped || inFlight) return;
      if (document.hidden) return;
      inFlight = true;
      try {
        const token = localStorage.getItem('portal_token');
        if (!token) return;
        const res = await fetch('/api/live', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (stopped) return;
        if (!res.ok) throw new Error(`live ${res.status}`);
        const json = await res.json();
        failures = 0;
        setStatus('live');
        if (json.v && current !== null && json.v !== current) {
          setLastChangeAt(Date.now());
          listeners.current.forEach((fn) => {
            try {
              fn();
            } catch (e) {
              console.error('Live refresh failed:', e);
            }
          });
          // wallet pill in the top bar
          refreshUserRef.current?.();
        }
        if (json.v) current = json.v;
      } catch (err) {
        failures += 1;
        if (!stopped && failures >= 2) setStatus('offline');
      } finally {
        inFlight = false;
        schedule();
      }
    };

    const onActive = () => {
      const wasIdle = Date.now() - lastActive > IDLE_AFTER_MS;
      lastActive = Date.now();
      if (wasIdle) check();
    };
    const onVisible = () => {
      if (document.hidden) {
        clearTimeout(timer);
        return;
      }
      lastActive = Date.now();
      check();
    };

    check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onVisible);
    window.addEventListener('pointerdown', onActive, { passive: true });
    window.addEventListener('keydown', onActive, { passive: true });
    window.addEventListener('scroll', onActive, { passive: true });

    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onVisible);
      window.removeEventListener('pointerdown', onActive);
      window.removeEventListener('keydown', onActive);
      window.removeEventListener('scroll', onActive);
    };
  }, [userId]);

  return <LiveContext.Provider value={{ status, lastChangeAt, subscribe }}>{children}</LiveContext.Provider>;
}

export const useLive = () => useContext(LiveContext);

/**
 * Run `fn` whenever the money data changed on the server. `fn` should reload quietly
 * (keep what is on screen, replace it when the new numbers arrive).
 */
export function useLiveRefresh(fn) {
  const { subscribe } = useContext(LiveContext);
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => subscribe(() => ref.current?.()), [subscribe]);
}

/** Small "Live" pill: green and breathing while connected, a brief flash when new numbers land. */
export function LiveBadge({ className = '' }) {
  const { status, lastChangeAt } = useLive();
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!lastChangeAt) return undefined;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 2500);
    return () => clearTimeout(t);
  }, [lastChangeAt]);

  const offline = status === 'offline';
  const label = offline ? 'Reconnecting…' : flash ? 'Updated just now' : status === 'live' ? 'Live' : 'Connecting…';

  return (
    <span
      title={offline ? 'Could not reach the server. Trying again…' : 'Amounts update by themselves. No refresh needed.'}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
        offline
          ? 'bg-amber-50 text-amber-700 border-amber-200'
          : flash
            ? 'bg-emerald-600 text-white border-emerald-600'
            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
      } ${className}`}
    >
      <span className="relative flex w-2 h-2">
        {!offline && status === 'live' && (
          <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${flash ? 'bg-white' : 'bg-emerald-500'}`} />
        )}
        <span className={`relative inline-flex rounded-full w-2 h-2 ${offline ? 'bg-amber-500' : flash ? 'bg-white' : 'bg-emerald-500'}`} />
      </span>
      <span>{label}</span>
    </span>
  );
}
