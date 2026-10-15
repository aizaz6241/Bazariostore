'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Package, Wallet, Lock, Clock, AlertTriangle, ChevronDown, CheckCircle2, Loader2 } from 'lucide-react';

const usd = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const label = (s) => String(s || '').replace(/_/g, ' ');

function waitText(h) {
  if (h < 1) return 'just now';
  if (h < 48) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'}`;
}
// the store warns the seller after 24 h and freezes his store after 48 h
function urgency(h) {
  if (h >= 48) return { cls: 'bg-red-600 text-white', note: 'Over 48 h — store can be frozen' };
  if (h >= 24) return { cls: 'bg-red-100 text-red-700', note: `Freeze in ${48 - h} h` };
  if (h >= 12) return { cls: 'bg-amber-100 text-amber-800', note: `Warning in ${24 - h} h` };
  return { cls: 'bg-slate-100 text-slate-600', note: '' };
}

/**
 * One store's orders: the ones still waiting for the seller to confirm (with how long they have
 * waited and how much money he needs in his store wallet), and the ones on their way.
 */
export default function SellerOrdersModal({ seller, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('waiting');
  const [open, setOpen] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!seller?._id) return undefined;
    let alive = true;
    setData(null);
    setError('');
    setOpen(null);
    fetch(`/api/sellers/${seller._id}/orders`, {
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${(() => {
          try {
            return localStorage.getItem('portal_token') || '';
          } catch {
            return '';
          }
        })()}`,
      },
    })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.message || 'Could not load orders');
        return j;
      })
      .then((j) => {
        if (!alive) return;
        setData(j);
        setTab((j.waiting || []).length || !(j.inProgress || []).length ? 'waiting' : 'progress');
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [seller?._id]);

  if (!seller || !mounted) return null;

  const waiting = data?.waiting || [];
  const progress = data?.inProgress || [];
  const list = tab === 'waiting' ? waiting : progress;
  const alias = seller.assignment?.privateNotes?.customName || seller.privateNotes?.customName;
  const name = alias && alias !== seller.storeName ? alias : seller.storeName;

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={`${name} orders`}>
      <div className="bg-white w-full sm:max-w-2xl max-h-[92vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col animate-sheet-up" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-slate-100">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 text-base truncate">{name}</h3>
            <p className="text-xs text-slate-500 mt-0.5">Orders and store wallet{name !== seller.storeName ? ` · ${seller.storeName}` : ''}</p>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 rounded-xl hover:bg-slate-100 text-slate-500" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-4">
          {/* wallet */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Tile icon={Wallet} tone="emerald" label="Available" value={usd(data ? data.wallet.available : seller.wallet?.balance)} />
            <Tile icon={Lock} tone="slate" label="Locked in orders" short="Locked" value={usd(data ? data.wallet.locked : seller.wallet?.locked)} />
            <Tile icon={Clock} tone={data?.shortBy > 0 ? 'red' : 'amber'} label="Needed to confirm" short="Needed" value={data ? usd(data.needed) : '—'} />
          </div>

          {data && data.shortBy > 0 && (
            <div className="flex gap-3 p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-900">
              <AlertTriangle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
              <p className="text-[13px]">
                The seller needs <b>{usd(data.shortBy)}</b> more in his store wallet to confirm all waiting orders. Ask him to deposit, then confirm them in
                <b> Orders &amp; Dispatch</b>.
              </p>
            </div>
          )}

          {/* tabs */}
          <div className="inline-flex p-1 rounded-2xl bg-slate-100 w-full sm:w-auto" role="tablist">
            {[
              { k: 'waiting', t: 'Waiting for confirmation', n: waiting.length },
              { k: 'progress', t: 'Confirmed, on the way', n: progress.length },
            ].map((x) => (
              <button
                key={x.k}
                type="button"
                role="tab"
                aria-selected={tab === x.k}
                onClick={() => {
                  setTab(x.k);
                  setOpen(null);
                }}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition ${
                  tab === x.k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {x.t}
                <span className={`tabular-nums px-1.5 rounded-full text-[10px] ${tab === x.k ? (x.k === 'waiting' && x.n ? 'bg-amber-100 text-amber-800' : 'bg-slate-100') : 'bg-white/60'}`}>
                  {data ? x.n : '·'}
                </span>
              </button>
            ))}
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{error}</div>}
          {!data && !error && (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading orders…
            </div>
          )}
          {data && list.length === 0 && (
            <div className="flex flex-col items-center text-center py-8">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
              <p className="text-sm font-semibold text-slate-800">{tab === 'waiting' ? 'Nothing waiting' : 'No orders on the way'}</p>
              <p className="text-xs text-slate-500 mt-0.5">{tab === 'waiting' ? 'The seller has confirmed every order.' : 'Confirmed orders that are not delivered yet show here.'}</p>
            </div>
          )}

          <ul className="space-y-2.5">
            {list.map((o) => {
              const u = tab === 'waiting' ? urgency(o.waitingHours) : null;
              const isOpen = open === o._id;
              return (
                <li key={o._id} className={`rounded-2xl border ${u && o.waitingHours >= 24 ? 'border-red-200' : 'border-slate-200'}`}>
                  <button type="button" onClick={() => setOpen(isOpen ? null : o._id)} className="w-full flex items-center gap-3 px-4 py-3 text-left" aria-expanded={isOpen}>
                    <div className="flex -space-x-2 shrink-0">
                      {o.items.slice(0, 2).map((it, i) =>
                        it.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={i} src={it.image} alt="" className="w-9 h-9 rounded-lg object-cover bg-slate-100 border-2 border-white" />
                        ) : (
                          <span key={i} className="w-9 h-9 rounded-lg bg-slate-100 border-2 border-white flex items-center justify-center">
                            <Package className="w-4 h-4 text-slate-400" />
                          </span>
                        )
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 text-sm truncate">Order #{o.orderNumber}</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {new Date(o.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {o.items.length} item
                        {o.items.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-slate-900 text-sm tabular-nums">{usd(tab === 'waiting' ? o.toConfirm || o.amount : o.amount)}</div>
                      {u ? (
                        <span className={`inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${u.cls}`} title={u.note || undefined}>
                          <Clock className="w-3 h-3" /> waiting {waitText(o.waitingHours)}
                        </span>
                      ) : (
                        <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 capitalize">{label(o.status)}</span>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {u?.note && <p className={`px-4 -mt-1 pb-2.5 text-[11px] font-semibold ${o.waitingHours >= 24 ? 'text-red-600' : 'text-amber-700'}`}>{u.note}</p>}
                  {isOpen && (
                    <div className="border-t border-slate-100 divide-y divide-slate-100">
                      {o.items.map((it, i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                          {it.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={it.image} alt="" className="w-11 h-11 rounded-lg object-cover bg-slate-100" />
                          ) : (
                            <div className="w-11 h-11 rounded-lg bg-slate-100 flex items-center justify-center">
                              <Package className="w-4 h-4 text-slate-400" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-slate-800 truncate">{it.name}</div>
                            <div className="text-[11px] text-slate-500">
                              {[it.size, it.variant].filter(Boolean).join(' · ')}
                              {it.size || it.variant ? ' · ' : ''}Qty {it.qty} × {usd(it.price)}
                            </div>
                          </div>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                              it.confirmed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {it.confirmed ? label(it.status === 'pending' ? 'confirmed' : it.status) : 'not confirmed'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Tile({ icon: Icon, tone, label: text, short, value }) {
  const t = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 [&_b]:text-emerald-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-600 [&_b]:text-slate-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 [&_b]:text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-700 [&_b]:text-red-700',
  }[tone];
  return (
    <div className={`rounded-2xl border p-2.5 sm:p-3 min-w-0 ${t}`}>
      <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold truncate">
        <Icon className="w-3.5 h-3.5 shrink-0" /> {short ? (
          <>
            <span className="truncate sm:hidden">{short}</span>
            <span className="truncate hidden sm:inline">{text}</span>
          </>
        ) : (
          <span className="truncate">{text}</span>
        )}
      </div>
      <b className="block text-sm sm:text-lg font-extrabold tabular-nums truncate mt-0.5">{value}</b>
    </div>
  );
}
