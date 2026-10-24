'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Field, Button, Banner, inputClass, api } from '@/components/ui/kit';
import { SOURCES } from './meta';

const empty = { phone: '', name: '', age: '', occupation: '', location: '', country: '', source: '', sourceDetail: '', memberId: '', waNumberId: '', status: 'new', notes: '', handover: false };

/**
 * Add one lead. A member's lead is his own; an admin can give it to a member or keep it in the
 * pool. The number is checked when the field is left, so a taken seller shows up before saving.
 */
export default function AddLeadModal({ open, onClose, onSaved, isAdmin, members = [], numbers = [], initialPhone = '', onOpenLead }) {
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dup, setDup] = useState(null);
  const [pre, setPre] = useState(null); // result of the check while typing

  useEffect(() => {
    if (open) {
      setForm({ ...empty, phone: initialPhone || '', source: isAdmin ? '' : 'self' });
      setError('');
      setDup(null);
      setPre(null);
    }
  }, [open, initialPhone, isAdmin]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const precheck = async () => {
    const digits = form.phone.replace(/\D+/g, '');
    if (digits.length < 7) return setPre(null);
    try {
      const r = await api(`/api/leads/check?phone=${encodeURIComponent(form.phone)}`);
      setPre(r.result === 'free' ? null : r);
    } catch {
      setPre(null);
    }
  };

  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    setDup(null);
    try {
      const body = { ...form, memberId: form.memberId || null, waNumberId: form.waNumberId || null };
      if (form.handover) body.phone = '';
      const r = await api('/api/leads', { method: 'POST', body });
      onSaved?.(r);
      onClose();
    } catch (err) {
      if (err.data?.duplicate) setDup(err.data.duplicate);
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const blocked = form.handover ? null : dup || pre;
  // only the numbers the chosen member really holds (a member: his own numbers)
  const memberNumbers = isAdmin ? (form.memberId ? numbers.filter((n) => (n.holders || []).includes(form.memberId)) : []) : numbers;
  const chosenName = members.find((m) => m._id === form.memberId)?.name;
  const numberHint = isAdmin
    ? !form.memberId
      ? 'Choose the member first: only his numbers are shown.'
      : !memberNumbers.length
      ? `No company number is linked to ${chosenName || 'this member'} yet (WhatsApp Numbers page).`
      : `Numbers linked to ${chosenName}.`
    : !numbers.length
    ? 'No company number is linked to you yet.'
    : undefined;

  const canSave = form.handover ? !!form.memberId && !!(form.name.trim() || form.notes.trim() || form.sourceDetail.trim()) : !!form.phone.trim();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isAdmin ? 'Add a lead' : 'Add a lead you found'}
      subtitle={isAdmin ? 'Give it to a member (or yourself) now, or keep it in the pool and give it later. Only the number is required.' : 'It is reserved for you as soon as you save it. Nobody else can take it.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy} disabled={!canSave || !!blocked}>
            {form.handover ? 'Save handover' : 'Save lead'}
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-4">
        {isAdmin && (
          <label
            className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-colors ${
              form.handover ? 'border-violet-300 bg-violet-50' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <input
              type="checkbox"
              checked={form.handover}
              onChange={(e) => {
                setForm((f) => ({ ...f, handover: e.target.checked }));
                setPre(null);
                setDup(null);
              }}
              className="w-4 h-4 mt-0.5 accent-violet-700"
            />
            <span className="text-sm">
              <span className="font-semibold text-slate-900 block">I gave the seller a member’s number</span>
              <span className="text-[12px] text-slate-500">
                You don’t have his number yet. He will message the member, and the member adds his number and details here.
              </span>
            </span>
          </label>
        )}

        {!form.handover && (
          <Field label="WhatsApp / phone number *" hint="With country code. Spaces, + and dashes are fine.">
            <input
              autoFocus
              value={form.phone}
              onChange={(e) => {
                set('phone')(e);
                setPre(null);
                setDup(null);
              }}
              onBlur={precheck}
              inputMode="tel"
              placeholder="WhatsApp number with country code"
              className={inputClass}
            />
          </Field>
        )}

        {blocked && (
          <Banner tone={blocked.mine ? 'info' : 'danger'} title={blocked.mine ? 'Already your lead' : isAdmin ? 'Already taken' : 'Taken — do not contact'}>
            {blocked.message}
            {isAdmin && blocked.leadId && (
              <button type="button" onClick={() => onOpenLead?.(blocked.leadId)} className="block mt-1.5 font-bold underline">
                Open that lead
              </button>
            )}
          </Banner>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={form.handover ? 'Seller name *' : 'Seller name'}>
            <input value={form.name} onChange={set('name')} placeholder="Full name" className={inputClass} />
          </Field>
          <Field label="Age">
            <input value={form.age} onChange={set('age')} inputMode="numeric" placeholder="Optional" className={inputClass} />
          </Field>
          <Field label="Profession">
            <input value={form.occupation} onChange={set('occupation')} placeholder="e.g. Boutique owner" className={inputClass} />
          </Field>
          <Field label="Location">
            <input value={form.location} onChange={set('location')} placeholder="City, area" className={inputClass} />
          </Field>
          <Field label="Country">
            <input value={form.country} onChange={set('country')} placeholder="IN, PK, UK…" className={inputClass} />
          </Field>
          <Field label="Where was this seller found?">
            <select value={form.source} onChange={set('source')} className={inputClass}>
              <option value="">Choose…</option>
              {Object.entries(SOURCES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Group / page name">
            <input value={form.sourceDetail} onChange={set('sourceDetail')} placeholder="Optional" className={inputClass} />
          </Field>
          {isAdmin ? (
            <Field
              label={form.handover ? 'Whose number did you give? *' : 'Give to'}
              hint={form.handover ? 'This member will be asked to add the seller’s number.' : 'Leave empty to keep it in the pool. You can also choose yourself.'}
            >
              <select
                value={form.memberId}
                onChange={(e) => {
                  const memberId = e.target.value;
                  setForm((f) => ({
                    ...f,
                    memberId,
                    // a number of the previous member is cleared
                    waNumberId: numbers.some((n) => n._id === f.waNumberId && (n.holders || []).includes(memberId)) ? f.waNumberId : '',
                  }));
                }}
                className={inputClass}
              >
                <option value="">{form.handover ? 'Choose the member…' : 'Not given yet (pool)'}</option>
                {members.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name}
                    {m.role === 'admin' ? ' (partner)' : ''}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Where does it stand?">
              <select value={form.status} onChange={set('status')} className={inputClass}>
                <option value="new">Not contacted yet</option>
                <option value="contacted">Already contacted</option>
                <option value="interested">Interested</option>
              </select>
            </Field>
          )}
          <Field label="Company WhatsApp number used" hint={numberHint}>
            <select value={form.waNumberId} onChange={set('waNumberId')} className={inputClass} disabled={!memberNumbers.length}>
              <option value="">—</option>
              {memberNumbers.map((n) => (
                <option key={n._id} value={n._id}>
                  {n.label ? `${n.label} · ` : ''}
                  {n.number}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Notes">
          <textarea
            value={form.notes}
            onChange={set('notes')}
            rows={2}
            placeholder={form.handover ? 'e.g. Found in a WhatsApp group, will message today' : 'Anything useful about this seller'}
            className={`${inputClass} resize-none`}
          />
        </Field>
        {error && <Banner tone="danger">{error}</Banner>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
