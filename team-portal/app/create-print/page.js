'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, RotateCcw, Maximize2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { buildCreatePrintDoc, CREATE_PRINT_SANDBOX } from '@/lib/createPrintDoc';

// Create / Print — the private tool, portal admins only. Files come from the API only after the
// admin login is checked, and run in a locked frame (no access to the portal login).
let memo = null;

export default function CreatePrintPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [doc, setDoc] = useState(memo);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const boxRef = useRef(null);

  const load = async () => {
    setError('');
    try {
      const token = localStorage.getItem('portal_token');
      const res = await fetch('/api/private-tools/create-print', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `Error ${res.status}`);
      memo = buildCreatePrintDoc(data.files);
      setDoc(memo);
    } catch (e) {
      setError(e.message || 'Could not open the tool.');
    }
  };

  useEffect(() => {
    if (isAdmin && !memo) load();
  }, [isAdmin]);

  const fullScreen = () => {
    const el = boxRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.().catch(() => {});
  };

  if (user && !isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center bg-white rounded-2xl border border-slate-200 p-8">
        <div className="text-3xl mb-2">🔒</div>
        <h2 className="font-bold text-slate-800">Admins only</h2>
        <Link href="/dashboard" className="inline-block mt-4 text-emerald-600 font-semibold text-sm">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" style={{ minHeight: 'calc(100vh - 120px)' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <Link
          href="/dashboard"
          className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs sm:text-sm font-semibold flex items-center gap-1.5 hover:bg-slate-50"
        >
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </Link>
        <div className="flex-1 min-w-[140px] flex items-center gap-1.5 font-extrabold text-slate-800">
          <ShieldCheck className="w-5 h-5 text-emerald-600" /> Create / Print
        </div>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          disabled={!doc}
          className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs sm:text-sm font-semibold flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-50"
        >
          <RotateCcw className="w-4 h-4" /> Restart
        </button>
        <button
          type="button"
          onClick={fullScreen}
          disabled={!doc}
          className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs sm:text-sm font-semibold flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-50"
        >
          <Maximize2 className="w-4 h-4" /> Full screen
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 text-sm flex items-center gap-3 flex-wrap">
          <span>Could not open Create / Print: {error}</span>
          <button type="button" onClick={load} className="font-semibold underline">
            Try again
          </button>
        </div>
      )}

      <div ref={boxRef} className="flex-1 flex bg-white border border-slate-200 rounded-2xl overflow-hidden" style={{ minHeight: '70vh' }}>
        {doc ? (
          <iframe
            key={reloadKey}
            title="Create / Print"
            sandbox={CREATE_PRINT_SANDBOX}
            allow="fullscreen; clipboard-write"
            referrerPolicy="no-referrer"
            srcDoc={doc}
            className="flex-1 w-full border-0 bg-white"
            style={{ minHeight: '70vh' }}
          />
        ) : (
          !error && <div className="m-auto text-slate-400 text-sm p-10">Opening…</div>
        )}
      </div>
    </div>
  );
}
