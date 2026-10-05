'use client';

import React, { createContext, useContext, useState, useEffect, useLayoutEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { readCache, writeCache, clearAllCache } from '@/lib/clientCache';

const AuthContext = createContext({
  user: null,
  loading: true,
  login: async () => {},
  logout: () => {},
  refreshUser: async () => {},
});

const USER_CACHE_KEY = 'user';
const useBrowserLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const rememberUser = (member) => {
    setUser(member);
    if (member) writeCache(USER_CACHE_KEY, member);
  };

  const forgetUser = () => {
    localStorage.removeItem('portal_token');
    clearAllCache();
    setUser(null);
  };

  const requestMe = (token, lite) =>
    fetch(`/api/auth/me${lite ? '?lite=1' : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

  const fetchCurrentUser = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('portal_token') : null;
    if (!token) {
      clearAllCache();
      setUser(null);
      setLoading(false);
      return;
    }

    const known = readCache(USER_CACHE_KEY);

    try {
      // First visit on this device: ask only "who am I" (quick), so the right dashboard and the
      // navigation can be drawn; the wallet numbers follow from the full request below.
      if (!known) {
        const quick = await requestMe(token, true);
        if (quick.ok) {
          const data = await quick.json();
          rememberUser(data.member);
          setLoading(false);
        } else if (quick.status === 401 || quick.status === 404) {
          forgetUser();
          setLoading(false);
          return;
        }
      }

      const res = await requestMe(token, false);
      if (res.ok) {
        const data = await res.json();
        rememberUser(data.member);
      } else if (res.status === 401 || res.status === 404) {
        // the session is really over (expired token or removed account)
        forgetUser();
      }
      // any other answer (server hiccup): keep the user we already know
    } catch (err) {
      // no network: stay signed in with the last known account instead of jumping to the login page
      console.error('Auth check failed:', err);
    } finally {
      setLoading(false);
    }
  };

  // Before the first paint: if this device already knows who is signed in, use it at once.
  // This is what stops the wrong (member) dashboard and the missing navigation from showing
  // for a few seconds while the server is still answering.
  useBrowserLayoutEffect(() => {
    const token = localStorage.getItem('portal_token');
    const known = token ? readCache(USER_CACHE_KEY) : null;
    if (known && known._id) {
      setUser(known);
      setLoading(false);
    }
    fetchCurrentUser();
  }, []);

  // Route protection
  useEffect(() => {
    if (!loading) {
      if (!user && pathname !== '/login') {
        router.push('/login');
      } else if (user && pathname === '/login') {
        router.push('/dashboard');
      }
    }
  }, [user, loading, pathname, router]);

  const login = async (username, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Login failed');
    }

    if (data.token) {
      clearAllCache();
      localStorage.setItem('portal_token', data.token);
      rememberUser(data.member);
      setLoading(false);
      router.push('/dashboard');
    }
    return data;
  };

  const logout = () => {
    localStorage.removeItem('portal_token');
    clearAllCache();
    document.cookie = 'portal_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        refreshUser: fetchCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

// Pages are drawn only once we know who is signed in. Until then a neutral loading screen is
// shown, never a page laid out for the wrong role.
export function AuthGate({ children }) {
  const { user } = useAuth();
  const pathname = usePathname();

  if (pathname === '/login' || user) return children;

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center">
      <div className="w-12 h-12 rounded-2xl bg-slate-900 animate-pulse flex items-center justify-center text-white font-bold shadow-lg">
        BZ
      </div>
      <p className="mt-4 text-sm font-medium text-slate-500">Opening Bazario Team…</p>
    </div>
  );
}
