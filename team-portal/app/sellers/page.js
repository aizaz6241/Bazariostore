'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import {
  Users,
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  Clock,
  HeartPulse,
  Edit3,
  UserPlus,
  Phone,
  Mail,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  Save,
  X,
  FileText,
  Camera,
  LayoutGrid,
  List,
  Wallet,
} from 'lucide-react';

export default function SellersPage() {
  const { user } = useAuth();
  const [sellers, setSellers] = useState([]);
  const [members, setMembers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState('compact');
  const [loading, setLoading] = useState(true);

  // Assignment Modal State (Admin only)
  const [assignModalSeller, setAssignModalSeller] = useState(null);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);

  // Private Note Modal State (Member & Admin)
  const [noteModalSeller, setNoteModalSeller] = useState(null);
  const [noteForm, setNoteForm] = useState({
    customName: '',
    age: '',
    occupation: '',
    maritalStatus: '',
    location: '',
    picture: '',
    details: '',
  });
  const [noteLoading, setNoteLoading] = useState(false);

  const isAdmin = user?.role === 'admin';

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('portal_token');
      const headers = { Authorization: `Bearer ${token}` };

      const [sellersRes, membersRes] = await Promise.all([
        fetch('/api/sellers', { headers }),
        isAdmin ? fetch('/api/members', { headers }) : Promise.resolve(null),
      ]);

      if (sellersRes.ok) {
        const data = await sellersRes.json();
        setSellers(data.sellers || []);
      }

      if (membersRes && membersRes.ok) {
        const mData = await membersRes.json();
        setMembers(mData.members || []);
      }
    } catch (err) {
      console.error('Fetch sellers error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isAdmin]);

  // Handle Admin Assigning Seller to a Member (Deal agreement is inherited from Member)
  const handleAssignSeller = async () => {
    if (!assignModalSeller || !selectedMemberId) return;

    try {
      setAssignLoading(true);
      const token = localStorage.getItem('portal_token');
      const res = await fetch('/api/sellers/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sellerId: assignModalSeller._id,
          memberId: selectedMemberId,
        }),
      });

      if (res.ok) {
        setAssignModalSeller(null);
        setSelectedMemberId('');
        fetchData();
      } else {
        const data = await res.json();
        alert(data.message || 'Assignment failed');
      }
    } catch (err) {
      console.error('Assign error:', err);
    } finally {
      setAssignLoading(false);
    }
  };

  // Open Private Note Modal
  const openNoteModal = (seller) => {
    setNoteModalSeller(seller);
    const existing = seller.assignment?.privateNotes || {};
    setNoteForm({
      customName: existing.customName || seller.storeName || '',
      age: existing.age || '',
      occupation: existing.occupation || '',
      maritalStatus: existing.maritalStatus || '',
      location: existing.location || '',
      picture: existing.picture || '',
      details: existing.details || '',
    });
  };

  // Save Private Memory Note
  const handleSaveNote = async (e) => {
    e?.preventDefault();
    if (!noteModalSeller) return;

    try {
      setNoteLoading(true);
      const token = localStorage.getItem('portal_token');
      const res = await fetch(`/api/sellers/${noteModalSeller._id}/note`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(noteForm),
      });

      if (res.ok) {
        setNoteModalSeller(null);
        fetchData();
      } else {
        const data = await res.json();
        alert(data.message || 'Failed to save note');
      }
    } catch (err) {
      console.error('Save note error:', err);
    } finally {
      setNoteLoading(false);
    }
  };

  // Filter sellers
  const filteredSellers = sellers.filter((s) => {
    const term = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !term ||
      s.storeName?.toLowerCase().includes(term) ||
      s.ownerName?.toLowerCase().includes(term) ||
      s.email?.toLowerCase().includes(term) ||
      s.phone?.toLowerCase().includes(term) ||
      s.assignment?.privateNotes?.customName?.toLowerCase().includes(term);

    if (!matchesSearch) return false;

    if (statusFilter === 'assigned') return Boolean(s.assignment);
    if (statusFilter === 'unassigned') return !s.assignment;
    return true;
  });

  const memberWalletMap = new Map();
  members.forEach((m) => {
    const earned = m.netBalancePKR ?? ((m.totalDepositsINR || 0) - (m.totalWithdrawalsINR || 0) + (m.totalBonusesPKR || 0));
    memberWalletMap.set(m._id?.toString(), earned);
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {isAdmin ? 'Seller Directory & Store Assignments' : 'My Assigned Clients'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {isAdmin
              ? 'Distribute incoming merchant applications to team members and monitor performance.'
              : 'Track your clients live deposits, withdrawals, pending orders and manage private CRM notes.'}
          </p>
        </div>

        {/* Search, Filter & View Controls */}
        <div className="flex items-center flex-wrap gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search store, owner or alias..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {isAdmin && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">All Stores</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned (New)</option>
            </select>
          )}

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode('compact')}
              className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
                viewMode === 'compact'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Compact Quick-Scan View"
            >
              <List className="w-4 h-4" />
              <span className="hidden sm:inline">Compact</span>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
                viewMode === 'grid'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Card Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="hidden sm:inline">Cards</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sellers Listing */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 text-sm">
          Loading client stores and live analytics...
        </div>
      ) : filteredSellers.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-3xl border border-slate-200 p-8">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-base font-bold text-slate-700">No sellers found</p>
          <p className="text-xs text-slate-400 mt-1">
            {searchTerm
              ? 'Try changing your search terms or filters.'
              : isAdmin
              ? 'No sellers are currently registered on the ecommerce platform.'
              : 'You have not been assigned any sellers yet. Admin will assign new seller applications to you soon.'}
          </p>
        </div>
      ) : viewMode === 'compact' ? (
        /* ── COMPACT LIST / TABLE VIEW (Fast Scanning, Zero Endless Scroll) ── */
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          {/* Desktop & Tablet Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Store & Owner</th>
                  <th className="py-3 px-4">Health</th>
                  <th className="py-3 px-4 text-center">Active Deal</th>
                  {isAdmin && <th className="py-3 px-4">Assigned Member (Wallet)</th>}
                  <th className="py-3 px-4 text-right">Deposited</th>
                  <th className="py-3 px-4 text-right">Withdrawn</th>
                  <th className="py-3 px-4 text-right">Remaining</th>
                  <th className="py-3 px-4 text-center">Orders</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredSellers.map((seller) => {
                  const privateNote = seller.assignment?.privateNotes || {};
                  const healthScore = seller.accountHealth?.score ?? 100;
                  const assignedMemberId = seller.assignment?.member?._id?.toString();
                  const memberWallet = assignedMemberId ? memberWalletMap.get(assignedMemberId) : null;
                  const activeDealLabel = seller.assignment?.commissionLabel || seller.assignment?.member?.commissionLabel;

                  return (
                    <tr key={seller._id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                          <span>{privateNote.customName || seller.storeName}</span>
                          {privateNote.customName && privateNote.customName !== seller.storeName && (
                            <span className="text-[10px] text-slate-400 font-normal">
                              ({seller.storeName})
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2">
                          <span>{seller.ownerName}</span>
                          {privateNote.location && (
                            <span className="text-[10px] text-slate-400 font-normal">
                              • 📍 {privateNote.location}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            healthScore >= 80
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : healthScore >= 50
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          <HeartPulse className="w-3 h-3" />
                          {healthScore}%
                        </span>
                      </td>

                      {/* Active Deal inherited from assigned Member */}
                      <td className="py-3 px-4 text-center">
                        {seller.assignment?.member ? (
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              activeDealLabel === 'inr_50'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                            title={`Deal set on staff: ${seller.assignment.member.name}`}
                          >
                            {activeDealLabel === 'inr_50' ? '🇮🇳 50% INR Deal' : '🇵🇰 1:1 PKR Deal'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            🏛️ Platform Treasury
                          </span>
                        )}
                      </td>

                      {isAdmin && (
                        <td className="py-3 px-4">
                          {seller.assignment?.member ? (
                            <div>
                              <span className="font-bold text-slate-800 text-xs block">
                                {seller.assignment.member.name}
                              </span>
                              {memberWallet !== undefined && memberWallet !== null && (
                                <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-0.5">
                                  <Wallet className="w-2.5 h-2.5" />
                                  <span>Rs. {memberWallet.toLocaleString()} earned</span>
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-md border border-red-100">
                              Unassigned
                            </span>
                          )}
                        </td>
                      )}

                      <td className="py-3 px-4 text-right font-bold text-emerald-600">
                        ₹{(seller.wallet?.totalDeposited || 0).toLocaleString()}
                      </td>

                      <td className="py-3 px-4 text-right text-slate-600">
                        ₹{(seller.wallet?.totalWithdrawn || 0).toLocaleString()}
                      </td>

                      <td className="py-3 px-4 text-right font-bold text-brand-700">
                        ₹{(seller.wallet?.netRemaining || 0).toLocaleString()}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            seller.pendingOrdersCount > 0
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {seller.pendingOrdersCount}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openNoteModal(seller)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                            title="Memory Note"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => {
                                setAssignModalSeller(seller);
                                setSelectedMemberId(seller.assignment?.member?._id || '');
                              }}
                              className="p-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 transition"
                              title="Reassign Store"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Condensed Cards (80% less vertical space!) */}
          <div className="block md:hidden divide-y divide-slate-100">
            {filteredSellers.map((seller) => {
              const privateNote = seller.assignment?.privateNotes || {};
              const healthScore = seller.accountHealth?.score ?? 100;
              const assignedMemberId = seller.assignment?.member?._id?.toString();
              const memberWallet = assignedMemberId ? memberWalletMap.get(assignedMemberId) : null;

              return (
                <div key={seller._id} className="p-3 hover:bg-slate-50/80 transition flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                        {privateNote.customName || seller.storeName}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {seller.ownerName}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          healthScore >= 80
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {healthScore}%
                      </span>
                      <button
                        onClick={() => openNoteModal(seller)}
                        className="p-1.5 rounded-lg bg-slate-100 text-slate-600"
                        title="Memory Note"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => {
                            setAssignModalSeller(seller);
                            setSelectedMemberId(seller.assignment?.member?._id || '');
                          }}
                          className="p-1.5 rounded-lg bg-purple-50 text-purple-700"
                          title="Assign"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-100">
                    <span className="text-slate-500">
                      Rem: <strong className="text-brand-700">₹{(seller.wallet?.netRemaining || 0).toLocaleString()}</strong>
                    </span>
                    <span className="text-slate-500">
                      Orders: <strong className="text-amber-600">{seller.pendingOrdersCount}</strong>
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                        (seller.assignment?.commissionLabel || seller.assignment?.member?.commissionLabel) === 'inr_50'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}
                    >
                      {(seller.assignment?.commissionLabel || seller.assignment?.member?.commissionLabel) === 'inr_50' ? '🇮🇳 50%' : '🇵🇰 1:1'}
                    </span>
                    {isAdmin && (
                      <span className="text-slate-500 truncate max-w-[100px]">
                        Staff: <strong className="text-slate-800">{seller.assignment?.member?.name?.split(' ')[0] || 'None'}</strong>
                        {memberWallet !== undefined && memberWallet !== null && (
                          <span className="text-[9px] text-emerald-600 block">
                            Rs. {memberWallet.toLocaleString()}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ── GRID CARDS VIEW (Full Details) ── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {filteredSellers.map((seller) => {
            const privateNote = seller.assignment?.privateNotes || {};
            const healthScore = seller.accountHealth?.score ?? 100;
            const assignedMemberId = seller.assignment?.member?._id?.toString();
            const memberWallet = assignedMemberId ? memberWalletMap.get(assignedMemberId) : null;

            return (
              <div
                key={seller._id}
                className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Top info row */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      {/* Member Alias or Real Store Name */}
                      <h3 className="font-bold text-slate-900 text-base flex items-center gap-1.5">
                        <span>{privateNote.customName || seller.storeName}</span>
                        {privateNote.customName && privateNote.customName !== seller.storeName && (
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({seller.storeName})
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-slate-500 font-medium">{seller.ownerName}</p>
                    </div>

                    {/* Account Health Pill */}
                    <div
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center space-x-1 ${
                        healthScore >= 80
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : healthScore >= 50
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}
                    >
                      <HeartPulse className="w-3 h-3" />
                      <span>{healthScore}% Health</span>
                    </div>
                  </div>

                  {/* Private Memory Badges (if saved by member) */}
                  {(privateNote.location || privateNote.occupation || privateNote.age) && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {privateNote.location && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                          📍 {privateNote.location}
                        </span>
                      )}
                      {privateNote.occupation && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                          💼 {privateNote.occupation}
                        </span>
                      )}
                      {privateNote.age && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                          🎂 {privateNote.age} yrs
                        </span>
                      )}
                    </div>
                  )}

                  {/* Live Financial Metrics (1 INR = 1 PKR rule) */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 rounded-2xl p-3 my-4 border border-slate-100 text-center">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Deposited</span>
                      <span className="text-xs sm:text-sm font-bold text-emerald-600">
                        ₹{(seller.wallet?.totalDeposited || 0).toLocaleString()}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Withdrawn</span>
                      <span className="text-xs sm:text-sm font-bold text-slate-700">
                        ₹{(seller.wallet?.totalWithdrawn || 0).toLocaleString()}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Remaining</span>
                      <span className="text-xs sm:text-sm font-bold text-brand-700">
                        ₹{(seller.wallet?.netRemaining || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Order & Contact status */}
                  <div className="space-y-1.5 text-xs text-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center space-x-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Pending Orders:</span>
                      </span>
                      <span className="font-bold text-amber-600">
                        {seller.pendingOrdersCount} orders
                      </span>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-slate-400">Assigned Member:</span>
                        <div className="text-right">
                          <span className="font-semibold text-slate-800 block">
                            {seller.assignment?.member?.name || (
                              <span className="text-red-500 font-bold">Unassigned</span>
                            )}
                          </span>
                          {memberWallet !== undefined && memberWallet !== null && (
                            <span className="text-[10px] text-emerald-600 font-semibold flex items-center justify-end gap-1">
                              <Wallet className="w-2.5 h-2.5" />
                              <span>Rs. {memberWallet.toLocaleString()} earned</span>
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Active Deal inherited from assigned Member */}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-slate-400">Commission Rule:</span>
                      {seller.assignment?.member ? (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            (seller.assignment?.commissionLabel || seller.assignment?.member?.commissionLabel) === 'inr_50'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {(seller.assignment?.commissionLabel || seller.assignment?.member?.commissionLabel) === 'inr_50'
                            ? '🇮🇳 50% INR (Staff Deal)'
                            : '🇵🇰 1:1 PKR (Staff Deal)'}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                          🏛️ Platform Treasury Pool
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Private Details Preview */}
                  {privateNote.details && (
                    <div className="mt-3 p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/50 text-[11px] text-amber-900 leading-snug">
                      <span className="font-bold block text-[10px] uppercase text-amber-800">
                        Private Memory Note:
                      </span>
                      {privateNote.details}
                    </div>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div className="pt-4 mt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  {/* Private Memory Note Button */}
                  <button
                    onClick={() => openNoteModal(seller)}
                    className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center space-x-1 transition"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Memory Note</span>
                  </button>

                  {/* Admin Re-assign Button */}
                  {isAdmin && (
                    <button
                      onClick={() => {
                        setAssignModalSeller(seller);
                        setSelectedMemberId(seller.assignment?.member?._id || '');
                      }}
                      className="py-2 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold text-xs flex items-center space-x-1 transition"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{seller.assignment ? 'Reassign' : 'Assign'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── MODAL: Admin Assign Seller to Member ─── */}
      {assignModalSeller && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200 animate-scale-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 text-base">Assign Store to Member</h3>
              <button
                onClick={() => setAssignModalSeller(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
              <p className="font-bold text-slate-800">{assignModalSeller.storeName}</p>
              <p className="text-slate-500 mt-0.5">Owner: {assignModalSeller.ownerName}</p>
              <p className="text-slate-500">
                Deposits: ₹{(assignModalSeller.wallet?.totalDeposited || 0).toLocaleString()} INR
              </p>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700 uppercase">
                Select Team Member
              </label>
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">-- Choose Member or Admin --</option>
                {members.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name} (@{m.username}) —{' '}
                    {m.role === 'admin'
                      ? '🛡️ Admin (50% Personal Handler + 25% Pool Split)'
                      : m.commissionLabel === 'inr_50'
                      ? '🇮🇳 50% INR Split Deal'
                      : '🇵🇰 1:1 PKR Fixed Deal'}
                  </option>
                ))}
              </select>
            </div>

            {selectedMemberId && (() => {
              const targetMember = members.find((m) => m._id === selectedMemberId);
              if (!targetMember) return null;
              const isTargetAdmin = targetMember.role === 'admin';
              const is50Inr = targetMember.commissionLabel === 'inr_50';
              return (
                <div className="mt-4 p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    Inherited Commission Agreement for {targetMember.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-extrabold px-2.5 py-1 rounded-xl border ${
                        isTargetAdmin
                          ? 'bg-amber-100 text-amber-900 border-amber-300'
                          : is50Inr
                          ? 'bg-purple-100 text-purple-900 border-purple-300'
                          : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      }`}
                    >
                      {isTargetAdmin
                        ? '🛡️ Admin Handler Deal (50% Personal + 25% Pool = 75% Total)'
                        : is50Inr
                        ? '🇮🇳 50% INR Split Deal'
                        : '🇵🇰 1:1 PKR Fixed Deal'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-snug">
                    {isTargetAdmin
                      ? '50% INR from all store deposits directly credits to this Admin as managing handler share. The remaining 50% INR platform pool is split 50-50 across both Admins (25% each).'
                      : is50Inr
                      ? '50% in Indian Rupees from all store deposits directly credits to this member. The other 50% INR goes to the Admin platform pool.'
                      : 'Member earns 1 Pakistani Rupee for every 1 Indian Rupee deposited. 100% of the deposit INR flows to Admin pool.'}
                  </p>
                  <p className="text-[10px] text-slate-400 italic">
                    * Note: Deal agreements are configured on the Member account under &quot;Team Members&quot;.
                  </p>
                </div>
              );
            })()}

            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={() => setAssignModalSeller(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignSeller}
                disabled={assignLoading || !selectedMemberId}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white shadow-sm"
              >
                {assignLoading ? 'Assigning...' : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: Member Private CRM Memory Note ─── */}
      {noteModalSeller && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto animate-scale-up">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Private Client Memory Card</h3>
                <p className="text-xs text-slate-400">
                  This note is private to you for personal memory & reminders.
                </p>
              </div>
              <button
                onClick={() => setNoteModalSeller(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNote} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Custom Nickname / Alias
                </label>
                <input
                  type="text"
                  value={noteForm.customName}
                  onChange={(e) => setNoteForm({ ...noteForm, customName: e.target.value })}
                  placeholder="e.g. Seth Ji Mumbai or Bhai Jaan Wholesale"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Age</label>
                  <input
                    type="text"
                    value={noteForm.age}
                    onChange={(e) => setNoteForm({ ...noteForm, age: e.target.value })}
                    placeholder="e.g. 34"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Marital Status
                  </label>
                  <input
                    type="text"
                    value={noteForm.maritalStatus}
                    onChange={(e) => setNoteForm({ ...noteForm, maritalStatus: e.target.value })}
                    placeholder="e.g. Married, 2 kids"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Occupation</label>
                  <input
                    type="text"
                    value={noteForm.occupation}
                    onChange={(e) => setNoteForm({ ...noteForm, occupation: e.target.value })}
                    placeholder="e.g. Textile Importer"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Location</label>
                  <input
                    type="text"
                    value={noteForm.location}
                    onChange={(e) => setNoteForm({ ...noteForm, location: e.target.value })}
                    placeholder="e.g. Surat, Gujarat"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Picture URL (Optional)
                </label>
                <input
                  type="url"
                  value={noteForm.picture}
                  onChange={(e) => setNoteForm({ ...noteForm, picture: e.target.value })}
                  placeholder="https://example.com/photo.jpg"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Additional Details & Reminders
                </label>
                <textarea
                  rows={3}
                  value={noteForm.details}
                  onChange={(e) => setNoteForm({ ...noteForm, details: e.target.value })}
                  placeholder="Any details to help you remember this client (interests, preferences, deposit habits)..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setNoteModalSeller(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={noteLoading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white shadow-sm flex items-center space-x-1"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{noteLoading ? 'Saving...' : 'Save Note'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
