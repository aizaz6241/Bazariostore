'use client';

import React, { useState, useEffect } from 'react';
import { useLiveRefresh } from '@/components/LiveProvider';
import { useAuth } from '@/components/AuthProvider';
import SellerOrdersModal from '@/components/SellerOrdersModal';
import { SellerAnalyticsView, SellerDetailDrawer } from '@/components/SellerAnalytics';
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
  // Pending orders + wallet popup
  const [ordersSeller, setOrdersSeller] = useState(null);

  const isAdmin = user?.role === 'admin';

  const fetchData = async (silent = false) => {
    try {
      if (silent !== true) setLoading(true);
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

  // Store deposits / balances follow the seller website without a reload
  useLiveRefresh(() => fetchData(true));

  // Handle Admin Assigning Seller to a Member (Deal agreement is inherited from Member)
  const handleAssignSeller = async () => {
    if (!assignModalSeller || !selectedMemberId) return;
    // Clear confirmation: once the seller's first deposit comes in, it stays with this owner for good
    const target = members.find((m) => m._id === selectedMemberId);
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Give “${assignModalSeller.storeName}” to ${target ? target.name : 'this member'}?\n\nOnce this seller's first deposit comes in, it stays with ${target ? target.name : 'this owner'} for good and can never be moved.`
      )
    ) {
      return;
    }

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
        const okData = await res.json().catch(() => ({}));
        setAssignModalSeller(null);
        setSelectedMemberId('');
        fetchData();
        loadAnalytics(scope, true);
        // Moving a seller that already has an owner waits for the other partner
        if (okData.pendingApproval) alert(okData.message);
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

  // Seller analytics: "My sellers" for everyone, "All sellers" (the business) for partners
  const [scope, setScope] = useState('mine');
  const [analytics, setAnalytics] = useState({}); // scope -> answer
  const [analyticsError, setAnalyticsError] = useState('');
  const [openSeller, setOpenSeller] = useState(null);

  const loadAnalytics = async (which = scope, silent = false) => {
    try {
      if (!silent) setAnalyticsError('');
      const token = localStorage.getItem('portal_token');
      const res = await fetch(`/api/sellers/analytics?scope=${which}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Could not load seller analytics');
      setAnalytics((prev) => ({ ...prev, [which]: json }));
    } catch (e) {
      if (!silent) setAnalyticsError(e.message);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadAnalytics(scope);
  }, [scope, user?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  useLiveRefresh(() => loadAnalytics(scope, true));

  const directory = new Map(sellers.map((x) => [String(x._id), x]));
  const current = analytics[scope];

  return (
    <div className="space-y-5 animate-fade-in pb-10">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{scope === 'all' ? 'All sellers' : 'My sellers'}</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {scope === 'all'
              ? 'Every real client seller of the business. Real Binance USDT only: test accounts and helping amounts are not counted.'
              : isAdmin
              ? 'The sellers that belong to you, and what you earned from each. Real Binance USDT only.'
              : 'Your sellers: what they deposited and withdrew, and what you earned from each. Real Binance USDT only.'}
          </p>
        </div>
        {isAdmin && (
          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 self-start lg:self-auto">
            {[
              { key: 'mine', label: 'My sellers' },
              { key: 'all', label: 'All sellers (business)' },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setScope(t.key)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition ${scope === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {analyticsError && !current && <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700">{analyticsError}</div>}

      {!current ? (
        <div className="space-y-3 animate-pulse" aria-label="Loading">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-3xl bg-slate-200/70" />
            ))}
          </div>
          <div className="h-72 rounded-3xl bg-slate-200/60" />
          <div className="h-64 rounded-3xl bg-slate-200/50" />
        </div>
      ) : current.sellers.length === 0 && !loading ? (
        <div className="py-16 text-center bg-white rounded-3xl border border-slate-200 p-8">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-base font-bold text-slate-700">No sellers yet</p>
          <p className="text-xs text-slate-400 mt-1">
            {scope === 'all'
              ? 'No client sellers are registered yet.'
              : isAdmin
              ? 'No seller is assigned to you yet. Choose yourself under “Assigned To” when approving a seller, or switch to “All sellers”.'
              : 'You have not been assigned any sellers yet. Admin will assign new seller applications to you soon.'}
          </p>
        </div>
      ) : (
        <SellerAnalyticsView
          data={current}
          directory={directory}
          isPartner={isAdmin}
          scope={scope}
          onOpen={(s) => setOpenSeller(s)}
          onNote={(dir) => openNoteModal(dir)}
          onOrders={(dir) => setOrdersSeller(dir)}
          onAssign={(dir) => {
            setAssignModalSeller(dir);
            setSelectedMemberId(dir.assignment?.member?._id || '');
          }}
        />
      )}

      {openSeller && (
        <SellerDetailDrawer
          seller={openSeller}
          scope={scope}
          isPartner={isAdmin}
          dirEntry={directory.get(openSeller.sellerId)}
          onClose={() => setOpenSeller(null)}
          onNote={(dir) => openNoteModal(dir)}
          onOrders={(dir) => setOrdersSeller(dir)}
        />
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
                Deposits: ₮{(assignModalSeller.binance?.depositUSDT || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                      ? 'This partner gets 75% of the real USDT of every deposit from this store; the other partner gets 25%.'
                      : is50Inr
                      ? 'This member gets 50% of the real USDT of every deposit from this store. The two partners share the other 50% equally.'
                      : 'Member gets 1 Pakistani Rupee for every Indian Rupee deposited, paid in USDT at that day’s rate. The two partners share the rest equally.'}
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
                  placeholder="e.g. The name you know them by"
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
                    placeholder="City, region"
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
      {ordersSeller && <SellerOrdersModal seller={ordersSeller} onClose={() => setOrdersSeller(null)} />}
    </div>
  );
}
