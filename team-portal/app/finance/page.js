'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  Undo2,
} from 'lucide-react';

const fmt = (n, d = 2) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const usdt = (n) => `₮${fmt(n)}`;
const day = (d) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const REASONS = {
  usdt: 'Real Binance USDT not entered yet',
  auto_default: 'USDT was auto-filled (90 rate) — enter the real amount',
  pkr_rate: 'PKR member: INR amount and that day’s PKR rate are needed',
  partners: 'Exactly 2 active admins are required before this can be split',
  bonus_rate: 'Milestone bonus: enter that day’s PKR rate to convert it to USDT',
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
  if (!owner) return 'Unassigned → both partners';
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

export default function FinancePage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [editId, setEditId] = useState('');
  const [showSkipped, setShowSkipped] = useState(false);

  const load = useCallback(async (fresh = false) => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('portal_token');
      const res = await fetch(`/api/finance${fresh ? '?fresh=1' : ''}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to load finance ledger');
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') load();
  }, [user, load]);

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
      setData(json);
      setEditId('');
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
  const mismatch = Math.abs(t.diffUSDT || 0) > 0.01;
  const short = (liability.totalUSD || 0) > (t.balanceUSDT || 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Landmark className="w-7 h-7 text-emerald-600" />
            <span>Binance Finance</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Real USDT only. Test accounts, helping amounts and anything before {data ? day(data.start) : '…'} are not counted.
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center gap-1.5 text-xs"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs font-semibold text-red-700">{error}</div>
      )}

      {data && !data.partnersOk && (
        <div className="p-4 bg-red-50 border border-red-300 rounded-2xl text-xs text-red-800 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <b>Splits are paused: exactly 2 active admins are required, found {data.partners.length}.</b>
            <div className="mt-1">
              Active admins: {data.partners.map((p) => `${p.name}${p.email ? ` (${p.email})` : ''}`).join(', ') || 'none'}.
              Remove or deactivate the extra account in the store admin panel (Staff), then refresh.
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
                  ? `Wallets add up to ${usdt(t.walletsUSDT)} (difference ${usdt(t.diffUSDT)})`
                  : 'Matches the sum of all wallets'}
              </p>
            </div>
          </div>

          {/* ── What sellers can still ask for ── */}
          <div className={`p-4 rounded-3xl border text-xs flex flex-wrap items-center gap-x-6 gap-y-1 ${short ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-white border-slate-200 text-slate-700'}`}>
            <span className="font-bold">Seller store wallets (what they can still ask to withdraw):</span>
            <span>
              <b>${fmt(liability.totalUSD)}</b> across {liability.sellerCount} real sellers
            </span>
            <span>
              Already requested, waiting: <b>${fmt(liability.pendingWithdrawalUSD)}</b>
            </span>
            {short && <span className="font-bold">More than the USDT in Binance — keep enough back before paying team payouts.</span>}
          </div>

          {/* ── Whose money is it ── */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 font-bold text-slate-900 text-sm">
              Whose share is in Binance
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
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
                    <tr key={w.userId}>
                      <td className="px-5 py-3">
                        <b className="text-slate-900">{w.name}</b>
                        <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                          {w.role === 'partner' ? 'Partner' : w.deal === 'inr_50' ? '50% member' : '1:1 PKR member'}
                        </span>
                      </td>
                      <td className="text-right px-3 py-3 text-emerald-700 font-bold">+{fmt(w.earnedUSDT)}</td>
                      <td className={`text-right px-3 py-3 font-bold ${w.bonusUSDT - w.bonusCostUSDT < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                        {w.bonusUSDT - w.bonusCostUSDT < 0 ? '-' : '+'}
                        {fmt(Math.abs(w.bonusUSDT - w.bonusCostUSDT))}
                      </td>
                      <td className="text-right px-3 py-3 text-red-600 font-bold">-{fmt(w.sellerWithdrawUSDT)}</td>
                      <td className="text-right px-3 py-3 text-amber-700 font-bold">-{fmt(w.payoutUSDT)}</td>
                      <td className={`text-right px-5 py-3 font-black text-sm ${w.balanceUSDT < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                        {usdt(w.balanceUSDT)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-black">
                    <td className="px-5 py-3">Total</td>
                    <td className="text-right px-3 py-3">+{fmt(t.inUSDT)}</td>
                    <td className="text-right px-3 py-3 text-slate-500">0.00</td>
                    <td className="text-right px-3 py-3">-{fmt(t.sellerOutUSDT)}</td>
                    <td className="text-right px-3 py-3">-{fmt(t.payoutUSDT)}</td>
                    <td className="text-right px-5 py-3 text-sm">{usdt(t.walletsUSDT)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Needs the real USDT ── */}
          {data.pending.length > 0 && (
            <div className="bg-amber-50/70 rounded-3xl border border-amber-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-amber-200 font-bold text-amber-900 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>Not counted yet — {data.pending.length} need a real amount or rate</span>
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
                        </span>
                      )}
                      {row.isManual && <span className="text-slate-500">• Direct add / manual</span>}
                      <span className="text-slate-500">• {ownerText(row.owner, row.previousStore, row.kind)}</span>
                    </div>
                    <div className="text-[11px] text-amber-800 mt-1">{REASONS[row.reason] || row.reason}</div>
                    {row.reason !== 'partners' && (
                      <div className="flex flex-wrap items-end gap-2">
                        <EntryForm row={row} busy={busyId === row.id} onSave={(v) => act(row.id, 'save', v, row.kind)} />
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => act(row.id, 'skip', {}, row.kind)}
                          className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-600 text-xs font-bold flex items-center gap-1"
                          title="Do not count this (for example a helping-only credit or an old bonus already settled)"
                        >
                          <EyeOff className="w-3.5 h-3.5" /> {row.kind === 'bonus' ? 'Do not count' : 'No real money'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Every counted movement ── */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 font-bold text-slate-900 text-sm">
              Counted deposits, seller withdrawals and bonuses ({data.entries.length})
            </div>
            {data.entries.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">Nothing counted yet.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {[...data.entries].reverse().map((e) => (
                  <div key={e.id} className="px-5 py-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <b className="text-slate-900">{e.storeName}</b>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${KIND_STYLE[e.kind]}`}>{KIND_LABEL[e.kind]}</span>
                        <span className="text-slate-500">{day(e.date)}</span>
                        {e.inr > 0 && (
                          <span className="text-slate-500">
                            ₹{fmt(e.inr, 0)} @ {e.rate}
                          </span>
                        )}
                        {e.kind === 'bonus' && (
                          <span className="text-slate-500">
                            Rs {fmt(e.amountPKR, 0)} @ {e.pkrRate}
                          </span>
                        )}
                        <span className="text-slate-500">• {ownerText(e.owner, e.previousStore, e.kind)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-black ${e.kind === 'deposit' ? 'text-emerald-600' : e.kind === 'bonus' ? 'text-amber-600' : 'text-red-600'}`}>
                          {e.kind === 'deposit' ? '+' : e.kind === 'bonus' ? '' : '-'}
                          {usdt(e.usdt)}
                        </span>
                        <button
                          onClick={() => setEditId(editId === e.id ? '' : e.id)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600"
                          title="Correct the amounts"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          disabled={busyId === e.id}
                          onClick={() => {
                            if (window.confirm('Recalculate this split from the seller’s current assignment?')) act(e.id, 'resplit', {}, e.kind);
                          }}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600"
                          title="Recalculate the split from the current assignment"
                        >
                          <Shuffle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {e.shares.map((s) => (
                        <span key={s.userId} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                          {s.name}: {e.kind === 'deposit' || (e.kind === 'bonus' && s.role === 'member') ? '+' : '-'}
                          {fmt(s.amountUSDT, 3)} ({Number(Number(s.pct).toFixed(2))}%)
                        </span>
                      ))}
                    </div>
                    {editId === e.id && (
                      <EntryForm row={e} busy={busyId === e.id} onSave={(v) => act(e.id, 'save', v, e.kind)} onCancel={() => setEditId('')} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Team payouts ── */}
          {data.payouts.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 font-bold text-slate-900 text-sm">
                Payouts to members / partners ({data.payouts.length})
              </div>
              <div className="divide-y divide-slate-100">
                {[...data.payouts].reverse().map((p) => (
                  <div key={p.id} className="px-5 py-3 text-xs flex items-center justify-between gap-3">
                    <div>
                      <b className="text-slate-900">{p.name}</b>
                      <span className="text-slate-500 ml-2">{day(p.date)}</span>
                      {p.note && <span className="text-slate-400 ml-2">• {p.note}</span>}
                    </div>
                    <span className="font-black text-amber-700">-{usdt(p.amountUSDT)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Marked as no real money ── */}
          {data.skipped.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
              <button
                onClick={() => setShowSkipped(!showSkipped)}
                className="w-full px-5 py-4 text-left font-bold text-slate-600 text-xs"
              >
                {showSkipped ? 'Hide' : 'Show'} {data.skipped.length} marked as “no real money”
              </button>
              {showSkipped && (
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {data.skipped.map((row) => (
                    <div key={row.id} className="px-5 py-3 text-xs flex items-center justify-between gap-3">
                      <div>
                        <b className="text-slate-800">{row.storeName}</b>
                        <span className="text-slate-500 ml-2">
                          {KIND_LABEL[row.kind]} • {day(row.date)} • {row.kind === 'bonus' ? `Rs ${fmt(row.amountPKR, 0)}` : `$${fmt(row.walletAmount)}`}
                        </span>
                      </div>
                      <button
                        disabled={busyId === row.id}
                        onClick={() => act(row.id, 'unskip', {}, row.kind)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 font-bold flex items-center gap-1"
                      >
                        <Undo2 className="w-3.5 h-3.5" /> Bring back
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
