'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Target, Plus, Upload, Search, List, BarChart3, ChevronLeft, ChevronRight, AlertTriangle, Users, X, Store } from 'lucide-react';
import { api, PageHeader, Segmented, Chip, Pill, Button, EmptyState, Banner, Skeleton, inputClass, fmtInt, timeAgo, useToast } from '@/components/ui/kit';
import CheckNumber from '@/components/leads/CheckNumber';
import AddLeadModal from '@/components/leads/AddLeadModal';
import ImportModal from '@/components/leads/ImportModal';
import LeadDrawer from '@/components/leads/LeadDrawer';
import LeadsAnalytics from '@/components/leads/LeadsAnalytics';
import { STATUS, STATUS_ORDER, sourceName, statusLabel } from '@/components/leads/meta';

const PAGE_SIZE = 30;

export default function LeadsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [toast, toastNode] = useToast();

  const [tab, setTab] = useState('list');
  const [status, setStatus] = useState('all');
  const [memberFilter, setMemberFilter] = useState('');
  const [q, setQ] = useState('');
  const [qLive, setQLive] = useState('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState(new Set());
  const [bulkMember, setBulkMember] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addPhone, setAddPhone] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [openLeadId, setOpenLeadId] = useState(null);

  // search waits until typing stops
  useEffect(() => {
    const t = setTimeout(() => setQ(qLive.trim()), 350);
    return () => clearTimeout(t);
  }, [qLive]);
  useEffect(() => setPage(1), [status, memberFilter, q]);

  const reqId = useRef(0);
  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ status, page: String(page), limit: String(PAGE_SIZE) });
      if (memberFilter) params.set('memberId', memberFilter);
      if (q) params.set('q', q);
      const r = await api(`/api/leads?${params}`);
      if (id === reqId.current) setData(r);
    } catch (e) {
      if (id === reqId.current) setError(e.message);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [status, page, memberFilter, q]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);
  useEffect(() => setSelected(new Set()), [status, memberFilter, q, page]);

  const counts = data?.counts || {};
  const leads = data?.leads || [];
  const members = data?.members || [];
  const numbers = data?.numbers || [];

  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const selectable = leads.filter((l) => l.status !== 'converted');
  const allSelected = selectable.length > 0 && selectable.every((l) => selected.has(l._id));

  const bulkAssign = async (memberId) => {
    setBulkBusy(true);
    try {
      const r = await api('/api/leads/bulk', { method: 'POST', body: { action: 'assign', ids: [...selected], memberId: memberId || null } });
      toast(r.message);
      setSelected(new Set());
      setBulkMember('');
      load();
    } catch (e) {
      toast(e.message, 'danger');
    } finally {
      setBulkBusy(false);
    }
  };

  const openAdd = (phone = '') => {
    setAddPhone(phone);
    setAddOpen(true);
  };

  const filters = [
    { key: 'all', label: 'All' },
    ...(isAdmin ? [{ key: 'unassigned', label: 'In pool' }] : []),
    ...STATUS_ORDER.map((s) => ({ key: s, label: s === 'new' ? 'Not contacted' : STATUS[s].label, tone: STATUS[s].color })),
    { key: 'stale', label: 'Stale 14d+', tone: '#dc2626' },
  ];

  if (!user) return null;

  return (
    <div className="space-y-4 sm:space-y-6 pb-6">
      <PageHeader
        icon={Target}
        title="Leads"
        subtitle={isAdmin ? 'Sellers found for the team: who has which one, and which became stores.' : 'Your sellers: the ones given to you and the ones you found yourself.'}
        actions={
          <>
            <Button variant="secondary" icon={Upload} onClick={() => setImportOpen(true)}>
              Import
            </Button>
            <Button icon={Plus} onClick={() => openAdd('')}>
              Add lead
            </Button>
          </>
        }
      />

      <CheckNumber isAdmin={isAdmin} onAdd={openAdd} onOpenLead={setOpenLeadId} />

      <Segmented
        label="View"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'list', label: 'Leads', icon: List },
          { value: 'analytics', label: 'Analytics', icon: BarChart3 },
        ]}
      />

      {tab === 'analytics' ? (
        <LeadsAnalytics
          isAdmin={isAdmin}
          members={members}
          onFilter={(s) => {
            setStatus(s);
            setTab('list');
          }}
        />
      ) : (
        <section className="bg-white rounded-3xl border border-slate-200/80 min-w-0">
          {/* filters */}
          <div className="p-4 sm:p-5 space-y-3 border-b border-slate-100">
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {filters.map((f) => (
                <Chip key={f.key} active={status === f.key} onClick={() => setStatus(f.key)} count={counts[f.key]} tone={f.tone}>
                  {f.label}
                </Chip>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={qLive} onChange={(e) => setQLive(e.target.value)} placeholder="Search name, phone or store" className={`${inputClass} pl-9`} aria-label="Search leads" />
                {qLive && (
                  <button type="button" onClick={() => setQLive('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-700" aria-label="Clear search">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {isAdmin && (
                <select value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)} className={`${inputClass} sm:w-56`} aria-label="Member">
                  <option value="">Every member</option>
                  <option value="none">Not given yet (pool)</option>
                  {members.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* bulk bar */}
          {isAdmin && selected.size > 0 && (
            <div className="px-4 sm:px-5 py-3 bg-slate-900 text-white flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="text-sm font-bold">{selected.size} selected</span>
              <select value={bulkMember} onChange={(e) => setBulkMember(e.target.value)} className="px-3 py-1.5 rounded-xl text-sm text-slate-900 bg-white" aria-label="Give selected leads to">
                <option value="">Give to…</option>
                {members.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!bulkMember || bulkBusy}
                onClick={() => bulkAssign(bulkMember)}
                className="px-3 py-1.5 rounded-xl bg-white text-slate-900 text-sm font-bold disabled:opacity-40"
              >
                Give
              </button>
              <button type="button" disabled={bulkBusy} onClick={() => bulkAssign(null)} className="px-3 py-1.5 rounded-xl text-sm font-semibold text-white/80 hover:text-white hover:bg-white/10">
                Take back to pool
              </button>
              <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-xs text-white/60 hover:text-white">
                Clear
              </button>
            </div>
          )}

          {error && (
            <div className="p-4">
              <Banner tone="danger">{error}</Banner>
            </div>
          )}

          {loading && !data ? (
            <div className="p-4 sm:p-5 space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : leads.length === 0 ? (
            <EmptyState
              icon={status === 'all' && !q ? Users : Search}
              title={status === 'all' && !q ? 'No leads yet' : 'Nothing matches'}
              text={
                status === 'all' && !q
                  ? isAdmin
                    ? 'Add the sellers you have found, or import a list, then give them to members.'
                    : 'Leads the admins give you show up here. You can also add sellers you found yourself.'
                  : 'Try another filter or search.'
              }
              action={
                status === 'all' && !q ? (
                  <Button icon={Plus} onClick={() => openAdd('')}>
                    Add lead
                  </Button>
                ) : null
              }
            />
          ) : (
            <div className={loading ? 'opacity-60 transition-opacity' : ''}>
              {/* desktop table */}
              <table className="hidden md:table w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-slate-500 border-b border-slate-100">
                    {isAdmin && (
                      <th className="pl-5 py-2.5 w-10">
                        <input
                          type="checkbox"
                          aria-label="Select all on this page"
                          checked={allSelected}
                          onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((l) => l._id)))}
                          className="w-4 h-4 rounded border-slate-300 accent-slate-900"
                        />
                      </th>
                    )}
                    <th className={`font-semibold py-2.5 ${isAdmin ? 'px-3' : 'px-5'}`}>Seller</th>
                    <th className="font-semibold px-3 py-2.5">Status</th>
                    {isAdmin && <th className="font-semibold px-3 py-2.5">With</th>}
                    <th className="font-semibold px-3 py-2.5">Source</th>
                    <th className="font-semibold px-5 py-2.5 text-right">Last update</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leads.map((l) => (
                    <tr key={l._id} onClick={() => setOpenLeadId(l._id)} className={`cursor-pointer hover:bg-slate-50 ${selected.has(l._id) ? 'bg-slate-50' : ''}`}>
                      {isAdmin && (
                        <td className="pl-5 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${l.name || l.phone}`}
                            disabled={l.status === 'converted'}
                            checked={selected.has(l._id)}
                            onChange={() => toggle(l._id)}
                            className="w-4 h-4 rounded border-slate-300 accent-slate-900 disabled:opacity-30"
                          />
                        </td>
                      )}
                      <td className={`py-3 ${isAdmin ? 'px-3' : 'px-5'}`}>
                        <p className="font-semibold text-slate-900 truncate max-w-[260px]">{l.name || l.phone}</p>
                        <p className="text-[11px] text-slate-500 tabular-nums">
                          {l.name ? l.phone : ''}
                          {l.country ? `${l.name ? ' · ' : ''}${l.country}` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <Pill color={STATUS[l.status]?.color}>{statusLabel(l)}</Pill>
                          {l.status === 'converted' && l.storeName && (
                            <span className="text-[11px] text-emerald-700 font-semibold inline-flex items-center gap-1">
                              <Store className="w-3 h-3" />
                              {l.storeName}
                            </span>
                          )}
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="px-3 py-3">
                          {l.memberName ? (
                            <span className="text-slate-800 font-medium">{l.memberName}</span>
                          ) : (
                            <span className="text-slate-400 italic">Pool</span>
                          )}
                          {l.ownerMismatch && <p className="text-[11px] text-red-600 font-semibold">Store went to {l.ownerName}</p>}
                        </td>
                      )}
                      <td className="px-3 py-3 text-slate-600">
                        {sourceName(l.source)}
                        {l.origin === 'member' && isAdmin && <span className="block text-[11px] text-violet-600 font-semibold">Found by member</span>}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className={`text-xs ${l.stale ? 'text-red-600 font-bold' : 'text-slate-500'}`}>
                          {l.stale && <AlertTriangle className="w-3 h-3 inline -mt-0.5 mr-1" />}
                          {timeAgo(l.lastActivityAt)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* phone cards */}
              <ul className="md:hidden divide-y divide-slate-100">
                {leads.map((l) => (
                  <li key={l._id} className="flex items-stretch">
                    {isAdmin && (
                      <label className="pl-4 pr-1 flex items-center">
                        <input
                          type="checkbox"
                          aria-label={`Select ${l.name || l.phone}`}
                          disabled={l.status === 'converted'}
                          checked={selected.has(l._id)}
                          onChange={() => toggle(l._id)}
                          className="w-4 h-4 rounded border-slate-300 accent-slate-900 disabled:opacity-30"
                        />
                      </label>
                    )}
                    <button type="button" onClick={() => setOpenLeadId(l._id)} className="flex-1 min-w-0 text-left px-4 py-3.5 active:bg-slate-50">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{l.name || l.phone}</p>
                          <p className="text-[11px] text-slate-500 truncate tabular-nums">
                            {l.name ? `${l.phone} · ` : ''}
                            {sourceName(l.source)}
                            {isAdmin ? ` · ${l.memberName || 'Pool'}` : ''}
                          </p>
                        </div>
                        <Pill color={STATUS[l.status]?.color}>{statusLabel(l)}</Pill>
                      </div>
                      <p className={`text-[11px] mt-1.5 ${l.stale ? 'text-red-600 font-bold' : 'text-slate-400'}`}>
                        {l.stale ? 'No update for 14+ days · ' : ''}
                        {timeAgo(l.lastActivityAt)}
                        {l.storeName ? ` · ${l.storeName}` : ''}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>

              {/* pages */}
              <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-slate-100 text-xs text-slate-500">
                <span className="tabular-nums">
                  {fmtInt((page - 1) * PAGE_SIZE + 1)}–{fmtInt(Math.min(page * PAGE_SIZE, data?.total || 0))} of {fmtInt(data?.total)}
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page" />
                  <span className="px-2 tabular-nums">
                    {page} / {data?.pages || 1}
                  </span>
                  <Button variant="ghost" size="sm" icon={ChevronRight} disabled={page >= (data?.pages || 1)} onClick={() => setPage((p) => p + 1)} aria-label="Next page" />
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <AddLeadModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        initialPhone={addPhone}
        isAdmin={isAdmin}
        members={members}
        numbers={numbers}
        onOpenLead={(id) => {
          setAddOpen(false);
          setOpenLeadId(id);
        }}
        onSaved={(r) => {
          toast(r.message);
          load();
        }}
      />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} isAdmin={isAdmin} members={members} onDone={() => load()} />
      <LeadDrawer
        leadId={openLeadId}
        onClose={() => setOpenLeadId(null)}
        isAdmin={isAdmin}
        members={members}
        numbers={numbers}
        toast={toast}
        onChanged={(lead, removedId) => {
          if (removedId) return load();
          setData((d) => (d ? { ...d, leads: d.leads.map((x) => (x._id === lead._id ? { ...x, ...lead } : x)) } : d));
        }}
      />
      {toastNode}
    </div>
  );
}
