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
} from 'lucide-react';

export default function SellersPage() {
  const { user } = useAuth();
  const [sellers, setSellers] = useState([]);
  const [members, setMembers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
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

  // Handle Admin Assigning Seller to a Member
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
    const matchesSearch =
      s.storeName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.ownerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.assignment?.privateNotes?.customName?.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === 'assigned') return Boolean(s.assignment);
    if (statusFilter === 'unassigned') return !s.assignment;
    return true;
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

        {/* Search & Filter Bar */}
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/* Sellers Grid */}
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {filteredSellers.map((seller) => {
            const privateNote = seller.assignment?.privateNotes || {};
            const healthScore = seller.accountHealth?.score ?? 100;
            const healthStatus = seller.accountHealth?.status || 'healthy';

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
                        <span className="font-semibold text-slate-800">
                          {seller.assignment?.member?.name || (
                            <span className="text-red-500 font-bold">Unassigned</span>
                          )}
                        </span>
                      </div>
                    )}
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
                <option value="">-- Choose Member --</option>
                {members.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name} (@{m.username}) — {m.role}
                  </option>
                ))}
              </select>
            </div>

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
