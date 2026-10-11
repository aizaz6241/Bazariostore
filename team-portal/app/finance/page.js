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
  Store,
  RotateCcw,
  Ban,
} from 'lucide-react';
import { computeSplit } from '@/lib/utils/financeSplit';
import { useLiveRefresh, LiveBadge } from '@/components/LiveProvider';
import { useApprovals, ApprovalsPanel, WaitingTag, HiddenEntries, ExcludedTestSellers, ActivityLog } from '@/components/FinanceControls';
import { DonutChart, LineChart, LineLegend, BarList, colorForSlot } from '@/components/Charts';

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
  // 1:1 PKR member: the INR amount and that day's PKR rate decide the member's part, on a deposit
  // and (the same way) on a seller withdrawal
  const needsPkr =
    (row.kind === 'deposit' || (row.kind === 'seller_withdrawal' && !row.previousStore)) && row.owner && row.owner.role === 'member' && row.owner.deal !== 'inr_50';
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
        {needsPkr ? ' *' : ''}
        <input
          type="number"
          step="any"
          min="0"
          required={needsPkr}
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
  const needsPkr = !partnersPayAll && owner && owner.role === 'member' && owner.deal !== 'inr_50';

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
      owner: owner ? { id: owner.id, name: owner.name, role: owner.role === 'partner' ? 'admin' : 'member', deal: owner.deal, referral: owner.referral || null } : null,
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
              <label className={labelCls}>INR amount{needsPkr ? ' *' : ''}</label>
              <input type="number" step="any" min="0" required={!!needsPkr} value={inr} onChange={(e) => setInr(e.target.value)} placeholder="e.g. 5000" className={inputCls} />
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
      owner: { id: owner.id, name: owner.name, role: owner.role === 'partner' ? 'admin' : 'member', deal: owner.deal, referral: owner.referral || null },
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
              { key: 'reverse', label: 'Remove it (deduct from this seller)' },
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
              <p>
                Use this when the correct seller <b>already has a deposit of its own</b> for this money (you added it again for the right seller), or when it was typed twice / no money came.
              </p>
              <p>If the correct seller has not received it yet, use “Move” instead, so the money is not lost from the count.</p>
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

/* ───────────────────────── Reserve pool: put money in / move it back ───────────────────────── */
const RESERVE_TYPE = {
  add_wallets: { label: 'Put in (from wallets)', cls: 'bg-indigo-100 text-indigo-800', sign: '+' },
  add_pocket: { label: 'Put in (own pockets)', cls: 'bg-indigo-100 text-indigo-800', sign: '+' },
  take: { label: 'Moved back to wallets', cls: 'bg-slate-100 text-slate-700', sign: '-' },
  used: { label: 'Paid a shortfall', cls: 'bg-red-100 text-red-700', sign: '-' },
  returned: { label: 'Came back (to wallets)', cls: 'bg-emerald-100 text-emerald-800', sign: '' },
};

function ReserveModal({ mode, data, onClose, onSent }) {
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('wallets');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const reserve = data.reserve || { balanceUSDT: 0 };
  const partnerWallets = data.wallets.filter((w) => data.partners.some((p) => p.id === w.userId));
  const half = Number(amount) > 0 ? Number(amount) / 2 : 0;
  const isAdd = mode === 'add';

  let problem = '';
  if (half > 0) {
    if (!isAdd && Number(amount) > reserve.balanceUSDT + 0.005) problem = `The reserve holds only ${usdt(reserve.balanceUSDT)}.`;
    if (isAdd && source === 'wallets') {
      const low = partnerWallets.filter((w) => (w.availableUSDT ?? w.balanceUSDT) + 0.005 < half);
      if (low.length > 0) problem = `${low.map((w) => `${w.name} can take out only ${usdt(Math.max(w.availableUSDT ?? w.balanceUSDT, 0))}`).join('; ')}. Each partner gives ${usdt(half)}.`;
    }
  }

  const submit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setErr('');
      const token = localStorage.getItem('portal_token');
      const res = await fetch('/api/finance/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: isAdd ? 'add' : 'take', source, amount: Number(amount), note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Could not send the request');
      onSent(json.message || 'Sent for approval.');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">{isAdd ? 'Put money into the reserve' : 'Move reserve money back to the wallets'}</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {isAdd ? 'Half from each partner. The other partner has to approve it.' : 'Half goes to each partner’s wallet. The other partner has to approve it.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {isAdd && (
            <div>
              <label className={labelCls}>Where does the money come from?</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'wallets', title: 'From our wallets', text: 'Taken out of both wallets. Binance total stays the same.' },
                  { id: 'pocket', title: 'From our own pockets', text: 'New USDT sent to Binance. Wallets stay the same.' },
                ].map((o) => (
                  <button
                    type="button"
                    key={o.id}
                    onClick={() => setSource(o.id)}
                    className={`text-left p-3 rounded-2xl border text-xs ${source === o.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white'}`}
                  >
                    <b className="text-slate-900 block">{o.title}</b>
                    <span className="text-[11px] text-slate-500">{o.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>Total amount (USDT) *</label>
            <input type="number" step="any" min="0" required autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 500" className={`${inputCls} border-indigo-400`} />
          </div>
          <div>
            <label className={labelCls}>Note</label>
            <input type="text" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className={inputCls} />
          </div>

          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-xs space-y-1.5">
            <div className="text-[11px] font-bold text-slate-500 uppercase">What will happen</div>
            {half > 0 ? (
              <>
                {partnerWallets.map((w) => (
                  <div key={w.userId} className="flex items-center justify-between">
                    <span className="text-slate-700">
                      <b>{w.name}</b>
                      {isAdd && source === 'pocket' ? ' sends to Binance' : ' wallet'}
                    </span>
                    <b className={isAdd && source === 'wallets' ? 'text-red-600' : 'text-emerald-700'}>
                      {isAdd && source === 'wallets' ? '-' : '+'}
                      {fmt(half)} USDT
                    </b>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-200">
                  <span className="text-slate-700">
                    <b>Reserve</b> {usdt(reserve.balanceUSDT)} →
                  </span>
                  <b className="text-slate-900">{usdt(reserve.balanceUSDT + (isAdd ? 1 : -1) * Number(amount))}</b>
                </div>
              </>
            ) : (
              <p className="text-slate-400">Enter the amount.</p>
            )}
          </div>

          {(problem || err) && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold">{err || problem}</div>}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold">
            Cancel
          </button>
          <button type="submit" disabled={saving || !(half > 0) || !!problem} className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50">
            {saving ? 'Sending…' : 'Send for approval'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ───────────────────────── Page ───────────────────────── */

/**
 * Charts above "Whose share is in Binance":
 *   - how the USDT in Binance is divided between the people (+ the reserve)
 *   - money in vs money out, week by week (last 8 weeks)
 *   - what each person earned from deposits
 * Colours follow the person (fixed order of the wallets list), never their rank.
 */
const IST_MS = 330 * 60000;
function weekStartIST(d) {
  const x = new Date(new Date(d).getTime() + IST_MS);
  const dow = (x.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate() - dow);
}
function BinanceShareCharts({ data, reserveInUse }) {
  const [range, setRange] = React.useState(8);
  const wallets = data.wallets || [];
  const colorOf = new Map(wallets.map((w, i) => [w.userId, colorForSlot(i)]));
  const fmtU = (v) => `₮${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const slices = wallets
    .filter((w) => (w.balanceUSDT || 0) > 0.005)
    .map((w) => ({ id: w.userId, name: w.name, value: Number(w.balanceUSDT) || 0, color: colorOf.get(w.userId) }));
  if (reserveInUse && (data.reserve?.balanceUSDT || 0) > 0.005) slices.push({ id: 'reserve', name: 'Reserve pool', value: data.reserve.balanceUSDT, color: '#64748b' });
  slices.sort((a, b) => b.value - a.value);
  const minus = wallets.filter((w) => (w.balanceUSDT || 0) < -0.005);

  // week buckets
  const now = weekStartIST(new Date());
  const weeks = [];
  for (let i = range - 1; i >= 0; i -= 1) weeks.push(now - i * 7 * 86400000);
  const idx = (d) => weeks.indexOf(weekStartIST(d));
  const inV = weeks.map(() => 0);
  const outV = weeks.map(() => 0);
  const payV = weeks.map(() => 0);
  for (const e of data.entries || []) {
    const i = idx(e.date);
    if (i < 0) continue;
    if (e.kind === 'deposit') inV[i] += Number(e.usdt) || 0;
    else if (e.kind === 'seller_withdrawal') outV[i] += Number(e.usdt) || 0;
  }
  for (const p of data.payouts || []) {
    const i = idx(p.date);
    if (i >= 0) payV[i] += Number(p.amountUSDT) || 0;
  }
  const labels = weeks.map((w) => {
    const a = new Date(w);
    const b = new Date(w + 6 * 86400000);
    const f = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    return { short: f(a), full: `Week ${f(a)} – ${f(b)}` };
  });
  const series = [
    { key: 'in', name: 'Came in (deposits)', color: '#1baf7a', values: inV },
    { key: 'out', name: 'Seller withdrawals', color: '#eb6834', values: outV },
    { key: 'pay', name: 'Team payouts', color: '#2a78d6', values: payV },
  ];
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  const earned = wallets
    .map((w) => ({ id: w.userId, name: w.name, value: Number(w.earnedUSDT) || 0, color: colorOf.get(w.userId), sub: dealText(w) }))
    .filter((x) => x.value > 0.005)
    .sort((a, b) => b.value - a.value);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <h3 className="text-sm font-bold text-slate-900">Who owns the USDT in Binance</h3>
        <p className="text-[11px] text-slate-400 mb-3">Each person’s share (balance){reserveInUse ? ' and the reserve' : ''}</p>
        <DonutChart vertical slices={slices} format={fmtU} totalLabel="Shares in plus" emptyText="No share in plus" />
        {minus.length > 0 && (
          <p className="text-[11px] text-red-600 mt-2">
            In minus: {minus.map((w) => `${w.name} ${fmtU(w.balanceUSDT)}`).join(', ')}
          </p>
        )}
      </div>
      <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Money in and out, per week</h3>
            <p className="text-[11px] text-slate-400">Real USDT (Monday–Sunday, India time)</p>
          </div>
          <div className="flex gap-1">
            {[4, 8, 12].map((n) => (
              <button
                key={n}
                onClick={() => setRange(n)}
                className={`px-2 py-1 rounded-md text-[11px] font-bold ${range === n ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {n}w
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2">
          <LineChart labels={labels} series={series} format={fmtU} height={210} ariaLabel="USDT in and out per week" />
        </div>
        <div className="mt-2">
          <LineLegend items={series.map((s) => ({ name: s.name, color: s.color, value: fmtU(sum(s.values)) }))} />
        </div>
      </div>
      <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 p-4">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Earned from deposits, per person (all time)</h3>
        <BarList items={earned} format={fmtU} emptyText="Nothing earned yet" />
      </div>
    </div>
  );
}

/**
 * What the sellers can still ask to withdraw (their store wallets, in $) next to what Binance
 * holds. Not the partners' money: a promise the business has to be able to keep.
 */
function StoreWalletsCard({ liability, binanceUSDT }) {
  const [open, setOpen] = React.useState(false);
  const total = Number(liability.totalUSD) || 0;
  const waiting = Number(liability.pendingWithdrawalUSD) || 0;
  const held = Math.max(0, Number(binanceUSDT) || 0);
  const covered = total > 0 ? Math.min(100, (held / total) * 100) : 100;
  const short = total > held + 0.005;
  const gap = Math.max(0, total - held);
  const rows = liability.sellers || [];
  return (
    <div className={`rounded-3xl border overflow-hidden ${short ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white'}`}>
      <div className="px-5 py-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Store className="w-4 h-4 text-amber-600" /> What sellers can still withdraw
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5 max-w-2xl">
            The money in the {liability.sellerCount} client sellers’ store wallets. They can ask to take it out at any time, so Binance should hold enough before the team takes payouts.
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${short ? 'bg-amber-500 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
          {short ? `Binance covers ${covered.toFixed(0)}%` : 'Fully covered'}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-slate-200/70 border-y border-slate-200/70">
        <div className="bg-white px-5 py-3.5">
          <div className="text-[10px] uppercase font-bold text-slate-400">In store wallets</div>
          <div className="text-xl font-black tabular-nums text-slate-900">${fmt(total)}</div>
          <div className="text-[11px] text-slate-500">across {liability.sellerCount} client sellers</div>
        </div>
        <div className="bg-white px-5 py-3.5">
          <div className="text-[10px] uppercase font-bold text-slate-400">Already asked to withdraw</div>
          <div className={`text-xl font-black tabular-nums ${waiting > 0 ? 'text-orange-600' : 'text-slate-900'}`}>${fmt(waiting)}</div>
          <div className="text-[11px] text-slate-500">{waiting > 0 ? 'waiting to be paid' : 'nothing waiting'}</div>
        </div>
        <div className="bg-white px-5 py-3.5">
          <div className="text-[10px] uppercase font-bold text-slate-400">In Binance now</div>
          <div className="text-xl font-black tabular-nums text-emerald-700">{usdt(held)}</div>
          <div className={`text-[11px] ${short ? 'text-amber-700 font-semibold' : 'text-slate-500'}`}>{short ? `${usdt(gap)} less than the store wallets` : 'more than the store wallets'}</div>
        </div>
      </div>
      <div className="px-5 py-3">
        <div className="h-2.5 rounded-full bg-slate-200 overflow-hidden" title={`Binance covers ${covered.toFixed(1)}% of the store wallets`}>
          <div className={`h-full rounded-full ${short ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.max(2, covered)}%` }} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
          <p className={`text-[11px] ${short ? 'text-amber-900' : 'text-slate-500'}`}>
            {short
              ? 'Store wallets hold more than Binance. Keep enough USDT back before paying team payouts.'
              : 'Binance holds more than every store wallet together.'}
          </p>
          {rows.length > 0 && (
            <button type="button" onClick={() => setOpen((v) => !v)} className="text-[11px] font-bold text-slate-700 hover:text-slate-900 underline underline-offset-2">
              {open ? 'Hide sellers' : `See by seller (${rows.length})`}
            </button>
          )}
        </div>
      </div>
      {open && rows.length > 0 && (
        <div className="border-t border-slate-200/70 bg-white overflow-x-auto">
          <table className="w-full text-xs min-w-[480px]">
            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase">
              <tr>
                <th className="text-left px-5 py-2">Seller</th>
                <th className="text-left px-3 py-2">Owner</th>
                <th className="text-right px-3 py-2">Store wallet</th>
                <th className="text-right px-5 py-2">Asked to withdraw</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-2 font-bold text-slate-900">{r.storeName}</td>
                  <td className="px-3 py-2 text-slate-600">{r.ownerName || <span className="text-red-600 font-semibold">No owner</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold">${fmt(r.balanceUSD)}</td>
                  <td className={`px-5 py-2 text-right tabular-nums ${r.pendingWithdrawalUSD > 0 ? 'text-orange-600 font-bold' : 'text-slate-300'}`}>{r.pendingWithdrawalUSD > 0 ? `$${fmt(r.pendingWithdrawalUSD)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** One person's share of the Binance money, as a card (phones) */
function ShareCard({ w, partner, reserveInUse, reserveCol, totalPlus }) {
  const bal = Number(w.balanceUSDT) || 0;
  const avail = w.availableUSDT ?? bal;
  const pct = totalPlus > 0 && bal > 0 ? (bal / totalPlus) * 100 : 0;
  const line = (label, v, cls = '') => (
    <div className="flex items-center justify-between text-[11px] py-0.5">
      <span className="text-slate-500">{label}</span>
      <span className={`font-bold tabular-nums ${cls || (v < 0 ? 'text-red-600' : 'text-slate-800')}`}>
        {v < 0 ? '−' : v > 0 ? '+' : ''}
        {fmt(Math.abs(v))}
      </span>
    </div>
  );
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-slate-900 text-sm truncate">{w.name}</div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">{dealText(w)}</span>
        </div>
        <div className="text-right">
          <div className={`text-lg font-black tabular-nums ${bal < 0 ? 'text-red-600' : 'text-slate-900'}`}>{usdt(bal)}</div>
          {pct > 0 && <div className="text-[10px] text-slate-400">{pct.toFixed(0)}% of all shares</div>}
        </div>
      </div>
      <div className="mt-2 border-t border-slate-100 pt-2">
        {line('Earned from deposits', w.earnedUSDT)}
        {Math.abs(w.bonusUSDT - w.bonusCostUSDT) > 0.004 && line('Bonuses', w.bonusUSDT - w.bonusCostUSDT)}
        {w.sellerWithdrawUSDT > 0.004 && line('Share of seller withdrawals', -w.sellerWithdrawUSDT)}
        {w.payoutUSDT > 0.004 && line('Payouts taken', -w.payoutUSDT)}
        {reserveInUse && partner && Math.abs(reserveCol(w)) > 0.004 && line('Reserve', reserveCol(w))}
      </div>
      <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2">
        <span className="text-[11px] font-bold text-emerald-900">Can take out now</span>
        <span className={`text-sm font-black tabular-nums ${avail < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{usdt(avail)}</span>
      </div>
    </div>
  );
}

const FINANCE_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'payouts', label: 'Payouts' },
  { key: 'reserve', label: 'Reserve pool' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'activity', label: 'Activity log' },
];
const PAGE = 50;

export default function FinancePage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [editId, setEditId] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [fixRow, setFixRow] = useState(null);
  const [reserveMode, setReserveMode] = useState(''); // '' | 'add' | 'take'
  const [showReserveHistory, setShowReserveHistory] = useState(false);
  const [notice, setNotice] = useState('');
  // Goes up whenever the approvals list and the activity log should be read again
  const [tick, setTick] = useState(0);

  // Which part of the page is shown (kept in the address: /finance?tab=payouts)
  const [tab, setTabState] = useState('overview');
  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('tab');
      if (t && FINANCE_TABS.some((x) => x.key === t)) setTabState(t);
    } catch (_) {}
  }, []);
  const setTab = (t) => {
    setTabState(t);
    try {
      const u = new URL(window.location.href);
      if (t === 'overview') u.searchParams.delete('tab');
      else u.searchParams.set('tab', t);
      window.history.replaceState(window.history.state, '', u.pathname + u.search);
    } catch (_) {}
  };
  const [shown, setShown] = useState(PAGE); // transactions shown (newest first)

  // Table filters
  const [q, setQ] = useState('');
  const [fType, setFType] = useState('all');
  const [fOwner, setFOwner] = useState('all');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  useEffect(() => setShown(PAGE), [q, fType, fOwner, fFrom, fTo]);

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

  // Take back a payout that was recorded by mistake. Always needs the other partner's approval.
  const reversePayout = async (p) => {
    const reason = window.prompt(
      `Reverse the payout of ₮${Number(p.amountUSDT).toLocaleString('en-US', { maximumFractionDigits: 6 })} to ${p.name}?\n\n` +
        'Use this only when the payout was written by mistake or the money was never sent. The row is kept, but it is no longer counted: ' +
        'the wallet and the Binance total get the amount back.\n\nThe other partner has to approve it. Reason:',
      ''
    );
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setError('Write the reason for reversing this payout.');
      return;
    }
    try {
      setBusyId(p.id);
      setError('');
      const token = localStorage.getItem('portal_token');
      const res = await fetch('/api/wallet/payout/reverse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: p.id, reason: reason.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Could not reverse this payout');
      setNotice(json.message || 'Sent for approval.');
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
  const reserve = data?.reserve || { balanceUSDT: 0, halves: [], owedUSDT: 0, owed: [], pocketInUSDT: 0, history: [] };
  const reserveInUse = reserve.balanceUSDT > 0.000001 || reserve.owedUSDT > 0.000001 || reserve.history.length > 0;
  const reserveWaiting = (approvals?.pending || []).find((a) => a.action === 'reserve_add' || a.action === 'reserve_take');
  const partnerIds = new Set(partners.map((p) => p.id));
  const reserveCol = (w) => (w.fromReserveUSDT || 0) + (w.reserveReturnUSDT || 0) - (w.toReserveUSDT || 0);
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
  const shownRows = rows.slice(0, shown);

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
                {mismatch
                  ? `Wallets${reserveInUse ? ' + reserve' : ''} add up to ${usdt((t.walletsUSDT || 0) + (t.reserveUSDT || 0) + (t.reserveOwedUSDT || 0))} (difference ${usdt(t.diffUSDT)})`
                  : reserveInUse
                  ? 'Matches all wallets + the reserve'
                  : 'Matches the sum of all wallets'}
              </p>
            </div>
          </div>

          {/* ── Sections ── */}
          <div className="sticky top-16 z-30 -mx-1 px-1 py-2 bg-slate-50/90 backdrop-blur">
            <div className="flex gap-1.5 overflow-x-auto bg-white border border-slate-200 rounded-2xl p-1.5">
              {FINANCE_TABS.map((x) => {
                const n =
                  x.key === 'attention'
                    ? (data.pending || []).length
                    : x.key === 'transactions'
                    ? data.entries.length
                    : x.key === 'payouts'
                    ? data.payouts.length
                    : 0;
                return (
                  <button
                    key={x.key}
                    type="button"
                    onClick={() => setTab(x.key)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition ${
                      tab === x.key ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {x.label}
                    {n > 0 && (
                      <span
                        className={`min-w-[18px] px-1 rounded-full text-[10px] text-center ${
                          x.key === 'attention' ? 'bg-amber-500 text-white' : tab === x.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {n}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {tab === 'reserve' && (
            <>
{/* ── Reserve pool ── */}
          <div className="bg-white rounded-3xl border border-indigo-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-indigo-100 bg-indigo-50/60 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold text-indigo-950 text-sm flex items-center gap-2">
                  <Landmark className="w-4 h-4" /> Reserve pool
                </div>
                <div className="text-[11px] text-indigo-900/70 mt-0.5">
                  Kept aside in the same Binance account, half each. Used only when someone’s wallet is not enough for a seller withdrawal. It never fills by itself.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setReserveMode('add')}
                  disabled={!data.partnersOk || !!reserveWaiting}
                  className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Put money in
                </button>
                <button
                  onClick={() => setReserveMode('take')}
                  disabled={!data.partnersOk || !!reserveWaiting || !(reserve.balanceUSDT > 0)}
                  className="px-3 py-2 rounded-xl bg-white border border-indigo-300 text-indigo-800 text-xs font-bold disabled:opacity-50"
                >
                  Move back to wallets
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
              <div className="p-5">
                <div className="text-[10px] uppercase font-bold text-slate-400">In the reserve now</div>
                <p className="text-2xl font-black text-indigo-700 mt-1 tabular-nums">{usdt(reserve.balanceUSDT)}</p>
                {reserveWaiting && (
                  <div className="mt-2">
                    <WaitingTag approval={reserveWaiting} />
                  </div>
                )}
              </div>
              <div className="p-5">
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1.5">Whose money it is</div>
                {reserve.halves.map((h) => (
                  <div key={h.id} className="flex items-center justify-between text-xs py-0.5">
                    <span className="font-bold text-slate-900">{h.name}</span>
                    <span className="font-black tabular-nums text-slate-700">{usdt(h.amountUSDT)}</span>
                  </div>
                ))}
              </div>
              <div className="p-5">
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1.5">Paid for others, still to come back</div>
                {reserve.owed.length === 0 ? (
                  <p className="text-xs text-slate-400">Nothing. Nobody owes the reserve.</p>
                ) : (
                  <>
                    {reserve.owed.map((o) => (
                      <div key={o.userId} className="flex items-center justify-between text-xs py-0.5">
                        <span className="font-bold text-slate-900">{o.name}</span>
                        <span className="font-black tabular-nums text-red-600">{usdt(o.amountUSDT)}</span>
                      </div>
                    ))}
                    <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                      When they earn again, this comes back to the partners’ wallets, half each (not into the reserve).
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="border-t border-slate-100">
              <button onClick={() => setShowReserveHistory((v) => !v)} className="w-full px-5 py-3 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center justify-between">
                <span>Reserve history ({reserve.history.length})</span>
                <span className="text-slate-400">{showReserveHistory ? 'Hide' : 'Show'}</span>
              </button>
              {showReserveHistory && (
                <div className="overflow-x-auto border-t border-slate-100">
                  <table className="w-full text-xs min-w-[640px]">
                    <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase">
                      <tr>
                        <th className="text-left px-5 py-2.5">Date</th>
                        <th className="text-left px-3 py-2.5">What happened</th>
                        <th className="text-left px-3 py-2.5">Details</th>
                        <th className="text-right px-3 py-2.5">Amount</th>
                        <th className="text-right px-5 py-2.5">Reserve after</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reserve.history.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400">
                            Nothing yet. Use “Put money in” to start the reserve.
                          </td>
                        </tr>
                      )}
                      {[...reserve.history].reverse().map((h, i) => {
                        const tp = RESERVE_TYPE[h.type] || RESERVE_TYPE.used;
                        return (
                          <tr key={i} className="hover:bg-slate-50/60">
                            <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{day(h.date)}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${tp.cls}`}>{tp.label}</span>
                            </td>
                            <td className="px-3 py-2.5 text-slate-600">
                              {h.type === 'used' && (
                                <>
                                  For <b className="text-slate-900">{h.name}</b>
                                  {h.storeName ? ` — withdrawal of ${h.storeName}` : ''}
                                </>
                              )}
                              {h.type === 'returned' && (
                                <>
                                  From <b className="text-slate-900">{h.name}</b>
                                  {h.storeName ? ` — deposit of ${h.storeName}` : ''}
                                </>
                              )}
                              {(h.type === 'add_wallets' || h.type === 'add_pocket' || h.type === 'take') && <>{h.by ? `By ${h.by}` : 'Half each'}</>}
                              {h.note && <div className="text-[10px] text-slate-400 mt-0.5">{h.note}</div>}
                            </td>
                            <td className={`px-3 py-2.5 text-right tabular-nums font-black ${tp.sign === '+' ? 'text-emerald-600' : tp.sign === '-' ? 'text-red-600' : 'text-slate-500'}`}>
                              {tp.sign}
                              {fmt(h.amountUSDT)}
                            </td>
                            <td className="px-5 py-2.5 text-right tabular-nums font-bold text-slate-800">{usdt(h.balanceAfterUSDT)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

                      </>
          )}

          {tab === 'overview' && (
            <>
{/* ── People in minus: what the partners can really use today ── */}
          {(t.membersMinusCount || 0) > 0 && (
            <div className="bg-white rounded-3xl border border-red-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-red-100 bg-red-50/60 flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-red-900 text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>
                    {t.membersMinusCount} {t.membersMinusCount === 1 ? 'person is' : 'people are'} in minus: {usdt(t.membersMinusUSDT)} owed
                  </span>
                </div>
                <span className="text-[11px] text-red-900/70">
                  {(t.minusPaidByReserveUSDT || 0) > 0
                    ? `${usdt(t.minusPaidByReserveUSDT)} was paid by the reserve, ${usdt(t.minusCarriedUSDT)} by the partners’ wallets. It comes back from their next deposits.`
                    : 'This money is not in Binance. It comes back from their next deposits.'}
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
                <div className="lg:col-span-2 p-5">
                  <div className="text-[10px] uppercase font-bold text-slate-400 mb-2">Who is in minus</div>
                  <div className="space-y-1.5">
                    {(data.membersInMinus || []).map((m) => (
                      <div key={m.userId} className="text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">
                            {m.name}
                            {m.isPartner && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[9px] font-bold uppercase">Partner</span>}
                          </span>
                          <span className="font-black text-red-600 tabular-nums">-{fmt(m.owesUSDT)}</span>
                        </div>
                        {(m.paidByReserveUSDT || 0) > 0 && (
                          <div className="text-[10px] text-slate-500">
                            Reserve paid {fmt(m.paidByReserveUSDT)}
                            {(m.carriedByPartnersUSDT || 0) > 0.000001 ? ` • partners’ wallets ${fmt(m.carriedByPartnersUSDT)}` : ''}
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-xs pt-2 mt-2 border-t border-slate-100">
                      <span className="font-bold text-slate-600">Total in minus</span>
                      <span className="font-black text-red-700 tabular-nums">-{fmt(t.membersMinusUSDT)}</span>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-3 p-5">
                  <div className="text-[10px] uppercase font-bold text-slate-400 mb-2">Partners: share, and what can be taken out now</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[420px]">
                      <thead className="text-slate-500 text-[10px] uppercase">
                        <tr>
                          <th className="text-left py-1.5">Partner</th>
                          <th className="text-right py-1.5 px-2">Share</th>
                          <th className="text-right py-1.5 px-2">Paid for people in minus</th>
                          <th className="text-right py-1.5 pl-2">Can take out now</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.wallets
                          .filter((w) => partners.some((p) => p.id === w.userId))
                          .map((w) => (
                            <tr key={w.userId}>
                              <td className="py-2 font-bold text-slate-900">{w.name}</td>
                              <td className="py-2 px-2 text-right tabular-nums text-slate-600">{usdt(w.balanceUSDT)}</td>
                              <td className="py-2 px-2 text-right tabular-nums text-red-600 font-bold">-{fmt(w.heldForMembersUSDT)}</td>
                              <td className={`py-2 pl-2 text-right tabular-nums font-black text-sm ${w.availableUSDT < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                                {usdt(w.availableUSDT)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-slate-200 font-black">
                          <td className="py-2">Both partners</td>
                          <td className="py-2 px-2 text-right tabular-nums">{usdt(t.partnersBookUSDT)}</td>
                          <td className="py-2 px-2 text-right tabular-nums text-red-700">-{fmt(t.minusCarriedUSDT ?? t.membersMinusUSDT)}</td>
                          <td className="py-2 pl-2 text-right tabular-nums text-sm">{usdt(t.partnersAvailableUSDT)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
                    Binance holds <b className="text-slate-800">{usdt(t.balanceUSDT)}</b>
                    {(t.membersPlusUSDT || 0) > 0 ? (
                      <>
                        , of which <b className="text-slate-800">{usdt(t.membersPlusUSDT)}</b> belongs to members with a positive wallet
                      </>
                    ) : null}
    . The partners&apos; shares add up to <b className="text-slate-800">{usdt(t.partnersBookUSDT)}</b>
                    {(t.minusCarriedUSDT ?? t.membersMinusUSDT) > 0.000001 ? (
                      <>
                        , but <b className="text-slate-800">{usdt(t.minusCarriedUSDT ?? t.membersMinusUSDT)}</b> of that was paid for people in minus (the
                        part the reserve did not pay), so <b className="text-slate-800">{usdt(t.partnersAvailableUSDT)}</b> can be taken out today
                      </>
                    ) : (
                      <>
                        {' '}
                        and all of it can be taken out today: the reserve paid the whole minus
                      </>
                    )}
                    . Nobody&apos;s share is reduced: when the minus comes back, the full share can be taken out.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── What sellers can still ask for ── */}
          <StoreWalletsCard liability={liability} binanceUSDT={t.balanceUSDT} />

          {/* ── Charts: who owns what, money in / out ── */}
          <BinanceShareCharts data={data} reserveInUse={reserveInUse} />

          {/* ── Whose money is it ── */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Whose share is in Binance</h3>
                <p className="text-[11px] text-slate-500">
                  Each person’s part of the {usdt(t.balanceUSDT)} in Binance: earned − withdrawals share − payouts = share.
                </p>
              </div>
            </div>
            {/* phones: one card per person */}
            <div className="md:hidden p-3 grid grid-cols-1 gap-3">
              {data.wallets.map((w) => (
                <ShareCard
                  key={w.userId}
                  w={w}
                  partner={partnerIds.has(w.userId)}
                  reserveInUse={reserveInUse}
                  reserveCol={reserveCol}
                  totalPlus={data.wallets.reduce((s2, x) => s2 + Math.max(0, x.balanceUSDT || 0), 0)}
                />
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs min-w-[640px]">
                <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase">
                  <tr>
                    <th className="text-left px-5 py-2.5">Person</th>
                    <th className="text-right px-3 py-2.5">Earned from deposits</th>
                    <th className="text-right px-3 py-2.5">Bonuses</th>
                    <th className="text-right px-3 py-2.5">Share of seller withdrawals</th>
                    <th className="text-right px-3 py-2.5">Payouts taken</th>
                    {reserveInUse && <th className="text-right px-3 py-2.5">Reserve (in / out / came back)</th>}
                    <th className="text-right px-3 py-2.5">Share (balance)</th>
                    <th className="text-right px-5 py-2.5">Can take out now</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.wallets.map((w) => (
                    <tr key={w.userId} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-black shrink-0" style={{ background: colorForSlot(data.wallets.indexOf(w)) }}>
                            {String(w.name || '?').charAt(0).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <b className="text-slate-900">{w.name}</b>
                            <div>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">{dealText(w)}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="text-right px-3 py-3 font-bold tabular-nums">{money(w.earnedUSDT)}</td>
                      <td className="text-right px-3 py-3 font-bold tabular-nums">{money(w.bonusUSDT - w.bonusCostUSDT)}</td>
                      <td className="text-right px-3 py-3 font-bold tabular-nums">{money(-w.sellerWithdrawUSDT)}</td>
                      <td className="text-right px-3 py-3 font-bold tabular-nums">{money(-w.payoutUSDT)}</td>
                      {reserveInUse && (
                        <td className="text-right px-3 py-3 font-bold tabular-nums">
                          {partnerIds.has(w.userId) ? money(reserveCol(w)) : <span className="text-slate-300">—</span>}
                          {(w.reserveReturnUSDT || 0) > 0 && <div className="text-[10px] font-semibold text-slate-400">{fmt(w.reserveReturnUSDT)} came back</div>}
                        </td>
                      )}
                      <td className={`text-right px-3 py-3 font-black text-sm tabular-nums ${w.balanceUSDT < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                        {usdt(w.balanceUSDT)}
                      </td>
                      <td className={`text-right px-5 py-3 font-black text-sm tabular-nums ${(w.availableUSDT ?? w.balanceUSDT) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                        {usdt(w.availableUSDT ?? w.balanceUSDT)}
                        {(w.heldForMembersUSDT || 0) > 0 && (
                          <div className="text-[10px] font-semibold text-slate-400">{fmt(w.heldForMembersUSDT)} paid for people in minus</div>
                        )}
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
                    {reserveInUse && <td className="text-right px-3 py-3 tabular-nums">{money(data.wallets.reduce((s2, w) => s2 + reserveCol(w), 0))}</td>}
                    <td className="text-right px-3 py-3 text-sm tabular-nums">{usdt(t.walletsUSDT)}</td>
                    <td className="text-right px-5 py-3 text-sm tabular-nums">{reserveInUse ? <span className="text-slate-300">—</span> : usdt(t.balanceUSDT)}</td>
                  </tr>
                  {reserveInUse && (
                    <tr className="bg-slate-50 text-[11px] text-slate-600">
                      <td colSpan={8} className="px-5 pb-3">
                        All wallets <b>{usdt(t.walletsUSDT)}</b> + reserve <b>{usdt(t.reserveUSDT)}</b>
                        {(t.reserveOwedUSDT || 0) > 0 ? (
                          <>
                            {' '}
                            + paid by the reserve for people in minus <b>{usdt(t.reserveOwedUSDT)}</b>
                          </>
                        ) : null}{' '}
                        = in Binance <b className="text-slate-900">{usdt(t.balanceUSDT)}</b>
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          </div>

                      </>
          )}

          {tab === 'attention' && (
            <>
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

                      </>
          )}

          {tab === 'transactions' && (
            <>
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
              <div className="font-bold text-slate-500">
                <span className="block text-[10px] uppercase mb-1">Type</span>
                <div className="flex gap-1 flex-wrap">
                  {[
                    { k: 'all', l: 'All', n: allEntries.length },
                    { k: 'deposit', l: 'Deposits', n: allEntries.filter((x) => x.kind === 'deposit').length },
                    { k: 'seller_withdrawal', l: 'Withdrawals', n: allEntries.filter((x) => x.kind === 'seller_withdrawal').length },
                    { k: 'bonus', l: 'Bonuses', n: allEntries.filter((x) => x.kind === 'bonus').length },
                  ].map((c) => (
                    <button
                      key={c.k}
                      type="button"
                      onClick={() => setFType(c.k)}
                      className={`px-2.5 py-2 rounded-xl border text-xs font-bold whitespace-nowrap ${fType === c.k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                    >
                      {c.l} <span className="opacity-60">{c.n}</span>
                    </button>
                  ))}
                </div>
              </div>
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

            {/* phones: one card per entry */}
            <div className="md:hidden divide-y divide-slate-100">
              {rows.length === 0 && <p className="py-10 text-center text-xs text-slate-400">{allEntries.length === 0 ? 'Nothing counted yet.' : 'No entries match these filters.'}</p>}
              {shownRows.map((e) => {
                const ms = memberShare(e);
                return (
                  <div key={e.id} className="px-4 py-3 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <b className="text-slate-900">{e.storeName}</b>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${KIND_STYLE[e.kind]}`}>{KIND_LABEL[e.kind]}</span>
                          {e.manual && <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[9px] font-bold uppercase">Manual</span>}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {day(e.date)} • {e.owner ? e.owner.name : '—'}
                          {e.inr > 0 ? ` • ₹${fmt(e.inr, 0)} @ ${e.rate}` : ''}
                        </div>
                        {waitingByEntry.has(e.id) && (
                          <div className="mt-1">
                            <WaitingTag approval={waitingByEntry.get(e.id)} />
                          </div>
                        )}
                      </div>
                      <div className={`text-sm font-black tabular-nums shrink-0 ${e.kind === 'deposit' ? 'text-emerald-600' : e.kind === 'bonus' ? 'text-amber-600' : 'text-red-600'}`}>
                        {e.kind === 'deposit' ? '+' : e.kind === 'bonus' ? '' : '−'}
                        {fmt(e.usdt)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[11px]">
                      {partners.map((p) => (
                        <span key={p.id} className="text-slate-500">
                          {p.name}: <b>{money(shareOf(e, p.id), 2)}</b>
                        </span>
                      ))}
                      {ms && (
                        <span className="text-slate-500">
                          {ms.name}: <b>{money(ms.value, 2)}</b>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden md:block overflow-x-auto">
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
                  {shownRows.map((e) => {
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
                            {(e.reserveCovers || []).map((c) => (
                              <div key={c.userId} className="text-[10px] text-indigo-700 mt-0.5">
                                Reserve paid {fmt(c.amountUSDT)} for {c.name} (wallet was short)
                              </div>
                            ))}
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
            {rows.length > shown && (
              <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-500">
                  Showing {shown} of {rows.length} • the totals count all {rows.length}
                </span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShown((n) => n + PAGE)} className="px-3 py-2 rounded-xl bg-slate-900 text-white font-bold">
                    Show {Math.min(PAGE, rows.length - shown)} more
                  </button>
                  <button type="button" onClick={() => setShown(rows.length)} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold">
                    Show all
                  </button>
                </div>
              </div>
            )}
          </div>

            </>
          )}

          {tab === 'payouts' && (
            <div className="space-y-4">
              {/* who took how much */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="bg-white rounded-3xl border border-slate-200 p-5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Paid out to the team</div>
                  <p className="text-2xl font-black text-amber-600 tabular-nums mt-1">{usdt(t.payoutUSDT)}</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {data.payouts.length} payout{data.payouts.length === 1 ? '' : 's'} counted
                    {(data.reversedPayouts || []).length ? ` • ${data.reversedPayouts.length} reversed (not counted)` : ''}
                  </p>
                  <div className="mt-3 p-3 rounded-2xl bg-slate-50 border border-slate-100 text-[11px] text-slate-600 leading-relaxed space-y-1">
                    <p>
                      <b className="text-slate-800">Your own payout</b> (Wallet → Record payout) is counted at once and lowers only your wallet.
                    </p>
                    <p>
                      <b className="text-slate-800">A member</b> can only ask: pay on Binance first, then approve the request above.
                    </p>
                    <p>
                      <b className="text-slate-800">Reverse</b> a payout written by mistake: the other partner approves, the row stays for the record.
                    </p>
                  </div>
                </div>
                <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-5">
                  <h3 className="text-sm font-bold text-slate-900">Payouts per person</h3>
                  <p className="text-[11px] text-slate-400 mb-3">Real USDT taken out of Binance, all time</p>
                  <BarList
                    items={Object.values(
                      data.payouts.reduce((acc, p) => {
                        const k = String(p.userId || p.name);
                        acc[k] = acc[k] || { id: k, name: p.name, value: 0, n: 0 };
                        acc[k].value += Number(p.amountUSDT) || 0;
                        acc[k].n += 1;
                        return acc;
                      }, {})
                    )
                      .sort((x, y) => y.value - x.value)
                      .map((x) => ({ ...x, color: '#eda100', sub: `${x.n} payout${x.n === 1 ? '' : 's'}` }))}
                    format={(v) => usdt(v)}
                    emptyText="No payouts yet"
                  />
                </div>
              </div>

              {/* every payout */}
              <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-900 text-sm">Every payout ({data.payouts.length})</h3>
                  <p className="text-[11px] text-slate-500">Newest first</p>
                </div>
                {data.payouts.length === 0 ? (
                  <p className="py-12 text-center text-xs text-slate-400">No payouts recorded yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {[...data.payouts].reverse().map((p) => (
                      <div key={p.id} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs hover:bg-slate-50/60">
                        <span className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-black shrink-0">{String(p.name || '?').charAt(0)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900">{p.name}</div>
                          <div className="text-[11px] text-slate-500">
                            {day(p.date)}
                            {p.processedBy ? ` • recorded by ${p.processedBy}` : ''}
                            {p.note ? ` • ${p.note}` : ''}
                          </div>
                          {waitingByEntry.get(p.id) && (
                            <div className="mt-1">
                              <WaitingTag approval={waitingByEntry.get(p.id)} />
                            </div>
                          )}
                        </div>
                        <span className="font-black text-amber-700 tabular-nums text-sm">−{fmt(p.amountUSDT)}</span>
                        {!waitingByEntry.get(p.id) && (
                          <button
                            disabled={busyId === p.id}
                            onClick={() => reversePayout(p)}
                            className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-[11px] font-bold hover:bg-red-50 hover:border-red-200 hover:text-red-700 disabled:opacity-60 flex items-center gap-1"
                            title="This payout was written by mistake or the money was never sent"
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Reverse
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* taken back: kept for the record, not counted */}
              {(data.reversedPayouts || []).length > 0 && (
                <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <Ban className="w-4 h-4 text-slate-400" /> Reversed payouts ({data.reversedPayouts.length})
                    </h3>
                    <p className="text-[11px] text-slate-500">Kept for the record. Not counted anywhere: the money went back to the wallet.</p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {[...data.reversedPayouts].reverse().map((p) => (
                      <div key={p.id} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-700">{p.name}</div>
                          <div className="text-[11px]">
                            Recorded {day(p.date)} • reversed {p.reversedAt ? day(p.reversedAt) : '—'}
                            {p.reversedBy ? ` by ${p.reversedBy}` : ''}
                          </div>
                          {p.reverseReason && <div className="text-[11px] text-slate-600 mt-0.5">Reason: {p.reverseReason}</div>}
                        </div>
                        <span className="font-bold tabular-nums line-through">{fmt(p.amountUSDT)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'attention' && (
            <>
              {(data.pending || []).length === 0 && (
                <div className="bg-white rounded-3xl border border-emerald-200 p-6 text-center">
                  <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto" />
                  <p className="text-sm font-bold text-slate-900 mt-2">Nothing waiting</p>
                  <p className="text-xs text-slate-500 mt-0.5">Every deposit and withdrawal has its real USDT and is counted.</p>
                </div>
              )}
              <HiddenEntries rows={data.skipped} busyId={busyId} onBringBack={(row) => act(row.id, 'unskip', {}, row.kind)} />
              <ExcludedTestSellers rows={data.excludedTest} />
            </>
          )}
          {tab === 'activity' && <ActivityLog tick={tick} defaultOpen />}
        </>
      )}

      {reserveMode && data && (
        <ReserveModal
          mode={reserveMode}
          data={data}
          onClose={() => setReserveMode('')}
          onSent={(message) => {
            setReserveMode('');
            setNotice(message);
            setTick((n) => n + 1);
          }}
        />
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
