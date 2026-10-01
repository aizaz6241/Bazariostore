'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import confetti from 'canvas-confetti';
import {
  Award,
  Sparkles,
  CheckCircle,
  XCircle,
  Clock,
  Gift,
  Plus,
  HelpCircle,
  Flame,
  Check,
  X,
  User,
  ShieldCheck,
} from 'lucide-react';

export default function RewardsPage() {
  const { user } = useAuth();
  const [claims, setClaims] = useState([]);
  const [weeklyProgress, setWeeklyProgress] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Direct Bonus Modal (Admin only)
  const [isBonusModalOpen, setIsBonusModalOpen] = useState(false);
  const [bonusForm, setBonusForm] = useState({
    memberId: '',
    amountPKR: '',
    reason: '',
  });
  const [bonusLoading, setBonusLoading] = useState(false);

  // Approval loading map
  const [approvingId, setApprovingId] = useState(null);

  const isAdmin = user?.role === 'admin';

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('portal_token');
      const headers = { Authorization: `Bearer ${token}` };

      const [rewardsRes, membersRes] = await Promise.all([
        fetch('/api/rewards', { headers }),
        isAdmin ? fetch('/api/members', { headers }) : Promise.resolve(null),
      ]);

      if (rewardsRes.ok) {
        const data = await rewardsRes.json();
        setClaims(data.claims || []);
        setWeeklyProgress(data.weeklyProgress);
      }

      if (membersRes && membersRes.ok) {
        const mData = await membersRes.json();
        setMembers(mData.members || []);
      }
    } catch (err) {
      console.error('Fetch rewards error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isAdmin]);

  // Admin approves a reward claim
  const handleApprove = async (claimId) => {
    try {
      setApprovingId(claimId);
      const token = localStorage.getItem('portal_token');
      const res = await fetch(`/api/rewards/${claimId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ adminNote: 'Verified and approved by Administrator' }),
      });

      if (res.ok) {
        // Trigger celebratory confetti animation
        confetti({
          particleCount: 120,
          spread: 70,
          origin: { y: 0.6 },
        });
        fetchData();
      } else {
        const data = await res.json();
        alert(data.message || 'Approval failed');
      }
    } catch (err) {
      console.error('Approve error:', err);
    } finally {
      setApprovingId(null);
    }
  };

  // Admin rejects a reward claim
  const handleReject = async (claimId) => {
    const reason = prompt('Optional reason for rejecting this claim:') || 'Declined by Admin';
    try {
      const token = localStorage.getItem('portal_token');
      const res = await fetch(`/api/rewards/${claimId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ adminNote: reason }),
      });

      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Reject error:', err);
    }
  };

  // Admin awards custom direct bonus
  const handleGrantCustomBonus = async (e) => {
    e?.preventDefault();
    if (!bonusForm.memberId || !bonusForm.amountPKR) return;

    try {
      setBonusLoading(true);
      const token = localStorage.getItem('portal_token');
      const res = await fetch('/api/rewards/bonus', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(bonusForm),
      });

      if (res.ok) {
        confetti({
          particleCount: 100,
          spread: 80,
          origin: { y: 0.6 },
        });
        setIsBonusModalOpen(false);
        setBonusForm({ memberId: '', amountPKR: '', reason: '' });
        fetchData();
      } else {
        const data = await res.json();
        alert(data.message || 'Failed to award bonus');
      }
    } catch (err) {
      console.error('Bonus error:', err);
    } finally {
      setBonusLoading(false);
    }
  };

  const pendingClaims = claims.filter((c) => c.status === 'pending');
  const pastClaims = claims.filter((c) => c.status !== 'pending');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Rewards, Milestones & Bonus Approvals
            </h1>
            {pendingClaims.length > 0 && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold animate-pulse">
                {pendingClaims.length} Pending
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {isAdmin
              ? 'Review automated agent milestone claims, approve payouts, and award team bonuses.'
              : 'Track milestone targets and weekly sprint progress. Approved rewards credit directly to your wallet.'}
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => setIsBonusModalOpen(true)}
            className="px-4 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm flex items-center space-x-1.5 transition shadow-md shadow-slate-900/10 active:scale-95 self-start sm:self-auto"
          >
            <Gift className="w-4 h-4 text-amber-400" />
            <span>Award Direct Bonus</span>
          </button>
        )}
      </div>

      {/* Weekly Sprint Progress Card (For Member) */}
      {!isAdmin && weeklyProgress && (
        <div className="bg-gradient-to-br from-amber-500 via-amber-600 to-yellow-600 rounded-3xl p-6 text-white shadow-xl shadow-amber-600/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <Flame className="w-5 h-5 text-yellow-200 fill-yellow-200" />
                <span className="text-xs font-black uppercase tracking-wider text-yellow-100">
                  Weekly Sprint Challenge
                </span>
              </div>
              <h2 className="text-2xl font-black mt-1">₹5 Lakh Combined Deposit Target</h2>
              <p className="text-xs sm:text-sm text-yellow-100/90 mt-0.5">
                Reach ₹500,000 INR across all your sellers this week to qualify for a{' '}
                <span className="underline font-bold text-white">Rs 5,000 PKR Weekend Reward</span>.
              </p>
            </div>

            <div className="bg-black/20 backdrop-blur px-4 py-2 rounded-2xl text-center shrink-0 self-start sm:self-auto">
              <span className="text-[10px] uppercase font-bold text-yellow-200 block">Progress</span>
              <span className="text-2xl font-black">{weeklyProgress.percentage}%</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-black/20 rounded-full h-3.5 mt-4 p-0.5">
            <div
              className="bg-white h-full rounded-full transition-all duration-700 shadow-sm"
              style={{ width: `${weeklyProgress.percentage}%` }}
            />
          </div>

          <div className="flex justify-between items-center mt-2 text-xs text-yellow-100 font-medium">
            <span>Volume: ₹{weeklyProgress.currentINR.toLocaleString()} INR</span>
            <span>
              {weeklyProgress.remainingINR > 0
                ? `₹${weeklyProgress.remainingINR.toLocaleString()} remaining`
                : '🎉 100% Target Met! Approval pending.'}
            </span>
            <span className="font-bold">Goal: ₹500,000 INR</span>
          </div>
        </div>
      )}

      {/* Pre-set Rules Explainer Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-sm">
          <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs mb-2">
            1
          </div>
          <h4 className="font-bold text-slate-900 text-sm">Individual Seller Milestones</h4>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            • 1 Lakh INR deposit $\rightarrow$ <strong>1,000 PKR</strong><br />
            • 2 Lakh INR deposit $\rightarrow$ <strong>2,000 PKR</strong><br />
            • 3 Lakh INR deposit $\rightarrow$ <strong>3,000 PKR</strong>
          </p>
        </div>

        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-sm">
          <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xs mb-2">
            2
          </div>
          <h4 className="font-bold text-slate-900 text-sm">Weekly Collective Target</h4>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            When all sellers combined reach <strong>₹5 Lakh INR</strong> within 7 days, get a{' '}
            <strong>5,000 PKR</strong> weekend award!
          </p>
        </div>

        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-sm">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs mb-2">
            3
          </div>
          <h4 className="font-bold text-slate-900 text-sm">First Seller 5 Orders</h4>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            When your first assigned seller completes <strong>5 successful orders</strong>, unlock a{' '}
            <strong>5,000 PKR</strong> starter booster.
          </p>
        </div>
      </div>

      {/* ─── PENDING ADMIN APPROVAL QUEUE ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-base flex items-center space-x-2">
            <span>Pending Reward Claims</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
              {pendingClaims.length}
            </span>
          </h3>
          <span className="text-xs text-slate-400">
            {isAdmin ? 'Requires your review & approval' : 'Awaiting Administrator review'}
          </span>
        </div>

        {pendingClaims.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center text-slate-400 text-xs">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
            <p className="font-semibold text-slate-700 text-sm">No pending reward claims</p>
            <p className="mt-0.5">All milestone earnings have been processed.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingClaims.map((claim) => (
              <div
                key={claim._id}
                className="bg-white rounded-3xl border-2 border-amber-300/80 p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-100 text-amber-800">
                        {claim.rewardType.replace(/_/g, ' ')}
                      </span>
                      <h4 className="font-bold text-slate-900 text-base mt-2">{claim.title}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">{claim.description}</p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xl sm:text-2xl font-black text-emerald-600 block">
                        Rs {claim.amountPKR.toLocaleString()}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase">PKR</span>
                    </div>
                  </div>

                  {/* Member attribution */}
                  <div className="flex items-center space-x-2 mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600">
                    <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[10px]">
                      {claim.memberId?.name?.charAt(0) || 'M'}
                    </div>
                    <span>
                      Earned by: <strong>{claim.memberId?.name}</strong> (@
                      {claim.memberId?.username})
                    </span>
                  </div>
                </div>

                {/* Admin Approval Actions */}
                {isAdmin ? (
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => handleApprove(claim._id)}
                      disabled={approvingId === claim._id}
                      className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 transition shadow-sm active:scale-95 disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                      <span>{approvingId === claim._id ? 'Crediting...' : 'Approve & Credit'}</span>
                    </button>

                    <button
                      onClick={() => handleReject(claim._id)}
                      className="py-2 px-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-semibold text-xs flex items-center justify-center space-x-1 transition"
                    >
                      <X className="w-4 h-4" />
                      <span>Decline</span>
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center space-x-1.5 text-xs text-amber-600 font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Under Review by Admin</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── PAST PROCESSED REWARDS HISTORY ─── */}
      <div className="space-y-3 pt-4">
        <h3 className="font-bold text-slate-900 text-base">Processed Rewards History</h3>

        {pastClaims.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 text-center text-slate-400 text-xs">
            No completed reward records yet.
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200/80 overflow-hidden divide-y divide-slate-100">
            {pastClaims.map((claim) => (
              <div
                key={claim._id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start space-x-3">
                  <div
                    className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${
                      claim.status === 'approved'
                        ? 'bg-emerald-50 text-emerald-600'
                        : 'bg-red-50 text-red-600'
                    }`}
                  >
                    {claim.status === 'approved' ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <XCircle className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{claim.title}</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Recipient: {claim.memberId?.name} •{' '}
                      {new Date(claim.approvedAt || claim.createdAt).toLocaleDateString()}
                    </p>
                    {claim.adminNote && (
                      <p className="text-[11px] text-slate-500 italic mt-1">Note: {claim.adminNote}</p>
                    )}
                  </div>
                </div>

                <div className="text-right self-end sm:self-auto">
                  <span
                    className={`text-base font-extrabold ${
                      claim.status === 'approved' ? 'text-emerald-600' : 'text-slate-400 line-through'
                    }`}
                  >
                    Rs {claim.amountPKR.toLocaleString()} PKR
                  </span>
                  <span
                    className={`text-[10px] block font-bold uppercase ${
                      claim.status === 'approved' ? 'text-emerald-700' : 'text-red-600'
                    }`}
                  >
                    {claim.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── MODAL: Admin Direct Bonus ─── */}
      {isBonusModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200 animate-scale-up">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Award Direct Member Bonus</h3>
                <p className="text-xs text-slate-400">
                  Credits wallet instantly & announces to the team group chat.
                </p>
              </div>
              <button
                onClick={() => setIsBonusModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGrantCustomBonus} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Recipient Team Member *
                </label>
                <select
                  required
                  value={bonusForm.memberId}
                  onChange={(e) => setBonusForm({ ...bonusForm, memberId: e.target.value })}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Choose Member --</option>
                  {members.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name} (@{m.username})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bonus Amount (PKR) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={bonusForm.amountPKR}
                  onChange={(e) => setBonusForm({ ...bonusForm, amountPKR: e.target.value })}
                  placeholder="e.g. 5000"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason / Celebration Note *
                </label>
                <input
                  type="text"
                  required
                  value={bonusForm.reason}
                  onChange={(e) => setBonusForm({ ...bonusForm, reason: e.target.value })}
                  placeholder="e.g. Exceptional customer retention & deposit surge"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsBonusModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bonusLoading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white shadow-sm flex items-center space-x-1"
                >
                  <Gift className="w-3.5 h-3.5" />
                  <span>{bonusLoading ? 'Awarding...' : 'Grant Bonus'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
