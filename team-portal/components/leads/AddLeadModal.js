'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Field, Button, Banner, inputClass, api } from '@/components/ui/kit';
import { SOURCES } from './meta';

const empty = { phone: '', name: '', country: '', source: '', sourceDetail: '', memberId: '', waNumberId: '', status: 'new', notes: '' };

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
      const r = await api('/api/leads', { method: 'POST', body: { ...form, memberId: form.memberId || null, waNumberId: form.waNumberId || null } });
      onSaved?.(r);
      onClose();
    } catch (err) {
      if (err.data?.duplicate) setDup(err.data.duplicate);
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const blocked = dup || pre;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isAdmin ? 'Add a lead' : 'Add a lead you found'}
      subtitle={isAdmin ? 'Give it to a member now, or keep it in the pool and give it later.' : 'It is reserved for you as soon as you save it. Nobody else can take it.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy} disabled={!form.phone.trim() || !!blocked}>
            Save lead
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="space-y-4">
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
            placeholder="+91 98765 43210"
            className={inputClass}
          />
        </Field>

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
          <Field label="Seller name">
            <input value={form.name} onChange={set('name')} placeholder="e.g. Rahul Sharma" className={inputClass} />
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
            <Field label="Give to" hint="Leave empty to keep it in the pool.">
              <select value={form.memberId} onChange={set('memberId')} className={inputClass}>
                <option value="">Not given yet (pool)</option>
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
          <Field label="Company WhatsApp number used" hint={!isAdmin && !numbers.length ? 'No company number is linked to you yet.' : undefined}>
            <select value={form.waNumberId} onChange={set('waNumberId')} className={inputClass} disabled={!numbers.length}>
              <option value="">—</option>
              {numbers.map((n) => (
                <option key={n._id} value={n._id}>
                  {n.label ? `${n.label} · ` : ''}
                  {n.number}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Notes">
          <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Anything useful about this seller" className={`${inputClass} resize-none`} />
        </Field>
        {error && <Banner tone="danger">{error}</Banner>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
