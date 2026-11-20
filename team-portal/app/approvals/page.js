'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { useLiveRefresh, LiveBadge } from '@/components/LiveProvider';
import { useApprovals } from '@/components/FinanceControls';
import ApprovalsBoard from '@/components/ApprovalsBoard';
import { ShieldCheck, RefreshCw, Gift, ArrowRight, Loader2 } from 'lucide-react';

/**
 * Approvals (partners): every request that waits for the second partner, in one place.
 * Before, this list sat on top of the Finance screen.
 */
export default function ApprovalsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const { approvals, setApprovals, reloadApprovals } = useApprovals(isAdmin, tick);

  // Rewards are approved on their own page: show how many wait there, so they are not forgotten
  const [rewardsPending, setRewardsPending] = useState(0);
  const loadCounts = async () => {
    try {
      const res = await fetch('/api/attention', { headers: { Authorization: `Bearer ${localStorage.getItem('portal_token')}` }, cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setRewardsPending(Number(json.rewardsPending) || 0);
    } catch (_) {
      /* keep what is on screen */
    }
  };
  useEffect(() => {
    if (isAdmin) loadCounts();
  }, [isAdmin, tick]);

  useLiveRefresh(() => {
    if (isAdmin) setTick((n) => n + 1);
  });

  if (!user) return null;
  if (!isAdmin) return <div className="p-8 text-center text-sm text-slate-500">This page is for admins only.</div>;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([reloadApprovals(), loadCounts()]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-indigo-600" />
            <span>Approvals</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">Every money change needs the second partner. Nothing is applied until it is approved.</p>
        </div>
        <div className="flex items-center gap-2">
          <LiveBadge />
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center gap-1.5 text-xs"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {rewardsPending > 0 && (
        <Link
          href="/rewards"
          className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 hover:bg-amber-100/70 transition"
        >
          <span className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
            <Gift className="w-4 h-4" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-amber-900">
              {rewardsPending} reward claim{rewardsPending === 1 ? '' : 's'} waiting
            </span>
            <span className="block text-[11px] text-amber-800/80">Rewards are approved on the Rewards page</span>
          </span>
          <ArrowRight className="w-4 h-4 text-amber-700 shrink-0" />
        </Link>
      )}

      {!approvals ? (
        <div className="bg-white rounded-3xl border border-slate-200 py-16 flex flex-col items-center gap-2 text-slate-400 text-xs">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
          Loading approvals…
        </div>
      ) : (
        <ApprovalsBoard
          approvals={approvals}
          onChanged={(next) => {
            if (next) setApprovals(next);
            else setTick((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
