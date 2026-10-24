'use client';

import React, { useState } from 'react';
import { Search, ShieldCheck, ShieldAlert, UserCheck, Store, Plus } from 'lucide-react';
import { api, fmtDate, Button } from '@/components/ui/kit';

/**
 * "Check before you message": paste a seller's number and see at once whether somebody already
 * has it. This is what stops two members from talking to the same seller.
 */
export default function CheckNumber({ onAdd, onOpenLead, isAdmin }) {
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const check = async (e) => {
    e?.preventDefault();
    if (!phone.trim()) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const r = await api(`/api/leads/check?phone=${encodeURIComponent(phone)}`);
      setResult({ ...r, phone });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const tone = !result
    ? null
    : result.result === 'free'
    ? { box: 'bg-emerald-50 border-emerald-200', ink: 'text-emerald-900', icon: ShieldCheck, iconInk: 'text-emerald-600', title: 'Free — nobody has this seller' }
    : result.result === 'mine'
    ? { box: 'bg-blue-50 border-blue-200', ink: 'text-blue-900', icon: UserCheck, iconInk: 'text-blue-600', title: 'This is already your lead' }
    : result.result === 'store'
    ? { box: 'bg-red-50 border-red-200', ink: 'text-red-900', icon: Store, iconInk: 'text-red-600', title: 'Already a registered store' }
    : { box: 'bg-red-50 border-red-200', ink: 'text-red-900', icon: ShieldAlert, iconInk: 'text-red-600', title: isAdmin ? 'Already taken' : 'Taken — do not contact' };

  return (
    <section className="bg-slate-900 rounded-3xl p-4 sm:p-6 text-white">
      <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-8">
        <div className="lg:w-72 shrink-0">
          <h2 className="text-base sm:text-lg font-bold">Check a number before you message</h2>
          <p className="text-[13px] text-slate-400 mt-1">One seller, one member. If someone already has this seller, you will see it here.</p>
        </div>
        <form onSubmit={check} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (result) setResult(null);
              }}
              inputMode="tel"
              placeholder="Paste a WhatsApp number with country code"
              aria-label="Phone number to check"
              className="w-full pl-10 pr-3 py-3 rounded-2xl bg-white/10 border border-white/10 text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !phone.trim()}
            className="px-5 py-3 rounded-2xl bg-white text-slate-900 text-sm font-bold hover:bg-slate-100 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {busy ? 'Checking…' : 'Check'}
          </button>
        </form>
      </div>

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

      {result && tone && (
        <div className={`mt-4 rounded-2xl border p-4 ${tone.box} ${tone.ink} flex flex-col sm:flex-row sm:items-center gap-3`}>
          <tone.icon className={`w-6 h-6 shrink-0 ${tone.iconInk}`} />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">{tone.title}</p>
            <p className="text-[13px] opacity-90 mt-0.5">{result.message}</p>
            {result.result === 'taken' && !isAdmin && result.since && (
              <p className="text-[11px] opacity-70 mt-1">With another member since {fmtDate(result.since)}.</p>
            )}
          </div>
          {result.result === 'free' && (
            <Button variant="primary" icon={Plus} onClick={() => onAdd(result.phone)}>
              {isAdmin ? 'Add this lead' : 'Add as my lead'}
            </Button>
          )}
          {(result.result === 'mine' || (isAdmin && result.leadId)) && (
            <Button variant="secondary" onClick={() => onOpenLead(result.leadId)}>
              Open lead
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
