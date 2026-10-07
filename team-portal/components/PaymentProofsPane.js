'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveRefresh } from './LiveProvider';
import { readCache, writeCache } from '@/lib/clientCache';
import { ChevronLeft, ReceiptText, Search, Store, User, CalendarClock, ImagePlus, CheckCircle2, AlertTriangle, Loader2, X, Pencil, Lock } from 'lucide-react';

/**
 * "Payment Proofs" group (partners only) — the right side of the chat screen when that group is
 * open.
 *
 * Every real seller deposit gets a card here by itself, as a draft: seller, member and date / time
 * are already filled in. A partner completes it with the two things only he has: the real USDT
 * received (typed, plus its Binance screenshot) and the screenshot of the INR payment. All three
 * are required; a draft cannot be saved
 * without them.
 */

const fmt = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const whenText = (d) => {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return `${x.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}, ${x.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

// A phone screenshot is made smaller before sending, but kept sharp enough to read every number
function shrinkPicture(file, maxSide = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the picture'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('This file is not a picture'));
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <Icon className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
      <span className="text-slate-500 w-[74px] shrink-0">{label}</span>
      <span className="font-semibold text-slate-900 min-w-0 break-words">{children}</span>
    </div>
  );
}

// One required screenshot: a dashed box until a picture is chosen, then its preview
function ShotPicker({ label, value, has, onChange, onBusy, onError }) {
  const [reading, setReading] = useState(false);
  const fileRef = useRef(null);
  const pick = async (file) => {
    if (!file) return;
    onError('');
    setReading(true);
    onBusy(1);
    try {
      onChange(await shrinkPicture(file));
    } catch (e) {
      onError(e.message);
    } finally {
      setReading(false);
      onBusy(-1);
    }
  };
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold text-slate-700">{label} *</p>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      {value ? (
        <div className="mt-1 flex items-start gap-2">
          <img src={value} alt={`New ${label}`} className="w-20 h-20 object-cover rounded-xl border border-slate-200" />
          <button type="button" onClick={() => fileRef.current?.click()} className="px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold">
            Choose another
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={reading}
          className={`mt-1 w-full py-4 px-2 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 text-[11px] font-bold text-center transition-colors ${
            has ? 'border-slate-300 text-slate-600 hover:bg-slate-50' : 'border-amber-400 text-amber-800 bg-amber-50/60 hover:bg-amber-50'
          }`}
        >
          {reading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
          <span>{reading ? 'Reading the picture…' : has ? 'Replace (optional)' : 'Add screenshot'}</span>
        </button>
      )}
    </div>
  );
}

function ProofForm({ proof, onSaved, onCancel }) {
  const counted = proof.ledger?.counted;
  const editing = proof.status === 'complete';
  const [usdt, setUsdt] = useState(counted ? String(proof.ledger.usdt) : proof.usdt ? String(proof.usdt) : '');
  const [inr, setInr] = useState(counted ? (proof.ledger.inr ? String(proof.ledger.inr) : '') : proof.inr ? String(proof.inr) : '');
  const [note, setNote] = useState(proof.note || '');
  const [shot, setShot] = useState(''); // new INR payment screenshot (already made small)
  const [usdtShot, setUsdtShot] = useState(''); // new Binance screenshot of the USDT received
  const [busy, setBusy] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const reading = busy > 0;
  const bump = (n) => setBusy((v) => Math.max(0, v + n));

  const usdtOk = counted || Number(usdt) > 0;
  const shotOk = !!shot || (editing && proof.hasScreenshot);
  const usdtShotOk = !!usdtShot || (editing && proof.hasUsdtScreenshot);
  const canSave = usdtOk && shotOk && usdtShotOk && !saving && !reading;
  const rate = Number(inr) > 0 && Number(usdt) > 0 ? (Number(inr) / Number(usdt)).toFixed(2) : null;

  const save = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      const token = localStorage.getItem('portal_token');
      const res = await fetch(`/api/proofs/${proof._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ usdtAmount: usdt, inrAmount: inr, screenshot: shot || undefined, usdtScreenshot: usdtShot || undefined, note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Could not save the proof');
      onSaved(json.proof);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="mt-3 pt-3 border-t border-slate-200 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-[11px] font-bold text-slate-700">
          Real USDT received *
          <div className="relative mt-1">
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              required
              disabled={counted}
              value={usdt}
              onChange={(e) => setUsdt(e.target.value)}
              placeholder="e.g. 46.45"
              className={`block w-full p-2.5 rounded-xl border text-sm font-bold ${
                counted ? 'bg-slate-100 border-slate-200 text-slate-600 pr-8' : 'bg-white border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500'
              }`}
            />
            {counted && <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />}
          </div>
        </label>
        <label className="text-[11px] font-bold text-slate-700">
          INR paid by the seller
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            disabled={counted}
            value={inr}
            onChange={(e) => setInr(e.target.value)}
            placeholder="e.g. 4200"
            className={`block w-full mt-1 p-2.5 rounded-xl border text-sm font-bold ${
              counted ? 'bg-slate-100 border-slate-200 text-slate-600' : 'bg-white border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500'
            }`}
          />
        </label>
      </div>
      {counted ? (
        <p className="text-[11px] text-slate-500 -mt-1">
          This amount is already in the finance ledger, so the proof uses the same number. To change it, use the Finance screen (the other partner approves).
        </p>
      ) : (
        rate && <p className="text-[11px] text-slate-500 -mt-1">Rate: ₹{rate} per 1 USDT. Saving also enters this USDT in the finance ledger.</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <ShotPicker label="Binance USDT screenshot" value={usdtShot} has={editing && proof.hasUsdtScreenshot} onChange={setUsdtShot} onBusy={bump} onError={setError} />
        <ShotPicker label="INR payment screenshot" value={shot} has={editing && proof.hasScreenshot} onChange={setShot} onBusy={bump} onError={setError} />
      </div>

      <label className="block text-[11px] font-bold text-slate-700">
        Note (optional)
        <input
          type="text"
          maxLength={300}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. paid in two parts, UTR number…"
          className="block w-full mt-1 p-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </label>

      {error && <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>}

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={saving} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold">
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!canSave}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Save proof'}
        </button>
      </div>
      {!canSave && !saving && !reading && (
        <p className="text-[11px] text-amber-700 text-right -mt-1">{!usdtOk ? 'Enter the real USDT received' : !usdtShotOk ? 'Add the Binance USDT screenshot' : 'Add the INR payment screenshot'} to save.</p>
      )}
    </form>
  );
}

// `readOnly`: the card as the seller's own member sees it (nothing to edit, no ledger remarks)
export function ProofCard({ proof, onSaved, onView, readOnly = false }) {
  const [editing, setEditing] = useState(false);
  const draft = proof.status === 'draft';
  const ledger = proof.ledger || {};
  const real = Math.max(0, Number(proof.walletAmount || 0) - Number(proof.helping || 0));
  // the ledger amount was changed (with approval) after this proof was added
  const differs = !draft && ledger.counted && Math.abs(Number(ledger.usdt) - Number(proof.usdt)) > 0.000001;

  return (
    <article className={`w-full max-w-2xl mx-auto bg-white rounded-2xl border p-4 shadow-sm ${draft ? 'border-amber-300' : 'border-slate-200'}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        {draft ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 text-[11px] font-bold">
            <AlertTriangle className="w-3.5 h-3.5" />
            Draft · proof needed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Proof complete
          </span>
        )}
        {readOnly && proof.isNew && <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold">New</span>}
        {!readOnly && !draft && !editing && (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100">
            <Pencil className="w-3 h-3" />
            Edit
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        <Row icon={Store} label="Seller">{proof.storeName}</Row>
        {!readOnly && <Row icon={User} label="Member">
          {proof.ownerName ? (
            <>
              {proof.ownerName}
              <span className="font-normal text-slate-500"> ({proof.ownerRole === 'partner' ? 'partner' : 'member'})</span>
            </>
          ) : (
            <span className="text-amber-700">Seller not assigned yet</span>
          )}
        </Row>}
        <Row icon={CalendarClock} label="Date & time">{whenText(proof.depositAt)}</Row>
        <Row icon={ReceiptText} label="Deposit">
          ${fmt(real)} added to the store wallet
          {Number(proof.helping) > 0 && <span className="font-normal text-slate-500"> (+ ${fmt(proof.helping)} helping, not part of this)</span>}
        </Row>
      </div>

      {!draft && !editing && (
        <div className="mt-3 pt-3 border-t border-slate-200">
          <div className="min-w-0">
            <p className="text-[11px] text-slate-500">Real USDT received</p>
            <p className="text-xl font-extrabold text-slate-900 leading-tight">₮{fmt(proof.usdt)}</p>
            {Number(proof.inr) > 0 && (
              <p className="text-[11px] text-slate-600 mt-0.5">
                for ₹{fmt(proof.inr, 0)} · ₹{(Number(proof.inr) / Number(proof.usdt || 1)).toFixed(2)} per USDT
              </p>
            )}
            {proof.note && <p className="text-[11px] text-slate-600 mt-1 break-words">Note: {proof.note}</p>}
            <p className="text-[10px] text-slate-400 mt-1">
              Added by {proof.completedBy || 'a partner'} · {whenText(proof.completedAt)}
              {!readOnly && proof.changes > 0 && ` · changed ${proof.changes} time${proof.changes === 1 ? '' : 's'}`}
            </p>
            {!readOnly && differs && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mt-1.5">
                The finance ledger now says ₮{fmt(ledger.usdt)} for this deposit.
              </p>
            )}
          </div>
          <div className="mt-3 flex items-start gap-3">
            {[
              { label: 'Binance USDT', src: proof.usdtScreenshot },
              { label: 'INR payment', src: proof.screenshot },
            ].map((x) => (
              <div key={x.label} className="w-28">
                {x.src ? (
                  <button onClick={() => onView(x.src)} className="block" title={`Open the ${x.label} screenshot`}>
                    <img src={x.src} alt={`${x.label} screenshot of ${proof.storeName}`} loading="lazy" className="w-28 h-28 object-cover rounded-xl border border-slate-200 hover:opacity-90" />
                  </button>
                ) : (
                  <div className="w-28 h-28 rounded-xl border border-dashed border-amber-400 bg-amber-50/60 flex items-center justify-center text-[10px] font-bold text-amber-800 text-center px-1">Not added</div>
                )}
                <p className="text-[10px] font-bold text-slate-600 mt-1 text-center">{x.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!readOnly && (draft || editing) && (
        <ProofForm
          proof={proof}
          onCancel={editing ? () => setEditing(false) : null}
          onSaved={(p) => {
            setEditing(false);
            onSaved(p);
          }}
        />
      )}
    </article>
  );
}

// A member (or a partner, for his own sellers) says: "payment was made, the proof is missing"
function RequestCard({ request, onAnswered }) {
  const [mode, setMode] = useState(''); // '' | 'done' | 'declined'
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const answer = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const token = localStorage.getItem('portal_token');
      const res = await fetch(`/api/proofs/requests/${request._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: mode, reply }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Could not answer the request');
      onAnswered(request._id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="py-2.5">
      <div className="flex items-start justify-between gap-3 text-xs">
        <div className="min-w-0">
          <p className="text-slate-900">
            <b>{request.requesterName}</b> <span className="text-slate-500">({request.requesterRole})</span> says <b className="break-words">{request.storeName}</b> paid
            {request.amount ? <> <b>{request.amount}</b></> : ''}
            {request.paidOn ? ` on ${new Date(request.paidOn).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}, but the proof is missing.
          </p>
          {request.note && <p className="text-[11px] text-slate-600 mt-0.5 break-words">“{request.note}”</p>}
          <p className="text-[10px] text-slate-400 mt-0.5">Asked {whenText(request.createdAt)}</p>
        </div>
        {!mode && (
          <div className="flex flex-col gap-1 shrink-0">
            <button onClick={() => setMode('done')} className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold">
              Mark done
            </button>
            <button onClick={() => setMode('declined')} className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[11px] font-bold">
              Not received
            </button>
          </div>
        )}
      </div>
      {mode && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="text"
            maxLength={300}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={mode === 'declined' ? 'Reason (required), e.g. no payment received yet' : 'Reply (optional)'}
            className="flex-1 min-w-[160px] p-2 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button onClick={answer} disabled={busy || (mode === 'declined' && !reply.trim())} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-[11px] font-bold disabled:opacity-50">
            {busy ? 'Sending…' : mode === 'done' ? 'Send: done' : 'Send: not received'}
          </button>
          <button onClick={() => setMode('')} disabled={busy} className="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold">
            Cancel
          </button>
        </div>
      )}
      {error && <p className="text-[11px] text-red-700 mt-1">{error}</p>}
    </li>
  );
}

export default function PaymentProofsPane({ visible, onBack, onCounts }) {
  const cacheKey = 'payment_proofs';
  const [data, setData] = useState(() => readCache(cacheKey));
  const [loading, setLoading] = useState(() => !readCache(cacheKey));
  const [error, setError] = useState('');
  const [tab, setTab] = useState('draft'); // 'draft' | 'complete' | 'all'
  const [q, setQ] = useState('');
  const [viewer, setViewer] = useState('');
  const requestNo = useRef(0);
  const onCountsRef = useRef(onCounts);
  onCountsRef.current = onCounts;

  const load = useCallback(async (silent = false) => {
    const mine = ++requestNo.current;
    try {
      if (!silent) setError('');
      const token = localStorage.getItem('portal_token');
      const res = await fetch('/api/proofs?status=all&limit=100', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Could not load payment proofs');
      if (mine !== requestNo.current) return;
      setData(json);
      writeCache(cacheKey, json, false);
      onCountsRef.current?.({ ...json.counts, requests: (json.requests || []).length });
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

  // A new deposit (or a proof added by the other partner) shows up by itself
  useLiveRefresh(() => {
    if (visible) load(true);
  });

  const applySaved = (proof) => {
    setData((prev) => {
      if (!prev) return prev;
      const was = prev.items.find((x) => x._id === proof._id);
      const items = prev.items.map((x) => (x._id === proof._id ? proof : x));
      const counts = { ...prev.counts };
      if (was && was.status === 'draft' && proof.status === 'complete') {
        counts.draft = Math.max(0, (counts.draft || 0) - 1);
        counts.complete = (counts.complete || 0) + 1;
      }
      onCountsRef.current?.({ ...counts, requests: (prev.requests || []).length });
      return { ...prev, items, counts };
    });
    load(true);
  };

  const requests = data?.requests || [];
  const dropRequest = (id) => {
    setData((prev) => {
      if (!prev) return prev;
      const left = (prev.requests || []).filter((r) => r._id !== id);
      onCountsRef.current?.({ ...prev.counts, requests: left.length });
      return { ...prev, requests: left };
    });
  };
  const counts = data?.counts || { draft: 0, complete: 0 };
  const needle = q.trim().toLowerCase();
  const items = (data?.items || []).filter((p) => {
    if (tab !== 'all' && p.status !== tab) return false;
    if (needle && !`${p.storeName} ${p.ownerName} ${p.note || ''}`.toLowerCase().includes(needle)) return false;
    return true;
  });

  return (
    <div className="flex-1 flex flex-col bg-slate-50/60 min-w-0 relative">
      {/* Top bar */}
      <div className="bg-slate-900 text-white px-4 py-3 sm:px-6 flex items-center gap-3 shrink-0 z-20">
        <button onClick={onBack} className="md:hidden p-1.5 -ml-1 text-slate-300 hover:text-white rounded-xl hover:bg-slate-800 transition" title="Back to all chats">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center shrink-0">
          <ReceiptText className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold truncate">Payment Proofs</h2>
          <p className="text-[11px] text-slate-400 truncate">
            {counts.draft > 0 ? `${counts.draft} deposit${counts.draft === 1 ? '' : 's'} waiting for proof` : 'Every deposit has its proof'} · partners only
          </p>
        </div>
      </div>

      {/* Filters: one row, scopes the list below */}
      <div className="px-3 sm:px-5 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center gap-2 shrink-0">
        <div className="inline-flex p-1 rounded-xl bg-slate-100" role="tablist" aria-label="Which proofs">
          {[
            { id: 'draft', label: `Pending${counts.draft ? ` (${counts.draft})` : ''}` },
            { id: 'complete', label: `Complete${counts.complete ? ` (${counts.complete})` : ''}` },
            { id: 'all', label: 'All' },
          ].map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[140px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search seller or member"
            className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between gap-2">
            <span>{error}</span>
            <button onClick={() => load()} className="px-2.5 py-1 rounded-lg bg-white border border-red-200 font-bold">
              Try again
            </button>
          </div>
        )}
        {loading && !data && (
          <div className="py-16 flex flex-col items-center text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            <p className="text-xs mt-2">Loading payment proofs…</p>
          </div>
        )}
        {requests.length > 0 && (
          <section className="w-full max-w-2xl mx-auto bg-blue-50/70 border border-blue-200 rounded-2xl p-4" aria-label="Requests">
            <h3 className="text-xs font-bold text-blue-900">
              {requests.length} request{requests.length === 1 ? '' : 's'}: payment made, proof missing
            </h3>
            <p className="text-[11px] text-blue-900/70">Completing a proof of that seller answers its request by itself.</p>
            <ul className="mt-1 divide-y divide-blue-200/70">
              {requests.map((r) => (
                <RequestCard key={r._id} request={r} onAnswered={dropRequest} />
              ))}
            </ul>
          </section>
        )}
        {data && items.length === 0 && (
          <div className="py-14 text-center">
            <ReceiptText className="w-9 h-9 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-800 mt-2">
              {needle ? 'Nothing matches this search' : tab === 'draft' ? 'No deposit is waiting for a proof' : tab === 'complete' ? 'No completed proofs yet' : 'No deposits yet'}
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              {tab === 'draft' && !needle
                ? 'When a real deposit is added for a seller, a draft appears here by itself. Add the real USDT, its Binance screenshot and the INR screenshot to complete it.'
                : 'A card is made for every real seller deposit.'}
            </p>
          </div>
        )}
        {items.map((p) => (
          <ProofCard key={p._id} proof={p} onSaved={applySaved} onView={setViewer} />
        ))}
        {data?.hasMore && <p className="text-center text-[11px] text-slate-400 py-2">Showing the latest 100. Use the search to find older ones.</p>}
      </div>

      {/* Screenshot viewer */}
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
