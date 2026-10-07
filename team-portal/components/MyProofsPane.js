'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveRefresh } from './LiveProvider';
import { readCache, writeCache } from '@/lib/clientCache';
import { ProofCard, whenText } from './PaymentProofsPane';
import { ChevronLeft, ReceiptText, Loader2, X, MessageSquarePlus, CheckCircle2, Clock, Info } from 'lucide-react';

/**
 * A person's OWN "Payment Proofs" group (members, and each partner for his own sellers).
 *
 * It shows the complete proofs of the sellers that belong to this person, and nothing else:
 * no drafts, no other person's sellers. Nothing here can be edited.
 * If a seller has paid and no proof has shown up, the person can tell the partners with
 * "Payment made, proof missing?".
 */

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function RequestForm({ sellers, openSellerIds, onSent, onCancel }) {
  const free = sellers.filter((s) => !openSellerIds.has(s._id));
  const [sellerId, setSellerId] = useState(free.length === 1 ? free[0]._id : '');
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async (e) => {
    e.preventDefault();
    if (!sellerId || busy) return;
    setBusy(true);
    setError('');
    try {
      const token = localStorage.getItem('portal_token');
      const res = await fetch('/api/proofs/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sellerId, amount, paidOn: paidOn || undefined, note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Could not send the request');
      onSent(json.request);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (sellers.length === 0) {
    return (
      <div className="w-full max-w-2xl mx-auto bg-white border border-slate-200 rounded-2xl p-4 text-xs text-slate-600">
        No seller is assigned to you yet, so there is nothing to ask about.
        <button onClick={onCancel} className="ml-2 font-bold text-slate-900 underline">
          Close
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="w-full max-w-2xl mx-auto bg-white border border-blue-300 rounded-2xl p-4 space-y-3 shadow-sm">
      <div>
        <h3 className="text-sm font-bold text-slate-900">Payment made, proof missing</h3>
        <p className="text-[11px] text-slate-500">This tells both partners. You will see their answer here.</p>
      </div>
      <label className="block text-[11px] font-bold text-slate-700">
        Seller *
        <select
          required
          value={sellerId}
          onChange={(e) => setSellerId(e.target.value)}
          className="block w-full mt-1 p-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">Choose the seller who paid</option>
          {sellers.map((s) => (
            <option key={s._id} value={s._id} disabled={openSellerIds.has(s._id)}>
              {s.storeName}
              {openSellerIds.has(s._id) ? ' (already asked)' : ''}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-[11px] font-bold text-slate-700">
          Amount paid (optional)
          <input
            type="text"
            maxLength={40}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. ₹5,000"
            className="block w-full mt-1 p-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </label>
        <label className="text-[11px] font-bold text-slate-700">
          Paid on (optional)
          <input
            type="date"
            max={today()}
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
            className="block w-full mt-1 p-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </label>
      </div>
      <label className="block text-[11px] font-bold text-slate-700">
        Note (optional)
        <input
          type="text"
          maxLength={300}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. paid by UPI in the morning"
          className="block w-full mt-1 p-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </label>
      {error && <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold">
          Cancel
        </button>
        <button type="submit" disabled={!sellerId || busy} className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed">
          {busy ? 'Sending…' : 'Tell the partners'}
        </button>
      </div>
    </form>
  );
}

function MyRequest({ request }) {
  const open = request.status === 'open';
  const done = request.status === 'done';
  return (
    <li className="py-2 flex items-start gap-2.5 text-xs">
      {open ? <Clock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" /> : done ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" /> : <Info className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <p className="text-slate-900">
          <b className="break-words">{request.storeName}</b>
          {request.amount ? ` · ${request.amount}` : ''}
          <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${open ? 'bg-amber-100 text-amber-900' : done ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
            {open ? 'Waiting for the partners' : done ? 'Done' : 'Not received'}
          </span>
        </p>
        {!open && (
          <p className="text-[11px] text-slate-600 mt-0.5 break-words">
            {request.reply ? `${request.closedBy || 'Partner'}: “${request.reply}”` : request.byProof ? 'The proof has been added.' : `Answered by ${request.closedBy || 'a partner'}.`}
          </p>
        )}
        <p className="text-[10px] text-slate-400 mt-0.5">Asked {whenText(request.createdAt)}</p>
      </div>
    </li>
  );
}

export default function MyProofsPane({ visible, onBack, onSeen, isPartner }) {
  const cacheKey = 'my_payment_proofs';
  const [data, setData] = useState(() => readCache(cacheKey));
  const [loading, setLoading] = useState(() => !readCache(cacheKey));
  const [error, setError] = useState('');
  const [asking, setAsking] = useState(false);
  const [viewer, setViewer] = useState('');
  const requestNo = useRef(0);
  const onSeenRef = useRef(onSeen);
  onSeenRef.current = onSeen;

  const load = useCallback(async (silent = false) => {
    const mine = ++requestNo.current;
    try {
      if (!silent) setError('');
      const token = localStorage.getItem('portal_token');
      const res = await fetch('/api/proofs/mine?limit=100', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Could not load payment proofs');
      if (mine !== requestNo.current) return;
      // a proof stays marked "New" for as long as this screen stays open
      setData((prev) => {
        const wasNew = new Set((prev?.items || []).filter((x) => x.isNew).map((x) => x._id));
        const next = { ...json, items: (json.items || []).map((x) => (wasNew.has(x._id) ? { ...x, isNew: true } : x)) };
        writeCache(cacheKey, { ...json, items: (json.items || []).map((x) => ({ ...x, isNew: false })) }, false);
        return next;
      });
      onSeenRef.current?.({ total: json.total || 0, open: (json.requests || []).filter((r) => r.status === 'open').length });
    } catch (e) {
      if (!silent && mine === requestNo.current) setError(e.message);
    } finally {
      if (mine === requestNo.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    load(Boolean(readCache(cacheKey)));
    const timer = setInterval(() => {
      if (!document.hidden) load(true);
    }, 30000);
    return () => clearInterval(timer);
  }, [visible, load]);

  // a proof added by the partners shows up by itself
  useLiveRefresh(() => {
    if (visible) load(true);
  });

  const items = data?.items || [];
  const requests = data?.requests || [];
  const sellers = data?.sellers || [];
  const openSellerIds = new Set(requests.filter((r) => r.status === 'open').map((r) => r.sellerId));

  return (
    <div className="flex-1 flex flex-col bg-slate-50/60 min-w-0 relative">
      {/* Top bar */}
      <div className="bg-slate-900 text-white px-4 py-3 sm:px-6 flex items-center gap-3 shrink-0 z-20">
        <button onClick={onBack} className="md:hidden p-1.5 -ml-1 text-slate-300 hover:text-white rounded-xl hover:bg-slate-800 transition" title="Back to all chats">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
          <ReceiptText className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold truncate">{isPartner ? 'My Payment Proofs' : 'Payment Proofs'}</h2>
          <p className="text-[11px] text-slate-400 truncate">Proofs of your own sellers · you and the partners</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between gap-2">
            <span>{error}</span>
            <button onClick={() => load()} className="px-2.5 py-1 rounded-lg bg-white border border-red-200 font-bold">
              Try again
            </button>
          </div>
        )}

        {/* Ask the partners */}
        {asking ? (
          <RequestForm
            sellers={sellers}
            openSellerIds={openSellerIds}
            onCancel={() => setAsking(false)}
            onSent={(r) => {
              setAsking(false);
              setData((prev) => (prev ? { ...prev, requests: [r, ...(prev.requests || [])] } : prev));
              load(true);
            }}
          />
        ) : (
          data && (
            <div className="w-full max-w-2xl mx-auto flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-3">
              <p className="text-xs text-slate-600 min-w-0">Your seller paid, but the proof is not here?</p>
              <button onClick={() => setAsking(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold">
                <MessageSquarePlus className="w-4 h-4" />
                Payment made, proof missing
              </button>
            </div>
          )
        )}

        {requests.length > 0 && (
          <section className="w-full max-w-2xl mx-auto bg-white border border-slate-200 rounded-2xl px-4 py-3" aria-label="My requests">
            <h3 className="text-xs font-bold text-slate-900">My requests</h3>
            <ul className="divide-y divide-slate-100">
              {requests.map((r) => (
                <MyRequest key={r._id} request={r} />
              ))}
            </ul>
          </section>
        )}

        {loading && !data && (
          <div className="py-16 flex flex-col items-center text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            <p className="text-xs mt-2">Loading payment proofs…</p>
          </div>
        )}
        {data && items.length === 0 && (
          <div className="py-12 text-center">
            <ReceiptText className="w-9 h-9 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-800 mt-2">No payment proofs yet</p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">When the partners add the proof of a deposit of one of your sellers, it appears here.</p>
          </div>
        )}
        {items.map((p) => (
          <ProofCard key={p._id} proof={p} readOnly onView={setViewer} />
        ))}
        {data?.hasMore && <p className="text-center text-[11px] text-slate-400 py-2">Showing the latest 100.</p>}
      </div>

      {viewer && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-3" onClick={() => setViewer('')}>
          <button className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20" onClick={() => setViewer('')} title="Close">
            <X className="w-5 h-5" />
          </button>
          <img src={viewer} alt="Payment proof screenshot" className="max-w-full max-h-full object-contain rounded-xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
