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
import { ColumnChart, BarList, DonutChart, LineLegend, colorForSlot } from '@/components/Charts';
import { useLiveRefresh } from '@/components/LiveProvider';

export default function RewardsPage() {
  const { user } = useAuth();
  const [claims, setClaims] = useState([]);
  const [progress, setProgress] = useState([]);
  const [devices, setDevices] = useState([]);
  const [deviceGifts, setDeviceGifts] = useState([]);
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

  // Screen controls
  const [rewardTab, setRewardTab] = useState('pending');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [progressSearch, setProgressSearch] = useState('');

  const isAdmin = user?.role === 'admin';

  const fetchData = async (silent = false) => {
    try {
      if (silent !== true) setLoading(true);
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
        setDevices(data.devices || []);
        setDeviceGifts(data.deviceGifts || []);
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
  // a new reward / an approval by the other partner shows up without a reload
  useLiveRefresh(() => fetchData(true));

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

  // ─── Numbers & charts ───
  const pk = (n) => `Rs ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
  const TYPE_LABEL = {
    wallet_300: '$300 wallet',
    daily_target: 'Daily target',
    weekly_target: 'Weekly target',
    custom_bonus: 'Special bonus',
    first_seller_5orders: 'Milestone',
    device_gift: 'Device gift',
  };
  const TYPE_ORDER = ['wallet_300', 'daily_target', 'weekly_target', 'device_gift', 'custom_bonus', 'first_seller_5orders'];
  const isGift = (c) => c?.rewardType === 'device_gift';
  const giftCostMissing = (c) => isGift(c) && c.gift?.costEntered !== true;
  const handleGiftDelivered = async (claim) => {
    if (!window.confirm(`Mark “${claim.title}” as handed over to ${claim.memberId?.name || 'the person'}?`)) return;
    try {
      const token = localStorage.getItem('portal_token');
      const res = await fetch(`/api/rewards/${claim._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ giftDelivered: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) alert(data.message || 'Could not save');
      fetchData(true);
    } catch (e) {
      alert(e.message);
    }
  };
  const typeName = (t) => TYPE_LABEL[t] || String(t || 'reward').replace(/_/g, ' ');
  const approved = claims.filter((c) => c.status === 'approved');
  const IST = 330 * 60000;
  const monthOf = (d) => new Date(new Date(d).getTime() + IST).toISOString().slice(0, 7);
  const thisMonth = monthOf(new Date());
  const stats = {
    pendingCount: pendingClaims.length,
    pendingPKR: pendingClaims.filter((c) => !giftCostMissing(c)).reduce((t, c) => t + (Number(c.amountPKR) || 0), 0),
    monthPKR: approved.filter((c) => monthOf(c.approvedAt || c.createdAt) === thisMonth).reduce((t, c) => t + (Number(c.amountPKR) || 0), 0),
    totalPKR: approved.reduce((t, c) => t + (Number(c.amountPKR) || 0), 0),
    approvedCount: approved.length,
    reversed: claims.filter((c) => c.status === 'reversed').length,
  };

  // last 6 months, stacked by reward type (fixed colour per type, never by rank)
  const months = [];
  {
    const now = new Date(Date.now() + IST);
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = d.toISOString().slice(0, 7);
      months.push({ key, short: d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }), full: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) });
    }
  }
  const typesUsed = TYPE_ORDER.filter((t) => approved.some((c) => c.rewardType === t));
  const monthSeries = typesUsed.map((t, i) => ({
    key: t,
    name: typeName(t),
    color: colorForSlot(TYPE_ORDER.indexOf(t)),
    values: months.map((m) => approved.filter((c) => c.rewardType === t && monthOf(c.approvedAt || c.createdAt) === m.key).reduce((s, c) => s + (Number(c.amountPKR) || 0), 0)),
  }));
  const earners = (() => {
    const map = new Map();
    for (const c of approved) {
      const id = String(c.memberId?._id || c.memberId || '');
      if (!id) continue;
      const row = map.get(id) || { id, name: c.memberId?.name || 'Someone', value: 0, n: 0 };
      row.value += Number(c.amountPKR) || 0;
      row.n += 1;
      map.set(id, row);
    }
    return [...map.values()].sort((a, b) => b.value - a.value).slice(0, 6).map((r) => ({ ...r, sub: `${r.n} reward${r.n === 1 ? '' : 's'}` }));
  })();
  const byType = typesUsed
    .map((t) => ({ id: t, name: typeName(t), color: colorForSlot(TYPE_ORDER.indexOf(t)), value: approved.filter((c) => c.rewardType === t).reduce((s, c) => s + (Number(c.amountPKR) || 0), 0) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);

  const filteredHistory = pastClaims.filter((c) => historyFilter === 'all' || c.status === historyFilter);
  const progressShown = progress.filter((p) => !progressSearch.trim() || `${p.storeName} ${p.ownerName || ''}`.toLowerCase().includes(progressSearch.trim().toLowerCase()));

  const StatusPill = ({ status }) => {
    const map = {
      approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      rejected: 'bg-red-50 text-red-700 border-red-200',
      reversed: 'bg-slate-100 text-slate-600 border-slate-200',
      pending: 'bg-amber-50 text-amber-800 border-amber-200',
    };
    return (
      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${map[status] || map.pending}`}>
        {status === 'reversed' ? 'taken back' : status === 'rejected' ? 'declined' : status}
      </span>
    );
  };

  const tabs = [
    { key: 'pending', label: 'Waiting', count: pendingClaims.length },
    { key: 'history', label: 'History', count: pastClaims.length },
    { key: 'progress', label: 'Seller progress', count: progress.length },
    { key: 'gifts', label: '🎁 Gifts', count: devices.length },
    { key: 'rules', label: 'Rules' },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Award className="w-6 h-6 text-amber-500" /> Rewards
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {isAdmin
              ? 'Rewards are created automatically and wait for approval. Approve, change, move or take back — every correction is logged.'
              : 'Your rewards and your sellers’ progress towards the next one. Approved rewards go into your wallet.'}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setIsBonusModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm flex items-center gap-1.5 shadow-sm active:scale-95 self-start sm:self-auto"
          >
            <Gift className="w-4 h-4 text-amber-400" /> Give a bonus
          </button>
        )}
      </div>

      {/* Numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          { label: 'Waiting for approval', value: `${stats.pendingCount}`, sub: stats.pendingCount ? pk(stats.pendingPKR) : 'nothing waiting', tone: stats.pendingCount ? 'text-amber-600' : 'text-slate-900' },
          { label: 'Approved this month', value: pk(stats.monthPKR), sub: 'PKR', tone: 'text-emerald-700' },
          { label: 'Approved all time', value: pk(stats.totalPKR), sub: `${stats.approvedCount} reward${stats.approvedCount === 1 ? '' : 's'}`, tone: 'text-slate-900' },
          { label: 'Taken back', value: `${stats.reversed}`, sub: 'corrected mistakes', tone: 'text-slate-900' },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{c.label}</div>
            <div className={`text-lg font-black leading-tight mt-0.5 ${c.tone}`}>{c.value}</div>
            <div className="text-[10px] text-slate-400">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      {approved.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-slate-900">Rewards approved per month (PKR)</h3>
            </div>
            <ColumnChart labels={months} series={monthSeries} format={pk} height={200} ariaLabel="Rewards approved per month" />
            <div className="mt-2">
              <LineLegend items={monthSeries.map((s) => ({ name: s.name, color: s.color, value: pk(s.values.reduce((a, b) => a + b, 0)) }))} />
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3">{isAdmin ? 'Who earned the most' : 'By type'}</h3>
            {isAdmin ? (
              <BarList items={earners} format={pk} emptyText="No approved rewards yet" />
            ) : (
              <DonutChart slices={byType} format={pk} totalLabel="All rewards" emptyText="No approved rewards yet" />
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setRewardTab(t.key)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
              rewardTab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`text-[10px] px-1.5 rounded-full ${t.key === 'pending' && t.count > 0 ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-600'}`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {loading && claims.length === 0 && <p className="text-sm text-slate-400">Loading rewards…</p>}

      {/* ─── Waiting ─── */}
      {rewardTab === 'pending' && (
        pendingClaims.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <CheckCircle className="w-9 h-9 text-emerald-500 mx-auto mb-2" />
            <p className="font-semibold text-slate-700 text-sm">Nothing is waiting</p>
            <p className="text-xs text-slate-400 mt-0.5">Every reward has been decided.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {pendingClaims.map((claim) => (
              <div key={claim._id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{typeName(claim.rewardType)}</span>
                      <span className="font-bold text-slate-900 text-sm">{claim.title}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      For <strong className="text-slate-700">{claim.memberId?.name || '—'}</strong>
                      {claim.sellerId?.storeName ? ` · ${claim.sellerId.storeName}` : ''} · {new Date(claim.createdAt).toLocaleDateString()}
                    </p>
                    {claim.description && <p className="text-[11px] text-slate-400 mt-0.5">{claim.description}</p>}
                    {isAdmin && claim.withdrawnAfterCount > 0 && (
                      <p className="text-[11px] text-red-600 bg-red-50 rounded-lg px-2 py-1 mt-1.5 font-semibold">
                        ⚠ This seller withdrew ${Number(claim.withdrawnAfterUSD).toFixed(2)} ({claim.withdrawnAfterCount} withdrawal{claim.withdrawnAfterCount > 1 ? 's' : ''}) since then. Check before approving.
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 md:justify-end">
                  <div className="text-right mr-auto md:mr-0">
                    {giftCostMissing(claim) ? (
                      <>
                        <div className="text-sm font-black text-amber-600 leading-tight">🎁 Cost not entered</div>
                        <div className="text-[10px] text-slate-400">buy it, then enter the price</div>
                      </>
                    ) : (
                      <>
                        <div className="text-lg font-black text-emerald-600 leading-tight">{pk(claim.amountPKR)}</div>
                        <div className="text-[10px] text-slate-400">{isGift(claim) ? 'PKR · purchase cost' : 'PKR'}</div>
                      </>
                    )}
                  </div>
                  {isAdmin ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleApprove(claim._id)}
                        disabled={approvingId === claim._id || giftCostMissing(claim)}
                        title={giftCostMissing(claim) ? 'Enter the real purchase cost first' : undefined}
                        className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1 disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" /> {approvingId === claim._id ? 'Saving…' : 'Approve'}
                      </button>
                      <button
                        onClick={() => { setFixMsg(''); setFix({ claim, mode: 'edit', memberId: claim.memberId?._id || '', amountPKR: giftCostMissing(claim) ? '' : claim.amountPKR, reason: '' }); }}
                        className={`px-3 py-2 rounded-lg font-semibold text-xs ${giftCostMissing(claim) ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                        title={isGift(claim) ? 'Enter the real purchase cost of the gift (PKR)' : 'Wrong person or amount? Change it before approving'}
                      >
                        {giftCostMissing(claim) ? 'Enter cost' : 'Change'}
                      </button>
                      <button onClick={() => handleReject(claim._id)} className="px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-semibold text-xs">
                        Decline
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-amber-600 font-semibold flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> Waiting for a partner
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ─── History ─── */}
      {rewardTab === 'history' && (
        <div className="space-y-3">
          <div className="flex gap-1.5 overflow-x-auto">
            {[
              { key: 'all', label: 'All' },
              { key: 'approved', label: 'Approved' },
              { key: 'rejected', label: 'Declined' },
              { key: 'reversed', label: 'Taken back' },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setHistoryFilter(f.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap ${historyFilter === f.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {filteredHistory.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-xs text-slate-400">Nothing here yet.</div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
              {filteredHistory.map((claim) => (
                <div key={claim._id} className="p-3.5 sm:px-4 flex flex-col sm:flex-row sm:items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {StatusPill({ status: claim.status })}
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{typeName(claim.rewardType)}</span>
                      <span className="font-semibold text-slate-900 text-sm">{claim.title}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {claim.memberId?.name || '—'} · {new Date(claim.approvedAt || claim.createdAt).toLocaleDateString()}
                      {claim.adminNote ? ` · “${claim.adminNote}”` : ''}
                    </p>
                    {isAdmin && claim.warning && claim.status === 'approved' && <p className="text-[11px] text-red-600 bg-red-50 rounded-lg px-2 py-1 mt-1 font-semibold">⚠ {claim.warning}</p>}
                    {isAdmin && claim.status === 'approved' && claim.withdrawnAfterCount > 0 && (
                      <p className="text-[11px] text-amber-700 mt-1">Seller withdrew ${Number(claim.withdrawnAfterUSD).toFixed(2)} since this reward.</p>
                    )}
                    {Array.isArray(claim.history) && claim.history.length > 0 && (
                      <div className="mt-1 space-y-0.5">
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
                  <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0">
                    <span className={`text-sm font-black ${claim.status === 'approved' ? 'text-emerald-600' : 'text-slate-400 line-through'}`}>{giftCostMissing(claim) ? '🎁' : pk(claim.amountPKR)}</span>
                    {isGift(claim) && claim.status === 'approved' && (
                      claim.gift?.status === 'delivered' ? (
                        <span className="text-[11px] font-bold text-emerald-700">✓ Handed over{claim.gift?.deliveredAt ? ` ${new Date(claim.gift.deliveredAt).toLocaleDateString()}` : ''}</span>
                      ) : isAdmin ? (
                        <button onClick={() => handleGiftDelivered(claim)} className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-semibold">
                          Mark handed over
                        </button>
                      ) : (
                        <span className="text-[11px] font-semibold text-amber-600">To be handed over</span>
                      )
                    )}
                    {isAdmin && claim.status === 'approved' && (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => { setFixMsg(''); setFix({ claim, mode: 'move', memberId: '', reason: '' }); }}
                          className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold"
                          title="Given to the wrong person? Move it (the other partner approves)"
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Seller progress ─── */}
      {rewardTab === 'progress' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-500" /> Progress per seller <span className="text-xs font-normal text-slate-400">(from 1 Oct 2026, real money only)</span>
            </h3>
            {progress.length > 6 && (
              <input
                value={progressSearch}
                onChange={(e) => setProgressSearch(e.target.value)}
                placeholder="Search seller"
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs sm:w-48"
              />
            )}
          </div>
          {progressShown.length === 0 ? (
            <p className="p-5 text-xs text-slate-400">No real deposits yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-400">
                  <tr>
                    <th className="text-left font-semibold px-4 py-2">Seller</th>
                    {isAdmin && <th className="text-left font-semibold px-4 py-2">Owner</th>}
                    <th className="text-left font-semibold px-4 py-2">$300 reward (real $)</th>
                    <th className="text-right font-semibold px-4 py-2">Today (INR)</th>
                    <th className="text-right font-semibold px-4 py-2">This week (INR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {progressShown.map((p) => (
                    <tr key={p.sellerId}>
                      <td className="px-4 py-2 font-semibold text-slate-800">{p.storeName}</td>
                      {isAdmin && <td className="px-4 py-2 text-slate-600">{p.ownerName || '—'}</td>}
                      <td className="px-4 py-2">
                        {p.wallet300Done ? (
                          <span className="text-emerald-600 font-bold">✓ reached (${Number(p.realUSD).toFixed(2)})</span>
                        ) : (
                          <div className="min-w-[150px]">
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
                      <td className="px-4 py-2 text-right">
                        ₹{Math.round(p.todayINR).toLocaleString('en-IN')}
                        <div className="text-[10px] text-slate-400">{p.todayINR >= 100000 ? `tier ${Math.min(5, Math.floor(p.todayINR / 100000))} reached` : `₹${Math.round(100000 - p.todayINR).toLocaleString('en-IN')} to ₹1L`}</div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        ₹{Math.round(p.weekINR).toLocaleString('en-IN')}
                        <div className="w-24 ml-auto bg-slate-100 rounded-full h-1 mt-1">
                          <div className="bg-indigo-500 h-1 rounded-full" style={{ width: `${Math.min(100, (p.weekINR / 500000) * 100)}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Device gifts ─── */}
      {rewardTab === 'gifts' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Gift className="w-4 h-4 text-amber-500" /> Device gifts
              <span className="text-xs font-normal text-slate-400">net = all sellers&apos; real USDT deposits − their withdrawals, from 1 Oct 2026</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">
              {(deviceGifts.length ? deviceGifts : [{ item: 'iphone', usdt: 10000, label: 'iPhone 17 Pro Max' }, { item: 'laptop', usdt: 20000, label: 'Laptop' }])
                .map((g) => `₮${Number(g.usdt).toLocaleString('en-US')} → ${g.label}`)
                .join(' · ')}
              . Once reached it stays earned.
            </p>
          </div>
          {devices.length === 0 ? (
            <p className="p-5 text-xs text-slate-400">No real deposits yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {devices.map((d) => {
                const top = deviceGifts.length ? Math.max(...deviceGifts.map((g) => g.usdt)) : 20000;
                return (
                  <li key={d.ownerId} className="p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-bold text-slate-900 text-sm">
                        {d.ownerName}
                        {d.role === 'admin' && <span className="ml-1.5 text-[10px] font-bold uppercase text-slate-400">partner</span>}
                      </p>
                      <p className="text-xs text-slate-500 tabular-nums">
                        Net <b className={d.net >= 0 ? 'text-slate-900' : 'text-red-600'}>₮{Number(d.net).toLocaleString('en-US', { maximumFractionDigits: 2 })}</b>
                        <span className="text-slate-400"> = ₮{Number(d.depositUSDT).toLocaleString('en-US', { maximumFractionDigits: 2 })} in − ₮{Number(d.withdrawUSDT).toLocaleString('en-US', { maximumFractionDigits: 2 })} out</span>
                      </p>
                    </div>
                    <div className="relative w-full bg-slate-100 rounded-full h-2 mt-2">
                      <div className="bg-amber-500 h-2 rounded-full" style={{ width: `${Math.max(0, Math.min(100, (d.net / top) * 100))}%` }} />
                      {(d.gifts || []).map((g) => (
                        <span key={g.item} className="absolute -top-0.5 w-0.5 h-3 bg-slate-500" style={{ left: `${Math.min(100, (g.usdt / top) * 100)}%` }} />
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(d.gifts || []).map((g) => {
                        const state = g.reachedAt
                          ? g.giftStatus === 'delivered'
                            ? { t: '✓ Handed over', c: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
                            : g.claimStatus === 'approved'
                            ? { t: 'Approved · to hand over', c: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
                            : g.claimStatus === 'reversed' || g.claimStatus === 'rejected'
                            ? { t: g.claimStatus === 'reversed' ? 'Taken back' : 'Declined', c: 'bg-slate-50 text-slate-500 border-slate-200' }
                            : { t: 'Earned · waiting for approval', c: 'bg-amber-50 text-amber-800 border-amber-200' }
                          : { t: `₮${Math.max(0, g.usdt - d.net).toLocaleString('en-US', { maximumFractionDigits: 2 })} to go`, c: 'bg-slate-50 text-slate-600 border-slate-200' };
                        return (
                          <span key={g.item} className={`text-[11px] font-semibold px-2 py-1 rounded-lg border ${state.c}`}>
                            {g.item === 'iphone' ? '📱' : '💻'} {g.label} — {state.t}
                          </span>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* ─── Rules ─── */}
      {rewardTab === 'rules' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { n: 1, tone: 'bg-emerald-50 text-emerald-600', title: '$300 wallet reward', body: <>When a seller&apos;s <strong>real</strong> deposits (helping not counted) reach <strong>$300</strong> → <strong>5,000 PKR</strong>. Once per seller.</> },
            { n: 2, tone: 'bg-blue-50 text-blue-600', title: 'Daily target (one seller, one day)', body: <>₹1L → <strong>1,000</strong> · ₹2L → <strong>2,000</strong> · ₹3L → <strong>3,000</strong> · ₹4L → <strong>4,000</strong> · ₹5L+ → <strong>5,000 PKR</strong>. Only the highest tier of the day, given after the day ends (India time).</> },
            { n: 3, tone: 'bg-amber-50 text-amber-600', title: 'Weekly target (one seller)', body: <><strong>₹5 Lakh</strong> real INR from Monday to Sunday → <strong>5,000 PKR</strong>, given after the week ends.</> },
            { n: 4, tone: 'bg-cyan-50 text-cyan-700', title: 'Device gifts (all your sellers together)', body: <>Net real USDT (deposits − withdrawals, from 1 Oct 2026) reaches <strong>₮10,000</strong> → <strong>iPhone 17 Pro Max</strong> (White, 256GB, Non-PTA); <strong>₮20,000</strong> → <strong>Laptop</strong> (PKR 2–3 lakh). Each once; once reached it stays earned. Diamond fees count; previous-store sellers do not.</> },
          ].map((r) => (
            <div key={r.n} className="bg-white rounded-2xl p-4 border border-slate-200">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs mb-2 ${r.tone}`}>{r.n}</div>
              <h4 className="font-bold text-slate-900 text-sm">{r.title}</h4>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{r.body}</p>
            </div>
          ))}
        </div>
      )}

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
                <label className="block text-xs font-semibold text-slate-700 mb-1">{isGift(fix.claim) ? 'Real purchase cost of the gift (PKR)' : 'Amount (PKR)'}</label>
                {isGift(fix.claim) && <p className="text-[11px] text-slate-500 mb-1">Paid 50 / 50 by the two partners. The person's wallet does not change (he gets the device, not money).</p>}
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
