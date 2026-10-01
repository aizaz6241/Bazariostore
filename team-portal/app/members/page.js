'use client';

import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';

export default function MembersPage() {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);

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
  });
  const [createLoading, setCreateLoading] = useState(false);

  // Bonus Award Modal
  const [bonusMember, setBonusMember] = useState(null);
  const [bonusAmount, setBonusAmount] = useState('');
  const [bonusReason, setBonusReason] = useState('');
  const [bonusLoading, setBonusLoading] = useState(false);

  const isAdmin = user?.role === 'admin';

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
        setCreateForm({ name: '', username: '', password: '', phone: '', role: 'member' });
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

  if (!isAdmin) {
    return (
      <div className="py-20 text-center text-slate-500 text-sm">
        Admin permission is required to access team oversight.
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
              Team Members Supervision
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold">
              {members.length} Total Users
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Supervise each member’s clients, pending orders, total deposits, withdrawals and issue bonuses.
          </p>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm flex items-center space-x-1.5 transition shadow-md shadow-emerald-600/20 active:scale-95 self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add New Member</span>
        </button>
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

            return (
              <div
                key={member._id}
                className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden transition-all"
              >
                {/* Member Summary Card Header */}
                <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Member identity */}
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 text-slate-800 font-bold flex items-center justify-center text-lg shrink-0">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-bold text-slate-900 text-base">{member.name}</h3>
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            member.role === 'admin'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {member.role}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        @{member.username} {member.phone && `• ${member.phone}`}
                      </p>
                    </div>
                  </div>

                  {/* Financial & Client Metrics Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 bg-slate-50 p-3 sm:p-4 rounded-2xl border border-slate-100 text-center">
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

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Pending Orders
                      </span>
                      <span className="text-sm font-extrabold text-amber-600">
                        {member.pendingOrdersCount || 0} orders
                      </span>
                    </div>
                  </div>

                  {/* Actions (Bonus + Expand Details) */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setBonusMember(member)}
                      className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold text-xs flex items-center space-x-1.5 transition border border-amber-200"
                    >
                      <Gift className="w-3.5 h-3.5 text-amber-600" />
                      <span>Award Bonus</span>
                    </button>

                    <button
                      onClick={() =>
                        setExpandedMemberId(isExpanded ? null : member._id)
                      }
                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center space-x-1 transition"
                    >
                      <span>{isExpanded ? 'Hide Stores' : 'Drill Down'}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
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
                    const autoUser = val.toLowerCase().replace(/[^a-z0-9]/g, '') + Math.floor(10 + Math.random() * 90);
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
                  onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
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
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
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
    </div>
  );
}
