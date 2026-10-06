'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import {
  Landmark,
  RefreshCw,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Users,
  Pencil,
  Shuffle,
  EyeOff,
  Plus,
  Search,
  Trash2,
  X,
  ArrowLeftRight,
} from 'lucide-react';
import { computeSplit } from '@/lib/utils/financeSplit';
import { useLiveRefresh, LiveBadge } from '@/components/LiveProvider';
import { useApprovals, ApprovalsPanel, WaitingTag, HiddenEntries, ExcludedTestSellers, ActivityLog } from '@/components/FinanceControls';

const fmt = (n, d = 2) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const usdt = (n) => `${Number(n || 0) < 0 ? '-' : ''}₮${fmt(Math.abs(Number(n || 0)))}`;
const day = (d) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const REASONS = {
  usdt: 'Real Binance USDT not entered yet',
  auto_default: 'USDT was auto-filled (90 rate) — enter the real amount',
  pkr_rate: 'PKR member: INR amount and that day’s PKR rate are needed',
  partners: 'Exactly 2 finance partners are required before this can be split',
  bonus_rate: 'Milestone bonus: enter that day’s PKR rate to convert it to USDT',
  unassigned: 'This seller is not assigned to anyone. Assign it and it will be divided automatically',
};

const KIND_LABEL = { deposit: 'Deposit', seller_withdrawal: 'Seller withdrawal', bonus: 'Milestone bonus' };
const KIND_STYLE = {
  deposit: 'bg-emerald-100 text-emerald-800',
  seller_withdrawal: 'bg-red-100 text-red-700',
  bonus: 'bg-amber-100 text-amber-800',
};

function ownerText(owner, previousStore, kind) {
  if (kind === 'bonus') return `${owner ? owner.name : 'Member'} gets it • partners pay 50 / 50`;
  if (kind === 'seller_withdrawal' && previousStore) return 'Previous-store seller → both partners';
  if (!owner) return 'Not assigned yet';
  if (owner.role === 'admin') return `${owner.name} (partner)`;
  return `${owner.name} (${owner.deal === 'inr_50' ? '50% member' : '1:1 PKR member'})`;
}

function EntryForm({ row, busy, onSave, onCancel }) {
  const [inr, setInr] = useState(row.inr ? String(row.inr) : '');
  const [amount, setAmount] = useState(row.usdt && row.reason !== 'auto_default' ? String(row.usdt) : '');
  const [pkrRate, setPkrRate] = useState(row.pkrRate ? String(row.pkrRate) : '');
  const needsPkr = row.kind === 'deposit' && row.owner && row.owner.role === 'member' && row.owner.deal !== 'inr_50';
  const rate = Number(inr) > 0 && Number(amount) > 0 ? (Number(inr) / Number(amount)).toFixed(2) : null;

  if (row.kind === 'bonus') {
    const worth = Number(pkrRate) > 0 ? (Number(row.amountPKR) / Number(pkrRate)).toFixed(2) : null;
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ pkrRate });
        }}
        className="flex flex-wrap items-end gap-2 mt-2"
      >
        <label className="text-[11px] font-bold text-slate-600">
          PKR per 1 USDT (that day) *
          <input
            type="number"
            step="any"
            min="0"
            required
            value={pkrRate}
            onChange={(e) => setPkrRate(e.target.value)}
            placeholder="e.g. 282"
            className="block w-28 mt-0.5 p-2 rounded-xl border border-teal-400 bg-white text-xs font-bold"
          />
        </label>
        {worth && <span className="text-[11px] text-slate-500 pb-2">= ₮{worth} USDT</span>}
        <button
          type="submit"
          disabled={busy}
          className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold">
            Cancel
          </button>
        )}
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ usdtAmount: amount, inrAmount: inr, pkrRate: needsPkr ? pkrRate : undefined });
      }}
      className="flex flex-wrap items-end gap-2 mt-2"
    >
      <label className="text-[11px] font-bold text-slate-600">
        INR {row.kind === 'deposit' ? 'received' : 'paid'}
        <input
          type="number"
          step="any"
          min="0"
          value={inr}
          onChange={(e) => setInr(e.target.value)}
          placeholder="e.g. 5000"
          className="block w-28 mt-0.5 p-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
        />
      </label>
      <label className="text-[11px] font-bold text-slate-600">
        Real USDT {row.kind === 'deposit' ? 'received' : 'sent'} *
        <input
          type="number"
          step="any"
          min="0"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g. 46.45"
          className="block w-28 mt-0.5 p-2 rounded-xl border border-emerald-400 bg-white text-xs font-bold"
        />
      </label>
      {needsPkr && (
        <label className="text-[11px] font-bold text-slate-600">
          PKR per 1 USDT (that day) *
          <input
            type="number"
            step="any"
            min="0"
            required
            value={pkrRate}
            onChange={(e) => setPkrRate(e.target.value)}
            placeholder="e.g. 282"
            className="block w-28 mt-0.5 p-2 rounded-xl border border-teal-400 bg-white text-xs font-bold"
          />
        </label>
      )}
      {rate && <span className="text-[11px] text-slate-500 pb-2">Rate: ₹{rate} / USDT</span>}
      <button
        type="submit"
        disabled={busy}
        className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-60"
      >
        {busy ? 'Saving…' : 'Save'}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold">
          Cancel
        </button>
      )}
    </form>
  );
}

const inputCls = 'w-full p-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500';
const labelCls = 'block text-[11px] font-bold text-slate-600 mb-1';

function dealText(p) {
  if (!p) return '';
  if (p.role === 'partner' || p.role === 'admin') return 'Partner';
  return p.deal === 'inr_50' ? '50% member' : '1:1 PKR member';
}

/* ───────────────────────── Add entry (manual) ───────────────────────── */
function AddEntryModal({ data, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [entryKind, setEntryKind] = useState('deposit');
  const [sellerId, setSellerId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [date, setDate] = useState(today);
  const [inr, setInr] = useState('');
  const [amount, setAmount] = useState('');
  const [pkrRate, setPkrRate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const sellers = data.sellerOptions || [];
  const people = data.people || [];
  const seller = sellers.find((x) => x.id === sellerId);
  const owner = people.find((p) => p.id === ownerId);
  const partnersPayAll = entryKind === 'seller_withdrawal' && seller?.previousStore;
  const needsPkr = entryKind === 'deposit' && owner && owner.role === 'member' && owner.deal !== 'inr_50';

  const pickSeller = (id) => {
    setSellerId(id);
    const picked = sellers.find((x) => x.id === id);
    setOwnerId(picked?.assignedTo && people.some((p) => p.id === picked.assignedTo) ? picked.assignedTo : '');
  };

  // Live preview with the same rules the server uses.
  let preview = null;
  if (Number(amount) > 0 && data.partnersOk && (owner || partnersPayAll)) {
    preview = computeSplit({
      kind: entryKind,
      usdt: Number(amount),
      inr: Number(inr) || 0,
      pkrRate: Number(pkrRate) || 0,
      owner: owner ? { id: owner.id, name: owner.name, role: owner.role === 'partner' ? 'admin' : 'member', deal: owner.deal } : null,
      partners: data.partners,
      previousStore: !!seller?.previousStore,
    });
  }
  const rate = Number(inr) > 0 && Number(amount) > 0 ? (Number(inr) / Number(amount)).toFixed(2) : null;

  const submit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setErr('');
      const token = localStorage.getItem('portal_token');
      const res = await fetch('/api/finance/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'create',
          entryKind,
          sellerId,
          ownerId,
          date,
          inrAmount: inr,
          usdtAmount: amount,
          pkrRate: needsPkr ? pkrRate : '',
          note,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Could not add the entry');
      onSaved(json);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">Add finance entry</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Adds to the Binance ledger only. The seller’s store wallet is not changed. It is counted after the other partner approves it.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {err && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">{err}</div>}

          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'deposit', label: 'Deposit received', cls: 'emerald' },
              { key: 'seller_withdrawal', label: 'Seller withdrawal paid', cls: 'red' },
            ].map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setEntryKind(k.key)}
                className={`p-2.5 rounded-xl text-xs font-bold border transition ${
                  entryKind === k.key
                    ? k.cls === 'emerald'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Seller *</label>
              <select required value={sellerId} onChange={(e) => pickSeller(e.target.value)} className={inputCls}>
                <option value="">Select seller…</option>
                {sellers.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.storeName}
                    {x.previousStore ? ' (previous store)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Belongs to {partnersPayAll ? '(not needed)' : '*'}</label>
              <select required={!partnersPayAll} value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={inputCls}>
                <option value="">Select person…</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {dealText(p)}
                  </option>
                ))}
              </select>
              {seller && !seller.assignedTo && (
                <span className="text-[10px] text-amber-700 mt-1 block">This seller is not assigned yet — pick the owner here and also assign the seller itself.</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Date *</label>
              <input type="date" required value={date} max={today} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>INR amount</label>
              <input type="number" step="any" min="0" value={inr} onChange={(e) => setInr(e.target.value)} placeholder="e.g. 5000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>USDT {entryKind === 'deposit' ? 'received' : 'sent'} *</label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 46.45"
                className={`${inputCls} border-emerald-400`}
              />
            </div>
            {needsPkr && (
              <div>
                <label className={labelCls}>PKR per 1 USDT *</label>
                <input type="number" step="any" min="0" required value={pkrRate} onChange={(e) => setPkrRate(e.target.value)} placeholder="e.g. 282" className={inputCls} />
              </div>
            )}
            <div className={needsPkr ? 'col-span-2' : 'col-span-2 sm:col-span-3'}>
              <label className={labelCls}>Note</label>
              <input type="text" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Optional — e.g. Binance TXID" className={inputCls} />
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase">
              <span>How it will be divided</span>
              {rate && <span className="normal-case text-slate-500">Rate ₹{rate} / USDT</span>}
            </div>
            {preview && preview.ok ? (
              <div className="mt-2 space-y-1.5">
                {preview.shares.map((sh) => (
                  <div key={sh.userId} className="flex items-center justify-between text-xs">
                    <span className="text-slate-700">
                      <b>{sh.name}</b> <span className="text-slate-400">• {Number(sh.pct.toFixed(2))}%</span>
                    </span>
                    <b className={entryKind === 'deposit' ? 'text-emerald-700' : 'text-red-600'}>
                      {entryKind === 'deposit' ? '+' : '-'}
                      {fmt(sh.amountUSDT, 3)} USDT
                    </b>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 mt-2">
                {!data.partnersOk
                  ? 'Exactly 2 finance partners are required.'
                  : preview && preview.reason === 'pkr_rate'
                  ? 'Enter the INR amount and the PKR rate for this 1:1 PKR member.'
                  : 'Choose the seller, who it belongs to and the USDT amount.'}
              </p>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !(preview && preview.ok)}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50"
          >
            {saving ? 'Sending…' : 'Send for approval'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ───────────────────────── Deposit added to the wrong seller ───────────────────────── */
function FixDepositModal({ row, data, onClose, onSaved }) {
  const [mode, setMode] = useState('move');
  const [toSellerId, setToSellerId] = useState('');
  const [pkrRate, setPkrRate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const sellers = (data.sellerOptions || []).filter((x) => x.id !== row.sellerId);
  const people = data.people || [];
  const target = sellers.find((x) => x.id === toSellerId);
  const owner = target ? people.find((p) => p.id === target.assignedTo) : null;
  const needsPkr = mode === 'move' && owner && owner.role === 'member' && owner.deal !== 'inr_50' && !(row.pkrRate > 0);
  const counted = Array.isArray(row.shares) && row.shares.length > 0;

  // How the same USDT will be divided once it belongs to the correct seller (same rules as the server).
  let preview = null;
  if (mode === 'move' && target && owner && row.usdt > 0 && data.partnersOk) {
    preview = computeSplit({
      kind: 'deposit',
      usdt: row.usdt,
      inr: row.inr || 0,
      pkrRate: row.pkrRate > 0 ? row.pkrRate : Number(pkrRate) || 0,
      owner: { id: owner.id, name: owner.name, role: owner.role === 'partner' ? 'admin' : 'member', deal: owner.deal },
      partners: data.partners,
      previousStore: false,
    });
  }

  const submit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setErr('');
      const token = localStorage.getItem('portal_token');
      const res = await fetch('/api/finance/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: row.id, kind: 'deposit', action: 'fix_deposit', mode, toSellerId, pkrRate: needsPkr ? pkrRate : '', note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Could not send the request');
      onSaved(json);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  };

  const shareLine = (sh, sign) => (
    <div key={sh.userId} className="flex items-center justify-between text-xs">
      <span className="text-slate-700">
        <b>{sh.name}</b>
      </span>
      <b className={sign === '+' ? 'text-emerald-700' : 'text-slate-500'}>
        {sign}
        {fmt(sh.amountUSDT, 3)} USDT
      </b>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">Deposit added to the wrong seller</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              <b>{row.storeName}</b> • {day(row.date)} • store wallet ${fmt(row.walletAmount)}
              {row.usdt > 0 ? ` • ₮${fmt(row.usdt)}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {err && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">{err}</div>}

          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'move', label: 'Move to the correct seller' },
              { key: 'reverse', label: 'Reverse it (no money came)' },
            ].map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setMode(k.key)}
                className={`p-2.5 rounded-xl text-xs font-bold border transition ${
                  mode === k.key ? (k.key === 'move' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-red-600 text-white border-red-600') : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>

          {mode === 'move' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className={needsPkr ? '' : 'sm:col-span-2'}>
                  <label className={labelCls}>Correct seller *</label>
                  <select required value={toSellerId} onChange={(e) => setToSellerId(e.target.value)} className={inputCls}>
                    <option value="">Select seller…</option>
                    {sellers.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.storeName}
                      </option>
                    ))}
                  </select>
                  {target && (
                    <span className={`text-[10px] mt-1 block ${owner ? 'text-slate-500' : 'text-amber-700'}`}>
                      {owner ? `Belongs to ${owner.name} — ${dealText(owner)}` : 'This seller is not assigned yet: the deposit will wait on the “not counted yet” list until it is.'}
                    </span>
                  )}
                </div>
                {needsPkr && (
                  <div>
                    <label className={labelCls}>PKR per 1 USDT (that day) *</label>
                    <input type="number" step="any" min="0" required value={pkrRate} onChange={(e) => setPkrRate(e.target.value)} placeholder="e.g. 282" className={inputCls} />
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                <p className="text-[11px] text-slate-600">
                  ${fmt(row.walletAmount)} leaves the store wallet of <b>{row.storeName}</b> and is added to <b>{target ? target.storeName : 'the correct seller'}</b>. The Binance total does not change; only who it is divided for.
                </p>
                {counted && (
                  <div>
                    <div className="text-[11px] font-bold text-slate-500 uppercase mb-1.5">Divided now</div>
                    <div className="space-y-1">{row.shares.map((sh) => shareLine(sh, ''))}</div>
                  </div>
                )}
                {row.usdt > 0 && (
                  <div>
                    <div className="text-[11px] font-bold text-slate-500 uppercase mb-1.5">After the move</div>
                    {preview && preview.ok ? (
                      <div className="space-y-1">{preview.shares.map((sh) => shareLine(sh, '+'))}</div>
                    ) : (
                      <p className="text-xs text-slate-400">
                        {preview && preview.reason === 'pkr_rate'
                          ? 'Enter that day’s PKR rate (and make sure the INR amount is on the deposit) for this 1:1 PKR member.'
                          : target && !owner
                          ? 'Assign the seller first to see the split.'
                          : 'Choose the correct seller.'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-[11px] text-red-800 space-y-1">
              <p>
                ${fmt(row.walletAmount)} is taken back from the store wallet of <b>{row.storeName}</b> and the deposit is closed.
                {row.usdt > 0 ? ` ₮${fmt(row.usdt)} leaves the Binance ledger.` : ''}
              </p>
              <p>Use this only when the money never came (typed twice, wrong amount). If the money came but for another seller, use “Move”.</p>
            </div>
          )}

          <div>
            <label className={labelCls}>Note</label>
            <input type="text" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Optional — what happened" className={inputCls} />
          </div>

          <p className="text-[11px] text-slate-500">
            It only works while {row.storeName} still has this amount in its available balance. Nothing changes until the other partner approves it.
          </p>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || (mode === 'move' && !toSellerId)}
            className={`px-5 py-2.5 rounded-xl text-white text-xs font-bold disabled:opacity-50 ${mode === 'move' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
          >
            {saving ? 'Sending…' : 'Send for approval'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ───────────────────────── Page ───────────────────────── */
export default function FinancePage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [editId, setEditId] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [fixRow, setFixRow] = useState(null);
  const [notice, setNotice] = useState('');
  // Goes up whenever the approvals list and the activity log should be read again
  const [tick, setTick] = useState(0);

  // Table filters
  const [q, setQ] = useState('');
  const [fType, setFType] = useState('all');
  const [fOwner, setFOwner] = useState('all');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');

  // Each request gets a number; an answer is used only if nothing newer was asked meanwhile, so a
  // background refresh can never put older numbers back over a change you just saved.
  const requestNo = useRef(0);

  const load = useCallback(async (fresh = false, silent = false) => {
    const mine = ++requestNo.current;
    try {
      if (!silent) {
        setLoading(true);
        setError('');
      }
      const token = localStorage.getItem('portal_token');
      const res = await fetch(`/api/finance${fresh ? '?fresh=1' : ''}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to load finance ledger');
      if (mine === requestNo.current) setData(json);
    } catch (e) {
      if (!silent) setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const isAdminUser = user?.role === 'admin';
  useEffect(() => {
    if (isAdminUser) load();
  }, [isAdminUser, load]);

  const { approvals, setApprovals } = useApprovals(isAdminUser, tick);

  // A deposit approved, funds added or adjusted on the seller website, or a request asked /
  // approved by the other partner: everything reloads by itself
  useLiveRefresh(() => {
    if (isAdminUser) {
      load(false, true);
      setTick((n) => n + 1);
    }
  });

  const act = async (id, action, values = {}, kind = '') => {
    try {
      setBusyId(id);
      setError('');
      const token = localStorage.getItem('portal_token');
      const res = await fetch('/api/finance/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, kind, action, ...values }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Could not save');
      requestNo.current += 1; // anything still loading in the background is older than this
      setData(json);
      setEditId('');
      setNotice(json.notice || '');
      setTick((n) => n + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId('');
    }
  };

  if (!user) return null;
  if (user.role !== 'admin') {
    return <div className="p-8 text-center text-sm text-slate-500">This page is for admins only.</div>;
  }

  const t = data?.totals || {};
  const liability = data?.sellerLiability || {};
  const partners = data?.partners || [];
  const mismatch = Math.abs(t.diffUSDT || 0) > 0.01;
  const short = (liability.totalUSD || 0) > (t.balanceUSDT || 0);
  const unassigned = data?.unassignedSellers || [];

  // Requests that are waiting, by the ledger entry they are about
  const waitingByEntry = new Map();
  (approvals?.pending || []).forEach((a) => {
    if (a.entryId && !waitingByEntry.has(a.entryId)) waitingByEntry.set(a.entryId, a);
  });

  // ── Filtered transactions (newest first) ──
  const allEntries = data ? [...data.entries].reverse() : [];
  const rows = allEntries.filter((e) => {
    if (fType !== 'all' && e.kind !== fType) return false;
    if (fOwner !== 'all') {
      if (fOwner === 'none') {
        if (e.owner) return false;
      } else if (!e.owner || e.owner.id !== fOwner) return false;
    }
    const d = new Date(e.date).toISOString().slice(0, 10);
    if (fFrom && d < fFrom) return false;
    if (fTo && d > fTo) return false;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      const hay = `${e.storeName} ${e.owner?.name || ''} ${e.note || ''} ${e.ref || ''}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  const filtersOn = q || fType !== 'all' || fOwner !== 'all' || fFrom || fTo;

  // signed amount of one person in one entry (+ money for them, − money from them)
  const signed = (e, sh) => {
    if (e.kind === 'deposit') return sh.amountUSDT;
    if (e.kind === 'seller_withdrawal') return -sh.amountUSDT;
    return sh.role === 'member' ? sh.amountUSDT : -sh.amountUSDT;
  };
  const shareOf = (e, userId) => {
    const sh = e.shares.find((x) => String(x.userId) === String(userId));
    return sh ? signed(e, sh) : null;
  };
  const memberShare = (e) => {
    const sh = e.shares.find((x) => !partners.some((p) => p.id === String(x.userId)));
    return sh ? { name: sh.name, value: signed(e, sh) } : null;
  };

  const sum = { inr: 0, inUSDT: 0, outUSDT: 0, p: partners.map(() => 0), member: 0 };
  rows.forEach((e) => {
    if (e.kind === 'deposit') {
      sum.inUSDT += e.usdt;
      sum.inr += e.inr || 0;
    } else if (e.kind === 'seller_withdrawal') sum.outUSDT += e.usdt;
    partners.forEach((p, i) => {
      sum.p[i] += shareOf(e, p.id) || 0;
    });
    sum.member += memberShare(e)?.value || 0;
  });

  const money = (v, d = 2) =>
    v === null || v === undefined ? (
      <span className="text-slate-300">—</span>
    ) : (
      <span className={v < 0 ? 'text-red-600' : 'text-emerald-700'}>
        {v < 0 ? '-' : '+'}
        {fmt(Math.abs(v), d)}
      </span>
    );

  const colCount = 8 + partners.length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Landmark className="w-7 h-7 text-emerald-600" />
            <span>Binance Finance</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Real USDT only, counted from {data ? day(new Date(new Date(data.start).getTime() + 12 * 3600 * 1000)) : '…'}. Test accounts and helping amounts are not counted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LiveBadge />
          <button
            onClick={() => setShowAdd(true)}
            disabled={!data}
            className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 text-xs shadow-sm disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>Add entry</span>
          </button>
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center gap-1.5 text-xs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs font-semibold text-red-700">{error}</div>}

      {notice && (
        <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl text-xs font-semibold text-indigo-900 flex items-start justify-between gap-3">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-indigo-700 shrink-0" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {isAdminUser && (
        <ApprovalsPanel
          approvals={approvals}
          onChanged={(next) => {
            if (next) setApprovals(next);
            load(true, true);
            setTick((n) => n + 1);
          }}
        />
      )}

      {data && !data.partnersOk && (
        <div className="p-4 bg-red-50 border border-red-300 rounded-2xl text-xs text-red-800 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <b>Splits are paused: exactly 2 finance partners are required, found {data.partners.length}.</b>
            <div className="mt-1">
              Finance partners: {data.partners.map((p) => `${p.name}${p.email ? ` (${p.email})` : ''}`).join(', ') || 'none'}. In the store admin panel
              (Staff), switch “Finance partner” off for accounts that should only be staff. The deals are written for two partners: money is not
              divided for any other number.
            </div>
          </div>
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-xs text-amber-900 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <b>
              {unassigned.length} client {unassigned.length === 1 ? 'seller has' : 'sellers have'} no owner.
            </b>{' '}
            Every client seller must be assigned to a partner or a member. Their deposits and withdrawals are not divided until you assign them:{' '}
            <a href="/sellers" className="underline font-bold">open the Sellers page</a>, or use Assigned To in the admin panel’s seller approval screen.
            <div className="flex flex-wrap gap-1.5 mt-2">
              {unassigned.map((x) => (
                <span key={x.id} className="px-2 py-0.5 rounded-full bg-white border border-amber-300 font-bold text-[11px]">
                  {x.storeName}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {!data && loading && (
        <div className="py-20 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          <span>Loading ledger…</span>
        </div>
      )}

      {data && (
        <>
          {/* ── Binance summary ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" /> Received from sellers
              </span>
              <p className="text-2xl font-black text-emerald-600 mt-1">{usdt(t.inUSDT)}</p>
              <p className="text-[11px] text-slate-500 mt-1">
                {t.depositCount} deposits • ₹{fmt(t.inINR, 0)} INR
              </p>
            </div>
            <div className="bg-white p-5 rounded-3xl border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5 text-red-500" /> Used for seller withdrawals
              </span>
              <p className="text-2xl font-black text-red-600 mt-1">{usdt(t.sellerOutUSDT)}</p>
              <p className="text-[11px] text-slate-500 mt-1">{t.withdrawalCount} withdrawals paid</p>
            </div>
            <div className="bg-white p-5 rounded-3xl border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-amber-600" /> Paid out to team
              </span>
              <p className="text-2xl font-black text-amber-600 mt-1">{usdt(t.payoutUSDT)}</p>
              <p className="text-[11px] text-slate-500 mt-1">{data.payouts.length} payouts to members / partners</p>
            </div>
            <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-5 rounded-3xl text-white">
              <span className="text-[10px] uppercase font-bold text-emerald-400">In Binance now</span>
              <p className="text-2xl sm:text-3xl font-black mt-1">{usdt(t.balanceUSDT)}</p>
              <p className={`text-[11px] mt-1 flex items-center gap-1 ${mismatch ? 'text-red-300' : 'text-emerald-300'}`}>
                {mismatch ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                {mismatch ? `Wallets add up to ${usdt(t.walletsUSDT)} (difference ${usdt(t.diffUSDT)})` : 'Matches the sum of all wallets'}
              </p>
            </div>
          </div>

          {/* ── What sellers can still ask for ── */}
          <div
            className={`p-4 rounded-3xl border text-xs flex flex-wrap items-center gap-x-6 gap-y-1 ${
              short ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-white border-slate-200 text-slate-700'
            }`}
          >
            <span className="font-bold">Seller store wallets (what they can still ask to withdraw):</span>
            <span>
              <b>${fmt(liability.totalUSD)}</b> across {liability.sellerCount} client sellers
            </span>
            <span>
              Already requested, waiting: <b>${fmt(liability.pendingWithdrawalUSD)}</b>
            </span>
            {short && <span className="font-bold">More than the USDT in Binance — keep enough back before paying team payouts.</span>}
          </div>

          {/* ── Whose money is it ── */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 font-bold text-slate-900 text-sm">Whose share is in Binance</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[640px]">
                <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase">
                  <tr>
                    <th className="text-left px-5 py-2.5">Person</th>
                    <th className="text-right px-3 py-2.5">Earned from deposits</th>
                    <th className="text-right px-3 py-2.5">Bonuses</th>
                    <th className="text-right px-3 py-2.5">Share of seller withdrawals</th>
                    <th className="text-right px-3 py-2.5">Payouts taken</th>
                    <th className="text-right px-5 py-2.5">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.wallets.map((w) => (
                    <tr key={w.userId} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <b className="text-slate-900">{w.name}</b>
                        <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">{dealText(w)}</span>
                      </td>
                      <td className="text-right px-3 py-3 font-bold tabular-nums">{money(w.earnedUSDT)}</td>
                      <td className="text-right px-3 py-3 font-bold tabular-nums">{money(w.bonusUSDT - w.bonusCostUSDT)}</td>
                      <td className="text-right px-3 py-3 font-bold tabular-nums">{money(-w.sellerWithdrawUSDT)}</td>
                      <td className="text-right px-3 py-3 font-bold tabular-nums">{money(-w.payoutUSDT)}</td>
                      <td className={`text-right px-5 py-3 font-black text-sm tabular-nums ${w.balanceUSDT < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                        {usdt(w.balanceUSDT)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-black border-t border-slate-200">
                    <td className="px-5 py-3">Total</td>
                    <td className="text-right px-3 py-3 tabular-nums">+{fmt(t.inUSDT)}</td>
                    <td className="text-right px-3 py-3 text-slate-400 tabular-nums">0.00</td>
                    <td className="text-right px-3 py-3 tabular-nums">-{fmt(t.sellerOutUSDT)}</td>
                    <td className="text-right px-3 py-3 tabular-nums">-{fmt(t.payoutUSDT)}</td>
                    <td className="text-right px-5 py-3 text-sm tabular-nums">{usdt(t.walletsUSDT)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── Waiting for an amount, a rate or an owner ── */}
          {data.pending.length > 0 && (
            <div className="bg-amber-50/70 rounded-3xl border border-amber-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-amber-200 font-bold text-amber-900 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>Not counted yet ({data.pending.length})</span>
              </div>
              <div className="divide-y divide-amber-100">
                {data.pending.map((row) => (
                  <div key={row.id} className="px-5 py-3 text-xs">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <b className="text-slate-900">{row.storeName}</b>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${KIND_STYLE[row.kind]}`}>{KIND_LABEL[row.kind]}</span>
                      <span className="text-slate-500">{day(row.date)}</span>
                      {row.kind === 'bonus' ? (
                        <span className="text-slate-500">Rs {fmt(row.amountPKR, 0)} PKR</span>
                      ) : (
                        <span className="text-slate-500">
                          Store wallet: ${fmt(row.walletAmount)}
                          {row.helping > 0 ? ` (helping $${fmt(row.helping)})` : ''}
                          {row.usdt > 0 ? ` • ₮${fmt(row.usdt)} entered` : ''}
                        </span>
                      )}
                      {row.isManual && <span className="text-slate-500">• Direct add</span>}
                      {row.reason !== 'unassigned' && <span className="text-slate-500">• {ownerText(row.owner, row.previousStore, row.kind)}</span>}
                    </div>
                    <div className="text-[11px] text-amber-800 mt-1">{REASONS[row.reason] || row.reason}</div>
                    {waitingByEntry.has(row.id) && (
                      <div className="mt-1.5">
                        <WaitingTag approval={waitingByEntry.get(row.id)} />
                      </div>
                    )}
                    {row.reason !== 'partners' && row.reason !== 'unassigned' && (
                      <div className="flex flex-wrap items-end gap-2">
                        <EntryForm row={row} busy={busyId === row.id} onSave={(v) => act(row.id, 'save', v, row.kind)} />
                        <button
                          type="button"
                          disabled={busyId === row.id || waitingByEntry.has(row.id)}
                          onClick={() => {
                            if (window.confirm('Ask the other partner to approve that no real money moved for this entry?\n\nIt stays in this list until they approve.')) act(row.id, 'skip', {}, row.kind);
                          }}
                          className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-600 text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                          title="Ask the other partner to approve that this is not real money (for example a helping-only credit or an old bonus already settled)"
                        >
                          <EyeOff className="w-3.5 h-3.5" /> {row.kind === 'bonus' ? 'Do not count' : 'No real money'}
                        </button>
                      </div>
                    )}
                    {row.kind === 'deposit' && (
                      <button
                        type="button"
                        disabled={waitingByEntry.has(row.id)}
                        onClick={() => setFixRow(row)}
                        className="mt-2 px-3 py-1.5 rounded-xl bg-white border border-amber-300 text-amber-800 text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-50"
                        title="Added to the wrong seller? Move it to the correct seller, or reverse it"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" /> Wrong seller?
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Transactions table ── */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-900 text-sm">Transactions</h2>
                <p className="text-[11px] text-slate-500">
                  {rows.length} of {allEntries.length} entries • deposits, seller withdrawals and bonuses
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search seller or person…"
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-end gap-3 text-xs">
              <label className="font-bold text-slate-500">
                <span className="block text-[10px] uppercase mb-1">Type</span>
                <select value={fType} onChange={(e) => setFType(e.target.value)} className="p-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700">
                  <option value="all">All types</option>
                  <option value="deposit">Deposits</option>
                  <option value="seller_withdrawal">Seller withdrawals</option>
                  <option value="bonus">Bonuses</option>
                </select>
              </label>
              <label className="font-bold text-slate-500">
                <span className="block text-[10px] uppercase mb-1">Belongs to</span>
                <select value={fOwner} onChange={(e) => setFOwner(e.target.value)} className="p-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700">
                  <option value="all">Everyone</option>
                  {(data.people || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="font-bold text-slate-500">
                <span className="block text-[10px] uppercase mb-1">From</span>
                <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} className="p-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700" />
              </label>
              <label className="font-bold text-slate-500">
                <span className="block text-[10px] uppercase mb-1">To</span>
                <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} className="p-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700" />
              </label>
              {filtersOn && (
                <button
                  onClick={() => {
                    setQ('');
                    setFType('all');
                    setFOwner('all');
                    setFFrom('');
                    setFTo('');
                  }}
                  className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-600 font-bold flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" /> Clear
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[980px]">
                <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase">
                  <tr>
                    <th className="text-left px-5 py-2.5">Date</th>
                    <th className="text-left px-3 py-2.5">Seller</th>
                    <th className="text-left px-3 py-2.5">Type</th>
                    <th className="text-left px-3 py-2.5">Belongs to</th>
                    <th className="text-right px-3 py-2.5">INR</th>
                    <th className="text-right px-3 py-2.5">Rate</th>
                    <th className="text-right px-3 py-2.5">USDT</th>
                    {partners.map((p) => (
                      <th key={p.id} className="text-right px-3 py-2.5">
                        {p.name}
                      </th>
                    ))}
                    <th className="text-right px-3 py-2.5">Member</th>
                    <th className="text-right px-5 py-2.5"> </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={colCount + 1} className="py-12 text-center text-slate-400">
                        {allEntries.length === 0 ? 'Nothing counted yet.' : 'No entries match these filters.'}
                      </td>
                    </tr>
                  )}
                  {rows.map((e) => {
                    const ms = memberShare(e);
                    return (
                      <React.Fragment key={e.id}>
                        <tr className="hover:bg-slate-50/60 align-middle">
                          <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{day(e.date)}</td>
                          <td className="px-3 py-3">
                            <b className="text-slate-900">{e.storeName}</b>
                            {e.manual && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[9px] font-bold uppercase">Manual</span>}
                            {e.note && <div className="text-[10px] text-slate-400 mt-0.5">{e.note}</div>}
                            {e.movedFrom && <div className="text-[10px] text-amber-700 mt-0.5">Moved from {e.movedFrom} (was added to the wrong seller)</div>}
                            {waitingByEntry.has(e.id) && (
                              <div className="mt-1">
                                <WaitingTag approval={waitingByEntry.get(e.id)} />
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${KIND_STYLE[e.kind]}`}>{KIND_LABEL[e.kind]}</span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {e.kind === 'seller_withdrawal' && e.previousStore ? (
                              <span className="text-slate-500">Previous store</span>
                            ) : e.owner ? (
                              <>
                                <span className="font-semibold text-slate-800">{e.owner.name}</span>
                                <div className="text-[10px] text-slate-400">{dealText(e.owner)}</div>
                              </>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                            {e.kind === 'bonus' ? `Rs ${fmt(e.amountPKR, 0)}` : e.inr > 0 ? `₹${fmt(e.inr, 0)}` : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-500">
                            {e.kind === 'bonus' ? e.pkrRate : e.rate > 0 ? e.rate : <span className="text-slate-300">—</span>}
                          </td>
                          <td className={`px-3 py-3 text-right tabular-nums font-black ${e.kind === 'deposit' ? 'text-emerald-600' : e.kind === 'bonus' ? 'text-amber-600' : 'text-red-600'}`}>
                            {e.kind === 'deposit' ? '+' : e.kind === 'bonus' ? '' : '-'}
                            {fmt(e.usdt)}
                          </td>
                          {partners.map((p) => (
                            <td key={p.id} className="px-3 py-3 text-right tabular-nums font-bold">
                              {money(shareOf(e, p.id), 3)}
                            </td>
                          ))}
                          <td className="px-3 py-3 text-right tabular-nums font-bold whitespace-nowrap">
                            {ms ? (
                              <>
                                {money(ms.value, 3)}
                                <div className="text-[10px] font-normal text-slate-400">{ms.name}</div>
                              </>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              {e.manual ? (
                                <button
                                  disabled={busyId === e.id}
                                  onClick={() => {
                                    if (window.confirm(`Ask the other partner to approve deleting this manual entry for ${e.storeName}?`)) act(e.id, 'delete', {}, 'manual');
                                  }}
                                  className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600"
                                  title="Delete this manual entry"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={() => setEditId(editId === e.id ? '' : e.id)}
                                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600"
                                    title="Correct the amounts (a change needs the other partner’s approval)"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    disabled={busyId === e.id}
                                    onClick={() => {
                                      if (window.confirm('Ask the other partner to approve dividing this entry again using the seller’s current assignment?')) act(e.id, 'resplit', {}, e.kind);
                                    }}
                                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600"
                                    title="Divide again using the current assignment"
                                  >
                                    <Shuffle className="w-3.5 h-3.5" />
                                  </button>
                                  {e.kind === 'deposit' && (
                                    <button
                                      disabled={waitingByEntry.has(e.id)}
                                      onClick={() => setFixRow(e)}
                                      className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 disabled:opacity-50"
                                      title="Added to the wrong seller? Move it to the correct seller, or reverse it"
                                    >
                                      <ArrowLeftRight className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        {editId === e.id && (
                          <tr className="bg-slate-50">
                            <td colSpan={colCount + 1} className="px-5 pb-3">
                              <EntryForm row={e} busy={busyId === e.id} onSave={(v) => act(e.id, 'save', v, e.kind)} onCancel={() => setEditId('')} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50 font-black border-t border-slate-200">
                      <td className="px-5 py-3" colSpan={4}>
                        {filtersOn ? 'Total of filtered entries' : 'Total'}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">₹{fmt(sum.inr, 0)}</td>
                      <td className="px-3 py-3"> </td>
                      <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                        <span className="text-emerald-700">+{fmt(sum.inUSDT)}</span>
                        {sum.outUSDT > 0 && <span className="text-red-600"> / -{fmt(sum.outUSDT)}</span>}
                      </td>
                      {partners.map((p, i) => (
                        <td key={p.id} className="px-3 py-3 text-right tabular-nums">
                          {money(sum.p[i])}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right tabular-nums">{money(sum.member)}</td>
                      <td className="px-5 py-3"> </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* ── Team payouts ── */}
          {data.payouts.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 font-bold text-slate-900 text-sm">Payouts to members / partners ({data.payouts.length})</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[520px]">
                  <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase">
                    <tr>
                      <th className="text-left px-5 py-2.5">Date</th>
                      <th className="text-left px-3 py-2.5">Person</th>
                      <th className="text-left px-3 py-2.5">Note</th>
                      <th className="text-right px-5 py-2.5">USDT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...data.payouts].reverse().map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/60">
                        <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{day(p.date)}</td>
                        <td className="px-3 py-3 font-bold text-slate-900">{p.name}</td>
                        <td className="px-3 py-3 text-slate-500">{p.note || '—'}</td>
                        <td className="px-5 py-3 text-right font-black text-amber-700 tabular-nums">-{fmt(p.amountUSDT)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <HiddenEntries rows={data.skipped} busyId={busyId} onBringBack={(row) => act(row.id, 'unskip', {}, row.kind)} />
          <ExcludedTestSellers rows={data.excludedTest} />
          <ActivityLog tick={tick} />
        </>
      )}

      {fixRow && data && (
        <FixDepositModal
          row={fixRow}
          data={data}
          onClose={() => setFixRow(null)}
          onSaved={(json) => {
            requestNo.current += 1;
            setData(json);
            setFixRow(null);
            setNotice(json.notice || '');
            setTick((n) => n + 1);
          }}
        />
      )}

      {showAdd && data && (
        <AddEntryModal
          data={data}
          onClose={() => setShowAdd(false)}
          onSaved={(json) => {
            requestNo.current += 1;
            setData(json);
            setShowAdd(false);
            setNotice(json.notice || '');
            setTick((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
