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
  const [progress, setProgress] = useState([]);
  // Fixing a mistake: { claim, mode: 'edit' | 'reverse' | 'move', memberId, amountPKR, reason }
  const [fix, setFix] = useState(null);
  const [fixBusy, setFixBusy] = useState(false);
  const [fixMsg, setFixMsg] = useState('');
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
        setProgress(data.progress || []);
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

  // Fix a mistake: change a waiting reward, or take back / move an approved one (partner approves)
  const submitFix = async (e) => {
    e?.preventDefault();
    if (!fix) return;
    setFixBusy(true);
    setFixMsg('');
    try {
      const token = localStorage.getItem('portal_token');
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
      const res =
        fix.mode === 'edit'
          ? await fetch(`/api/rewards/${fix.claim._id}`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify({ memberId: fix.memberId, amountPKR: fix.amountPKR, note: fix.reason }),
            })
          : await fetch(`/api/rewards/${fix.claim._id}/correct`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ action: fix.mode, memberId: fix.memberId, reason: fix.reason }),
            });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFixMsg(data.message || 'Could not save');
        return;
      }
      setFix(null);
      alert(data.message || 'Saved');
      fetchData();
    } catch (err) {
      setFixMsg(err.message);
    } finally {
      setFixBusy(false);
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
    <div className="flex flex-col space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="order-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
              ? 'Rewards are created automatically (pending). Approve, change, move or take back — every correction is logged.'
              : 'Your sellers’ progress towards the next reward. Approved rewards are added to your wallet.'}
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

      {/* Progress towards the next reward, per seller */}
      <div className="order-2 bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Flame className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-slate-900 text-sm">Progress per seller (from 1 Oct 2026, real money only)</h3>
        </div>
        {progress.length === 0 ? (
          <p className="p-5 text-xs text-slate-400">No real deposits yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2">Seller</th>
                  {isAdmin && <th className="text-left px-4 py-2">Owner</th>}
                  <th className="text-left px-4 py-2">$300 reward (real $)</th>
                  <th className="text-right px-4 py-2">Today (INR)</th>
                  <th className="text-right px-4 py-2">This week (INR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {progress.map((p) => (
                  <tr key={p.sellerId}>
                    <td className="px-4 py-2 font-semibold text-slate-800">{p.storeName}</td>
                    {isAdmin && <td className="px-4 py-2 text-slate-600">{p.ownerName || '—'}</td>}
                    <td className="px-4 py-2">
                      {p.wallet300Done ? (
                        <span className="text-emerald-600 font-bold">✓ reached (${Number(p.realUSD).toFixed(2)})</span>
                      ) : (
                        <div className="min-w-[140px]">
                          <div className="flex justify-between text-[11px] text-slate-500">
                            <span>${Number(p.realUSD).toFixed(2)} / $300</span>
                            <span>${Math.max(0, 300 - p.realUSD).toFixed(2)} left</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1">
                            <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (p.realUSD / 300) * 100)}%` }} />
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">₹{Math.round(p.todayINR).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2 text-right">₹{Math.round(p.weekINR).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reward rules */}
      <div className="order-5 sm:order-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-sm">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs mb-2">1</div>
          <h4 className="font-bold text-slate-900 text-sm">$300 wallet reward</h4>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            When a seller&apos;s <strong>real</strong> deposits (helping not counted) reach <strong>$300</strong> →{' '}
            <strong>5,000 PKR</strong>. Once per seller.
          </p>
        </div>
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-sm">
          <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs mb-2">2</div>
          <h4 className="font-bold text-slate-900 text-sm">Daily target (one seller, one day)</h4>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            ₹1L → <strong>1,000</strong> • ₹2L → <strong>2,000</strong> • ₹3L → <strong>3,000</strong> • ₹4L → <strong>4,000</strong> • ₹5L+ → <strong>5,000 PKR</strong>
            <br />Only the highest tier of the day. Given after the day ends (India time).
          </p>
        </div>
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-sm">
          <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xs mb-2">3</div>
          <h4 className="font-bold text-slate-900 text-sm">Weekly target (one seller)</h4>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            <strong>₹5 Lakh</strong> real INR from Monday to Sunday → <strong>5,000 PKR</strong>, given after the week ends.
          </p>
        </div>
      </div>

      {/* ─── PENDING ADMIN APPROVAL QUEUE ─── */}
      <div className="order-3 sm:order-4 space-y-3">
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
                      {isAdmin && claim.withdrawnAfterCount > 0 && (
                        <p className="text-[11px] text-red-600 bg-red-50 rounded-lg px-2 py-1 mt-1.5 font-semibold">
                          ⚠ This seller withdrew ${Number(claim.withdrawnAfterUSD).toFixed(2)} ({claim.withdrawnAfterCount} withdrawal{claim.withdrawnAfterCount > 1 ? 's' : ''}) since then. Check before approving.
                        </p>
                      )}
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
                      onClick={() => { setFixMsg(''); setFix({ claim, mode: 'edit', memberId: claim.memberId?._id || '', amountPKR: claim.amountPKR, reason: '' }); }}
                      className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs"
                      title="Wrong person or amount? Change it before approving"
                    >
                      Change
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
      <div className="order-4 sm:order-5 space-y-3 pt-4">
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
                    {isAdmin && claim.warning && claim.status === 'approved' && (
                      <p className="text-[11px] text-red-600 bg-red-50 rounded-lg px-2 py-1 mt-1 font-semibold">⚠ {claim.warning}</p>
                    )}
                    {isAdmin && claim.status === 'approved' && claim.withdrawnAfterCount > 0 && (
                      <p className="text-[11px] text-amber-700 mt-1">Seller withdrew ${Number(claim.withdrawnAfterUSD).toFixed(2)} since this reward.</p>
                    )}
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
                      claim.status === 'approved' ? 'text-emerald-700' : claim.status === 'reversed' ? 'text-slate-500' : 'text-red-600'
                    }`}
                  >
                    {claim.status === 'reversed' ? 'taken back' : claim.status}
                  </span>
                  {isAdmin && claim.status === 'approved' && (
                    <div className="flex gap-1.5 justify-end mt-2">
                      <button
                        onClick={() => { setFixMsg(''); setFix({ claim, mode: 'move', memberId: '', reason: '' }); }}
                        className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold"
                        title="Given to the wrong person? Move it to the right one (the other partner approves)"
                      >
                        Move
                      </button>
                      <button
                        onClick={() => { setFixMsg(''); setFix({ claim, mode: 'reverse', reason: '' }); }}
                        className="px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-[11px] font-semibold"
                        title="Given by mistake? Take it back (the other partner approves)"
                      >
                        Take back
                      </button>
                    </div>
                  )}
                  {Array.isArray(claim.history) && claim.history.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {claim.history.map((h, i) => (
                        <p key={i} className="text-[10px] text-slate-400">
                          {new Date(h.at).toLocaleDateString()} · {h.action}
                          {h.to?.name ? ` → ${h.to.name}` : ''}
                          {h.by ? ` · ${h.by}` : ''}
                          {h.note ? ` · “${h.note}”` : ''}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── MODAL: Fix a mistake ─── */}
      {fix && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !fixBusy && setFix(null)}>
          <form onSubmit={submitFix} onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200 space-y-3.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  {fix.mode === 'edit' ? 'Change this waiting reward' : fix.mode === 'move' ? 'Move reward to another person' : 'Take back this reward'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {fix.claim.title} — Rs {Number(fix.claim.amountPKR).toLocaleString()} PKR — now with <strong>{fix.claim.memberId?.name}</strong>
                </p>
              </div>
              <button type="button" onClick={() => setFix(null)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {(fix.mode === 'edit' || fix.mode === 'move') && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{fix.mode === 'move' ? 'Give it to *' : 'Person'}</label>
                <select
                  value={fix.memberId}
                  required={fix.mode === 'move'}
                  onChange={(e) => setFix({ ...fix, memberId: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                >
                  <option value="">— choose —</option>
                  {members
                    .filter((m) => fix.mode !== 'move' || String(m._id) !== String(fix.claim.memberId?._id))
                    .map((m) => (
                      <option key={m._id} value={m._id}>
                        {m.name} ({m.role})
                      </option>
                    ))}
                </select>
              </div>
            )}

            {fix.mode === 'edit' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (PKR)</label>
                <input
                  type="number"
                  min="1"
                  value={fix.amountPKR}
                  onChange={(e) => setFix({ ...fix, amountPKR: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Reason {fix.mode === 'edit' ? '(optional)' : '*'}</label>
              <input
                value={fix.reason}
                required={fix.mode !== 'edit'}
                minLength={fix.mode !== 'edit' ? 3 : undefined}
                onChange={(e) => setFix({ ...fix, reason: e.target.value })}
                placeholder="e.g. given to the wrong member by mistake"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
            </div>

            <p className="text-[11px] text-slate-500 bg-slate-50 rounded-xl p-2.5">
              {fix.mode === 'edit'
                ? 'Nothing is counted yet, so the change is saved at once (it is written to the activity log).'
                : fix.mode === 'move'
                ? 'Goes to the other partner for approval. Then it leaves this person’s wallet and goes to the chosen person (same amount and PKR rate).'
                : 'Goes to the other partner for approval. Then the reward is no longer counted: it leaves this person’s wallet and the partners get their 50 / 50 cost back. The record is kept.'}
            </p>

            {fixMsg && <p className="text-xs text-red-600 bg-red-50 rounded-xl p-2.5">{fixMsg}</p>}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setFix(null)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
              <button
                type="submit"
                disabled={fixBusy}
                className={`px-4 py-2 rounded-xl text-xs font-semibold text-white ${fix.mode === 'reverse' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'} disabled:opacity-50`}
              >
                {fixBusy ? 'Saving…' : fix.mode === 'edit' ? 'Save change' : 'Send for approval'}
              </button>
            </div>
          </form>
        </div>
      )}

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
