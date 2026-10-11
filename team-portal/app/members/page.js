'use client';

import React, { useState, useEffect } from 'react';
import { useLiveRefresh } from '@/components/LiveProvider';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import confetti from 'canvas-confetti';
import {
  Users,
  UserPlus,
  Wallet,
  TrendingUp,
  TrendingDown,
  Clock,
  Gift,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  X,
  Phone,
  Mail,
  User,
  KeyRound,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Search,
  MoreVertical,
  Link2,
} from 'lucide-react';
import WalletModal from '@/components/WalletModal';

const fmtUsdt = (n) => `₮${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtInr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

/**
 * Partners' view of the referrals: for every member who brought other 1:1 members, what HE (the
 * referrer) earned and paid. Written in his name ("Cole earned"), never as if the partner did it.
 */
function ReferralsOverview({ groups, loading, error, onOpenMember }) {
  if (loading) return <p className="text-sm text-slate-500">Loading referrals…</p>;
  if (error) return <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>;
  if (!groups.length) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
        No member has brought another member yet.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Only members bring members (partners are never referrers). The commission comes out of the brought member’s own share — never
        from the partners. Each referrer sees this on his own “My Members” page.
      </p>
      {groups.map((g) => (
        <div key={g.referrerId} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white font-bold flex items-center justify-center text-sm shrink-0">
                {String(g.referrerName || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <button type="button" onClick={() => onOpenMember(g.referrerId)} className="font-bold text-slate-900 text-sm hover:underline text-left">
                  {g.referrerName}
                </button>
                <div className="text-[11px] text-slate-500">
                  brought {g.totals.members} member{g.totals.members === 1 ? '' : 's'}
                  {!g.referrerActive && <span className="text-red-600"> · account off (earns nothing on new deposits)</span>}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-right">
              <div>
                <div className="text-[10px] text-slate-400">{g.referrerName} earned</div>
                <div className="text-sm font-bold text-emerald-700">{fmtUsdt(g.totals.earnedUSDT)}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">{g.referrerName} paid</div>
                <div className="text-sm font-bold text-red-600">{fmtUsdt(g.totals.paidUSDT)}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">Net</div>
                <div className={`text-sm font-black ${g.totals.netUSDT < 0 ? 'text-red-600' : 'text-slate-900'}`}>{fmtUsdt(g.totals.netUSDT)}</div>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-400">
                <tr>
                  <th className="text-left font-semibold px-4 py-2">Brought member</th>
                  <th className="text-right font-semibold px-3 py-2">Commission</th>
                  <th className="text-right font-semibold px-3 py-2">Stores</th>
                  <th className="text-right font-semibold px-3 py-2">Deposits</th>
                  <th className="text-right font-semibold px-3 py-2">Withdrawals</th>
                  <th className="text-right font-semibold px-3 py-2">{g.referrerName} earned</th>
                  <th className="text-right font-semibold px-3 py-2">{g.referrerName} paid</th>
                  <th className="text-right font-semibold px-4 py-2">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {g.members.map((m) => (
                  <tr key={m.memberId}>
                    <td className="px-4 py-2">
                      <button type="button" onClick={() => onOpenMember(m.memberId)} className="font-semibold text-slate-800 hover:underline text-left">
                        {m.name}
                      </button>
                      <div className="text-[10px] text-slate-400">
                        since {new Date(m.since).toLocaleDateString()}
                        {!m.active ? ' · account off' : ''}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-indigo-700">{m.pct}%</td>
                    <td className="px-3 py-2 text-right">{m.sellers}</td>
                    <td className="px-3 py-2 text-right">
                      {fmtUsdt(m.depositUSDT)}
                      <div className="text-[10px] text-slate-400">{fmtInr(m.depositINR)} · {m.deposits}</div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmtUsdt(m.withdrawUSDT)}
                      <div className="text-[10px] text-slate-400">{fmtInr(m.withdrawINR)} · {m.withdrawals}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-700">{fmtUsdt(m.earnedUSDT)}</td>
                    <td className="px-3 py-2 text-right text-red-600">{fmtUsdt(m.paidUSDT)}</td>
                    <td className={`px-4 py-2 text-right font-bold ${m.netUSDT < 0 ? 'text-red-600' : 'text-slate-900'}`}>{fmtUsdt(m.netUSDT)}</td>
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

export default function MembersPage() {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Financial Wallet Statement Modal
  const [walletModalMember, setWalletModalMember] = useState(null);

  // Expanded member ID for client drill-down
  const [expandedMemberId, setExpandedMemberId] = useState(null);

  // Create Member Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    username: '',
    password: '',
    phone: '',
    role: 'member',
    commissionLabel: 'pkr_1to1',
    referredBy: '',
    referralPct: '',
  });
  const [createLoading, setCreateLoading] = useState(false);
  // Second step before sending: everything is shown once more (the referral can never be changed)
  const [createConfirm, setCreateConfirm] = useState(false);

  // Quick switch of commission agreement for Admin
  const handleUpdateCommissionLabel = async (memberId, newLabel) => {
    try {
      const token = localStorage.getItem('portal_token');
      const res = await fetch(`/api/members/${memberId}/commission-label`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ commissionLabel: newLabel }),
      });

      if (res.ok) {
        setMembers((prev) =>
          prev.map((m) => (m._id === memberId ? { ...m, commissionLabel: newLabel } : m))
        );
        fetchData();
      } else {
        const data = await res.json();
        alert(data.message || 'Failed to update commission agreement');
      }
    } catch (err) {
      console.error('Update commission label error:', err);
    }
  };

  // Bonus Award Modal
  const [bonusMember, setBonusMember] = useState(null);
  const [bonusAmount, setBonusAmount] = useState('');
  const [bonusReason, setBonusReason] = useState('');
  const [bonusLoading, setBonusLoading] = useState(false);

  // Edit Password Modal
  const [editPasswordMember, setEditPasswordMember] = useState(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [editPasswordLoading, setEditPasswordLoading] = useState(false);
  const [editPasswordMsg, setEditPasswordMsg] = useState({ text: '', type: '' });

  // Delete Member Confirmation Modal
  const [deleteConfirmMember, setDeleteConfirmMember] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // List controls
  const [memberSearch, setMemberSearch] = useState('');
  const [memberFilter, setMemberFilter] = useState('all');
  const [openMenuId, setOpenMenuId] = useState(null);
  const [dealChange, setDealChange] = useState(null); // { member, to }
  const [tab, setTab] = useState(() => {
    if (typeof window === 'undefined') return 'members';
    return new URLSearchParams(window.location.search).get('tab') === 'referrals' ? 'referrals' : 'members';
  });

  // Referrals overview (who brought whom, and what the referrer earned / paid)
  const [referralGroups, setReferralGroups] = useState([]);
  const [referralsLoading, setReferralsLoading] = useState(true);
  const [referralsError, setReferralsError] = useState('');
  const loadReferrals = async () => {
    try {
      const token = localStorage.getItem('portal_token');
      const res = await fetch('/api/referrals', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not load referrals');
      setReferralGroups(data.groups || []);
      setReferralsError('');
    } catch (e) {
      setReferralsError(e.message);
    } finally {
      setReferralsLoading(false);
    }
  };

  const router = useRouter();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const fetchData = async (silent = false) => {
    try {
      if (silent !== true) setLoading(true);
      const token = localStorage.getItem('portal_token');
      const headers = { Authorization: `Bearer ${token}` };

      const [membersRes, sellersRes] = await Promise.all([
        fetch('/api/members', { headers }),
        fetch('/api/sellers', { headers }),
      ]);

      if (membersRes.ok) {
        const mData = await membersRes.json();
        setMembers(mData.members || []);
      }

      if (sellersRes.ok) {
        const sData = await sellersRes.json();
        setSellers(sData.sellers || []);
      }
    } catch (err) {
      console.error('Fetch members error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchData();
      loadReferrals();
    }
  }, [isAdmin]);

  // Wallet balances follow new deposits / payouts without a reload
  useLiveRefresh(() => {
    if (isAdmin) {
      fetchData(true);
      loadReferrals();
    }
  });

  const handleCreateMember = async (e) => {
    e?.preventDefault();
    if (!createForm.name.trim()) return;
    if (createForm.referredBy) {
      const pct = Number(createForm.referralPct);
      if (!(pct >= 1 && pct <= 20) || Math.round(pct * 2) !== pct * 2) {
        alert('Commission must be between 1% and 20% (whole or half percent, e.g. 5 or 2.5).');
        return;
      }
    }
    if (!createConfirm) {
      setCreateConfirm(true);
      return;
    }

    try {
      setCreateLoading(true);
      const token = localStorage.getItem('portal_token');
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...createForm,
          referredBy: createForm.commissionLabel === 'pkr_1to1' ? createForm.referredBy : '',
          referralPct: createForm.commissionLabel === 'pkr_1to1' && createForm.referredBy ? Number(createForm.referralPct) : 0,
        }),
      });

      if (res.ok) {
        const created = await res.json().catch(() => ({}));
        setIsCreateModalOpen(false);
        setCreateConfirm(false);
        setCreateForm({ name: '', username: '', password: '', phone: '', role: 'member', commissionLabel: 'pkr_1to1', referredBy: '', referralPct: '' });
        fetchData();
        // The member is made once the other partner approves (and a random password is shown only now)
        alert(created.message || 'Sent for approval.');
      } else {
        const data = await res.json();
        alert(data.message || 'Failed to create member');
      }
    } catch (err) {
      console.error('Create member error:', err);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleSendBonus = async (e) => {
    e?.preventDefault();
    if (!bonusMember || !bonusAmount) return;

    try {
      setBonusLoading(true);
      const token = localStorage.getItem('portal_token');
      const res = await fetch('/api/rewards/bonus', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          memberId: bonusMember._id,
          amountPKR: Number(bonusAmount),
          reason: bonusReason || 'Performance Award',
        }),
      });

      if (res.ok) {
        confetti({
          particleCount: 100,
          spread: 80,
          origin: { y: 0.6 },
        });
        setBonusMember(null);
        setBonusAmount('');
        setBonusReason('');
        fetchData();
      } else {
        const data = await res.json();
        alert(data.message || 'Failed to send bonus');
      }
    } catch (err) {
      console.error('Send bonus error:', err);
    } finally {
      setBonusLoading(false);
    }
  };

  // ─── ADMIN: Change Member Password ───
  const handleEditPasswordSubmit = async (e) => {
    e?.preventDefault();
    if (!editPasswordMember || !newPasswordInput) return;

    if (newPasswordInput.length < 6) {
      setEditPasswordMsg({ text: 'Password must be at least 6 characters', type: 'error' });
      return;
    }

    try {
      setEditPasswordLoading(true);
      setEditPasswordMsg({ text: '', type: '' });
      const token = localStorage.getItem('portal_token');

      const res = await fetch(`/api/members/${editPasswordMember._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: newPasswordInput }),
      });

      const data = await res.json();
      if (res.ok) {
        setEditPasswordMsg({
          text: `Password updated successfully for ${editPasswordMember.name}!`,
          type: 'success',
        });
        setTimeout(() => {
          setEditPasswordMember(null);
          setNewPasswordInput('');
          setEditPasswordMsg({ text: '', type: '' });
          fetchData();
        }, 1200);
      } else {
        setEditPasswordMsg({ text: data.message || 'Failed to update password', type: 'error' });
      }
    } catch (err) {
      console.error('Edit password error:', err);
      setEditPasswordMsg({ text: 'Network error occurred', type: 'error' });
    } finally {
      setEditPasswordLoading(false);
    }
  };

  // ─── ADMIN: Delete Member ───
  const handleDeleteMember = async () => {
    if (!deleteConfirmMember) return;

    try {
      setDeleteLoading(true);
      const token = localStorage.getItem('portal_token');

      const res = await fetch(`/api/members/${deleteConfirmMember._id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (res.ok) {
        setDeleteConfirmMember(null);
        fetchData();
      } else {
        alert(data.message || 'Failed to delete member');
      }
    } catch (err) {
      console.error('Delete member error:', err);
      alert('Network error occurred while deleting member');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (!user || user.role !== 'admin') {
    return (
      <div className="py-24 text-center">
        <div className="w-16 h-16 rounded-3xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Admin Only Access</h2>
        <p className="text-xs text-slate-500 mt-1">
          The Members management section is restricted exclusively to administrators. Redirecting to dashboard...
        </p>
      </div>
    );
  }

  // ─── Derived lists for the screen ───
  const sid = (v) => (v ? String(v) : '');
  const byId = new Map(members.map((m) => [sid(m._id), m]));
  const broughtBy = (m) => (m.referredBy ? byId.get(sid(m.referredBy)) || null : null);
  const broughtList = (m) => members.filter((x) => sid(x.referredBy) === sid(m._id));
  const walletOf = (m) =>
    m.wallet?.balanceUSDT != null
      ? Number(m.wallet.balanceUSDT) || 0
      : (Number(m.wallet?.balancePKR || m.netBalancePKR || 0) / 280) + (Number(m.wallet?.balanceINR || 0) / 90);
  const usd = (n) => `₮${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const q = memberSearch.trim().toLowerCase();
  const visibleMembers = members.filter((m) => {
    if (q && !`${m.name} ${m.username} ${m.phone || ''}`.toLowerCase().includes(q)) return false;
    if (memberFilter === 'partners') return m.role === 'admin';
    if (memberFilter === 'pkr') return m.role !== 'admin' && (m.commissionLabel || 'pkr_1to1') === 'pkr_1to1';
    if (memberFilter === 'inr') return m.role !== 'admin' && m.commissionLabel === 'inr_50';
    if (memberFilter === 'referral') return !!m.referredBy || broughtList(m).length > 0;
    if (memberFilter === 'off') return m.active === false;
    return true;
  });
  const partnersShown = visibleMembers.filter((m) => m.role === 'admin');
  const membersShown = visibleMembers.filter((m) => m.role !== 'admin');

  const teamTotals = {
    members: members.filter((m) => m.role !== 'admin').length,
    active: members.filter((m) => m.role !== 'admin' && m.active !== false).length,
    stores: members.reduce((t, m) => t + (Number(m.totalClients) || 0), 0),
    deposited: members.reduce((t, m) => t + (Number(m.totalDepositsINR) || 0), 0),
    owedToMembers: members.filter((m) => m.role !== 'admin').reduce((t, m) => t + walletOf(m), 0),
    referrals: members.filter((m) => !!m.referredBy).length,
  };

  const filterChips = [
    { key: 'all', label: 'All' },
    { key: 'partners', label: 'Partners' },
    { key: 'pkr', label: '1:1 PKR' },
    { key: 'inr', label: '50% INR' },
    { key: 'referral', label: 'In a referral' },
    { key: 'off', label: 'Switched off' },
  ];

  const DealBadge = ({ m }) =>
    m.role === 'admin' ? (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">Partner</span>
    ) : m.commissionLabel === 'inr_50' ? (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">50% INR</span>
    ) : (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">1:1 PKR</span>
    );

  const ReferralLine = ({ m }) => {
    const by = broughtBy(m);
    const brought = broughtList(m);
    if (!by && !brought.length) return null;
    return (
      <div className="flex flex-wrap items-center gap-1.5 mt-1">
        {by && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
            <Link2 className="w-3 h-3" /> Brought by {by.name} · {m.referralPct}%
          </span>
        )}
        {brought.length > 0 && (
          <button
            type="button"
            onClick={() => setTab('referrals')}
            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100 hover:bg-sky-100"
            title={brought.map((x) => `${x.name} (${x.referralPct}%)`).join(', ')}
          >
            <UserPlus className="w-3 h-3" /> Brought {brought.length}: {brought.slice(0, 3).map((x) => x.name).join(', ')}
            {brought.length > 3 ? ` +${brought.length - 3}` : ''}
          </button>
        )}
      </div>
    );
  };

  const MemberRow = ({ member }) => {
    const isExpanded = expandedMemberId === member._id;
    const assignedSellers = sellers.filter((s) => s.assignment?.member?._id === member._id);
    const isSelf = user?._id === member._id;
    const isPrimaryAdmin = member.role === 'admin' && member.ecommerceAdminId;
    const wallet = walletOf(member);
    const menuOpen = openMenuId === member._id;

    return (
      <div className={`border-b border-slate-100 last:border-b-0 ${member.active === false ? 'opacity-60' : ''}`}>
        <div className="px-3 sm:px-4 py-3 grid grid-cols-[1fr_auto] lg:grid-cols-[minmax(0,2.2fr)_repeat(4,minmax(0,1fr))_auto] items-center gap-x-3 gap-y-2">
          {/* who */}
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl text-white font-bold flex items-center justify-center text-sm shrink-0 ${
                member.role === 'admin' ? 'bg-gradient-to-tr from-purple-600 to-indigo-600' : 'bg-gradient-to-tr from-slate-700 to-slate-800'
              }`}
            >
              {String(member.name || '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-slate-900 text-sm truncate">{member.name}</span>
                {DealBadge({ m: member })}
                {isSelf && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold">You</span>}
                {member.active === false && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 font-semibold">Off</span>}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                @{member.username}
                {member.phone ? ` · ${member.phone}` : ''}
              </div>
              {ReferralLine({ m: member })}
            </div>
          </div>

          {/* numbers (desktop: own columns; phone: one compact line below) */}
          <div className="hidden lg:block text-right">
            <div className="text-sm font-bold text-slate-800">{member.totalClients || assignedSellers.length}</div>
            <div className="text-[10px] text-slate-400">stores</div>
          </div>
          <div className="hidden lg:block text-right">
            <div className="text-sm font-bold text-emerald-700">{usd(member.totalDepositsINR)}</div>
            <div className="text-[10px] text-slate-400">deposited</div>
          </div>
          <div className="hidden lg:block text-right">
            <div className="text-sm font-bold text-slate-600">{usd(member.totalWithdrawalsINR)}</div>
            <div className="text-[10px] text-slate-400">withdrawn</div>
          </div>
          <button
            type="button"
            onClick={() => setWalletModalMember(member)}
            className="hidden lg:block text-right rounded-lg px-2 py-1 hover:bg-emerald-50 transition"
            title="Open wallet statement"
          >
            <div className={`text-sm font-black ${wallet < 0 ? 'text-red-600' : 'text-slate-900'}`}>{usd(wallet)}</div>
            <div className="text-[10px] text-slate-400">wallet{member.pendingOrdersCount > 0 ? ` · ${member.pendingOrdersCount} open orders` : ''}</div>
          </button>

          {/* actions */}
          <div className="flex items-center gap-1 justify-end relative">
            <button
              type="button"
              onClick={() => setWalletModalMember(member)}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold text-xs flex items-center gap-1 border border-emerald-200"
              title="Wallet statement & payouts"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Wallet</span>
            </button>
            <button
              type="button"
              onClick={() => setExpandedMemberId(isExpanded ? null : member._id)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1"
              title="Stores of this person"
            >
              <span className="hidden sm:inline">Stores</span>
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setOpenMenuId(menuOpen ? null : member._id)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              title="More"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setOpenMenuId(null)} />
                <div role="menu" className="absolute right-0 top-9 z-40 w-52 bg-white rounded-xl border border-slate-200 shadow-xl py-1 text-xs">
                  {!isSelf && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        setOpenMenuId(null);
                        setBonusMember(member);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                    >
                      <Gift className="w-3.5 h-3.5 text-amber-600" /> Give a bonus
                    </button>
                  )}
                  {(member.role !== 'admin' || isSelf) && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        setOpenMenuId(null);
                        setEditPasswordMember(member);
                        setNewPasswordInput('');
                        setEditPasswordMsg({ text: '', type: '' });
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-slate-500" /> Change password
                    </button>
                  )}
                  {member.role !== 'admin' && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        setOpenMenuId(null);
                        setDealChange({ member, to: member.commissionLabel === 'inr_50' ? 'pkr_1to1' : 'inr_50' });
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-slate-500" /> Change deal…
                    </button>
                  )}
                  {!isPrimaryAdmin && !isSelf && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        setOpenMenuId(null);
                        setDeleteConfirmMember(member);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-red-50 flex items-center gap-2 text-red-600 border-t border-slate-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* phone: numbers in one line */}
          <div className="lg:hidden col-span-2 grid grid-cols-4 gap-1 bg-slate-50 rounded-xl px-2 py-1.5 text-center">
            <div>
              <div className="text-[10px] text-slate-400">Stores</div>
              <div className="text-xs font-bold text-slate-800">{member.totalClients || assignedSellers.length}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">Deposited</div>
              <div className="text-xs font-bold text-emerald-700">{usd(member.totalDepositsINR)}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">Withdrawn</div>
              <div className="text-xs font-bold text-slate-600">{usd(member.totalWithdrawalsINR)}</div>
            </div>
            <button type="button" onClick={() => setWalletModalMember(member)}>
              <div className="text-[10px] text-slate-400">Wallet</div>
              <div className={`text-xs font-black ${wallet < 0 ? 'text-red-600' : 'text-slate-900'}`}>{usd(wallet)}</div>
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="px-3 sm:px-4 pb-4">
            {assignedSellers.length === 0 ? (
              <p className="text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-3">No stores are assigned to {member.name}.</p>
            ) : (
              <div className="bg-slate-50 rounded-xl border border-slate-100 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="text-left font-semibold px-3 py-2">Store</th>
                      <th className="text-right font-semibold px-3 py-2">Deposit</th>
                      <th className="text-right font-semibold px-3 py-2">Withdraw</th>
                      <th className="text-right font-semibold px-3 py-2">Net in Binance</th>
                      <th className="text-right font-semibold px-3 py-2">Open orders</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {assignedSellers.map((seller) => (
                      <tr key={seller._id}>
                        <td className="px-3 py-2">
                          <div className="font-semibold text-slate-800">{seller.assignment?.privateNotes?.customName || seller.storeName}</div>
                          <div className="text-[10px] text-slate-400">{seller.ownerName}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-emerald-700">{usd(seller.binance?.depositUSDT)}</td>
                        <td className="px-3 py-2 text-right text-slate-600">{usd(seller.binance?.withdrawUSDT)}</td>
                        <td className="px-3 py-2 text-right font-bold text-slate-900">{usd(seller.binance?.netUSDT)}</td>
                        <td className="px-3 py-2 text-right text-amber-700">{seller.pendingOrdersCount || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const Section = ({ title, people, hint }) =>
    people.length === 0 ? null : (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {title} <span className="text-slate-400 font-semibold">({people.length})</span>
          </h2>
          {hint && <span className="text-[10px] text-slate-400 hidden sm:block">{hint}</span>}
        </div>
        <div className="hidden lg:grid grid-cols-[minmax(0,2.2fr)_repeat(4,minmax(0,1fr))_auto] gap-x-3 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-50/60">
          <span>Person</span>
          <span className="text-right">Stores</span>
          <span className="text-right">Deposited (USDT)</span>
          <span className="text-right">Withdrawn (USDT)</span>
          <span className="text-right">Wallet</span>
          <span className="w-[150px]" />
        </div>
        {people.map((m) => (
          <React.Fragment key={m._id}>{MemberRow({ member: m })}</React.Fragment>
        ))}
      </div>
    );

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-600" /> Members
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Partners and members, their stores, wallets and who brought whom.</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm flex items-center gap-1.5 shadow-sm active:scale-95 self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" /> Add member
        </button>
      </div>

      {/* Totals strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {[
          { label: 'Members', value: `${teamTotals.active}`, sub: teamTotals.members !== teamTotals.active ? `${teamTotals.members - teamTotals.active} switched off` : 'all active' },
          { label: 'Stores assigned', value: `${teamTotals.stores}`, sub: 'client sellers' },
          { label: 'Deposited (USDT)', value: usd(teamTotals.deposited), sub: 'real Binance, all time' },
          { label: 'Members’ wallets', value: usd(teamTotals.owedToMembers), sub: 'their shares together' },
          { label: 'Referrals', value: `${teamTotals.referrals}`, sub: 'members brought by members' },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{c.label}</div>
            <div className="text-lg font-black text-slate-900 leading-tight mt-0.5">{c.value}</div>
            <div className="text-[10px] text-slate-400">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {[
          { key: 'members', label: 'Members' },
          { key: 'referrals', label: `Referrals${teamTotals.referrals ? ` (${teamTotals.referrals})` : ''}` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'members' ? (
        <>
          {/* Search + filters */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search name, username, phone"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {filterChips.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setMemberFilter(c.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition ${
                    memberFilter === c.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="px-4 py-4 flex items-center gap-3 animate-pulse">
                  <div className="w-9 h-9 rounded-xl bg-slate-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-40 bg-slate-200 rounded" />
                    <div className="h-2.5 w-24 bg-slate-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : visibleMembers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-400">Nobody matches this search.</div>
          ) : (
            <div className="space-y-4">
              {Section({ title: 'Partners', people: partnersShown, hint: 'Own sellers 75% · the other partner’s sellers 25%' })}
              {Section({ title: 'Members', people: membersShown, hint: 'Tap Wallet for the statement and payouts' })}
            </div>
          )}
        </>
      ) : (
        <ReferralsOverview groups={referralGroups} loading={referralsLoading} error={referralsError} onOpenMember={(id) => {
          setTab('members');
          setMemberSearch(byId.get(sid(id))?.username || '');
          setMemberFilter('all');
        }} />
      )}

      {/* ─── MODAL: Change a member's deal (confirm first: it changes every future split) ─── */}
      {dealChange && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Change {dealChange.member.name}’s deal?</h3>
                <p className="text-xs text-slate-500 mt-1">
                  From <b>{dealChange.member.commissionLabel === 'inr_50' ? '50% INR' : '1:1 PKR'}</b> to{' '}
                  <b>{dealChange.to === 'inr_50' ? '50% INR' : '1:1 PKR'}</b>. Every NEW deposit and withdrawal of this member’s sellers will be
                  divided the new way. Deposits already counted stay as they are.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setDealChange(null)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
              <button
                onClick={async () => {
                  const d = dealChange;
                  setDealChange(null);
                  await handleUpdateCommissionLabel(d.member._id, d.to);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700"
              >
                Yes, change the deal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: Admin Edit Member Password ─── */}
      {editPasswordMember && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200 animate-scale-up">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <div className="w-9 h-9 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Edit Member Password</h3>
                  <p className="text-xs text-slate-400">
                    For {editPasswordMember.name} (@{editPasswordMember.username})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditPasswordMember(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editPasswordMsg.text && (
              <div
                className={`mb-4 p-3 rounded-2xl text-xs flex items-center space-x-2 ${
                  editPasswordMsg.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{editPasswordMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleEditPasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New Password (min 6 characters) *
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    required
                    minLength={6}
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    placeholder="Enter new password"
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const randomPass =
                        editPasswordMember.username.slice(0, 3) +
                        Math.floor(1000 + Math.random() * 9000);
                      setNewPasswordInput(randomPass);
                    }}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                    title="Generate Random Password"
                  >
                    Generate
                  </button>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditPasswordMember(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editPasswordLoading || !newPasswordInput}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white shadow-sm"
                >
                  {editPasswordLoading ? 'Saving...' : 'Save New Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: Admin Delete Member Confirmation ─── */}
      {deleteConfirmMember && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200 animate-scale-up">
            <div className="flex items-center space-x-3 mb-4 text-red-600">
              <div className="w-10 h-10 rounded-2xl bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Delete Team Member</h3>
                <p className="text-xs text-slate-400">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 mb-4 leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <strong className="text-slate-900">{deleteConfirmMember.name}</strong> (@
              {deleteConfirmMember.username})?
              <br />
              <br />
              Any client stores assigned to this member will be safely unassigned so that another
              agent can be assigned to them.
            </p>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmMember(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteMember}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white shadow-sm flex items-center space-x-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleteLoading ? 'Deleting...' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: Admin Create Member ─── */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200 animate-scale-up">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Add New Team Member</h3>
                <p className="text-xs text-slate-400">
                  Create an agent account with just their name & basic credentials.
                </p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMember} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Member Name *
                </label>
                <input
                  type="text"
                  required
                  value={createForm.name}
                  onChange={(e) => {
                    const val = e.target.value;
                    const autoUser =
                      val.toLowerCase().replace(/[^a-z0-9]/g, '') +
                      Math.floor(10 + Math.random() * 90);
                    setCreateForm({
                      ...createForm,
                      name: val,
                      username: createForm.username || autoUser,
                    });
                  }}
                  placeholder="e.g. Member 1 or Bilal Khan"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Login Username *
                </label>
                <input
                  type="text"
                  required
                  value={createForm.username}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, username: e.target.value })
                  }
                  placeholder="e.g. member1"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Password *
                </label>
                <input
                  type="text"
                  required
                  value={createForm.password}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, password: e.target.value })
                  }
                  placeholder="e.g. member123"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Phone (Optional)
                </label>
                <input
                  type="text"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                  placeholder="+92 300 0000000"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Commission Agreement Deal *
                </label>
                <select
                  value={createForm.commissionLabel}
                  onChange={(e) => { setCreateConfirm(false); setCreateForm({ ...createForm, commissionLabel: e.target.value, referredBy: '', referralPct: '' }); }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                >
                  <option value="pkr_1to1">🇵🇰 1:1 PKR Deal (₹100k INR deposit = Rs 100,000 to member, paid in USDT)</option>
                  <option value="inr_50">50% Deal (member gets 50% of the USDT received)</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  {createForm.commissionLabel === 'inr_50'
                    ? 'Member gets 50% of the real USDT of every client deposit. The other 50% is shared equally by the two partners.'
                    : 'Member gets 1 Pakistani Rupee for every Indian Rupee deposited, paid in USDT at that day’s rate. The rest is shared equally by the two partners.'}
                </p>
              </div>

              {createForm.commissionLabel === 'pkr_1to1' && (
                <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/50 p-3 space-y-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Referred by (who brought this member) *</label>
                    <select
                      value={createForm.referredBy}
                      onChange={(e) => { setCreateConfirm(false); setCreateForm({ ...createForm, referredBy: e.target.value }); }}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-medium"
                    >
                      <option value="">— No referrer —</option>
                      {members
                        .filter((m) => m.role === 'member' && m.active !== false && (m.commissionLabel || 'pkr_1to1') === 'pkr_1to1')
                        .map((m) => (
                          <option key={m._id} value={m._id}>
                            {m.name} (@{m.username})
                          </option>
                        ))}
                    </select>
                    <p className="text-[11px] text-slate-500 mt-1">Only active 1:1 PKR members can be referrers. Partners and 50% members cannot.</p>
                  </div>
                  {createForm.referredBy && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Referral commission % * (1% – 20%)</label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        step="0.5"
                        required
                        value={createForm.referralPct}
                        onChange={(e) => { setCreateConfirm(false); setCreateForm({ ...createForm, referralPct: e.target.value }); }}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm"
                        placeholder="e.g. 5"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Taken from this member&apos;s own share of every deposit (never from the partners). He also bears the same % of this member&apos;s part of every seller withdrawal.
                      </p>
                    </div>
                  )}
                  <p className="text-[11px] font-semibold text-red-600">⚠ The referral is set only now and can NEVER be changed later.</p>
                </div>
              )}

              {createConfirm && (
                <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-3 text-xs text-slate-800 space-y-1">
                  <div className="font-bold text-sm">Please check before sending:</div>
                  <div>Name: <b>{createForm.name}</b></div>
                  <div>Deal: <b>{createForm.commissionLabel === 'inr_50' ? '50% member' : '1:1 PKR member'}</b></div>
                  {createForm.commissionLabel === 'pkr_1to1' && (
                    <div>
                      Referral:{' '}
                      <b>
                        {createForm.referredBy
                          ? `${members.find((m) => m._id === createForm.referredBy)?.name || '?'} — ${createForm.referralPct}%`
                          : 'none'}
                      </b>
                    </div>
                  )}
                  <div className="text-[11px] text-slate-600 pt-1">The other partner has to approve it before the member is created. The referral can never be changed afterwards.</div>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => { setIsCreateModalOpen(false); setCreateConfirm(false); }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white shadow-sm"
                >
                  {createLoading ? 'Sending...' : createConfirm ? 'Confirm & send for approval' : 'Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: Award Bonus from Member Card ─── */}
      {bonusMember && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200 animate-scale-up">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Award Bonus to {bonusMember.name}
                </h3>
                <p className="text-xs text-slate-400">
                  Direct wallet credit + instant group announcement.
                </p>
              </div>
              <button
                onClick={() => setBonusMember(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendBonus} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bonus Amount (PKR) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={bonusAmount}
                  onChange={(e) => setBonusAmount(e.target.value)}
                  placeholder="e.g. 3000"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason for Bonus *
                </label>
                <input
                  type="text"
                  required
                  value={bonusReason}
                  onChange={(e) => setBonusReason(e.target.value)}
                  placeholder="e.g. ₹200k deposit milestone achieved"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setBonusMember(null)}
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
                  <span>{bonusLoading ? 'Awarding...' : 'Confirm Bonus'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: Member Financial Statement & Payouts ─── */}
      {walletModalMember && (
        <WalletModal
          isOpen={!!walletModalMember}
          onClose={() => setWalletModalMember(null)}
          memberId={walletModalMember._id}
          title={`${walletModalMember.name}'s Financial Statement & Transactions`}
        />
      )}
    </div>
  );
}
