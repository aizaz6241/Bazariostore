'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useLiveRefresh } from '@/components/LiveProvider';
import { Users, TrendingUp, TrendingDown, Wallet } from 'lucide-react';

const usdt = (n) => `₮${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

export default function MyMembersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const router = useRouter();
  // Partners never bring members themselves: their overview of every referral is on Members
  useEffect(() => {
    if (isAdmin) router.replace('/members?tab=referrals');
  }, [isAdmin, router]);

  const load = async () => {
    try {
      const token = localStorage.getItem('portal_token');
      const res = await fetch('/api/referrals', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not load');
      setGroups(data.groups || []);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && !isAdmin) load();
  }, [user?._id, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  useLiveRefresh(() => {
    if (user && !isAdmin) load();
  });

  if (isAdmin) return <p className="text-sm text-slate-500 p-6">Opening Members → Referrals…</p>;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-6 space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
          <Users className="w-6 h-6 text-indigo-600" /> {isAdmin ? 'Referrals' : 'My Members'}
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          {isAdmin
            ? 'Every member who brought another 1:1 member, with the commission he earned and the part of withdrawals he paid.'
            : 'The members you brought: their deposits, your commission, and your part of their sellers’ withdrawals.'}
        </p>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>}
      {!loading && !error && groups.length === 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center text-slate-500 text-sm">
          {isAdmin ? 'No referrals yet.' : 'You have not brought any members yet.'}
        </div>
      )}

      {groups.map((g) => (
        <div key={g.referrerId} className="space-y-3">
          {isAdmin && (
            <h2 className="font-bold text-slate-900 text-base">
              {g.referrerName} {!g.referrerActive && <span className="text-xs text-red-600">(account off — earns nothing on new deposits)</span>}
            </h2>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-slate-200 p-3">
              <div className="text-[11px] text-slate-500">Members brought</div>
              <div className="text-xl font-black text-slate-900">{g.totals.members}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-3">
              <div className="text-[11px] text-slate-500">Their deposits</div>
              <div className="text-lg font-black text-slate-900">{inr(g.totals.depositINR)}</div>
              <div className="text-[11px] text-slate-500">{usdt(g.totals.depositUSDT)} • {g.totals.deposits} deposits</div>
            </div>
            <div className="bg-white rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-[11px] text-emerald-700 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> Commission earned</div>
              <div className="text-lg font-black text-emerald-800">{usdt(g.totals.earnedUSDT)}</div>
              <div className="text-[11px] text-emerald-700">This month {usdt(g.totals.monthEarnedUSDT)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-3">
              <div className="text-[11px] text-slate-500 flex items-center gap-1"><Wallet className="w-3.5 h-3.5" /> Net (earned − paid)</div>
              <div className={`text-lg font-black ${g.totals.netUSDT < 0 ? 'text-red-600' : 'text-slate-900'}`}>{usdt(g.totals.netUSDT)}</div>
              <div className="text-[11px] text-slate-500 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> paid in withdrawals {usdt(g.totals.paidUSDT)}</div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2">Member</th>
                  <th className="text-right px-4 py-2">Your %</th>
                  <th className="text-right px-4 py-2">Sellers</th>
                  <th className="text-right px-4 py-2">Deposits</th>
                  <th className="text-right px-4 py-2">Withdrawals</th>
                  <th className="text-right px-4 py-2">You earned</th>
                  <th className="text-right px-4 py-2">You paid</th>
                  <th className="text-right px-4 py-2">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {g.members.map((m) => (
                  <tr key={m.memberId}>
                    <td className="px-4 py-2">
                      <div className="font-semibold text-slate-800">{m.name}</div>
                      <div className="text-[10px] text-slate-400">
                        since {new Date(m.since).toLocaleDateString()}
                        {m.lastDepositAt ? ` • last deposit ${new Date(m.lastDepositAt).toLocaleDateString()}` : ''}
                        {!m.active ? ' • account off' : ''}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">{m.pct}%</td>
                    <td className="px-4 py-2 text-right">{m.sellers}</td>
                    <td className="px-4 py-2 text-right">
                      {inr(m.depositINR)}
                      <div className="text-[10px] text-slate-400">{usdt(m.depositUSDT)} • {m.deposits}</div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {inr(m.withdrawINR)}
                      <div className="text-[10px] text-slate-400">{usdt(m.withdrawUSDT)} • {m.withdrawals}</div>
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-emerald-700">{usdt(m.earnedUSDT)}</td>
                    <td className="px-4 py-2 text-right text-red-600">{usdt(m.paidUSDT)}</td>
                    <td className={`px-4 py-2 text-right font-bold ${m.netUSDT < 0 ? 'text-red-600' : 'text-slate-900'}`}>{usdt(m.netUSDT)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
