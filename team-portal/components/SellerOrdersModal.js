'use client';

import React, { useEffect, useState } from 'react';
import { X, Package, Wallet, Lock } from 'lucide-react';

const usd = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// One store's pending orders (with items) and its store wallet: available + locked in orders.
export default function SellerOrdersModal({ seller, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  useEffect(() => {
    if (!seller?._id) return;
    let alive = true;
    setData(null);
    setError('');
    fetch(`/api/sellers/${seller._id}/orders`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${(() => { try { return localStorage.getItem('portal_token') || ''; } catch { return ''; } })()}` },
    })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.message || 'Could not load orders');
        return j;
      })
      .then((j) => alive && setData(j))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [seller?._id]);

  if (!seller) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-2xl max-h-[90vh] rounded-t-3xl sm:rounded-3xl shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900">{seller.storeName}</h3>
            <p className="text-xs text-slate-500">Pending orders & store wallet</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700"><Wallet className="w-3.5 h-3.5" /> Available</div>
              <div className="text-lg font-extrabold text-emerald-800">{usd(data ? data.wallet.available : seller.wallet?.balance)}</div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700"><Lock className="w-3.5 h-3.5" /> Locked in orders</div>
              <div className="text-lg font-extrabold text-amber-800">{usd(data ? data.wallet.locked : seller.wallet?.locked)}</div>
            </div>
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{error}</div>}
          {!data && !error && <div className="text-sm text-slate-500">Loading orders…</div>}
          {data && data.orders.length === 0 && <div className="text-sm text-slate-500">No pending orders.</div>}

          {data && data.orders.map((o) => (
            <div key={o._id} className="rounded-2xl border border-slate-200">
              <button type="button" onClick={() => setOpen(open === o._id ? null : o._id)} className="w-full flex items-center justify-between px-4 py-3 text-left">
                <div>
                  <div className="font-bold text-slate-900 text-sm">Order #{o.orderNumber}</div>
                  <div className="text-[11px] text-slate-500">
                    {new Date(o.createdAt).toLocaleString()} · {o.items.length} item{o.items.length === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-slate-900 text-sm">{usd(o.amount)}</div>
                  <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 capitalize">{String(o.status).replace(/_/g, ' ')}</span>
                </div>
              </button>
              {open === o._id && (
                <div className="border-t border-slate-100 divide-y divide-slate-100">
                  {o.items.map((it, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                      {it.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.image} alt="" className="w-10 h-10 rounded-lg object-cover bg-slate-100" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center"><Package className="w-4 h-4 text-slate-400" /></div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800 truncate">{it.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {[it.size, it.variant].filter(Boolean).join(' · ')}{(it.size || it.variant) ? ' · ' : ''}Qty {it.qty} × {usd(it.price)}
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">{String(it.status).replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
