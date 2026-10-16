'use client';

import React, { useMemo } from 'react';
import { Smartphone, UserRound } from 'lucide-react';
import { Avatar, Pill, EmptyState, Skeleton, fmtInt } from '@/components/ui/kit';
import { NUMBER_STATUS, APP_TYPES } from './meta';

/**
 * Who has which number on which mobile: every member, his mobiles, and the numbers logged in
 * on each one (main phone or linked device, Business or normal WhatsApp). Only numbers that are
 * still active or banned-but-not-replaced are shown (a replaced number has no holders).
 */
export default function NumbersByMember({ numbers = [], loading, onOpen }) {
  const people = useMemo(() => {
    const byMember = new Map();
    for (const n of numbers) {
      for (const h of n.holders || []) {
        const p = byMember.get(h.memberId) || { memberId: h.memberId, name: h.name, mobiles: new Map(), count: 0, bought: 0 };
        const device = (h.device || '').trim() || 'Mobile not set';
        const list = p.mobiles.get(device) || [];
        list.push({ n, primary: h.primary });
        p.mobiles.set(device, list);
        p.count += 1;
        byMember.set(h.memberId, p);
      }
    }
    for (const n of numbers) {
      const id = n.purchasedBy?.memberId;
      if (id && byMember.has(String(id))) byMember.get(String(id)).bought += 1;
    }
    return [...byMember.values()]
      .map((p) => ({
        ...p,
        mobiles: [...p.mobiles.entries()].sort((a, b) => (a[0] === 'Mobile not set') - (b[0] === 'Mobile not set') || a[0].localeCompare(b[0])),
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [numbers]);

  if (loading) {
    return (
      <div className="grid md:grid-cols-2 gap-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    );
  }
  if (!people.length) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200/80">
        <EmptyState icon={UserRound} title="No numbers given out yet" text="Link numbers to members from a number's page; they show up here by member and mobile." />
      </div>
    );
  }

  return (
    <ul className="grid md:grid-cols-2 gap-3">
      {people.map((p) => (
        <li key={p.memberId} className="bg-white rounded-3xl border border-slate-200/80 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <Avatar name={p.name} />
            <div className="min-w-0 flex-1">
              <p className="font-extrabold text-slate-900 truncate">{p.name}</p>
              <p className="text-[11px] text-slate-500">
                {fmtInt(p.count)} number{p.count === 1 ? '' : 's'} on {fmtInt(p.mobiles.filter(([d]) => d !== 'Mobile not set').length)} mobile
                {p.mobiles.length === 1 ? '' : 's'}
                {p.bought ? ` · bought ${fmtInt(p.bought)}` : ''}
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {p.mobiles.map(([device, list]) => (
              <div key={device} className="rounded-2xl border border-slate-200/80 overflow-hidden">
                <p className={`px-3 py-2 text-xs font-bold flex items-center gap-1.5 ${device === 'Mobile not set' ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-700'}`}>
                  <Smartphone className="w-3.5 h-3.5" /> {device}
                </p>
                <ul className="divide-y divide-slate-100">
                  {list.map(({ n, primary }) => (
                    <li key={n._id}>
                      <button type="button" onClick={() => onOpen?.(n._id)} className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-50">
                        <span className="font-bold text-sm text-slate-900 tabular-nums truncate">{n.number}</span>
                        {n.label && <span className="text-[11px] text-slate-500 truncate">{n.label}</span>}
                        <span className="ml-auto flex items-center gap-1.5 shrink-0">
                          {n.appType && <Pill color={APP_TYPES[n.appType].color}>{APP_TYPES[n.appType].short}</Pill>}
                          <span className="text-[10px] text-slate-400">{primary ? 'Main' : 'Linked'}</span>
                          {n.status !== 'active' && <Pill color={NUMBER_STATUS[n.status].color}>{NUMBER_STATUS[n.status].label}</Pill>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
