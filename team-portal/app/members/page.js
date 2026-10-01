'use client';

import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import WalletModal from '@/components/WalletModal';

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
  });
  const [createLoading, setCreateLoading] = useState(false);

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

  const router = useRouter();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const fetchData = async () => {
    try {
      setLoading(true);
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
    }
  }, [isAdmin]);

  const handleCreateMember = async (e) => {
    e?.preventDefault();
    if (!createForm.name.trim()) return;

    try {
      setCreateLoading(true);
      const token = localStorage.getItem('portal_token');
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(createForm),
      });

      if (res.ok) {
        setIsCreateModalOpen(false);
        setCreateForm({ name: '', username: '', password: '', phone: '', role: 'member', commissionLabel: 'pkr_1to1' });
        fetchData();
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Team Members Management & Supervision
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold">
              {members.length} Total Users
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Manage member credentials, passwords, accounts, and review their assigned stores and performance.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm flex items-center space-x-1.5 transition shadow-md shadow-emerald-600/20 active:scale-95 self-start sm:self-auto"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add New Member</span>
          </button>
        )}
      </div>

      {/* Members Directory */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 text-sm">
          Loading team members and client metrics...
        </div>
      ) : (
        <div className="space-y-4">
          {members.map((member) => {
            const isExpanded = expandedMemberId === member._id;
            const assignedSellers = sellers.filter(
              (s) => s.assignment?.member?._id === member._id
            );
            const isSelf = user?._id === member._id;
            const isPrimaryAdmin = member.role === 'admin' && member.ecommerceAdminId;

            return (
              <div
                key={member._id}
                className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden transition-all"
              >
                {/* Member Summary Card Header */}
                <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Member identity */}
                  <div className="flex items-start space-x-4">
                    <div
                      className={`w-12 h-12 rounded-2xl border text-white font-bold flex items-center justify-center text-lg shrink-0 shadow-sm ${
                        member.role === 'admin'
                          ? 'bg-gradient-to-tr from-purple-600 to-indigo-600 border-purple-300'
                          : 'bg-gradient-to-tr from-slate-700 to-slate-800 border-slate-600'
                      }`}
                    >
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <h3 className="font-bold text-slate-900 text-base">{member.name}</h3>
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            member.role === 'admin'
                              ? 'bg-purple-100 text-purple-700 border border-purple-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {member.role}
                        </span>
                        {isSelf && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
                            You
                          </span>
                        )}

                        {/* Commission Deal Label: Assigned directly to Member */}
                        {member.role !== 'admin' ? (
                          isAdmin ? (
                            <select
                              value={member.commissionLabel || 'pkr_1to1'}
                              onChange={(e) => handleUpdateCommissionLabel(member._id, e.target.value)}
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border cursor-pointer focus:outline-none transition-all shadow-xs ${
                                member.commissionLabel === 'inr_50'
                                  ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                                  : 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                              }`}
                              title="Click to toggle member commission deal between 1:1 PKR and 50% INR"
                            >
                              <option value="pkr_1to1">🇵🇰 1:1 PKR Fixed Deal</option>
                              <option value="inr_50">🇮🇳 50% INR Split Deal</option>
                            </select>
                          ) : (
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                member.commissionLabel === 'inr_50'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}
                            >
                              {member.commissionLabel === 'inr_50' ? '🇮🇳 50% INR Deal' : '🇵🇰 1:1 PKR Deal'}
                            </span>
                          )
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                            Admin Treasury Pool
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        @{member.username} {member.phone && `• ${member.phone}`}
                      </p>
                    </div>
                  </div>

                  {/* Financial & Client Metrics Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-100 text-center">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Clients
                      </span>
                      <span className="text-sm font-extrabold text-slate-800">
                        {member.totalClients || assignedSellers.length} stores
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Deposited
                      </span>
                      <span className="text-sm font-extrabold text-emerald-600">
                        ₹{(member.totalDepositsINR || 0).toLocaleString()}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Withdrawn
                      </span>
                      <span className="text-sm font-extrabold text-slate-600">
                        ₹{(member.totalWithdrawalsINR || 0).toLocaleString()}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setWalletModalMember(member)}
                      className="bg-emerald-50/90 hover:bg-emerald-100 rounded-xl p-1.5 border border-emerald-200/80 transition text-center cursor-pointer group shadow-xs"
                      title="Click to view full financial statement & record payouts"
                    >
                      <span className="text-[10px] uppercase font-bold text-emerald-800 flex items-center justify-center gap-1 group-hover:text-emerald-950">
                        <Wallet className="w-3 h-3 text-emerald-600" />
                        <span>Wallet Earned</span>
                      </span>
                      {member.commissionLabel === 'inr_50' ? (
                        <>
                          <span className="text-sm font-extrabold text-amber-700 block">
                            ₹{(member.wallet?.balanceINR || 0).toLocaleString()} INR
                          </span>
                          {(member.wallet?.balancePKR || member.netBalancePKR || 0) > 0 && (
                            <span className="text-[10px] text-emerald-700 font-bold block">
                              + Rs. {(member.wallet?.balancePKR || member.netBalancePKR || 0).toLocaleString()} PKR
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="text-sm font-extrabold text-emerald-700 block">
                            Rs. {(member.wallet?.balancePKR ?? member.netBalancePKR ?? 0).toLocaleString()}
                          </span>
                          {(member.wallet?.balanceINR || 0) > 0 && (
                            <span className="text-[10px] text-emerald-800 font-bold block">
                              + ₹{(member.wallet.balanceINR).toLocaleString()} INR
                            </span>
                          )}
                        </>
                      )}
                      {member.totalBonusesPKR > 0 && (
                        <span className="text-[9px] text-amber-700 block font-semibold">
                          +{member.totalBonusesPKR.toLocaleString()} bonus
                        </span>
                      )}
                    </button>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Pending Orders
                      </span>
                      <span className="text-sm font-extrabold text-amber-600">
                        {member.pendingOrdersCount || 0} orders
                      </span>
                    </div>
                  </div>

                  {/* Actions (Wallet & Payout, Bonus, Edit Password, Delete, Expand Details) */}
                  {isAdmin ? (
                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      {/* Wallet Statement & Payouts */}
                      <button
                        type="button"
                        onClick={() => setWalletModalMember(member)}
                        className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold text-xs flex items-center space-x-1.5 transition border border-emerald-200 shadow-xs"
                        title="View Statement & Record Payouts"
                      >
                        <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="hidden sm:inline">Statement</span>
                      </button>

                      {/* Award Bonus */}
                      <button
                        onClick={() => setBonusMember(member)}
                        className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold text-xs flex items-center space-x-1.5 transition border border-amber-200"
                        title="Award Bonus"
                      >
                        <Gift className="w-3.5 h-3.5 text-amber-600" />
                        <span className="hidden sm:inline">Bonus</span>
                      </button>

                      {/* Edit Password Button */}
                      <button
                        onClick={() => {
                          setEditPasswordMember(member);
                          setNewPasswordInput('');
                          setEditPasswordMsg({ text: '', type: '' });
                        }}
                        className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                        title="Edit Password"
                      >
                        <KeyRound className="w-4 h-4 text-slate-600" />
                      </button>

                      {/* Delete Member Button (Disabled for primary platform admins / self) */}
                      {!isPrimaryAdmin && !isSelf && (
                        <button
                          onClick={() => setDeleteConfirmMember(member)}
                          className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition"
                          title="Delete Member"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}

                      {/* Drill Down */}
                      <button
                        onClick={() =>
                          setExpandedMemberId(isExpanded ? null : member._id)
                        }
                        className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center space-x-1 transition"
                      >
                        <span className="hidden sm:inline">
                          {isExpanded ? 'Hide' : 'Stores'}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2 shrink-0">
                      <span className="text-xs px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                        Active Team Member
                      </span>
                    </div>
                  )}
                </div>

                {/* ─── EXPANDED CLIENT STORES DRILL-DOWN ─── */}
                {isExpanded && (
                  <div className="p-5 sm:p-6 bg-slate-50/80 border-t border-slate-200/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Assigned Client Stores ({assignedSellers.length})
                      </h4>
                      <span className="text-xs text-slate-400">
                        Detailed breakdown per client
                      </span>
                    </div>

                    {assignedSellers.length === 0 ? (
                      <p className="text-xs text-slate-400 py-3">
                        No clients are currently assigned to this member.
                      </p>
                    ) : (
                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                        {assignedSellers.map((seller) => (
                          <div
                            key={seller._id}
                            className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                          >
                            <div>
                              <p className="font-bold text-slate-900 text-sm">
                                {seller.assignment?.privateNotes?.customName || seller.storeName}
                              </p>
                              <p className="text-slate-400 text-[11px]">
                                Owner: {seller.ownerName} • {seller.email}
                              </p>
                            </div>

                            <div className="flex items-center gap-4 text-center sm:text-right">
                              <div>
                                <span className="text-[10px] text-slate-400 block font-medium">
                                  Deposit
                                </span>
                                <span className="font-bold text-emerald-600">
                                  ₹{(seller.wallet?.totalDeposited || 0).toLocaleString()}
                                </span>
                              </div>

                              <div>
                                <span className="text-[10px] text-slate-400 block font-medium">
                                  Withdraw
                                </span>
                                <span className="font-bold text-slate-600">
                                  ₹{(seller.wallet?.totalWithdrawn || 0).toLocaleString()}
                                </span>
                              </div>

                              <div>
                                <span className="text-[10px] text-slate-400 block font-medium">
                                  Remaining
                                </span>
                                <span className="font-bold text-brand-700">
                                  ₹{(seller.wallet?.netRemaining || 0).toLocaleString()}
                                </span>
                              </div>

                              <div>
                                <span className="text-[10px] text-slate-400 block font-medium">
                                  Pending Orders
                                </span>
                                <span className="font-bold text-amber-600">
                                  {seller.pendingOrdersCount} orders
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
                  onChange={(e) => setCreateForm({ ...createForm, commissionLabel: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                >
                  <option value="pkr_1to1">🇵🇰 1:1 PKR Fixed Deal (₹100k INR Deposit = 100,000 PKR to Member)</option>
                  <option value="inr_50">🇮🇳 50% INR Split Deal (₹100k INR Deposit = ₹50,000 INR to Member)</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  {createForm.commissionLabel === 'inr_50'
                    ? 'Member earns 50% in Indian Rupees directly from every client deposit. The other 50% INR goes to the Admin pool.'
                    : 'Member receives 1 Pakistani Rupee for every 1 Indian Rupee deposited. 100% of the deposit INR goes to the Admin pool.'}
                </p>
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white shadow-sm"
                >
                  {createLoading ? 'Creating...' : 'Create Member Account'}
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
