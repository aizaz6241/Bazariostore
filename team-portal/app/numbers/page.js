'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Smartphone, Plus, Search, LayoutGrid, BarChart3, Wallet, CalendarClock, Ban, Users, X, Star } from 'lucide-react';
import {
  api,
  PageHeader,
  Segmented,
  Chip,
  Pill,
  Button,
  StatTile,
  EmptyState,
  Banner,
  Skeleton,
  Modal,
  Field,
  Avatar,
  inputClass,
  fmtInt,
  fmtMoney,
  useToast,
} from '@/components/ui/kit';
import NumberDrawer from '@/components/numbers/NumberDrawer';
import NumbersAnalytics from '@/components/numbers/NumbersAnalytics';
import { NUMBER_STATUS, CURRENCIES, MAX_HOLDERS, renewalInfo } from '@/components/numbers/meta';

const emptyForm = { number: '', label: '', country: '', provider: '', monthlyCost: '', currency: 'USD', nextRenewalAt: '', notes: '' };

export default function NumbersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === 'admin';
  const [toast, toastNode] = useToast();

  const [tab, setTab] = useState('numbers');
  const [status, setStatus] = useState('active');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/leads');
  }, [user, router]);

  const load = useCallback(async () => {
    try {
      setError('');
      setData(await api('/api/numbers'));
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const numbers = data?.numbers || [];
  const members = data?.members || [];

  const counts = useMemo(() => {
    const c = { all: numbers.length, active: 0, banned: 0, replaced: 0, inactive: 0 };
    numbers.forEach((n) => (c[n.status] = (c[n.status] || 0) + 1));
    return c;
  }, [numbers]);

  const summary = useMemo(() => {
    const active = numbers.filter((n) => n.status === 'active');
    const cost = new Map();
    active.forEach((n) => cost.set(n.currency || 'USD', (cost.get(n.currency || 'USD') || 0) + (Number(n.monthlyCost) || 0)));
    const costs = [...cost.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const due = active.filter((n) => {
      const r = renewalInfo(n);
      return r && r.days <= 7;
    }).length;
    const monthAgo = Date.now() - 30 * 86400000;
    const bannedRecently = numbers.filter((n) => n.bannedAt && new Date(n.bannedAt).getTime() > monthAgo).length;
    const holders = new Set(active.flatMap((n) => n.holders.map((h) => h.memberId))).size;
    return { active: active.length, costs, due, bannedRecently, holders };
  }, [numbers]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const digits = term.replace(/\D+/g, '');
    return numbers.filter((n) => {
      if (status !== 'all' && n.status !== status) return false;
      if (!term) return true;
      return (
        (digits.length >= 3 && String(n.number || '').replace(/\D+/g, '').includes(digits)) ||
        [n.label, n.country, n.provider].some((x) => x?.toLowerCase().includes(term)) ||
        n.holders.some((h) => h.name?.toLowerCase().includes(term))
      );
    });
  }, [numbers, status, q]);

  const openNumber = numbers.find((n) => n._id === openId) || null;

  const save = async () => {
    setSaving(true);
    setFormError('');
    try {
      const r = await api('/api/numbers', { method: 'POST', body: { ...form, nextRenewalAt: form.nextRenewalAt || null } });
      toast(r.message);
      setAddOpen(false);
      setForm(emptyForm);
      await load();
      setStatus('active');
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4 sm:space-y-6 pb-6">
      <PageHeader
        icon={Smartphone}
        title="WhatsApp Numbers"
        subtitle="Company numbers, who holds them, and what they cost each month."
        actions={
          <Button
            icon={Plus}
            onClick={() => {
              setForm(emptyForm);
              setFormError('');
              setAddOpen(true);
            }}
          >
            Add number
          </Button>
        }
      />

      {/* summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon={Smartphone} tone="green" label="Active numbers" value={data ? fmtInt(summary.active) : '—'} sub={data ? `${fmtInt(summary.holders)} people use them` : ''} />
        <StatTile
          icon={Wallet}
          tone="blue"
          label="Monthly cost"
          value={data ? (summary.costs.length ? fmtMoney(summary.costs[0][1], summary.costs[0][0]) : '0') : '—'}
          sub={summary.costs.length > 1 ? summary.costs.slice(1).map(([c, v]) => fmtMoney(v, c)).join(' + ') : "Not in finance"}
        />
        <StatTile
          icon={CalendarClock}
          tone={summary.due ? 'amber' : 'slate'}
          label="Due this week"
          value={data ? fmtInt(summary.due) : '—'}
          sub="Including overdue ones"
          onClick={() => setTab('analytics')}
        />
        <StatTile
          icon={Ban}
          tone={summary.bannedRecently ? 'red' : 'slate'}
          label="Banned (30d)"
          value={data ? fmtInt(summary.bannedRecently) : '—'}
          sub={`${fmtInt(counts.banned)} banned in total`}
          onClick={() => {
            setTab('numbers');
            setStatus('banned');
          }}
          active={tab === 'numbers' && status === 'banned'}
        />
      </div>

      <Segmented
        label="View"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'numbers', label: 'Numbers', icon: LayoutGrid },
          { value: 'analytics', label: 'Analytics', icon: BarChart3 },
        ]}
      />

      {error && <Banner tone="danger">{error}</Banner>}

      {tab === 'analytics' ? (
        <NumbersAnalytics onOpen={setOpenId} />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {['active', 'banned', 'replaced', 'inactive', 'all'].map((s) => (
                <Chip key={s} active={status === s} onClick={() => setStatus(s)} count={counts[s] || 0} tone={NUMBER_STATUS[s]?.color}>
                  {s === 'all' ? 'All' : NUMBER_STATUS[s].label}
                </Chip>
              ))}
            </div>
            <div className="relative sm:ml-auto sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, name or member" className={`${inputClass} pl-9`} aria-label="Search numbers" />
              {q && (
                <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-700" aria-label="Clear search">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {!data ? (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-44" />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200/80">
              <EmptyState
                icon={Smartphone}
                title={numbers.length ? 'Nothing matches' : 'No numbers yet'}
                text={numbers.length ? 'Try another filter or search.' : 'Add the company WhatsApp numbers (UK, US …), then link each one to the members who use it.'}
                action={
                  !numbers.length && (
                    <Button icon={Plus} onClick={() => setAddOpen(true)}>
                      Add number
                    </Button>
                  )
                }
              />
            </div>
          ) : (
            <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {shown.map((n) => {
                const st = NUMBER_STATUS[n.status];
                const renew = n.status === 'active' ? renewalInfo(n) : null;
                const over = n.holders.length > MAX_HOLDERS;
                return (
                  <li key={n._id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(n._id)}
                      className="w-full h-full text-left bg-white rounded-3xl border border-slate-200/80 p-4 sm:p-5 hover:border-slate-300 hover:shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 flex flex-col"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-10 h-10 rounded-2xl bg-slate-900 text-white text-xs font-extrabold flex items-center justify-center shrink-0">
                            {(n.country || '··').slice(0, 3)}
                          </span>
                          <div className="min-w-0">
                            <p className="font-extrabold text-slate-900 tabular-nums truncate">{n.number}</p>
                            <p className="text-[11px] text-slate-500 truncate">{[n.label, n.provider].filter(Boolean).join(' · ') || 'No name'}</p>
                          </div>
                        </div>
                        <Pill color={st.color}>{st.label}</Pill>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        {n.holders.length ? (
                          <div className="flex items-center min-w-0">
                            <div className="flex -space-x-2">
                              {n.holders.slice(0, 5).map((h) => (
                                <Avatar key={h.memberId} name={h.name} size="sm" ring={h.primary} />
                              ))}
                            </div>
                            <span className={`ml-2 text-xs truncate ${over ? 'text-red-600 font-bold' : 'text-slate-600'}`}>
                              {n.holders.length === 1 ? n.holders[0].name : `${n.holders.length} people`}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 inline-flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" /> Not given to anyone
                          </span>
                        )}
                        {n.holders.some((h) => h.primary) && n.holders.length > 1 && (
                          <span className="text-[10px] text-slate-400 inline-flex items-center gap-1 shrink-0">
                            <Star className="w-3 h-3 text-amber-500" /> main phone
                          </span>
                        )}
                      </div>

                      <div className="flex-1" />
                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-bold text-slate-900 tabular-nums">{n.monthlyCost ? `${fmtMoney(n.monthlyCost, n.currency)}/mo` : 'No cost set'}</span>
                        {renew ? (
                          <span className="font-semibold" style={{ color: renew.color === '#94a3b8' ? '#64748b' : renew.color }}>
                            {renew.text}
                          </span>
                        ) : (
                          <span className="text-slate-400">
                            {fmtInt(n.leads)} leads · {fmtInt(n.converted)} stores
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a WhatsApp number"
        subtitle="Link it to members afterwards from the number's page."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving} disabled={!form.number.trim()}>
              Add number
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="WhatsApp number *" hint="With country code.">
            <input autoFocus value={form.number} onChange={set('number')} inputMode="tel" placeholder="+44 7700 900123" className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name" hint="So everyone knows which one: UK-3, US main…">
              <input value={form.label} onChange={set('label')} placeholder="UK-3" className={inputClass} />
            </Field>
            <Field label="Country">
              <input value={form.country} onChange={set('country')} placeholder="UK" className={inputClass} />
            </Field>
            <Field label="Monthly cost">
              <input value={form.monthlyCost} onChange={set('monthlyCost')} inputMode="decimal" placeholder="0" className={inputClass} />
            </Field>
            <Field label="Currency">
              <select value={form.currency} onChange={set('currency')} className={inputClass}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Provider">
              <input value={form.provider} onChange={set('provider')} placeholder="Where it is bought" className={inputClass} />
            </Field>
            <Field label="Next renewal">
              <input type="date" value={form.nextRenewalAt} onChange={set('nextRenewalAt')} className={inputClass} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea value={form.notes} onChange={set('notes')} rows={2} className={`${inputClass} resize-none`} />
          </Field>
          {formError && <Banner tone="danger">{formError}</Banner>}
        </div>
      </Modal>

      {openNumber && <NumberDrawer number={openNumber} members={members} onClose={() => setOpenId(null)} onChanged={load} toast={toast} />}
      {toastNode}
    </div>
  );
}
