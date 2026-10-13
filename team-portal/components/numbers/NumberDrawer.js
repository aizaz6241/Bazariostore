'use client';

import React, { useEffect, useState } from 'react';
import { Star, UserMinus, UserPlus, RefreshCw, Ban, CheckCircle2, Repeat, Pencil, CalendarClock, MessageSquareText } from 'lucide-react';
import { Drawer, Pill, Button, Field, Timeline, Banner, Avatar, inputClass, api, fmtDate, fmtMoney } from '@/components/ui/kit';
import { NUMBER_STATUS, renewalInfo, CURRENCIES, MAX_HOLDERS } from './meta';

const historyColor = (h) =>
  ({ banned: NUMBER_STATUS.banned.color, replaced: NUMBER_STATUS.replaced.color, renewed: '#1baf7a', linked: '#2a78d6', unlinked: '#94a3b8', created: '#0f172a' }[h.type] ||
  '#94a3b8');

const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

/** One company WhatsApp number: who holds it, its subscription, and what happened to it. */
export default function NumberDrawer({ number, members = [], onClose, onChanged, toast }) {
  const [panel, setPanel] = useState(null); // link | renew | ban | replace | edit | note
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState({});

  useEffect(() => {
    setPanel(null);
    setForm({});
  }, [number?._id]);

  if (!number) return <Drawer open={false} />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const openPanel = (p, init = {}) => {
    setForm(init);
    setPanel(panel === p ? null : p);
  };

  const act = async (key, body) => {
    setBusy(key);
    try {
      const r = await api(`/api/numbers/${number._id}`, { method: 'PATCH', body });
      toast?.(r.message);
      setPanel(null);
      onChanged?.();
      return true;
    } catch (e) {
      toast?.(e.message, 'danger');
      return false;
    } finally {
      setBusy('');
    }
  };

  const st = NUMBER_STATUS[number.status];
  const renew = renewalInfo(number);
  const active = number.status === 'active';
  const free = members.filter((m) => !number.holders.some((h) => h.memberId === m._id));

  return (
    <Drawer
      open
      onClose={onClose}
      title={<span className="tabular-nums">{number.number}</span>}
      subtitle={[number.label, number.country, number.provider].filter(Boolean).join(' · ') || 'Company WhatsApp number'}
      headerExtra={
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Pill color={st.color}>{st.label}</Pill>
            {renew && active && <Pill color={renew.color}>{renew.text}</Pill>}
          </div>
          <div className="flex flex-wrap gap-2">
            {active && (
              <>
                <Button size="sm" icon={UserPlus} variant={panel === 'link' ? 'primary' : 'secondary'} onClick={() => openPanel('link', { memberId: '', primary: false })}>
                  Link member
                </Button>
                <Button
                  size="sm"
                  icon={RefreshCw}
                  variant={panel === 'renew' ? 'primary' : 'secondary'}
                  onClick={() => openPanel('renew', { amount: String(number.monthlyCost || ''), currency: number.currency, paidAt: toDateInput(new Date()) })}
                >
                  Renewed
                </Button>
                <Button size="sm" icon={Ban} variant={panel === 'ban' ? 'primary' : 'secondary'} onClick={() => openPanel('ban', { reason: '' })}>
                  Banned
                </Button>
              </>
            )}
            {number.status !== 'replaced' && (
              <Button size="sm" icon={Repeat} variant={panel === 'replace' ? 'primary' : 'secondary'} onClick={() => openPanel('replace', { number: '', label: number.label, nextRenewalAt: '' })}>
                Replace
              </Button>
            )}
            {!active && number.status !== 'replaced' && (
              <Button size="sm" icon={CheckCircle2} variant="secondary" loading={busy === 'activate'} onClick={() => act('activate', { action: 'status', status: 'active' })}>
                Active again
              </Button>
            )}
            <Button
              size="sm"
              icon={Pencil}
              variant={panel === 'edit' ? 'primary' : 'ghost'}
              onClick={() =>
                openPanel('edit', {
                  number: number.number,
                  label: number.label,
                  country: number.country,
                  provider: number.provider,
                  monthlyCost: String(number.monthlyCost ?? ''),
                  currency: number.currency,
                  nextRenewalAt: toDateInput(number.nextRenewalAt),
                  notes: number.notes,
                })
              }
            >
              Edit
            </Button>
          </div>
        </div>
      }
    >
      {/* the action the admin opened */}
      {panel && panel !== 'note' && (
        <section className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
          {panel === 'link' && (
            <>
              <Field label="Give this number to">
                <select value={form.memberId} onChange={set('memberId')} className={inputClass}>
                  <option value="">Choose a member…</option>
                  {free.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name}
                      {m.role === 'admin' ? ' (partner)' : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={!!form.primary} onChange={set('primary')} className="w-4 h-4 accent-slate-900" />
                The number's main phone (SIM / account) is with this member
              </label>
              {number.holders.length >= MAX_HOLDERS && (
                <Banner tone="warning">WhatsApp allows one main phone and 4 linked devices. This number already has {number.holders.length} people.</Banner>
              )}
              <Button loading={busy === 'link'} disabled={!form.memberId} onClick={() => act('link', { action: 'link', memberId: form.memberId, primary: form.primary })}>
                Link
              </Button>
            </>
          )}
          {panel === 'renew' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount paid">
                  <input value={form.amount} onChange={set('amount')} inputMode="decimal" className={inputClass} />
                </Field>
                <Field label="Currency">
                  <select value={form.currency} onChange={set('currency')} className={inputClass}>
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Paid on" hint="The next renewal moves one month ahead (paying early does not lose days).">
                <input type="date" value={form.paidAt} onChange={set('paidAt')} className={inputClass} />
              </Field>
              <Button loading={busy === 'renew'} onClick={() => act('renew', { action: 'renew', ...form })}>
                Save renewal
              </Button>
            </>
          )}
          {panel === 'ban' && (
            <>
              <Field label="What happened?" hint="The members who hold it are told to stop using it.">
                <input value={form.reason} onChange={set('reason')} placeholder="e.g. banned on 14 Oct after reports" className={inputClass} />
              </Field>
              <Button loading={busy === 'ban'} onClick={() => act('ban', { action: 'status', status: 'banned', reason: form.reason })}>
                Mark banned
              </Button>
              <button type="button" onClick={() => act('inactive', { action: 'status', status: 'inactive', reason: form.reason })} className="block text-xs font-semibold text-slate-500 hover:text-slate-800">
                Not banned, just not in use → mark inactive
              </button>
            </>
          )}
          {panel === 'replace' && (
            <>
              <p className="text-[13px] text-slate-600">A new number takes this one's place. Everyone who holds it moves to the new number and is told to link it.</p>
              <Field label="New WhatsApp number">
                <input value={form.number} onChange={set('number')} inputMode="tel" placeholder="+44 7700 900123" className={inputClass} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name">
                  <input value={form.label} onChange={set('label')} className={inputClass} />
                </Field>
                <Field label="First renewal">
                  <input type="date" value={form.nextRenewalAt} onChange={set('nextRenewalAt')} className={inputClass} />
                </Field>
              </div>
              <Button loading={busy === 'replace'} disabled={!form.number?.trim()} onClick={() => act('replace', { action: 'replace', ...form })}>
                Replace number
              </Button>
            </>
          )}
          {panel === 'edit' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Number" className="col-span-2">
                  <input value={form.number} onChange={set('number')} inputMode="tel" className={inputClass} />
                </Field>
                <Field label="Name">
                  <input value={form.label} onChange={set('label')} className={inputClass} />
                </Field>
                <Field label="Country">
                  <input value={form.country} onChange={set('country')} className={inputClass} />
                </Field>
                <Field label="Monthly cost">
                  <input value={form.monthlyCost} onChange={set('monthlyCost')} inputMode="decimal" className={inputClass} />
                </Field>
                <Field label="Currency">
                  <select value={form.currency} onChange={set('currency')} className={inputClass}>
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Provider">
                  <input value={form.provider} onChange={set('provider')} className={inputClass} />
                </Field>
                <Field label="Next renewal">
                  <input type="date" value={form.nextRenewalAt} onChange={set('nextRenewalAt')} className={inputClass} />
                </Field>
              </div>
              <Field label="Notes">
                <textarea value={form.notes} onChange={set('notes')} rows={2} className={`${inputClass} resize-none`} />
              </Field>
              <Button loading={busy === 'edit'} onClick={() => act('edit', { action: 'edit', ...form, nextRenewalAt: form.nextRenewalAt || null })}>
                Save changes
              </Button>
            </>
          )}
        </section>
      )}

      {number.status === 'banned' && (
        <Banner tone="danger" title={`Banned ${fmtDate(number.bannedAt)}`}>
          {number.banReason || 'No reason written.'} Replace it to move its members to a new number.
        </Banner>
      )}

      {/* holders */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-slate-700">Who has this number</p>
          <span className={`text-[11px] font-semibold ${number.holders.length > MAX_HOLDERS ? 'text-red-600' : 'text-slate-400'}`}>
            {number.holders.length} / {MAX_HOLDERS}
          </span>
        </div>
        {number.holders.length ? (
          <ul className="space-y-2">
            {number.holders.map((h) => (
              <li key={h.memberId} className="flex items-center gap-3 p-2.5 rounded-2xl border border-slate-200/80">
                <Avatar name={h.name} ring={h.primary} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{h.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {h.primary ? 'Main phone · ' : 'Linked device · '}since {fmtDate(h.since)}
                  </p>
                </div>
                {!h.primary && active && (
                  <button
                    type="button"
                    title="Make main phone"
                    aria-label={`Make ${h.name} the main phone`}
                    onClick={() => act(`p-${h.memberId}`, { action: 'primary', memberId: h.memberId })}
                    className="p-2 rounded-xl text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                  >
                    <Star className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  title="Remove"
                  aria-label={`Remove ${h.name}`}
                  onClick={() => window.confirm(`Take this number back from ${h.name}?`) && act(`u-${h.memberId}`, { action: 'unlink', memberId: h.memberId })}
                  className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50"
                >
                  <UserMinus className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">Nobody holds this number{active ? '. Link a member to give it out.' : '.'}</p>
        )}
      </section>

      {/* subscription */}
      <section>
        <p className="text-xs font-bold text-slate-700 mb-3">Subscription</p>
        <div className="grid grid-cols-3 gap-2">
          <Box label="Per month" value={number.monthlyCost ? fmtMoney(number.monthlyCost, number.currency) : '—'} />
          <Box label="Next renewal" value={number.nextRenewalAt ? fmtDate(number.nextRenewalAt) : '—'} icon={CalendarClock} />
          <Box label="Leads / stores" value={`${number.leads || 0} / ${number.converted || 0}`} />
        </div>
        {!!number.renewals?.length && (
          <ul className="mt-3 divide-y divide-slate-100 border border-slate-200/80 rounded-2xl">
            {number.renewals.slice(0, 6).map((r, i) => (
              <li key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                <span className="text-slate-600">Paid {fmtDate(r.at)}</span>
                <span className="font-bold text-slate-900 tabular-nums">{fmtMoney(r.amount, r.currency)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-slate-400 mt-2">Tracking only. These amounts are not taken from any wallet.</p>
        {number.notes && <p className="text-[13px] text-slate-600 bg-slate-50 rounded-2xl p-3 mt-3 whitespace-pre-wrap">{number.notes}</p>}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-slate-700">History</p>
          <button type="button" onClick={() => openPanel('note', { text: '' })} className="text-xs font-semibold text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
            <MessageSquareText className="w-3.5 h-3.5" /> Add note
          </button>
        </div>
        {panel === 'note' && (
          <div className="flex gap-2 mb-4">
            <input value={form.text || ''} onChange={set('text')} placeholder="Write a note" className={inputClass} autoFocus />
            <Button size="sm" loading={busy === 'note'} disabled={!form.text?.trim()} onClick={() => act('note', { action: 'note', text: form.text })}>
              Save
            </Button>
          </div>
        )}
        <Timeline items={number.history} colorOf={historyColor} />
      </section>
    </Drawer>
  );
}

function Box({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-3 min-w-0">
      <p className="text-[11px] text-slate-500 font-semibold">{label}</p>
      <p className="text-sm font-extrabold text-slate-900 mt-0.5 truncate tabular-nums">{value}</p>
    </div>
  );
}
