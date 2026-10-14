'use client';

import React, { useEffect, useState } from 'react';
import { MessageCircle, Store, Trash2, AlertTriangle, Check } from 'lucide-react';
import { Drawer, Pill, Button, Field, Timeline, Banner, inputClass, api, fmtDate, timeAgo } from '@/components/ui/kit';
import { STATUS, LOST_REASONS, sourceName, statusLabel, waLink } from './meta';

const STEPS = ['new', 'contacted', 'interested', 'converted'];

const historyColor = (h) =>
  ({
    converted: STATUS.converted.color,
    duplicate: '#dc2626',
    assigned: '#7c3aed',
    unassigned: '#7c3aed',
    owner: STATUS.converted.color,
    status: '#2a78d6',
  }[h.type] || '#94a3b8');

/** One lead: where it stands, who has it, and everything that happened to it. */
export default function LeadDrawer({ leadId, onClose, onChanged, isAdmin, members = [], numbers = [], toast }) {
  const [lead, setLead] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState('no_response');

  useEffect(() => {
    if (!leadId) return;
    setLead(null);
    setError('');
    setNote('');
    setLostOpen(false);
    api(`/api/leads/${leadId}`)
      .then((r) => setLead(r.lead))
      .catch((e) => setError(e.message));
  }, [leadId]);

  const act = async (key, body, okText) => {
    setBusy(key);
    try {
      const r = await api(`/api/leads/${leadId}`, { method: 'PATCH', body });
      setLead(r.lead);
      onChanged?.(r.lead);
      toast?.(okText || r.message);
      return true;
    } catch (e) {
      toast?.(e.message, 'danger');
      return false;
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this lead? Only do this for a lead added by mistake.')) return;
    setBusy('delete');
    try {
      await api(`/api/leads/${leadId}`, { method: 'DELETE' });
      toast?.('Lead deleted.');
      onChanged?.(null, leadId);
      onClose();
    } catch (e) {
      toast?.(e.message, 'danger');
    } finally {
      setBusy('');
    }
  };

  const open = !!leadId;
  // only the numbers the lead's member really holds (a member's list is already only his own)
  const leadNumbers = !lead?.memberId ? [] : isAdmin ? numbers.filter((n) => (n.holders || []).includes(lead.memberId)) : numbers;
  const locked = lead?.status === 'converted' && (lead?.sellerId || !isAdmin);
  const stepIndex = lead ? STEPS.indexOf(lead.status) : -1;
  const wa = lead && waLink(lead.phone);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={lead ? lead.name || lead.phone || 'Unnamed seller' : 'Lead'}
      subtitle={lead ? [lead.name ? lead.phone : '', lead.occupation, lead.location].filter(Boolean).join(' · ') || sourceName(lead.source) : error || 'Loading…'}
      headerExtra={
        lead && (
          <div className="flex flex-wrap items-center gap-2">
            <Pill color={STATUS[lead.status]?.color}>{statusLabel(lead)}</Pill>
            {lead.stale && <Pill color="#dc2626">No update for 14+ days</Pill>}
            {lead.origin === 'member' && <Pill color="#7c3aed">Found by member</Pill>}
            {lead.handover && <Pill color="#7c3aed">Handover</Pill>}
            {lead.needsDetails && <Pill color="#eda100">Number needed</Pill>}
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
              >
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </a>
            )}
          </div>
        )
      }
      footer={
        lead &&
        isAdmin &&
        lead.status !== 'converted' && (
          <Button variant="danger" size="sm" icon={Trash2} onClick={remove} loading={busy === 'delete'}>
            Delete lead
          </Button>
        )
      }
    >
      {!lead && !error && (
        <div className="space-y-3">
          <div className="h-16 rounded-2xl bg-slate-100 animate-pulse" />
          <div className="h-32 rounded-2xl bg-slate-100 animate-pulse" />
        </div>
      )}
      {error && <Banner tone="danger">{error}</Banner>}

      {lead && (
        <>
          {lead.needsDetails && (
            <Banner tone="warning" title={isAdmin ? 'Waiting for the seller’s number' : 'Complete this seller’s profile'}>
              {isAdmin
                ? `This seller was given ${lead.memberName || 'the member'}’s number. ${lead.memberName || 'The member'} adds his number and details when he messages.`
                : 'An admin gave this seller your number. When he messages you, add his WhatsApp number and whatever you learn about him.'}
            </Banner>
          )}

          <SellerProfile
            key={lead._id + (lead.needsDetails ? '-open' : '')}
            lead={lead}
            isAdmin={isAdmin}
            busy={busy === 'profile'}
            onSave={(fields) => act('profile', { action: 'edit', ...fields })}
          />

          {/* progress */}
          <section>
            <p className="text-xs font-bold text-slate-700 mb-3">Progress</p>
            {lead.status === 'not_converted' ? (
              <Banner tone="warning" title="Not converted">
                {LOST_REASONS[lead.lostReason] || 'Other reason'} · {timeAgo(lead.statusAt)}
              </Banner>
            ) : (
              <ol className="grid grid-cols-4 gap-1.5">
                {STEPS.map((s, i) => {
                  const done = i <= stepIndex;
                  return (
                    <li key={s} className="min-w-0">
                      <div className="h-1.5 rounded-full" style={{ background: done ? STATUS[lead.status].color : '#e2e8f0' }} />
                      <p className={`text-[11px] mt-1.5 truncate ${done ? 'text-slate-900 font-semibold' : 'text-slate-400'}`}>
                        {s === 'new' ? 'Given' : STATUS[s].label}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}

            {lead.status === 'converted' ? (
              <div className="mt-4 flex items-start gap-3 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200">
                <Store className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-sm text-emerald-900 min-w-0">
                  <p className="font-bold truncate">{lead.storeName || 'Store registered'}</p>
                  <p className="text-[13px] opacity-90">
                    Registered {fmtDate(lead.convertedAt)}
                    {lead.ownerName ? ` · assigned to ${lead.ownerName}` : ' · waiting for approval'}
                  </p>
                </div>
              </div>
            ) : null}

            {isAdmin && lead.ownerMismatch && (
              <Banner tone="warning" className="mt-3" title="Store went to someone else">
                This lead was with {lead.memberName}, but the store was assigned to {lead.ownerName}. Check it on the Sellers page.
              </Banner>
            )}

            {!locked && (
              <div className="mt-4 flex flex-wrap gap-2">
                {lead.status !== 'contacted' && (
                  <Button size="sm" variant="secondary" loading={busy === 'contacted'} onClick={() => act('contacted', { action: 'status', status: 'contacted' })}>
                    Contacted
                  </Button>
                )}
                {lead.status !== 'interested' && (
                  <Button size="sm" variant="secondary" loading={busy === 'interested'} onClick={() => act('interested', { action: 'status', status: 'interested' })}>
                    Interested
                  </Button>
                )}
                {lead.status !== 'not_converted' && (
                  <Button size="sm" variant="secondary" onClick={() => setLostOpen((v) => !v)}>
                    Not converted…
                  </Button>
                )}
                {lead.status !== 'new' && (
                  <Button size="sm" variant="ghost" loading={busy === 'new'} onClick={() => act('new', { action: 'status', status: 'new' })}>
                    Back to not contacted
                  </Button>
                )}
                {isAdmin && lead.status !== 'converted' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Check}
                    loading={busy === 'converted'}
                    onClick={() => {
                      if (window.confirm('Mark as converted by hand? Use this only when the seller registered with a different phone number.')) {
                        act('converted', { action: 'status', status: 'converted' });
                      }
                    }}
                  >
                    Mark converted
                  </Button>
                )}
              </div>
            )}

            {lostOpen && !locked && (
              <div className="mt-3 p-3 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row gap-2">
                <select value={lostReason} onChange={(e) => setLostReason(e.target.value)} className={inputClass} aria-label="Why it did not convert">
                  {Object.entries(LOST_REASONS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  loading={busy === 'lost'}
                  onClick={async () => {
                    if (await act('lost', { action: 'status', status: 'not_converted', lostReason })) setLostOpen(false);
                  }}
                >
                  Save
                </Button>
              </div>
            )}
          </section>

          {/* who / how */}
          <section className="space-y-3">
            <p className="text-xs font-bold text-slate-700">Details</p>
            {isAdmin && (
              <Field label="With member">
                <select
                  value={lead.memberId || ''}
                  disabled={lead.status === 'converted' || busy === 'assign'}
                  onChange={(e) => act('assign', { action: 'assign', memberId: e.target.value || null })}
                  className={inputClass}
                >
                  <option value="">Not given yet (pool)</option>
                  {members.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name}
                      {m.role === 'admin' ? ' (partner)' : ''}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field
              label="Company WhatsApp number used"
              hint={
                !lead.memberId
                  ? 'Give the lead to a member first.'
                  : !leadNumbers.length
                  ? isAdmin
                    ? `No company number is linked to ${lead.memberName || 'this member'} (WhatsApp Numbers page).`
                    : 'No company number is linked to you yet.'
                  : undefined
              }
            >
              <select
                value={lead.waNumberId || ''}
                disabled={busy === 'number' || (!leadNumbers.length && !lead.waNumberId)}
                onChange={(e) => act('number', { action: 'number', waNumberId: e.target.value || null })}
                className={inputClass}
              >
                <option value="">—</option>
                {lead.waNumberId && !leadNumbers.some((n) => n._id === lead.waNumberId) && (
                  <option value={lead.waNumberId}>{numbers.find((n) => n._id === lead.waNumberId)?.number || 'Current number'} (no longer linked)</option>
                )}
                {leadNumbers.map((n) => (
                  <option key={n._id} value={n._id}>
                    {n.label ? `${n.label} · ` : ''}
                    {n.number}
                  </option>
                ))}
              </select>
            </Field>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm pt-1">
              <Info label="Source" value={`${sourceName(lead.source)}${lead.sourceDetail ? ` · ${lead.sourceDetail}` : ''}`} />
              <Info label={lead.memberId ? 'Given on' : 'Added on'} value={fmtDate(lead.assignedAt || lead.createdAt)} />
              <Info label="Last update" value={timeAgo(lead.lastActivityAt)} />
              {isAdmin && <Info label="Added by" value={lead.addedByName || '—'} />}
              {isAdmin && !!lead.duplicateAttempts && (
                <Info
                  label="Others tried to add it"
                  value={
                    <span className="inline-flex items-center gap-1 text-red-600 font-bold">
                      <AlertTriangle className="w-3.5 h-3.5" /> {lead.duplicateAttempts}×
                    </span>
                  }
                />
              )}
            </dl>
          </section>

          {/* notes */}
          <section>
            <p className="text-xs font-bold text-slate-700 mb-2">Add a note</p>
            {lead.notes && <p className="text-[13px] text-slate-600 bg-slate-50 rounded-2xl p-3 mb-2 whitespace-pre-wrap">{lead.notes}</p>}
            <div className="flex gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did the seller say?" className={inputClass} />
              <Button
                size="sm"
                loading={busy === 'note'}
                disabled={!note.trim()}
                onClick={async () => {
                  if (await act('note', { action: 'note', text: note })) setNote('');
                }}
              >
                Save
              </Button>
            </div>
          </section>

          <section>
            <p className="text-xs font-bold text-slate-700 mb-3">History</p>
            <Timeline items={lead.history} colorOf={historyColor} />
          </section>
        </>
      )}
    </Drawer>
  );
}

function Info({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className="text-slate-900 font-semibold truncate">{value}</dd>
    </div>
  );
}

/** Who the seller is: name, number, age, profession, location. All optional except the number. */
function SellerProfile({ lead, isAdmin, busy, onSave }) {
  const [editing, setEditing] = useState(lead.needsDetails);
  const [f, setF] = useState(() => ({
    name: lead.name || '',
    phone: lead.phone || '',
    age: lead.age || '',
    occupation: lead.occupation || '',
    location: lead.location || '',
    country: lead.country || '',
  }));
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const phoneLocked = !!lead.phone && !isAdmin; // a member adds the number once; admins correct it
  const filled = lead.profileFilled || 0;

  const save = async () => {
    const body = { name: f.name, age: f.age, occupation: f.occupation, location: f.location, country: f.country };
    if (!phoneLocked && f.phone !== (lead.phone || '')) body.phone = f.phone;
    if (await onSave(body)) setEditing(false);
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-slate-700">Seller profile</p>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500" title={`${filled} of 5 filled`}>
            <span className="flex gap-0.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className={`w-2.5 h-1.5 rounded-full ${i < filled ? 'bg-emerald-500' : 'bg-slate-200'}`} />
              ))}
            </span>
            {filled}/5
          </span>
          {!editing && lead.status !== 'converted' && (
            <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-slate-600 hover:text-slate-900">
              Edit
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-3 p-4 rounded-2xl border border-slate-200 bg-slate-50/60">
          <Field label="WhatsApp / phone number" hint={phoneLocked ? 'Already set. Ask an admin if it is wrong.' : 'With country code. It is checked so no other member has this seller.'}>
            <input value={f.phone} onChange={set('phone')} disabled={phoneLocked} inputMode="tel" placeholder="+91 98765 43210" className={inputClass} autoFocus={lead.needsDetails} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <input value={f.name} onChange={set('name')} className={inputClass} />
            </Field>
            <Field label="Age">
              <input value={f.age} onChange={set('age')} inputMode="numeric" className={inputClass} />
            </Field>
            <Field label="Profession">
              <input value={f.occupation} onChange={set('occupation')} placeholder="e.g. Boutique owner" className={inputClass} />
            </Field>
            <Field label="Location">
              <input value={f.location} onChange={set('location')} placeholder="City, area" className={inputClass} />
            </Field>
            <Field label="Country">
              <input value={f.country} onChange={set('country')} placeholder="IN, PK…" className={inputClass} />
            </Field>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" loading={busy} onClick={save}>
              Save profile
            </Button>
            {!lead.needsDetails && (
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Info label="Name" value={lead.name || <Missing />} />
          <Info label="Number" value={lead.phone ? <span className="tabular-nums">{lead.phone}</span> : <Missing />} />
          <Info label="Age" value={lead.age || <Missing />} />
          <Info label="Profession" value={lead.occupation || <Missing />} />
          <Info label="Location" value={lead.location || <Missing />} />
          <Info label="Country" value={lead.country || <Missing />} />
        </dl>
      )}
    </section>
  );
}

function Missing() {
  return <span className="text-slate-300 font-normal">Not added</span>;
}
