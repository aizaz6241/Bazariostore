'use client';

import React, { useEffect, useState } from 'react';
import { Target, TrendingUp, Store, Copy, UserX, Timer } from 'lucide-react';
import { LineChart, LineLegend, DonutChart, BarList, CATEGORY_COLORS } from '@/components/Charts';
import { api, Card, StatTile, Segmented, Banner, Skeleton, fmtInt, fmtPct, inputClass } from '@/components/ui/kit';
import { STATUS, LOST_REASONS, sourceName } from './meta';

const ADDED = CATEGORY_COLORS[0];
const CONVERTED = STATUS.converted.color;

function change(now, before) {
  if (!before) return now ? 'new this period' : 'no change';
  const pct = ((now - before) / before) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}% vs the period before`;
}

/** Charts and numbers for the leads: funnel, conversion per member and per source, lost reasons. */
export default function LeadsAnalytics({ isAdmin, members = [], onFilter }) {
  const [days, setDays] = useState(30);
  const [memberId, setMemberId] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    api(`/api/leads/analytics?days=${days}${memberId ? `&memberId=${memberId}` : ''}`)
      .then((r) => !cancelled && setData(r))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [days, memberId]);

  if (error) return <Banner tone="danger">{error}</Banner>;
  if (!data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  const k = data.kpis;
  const funnelMax = Math.max(1, data.funnel[0]?.value || 0);
  const scopeName = memberId ? members.find((m) => m._id === memberId)?.name : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          size="sm"
          label="Period"
          value={days}
          onChange={setDays}
          options={[
            { value: 7, label: '7 days' },
            { value: 30, label: '30 days' },
            { value: 90, label: '90 days' },
          ]}
        />
        {isAdmin && (
          <div className="w-full sm:w-64">
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className={inputClass} aria-label="Whose leads">
            <option value="">Whole team</option>
            {members.map((m) => (
              <option key={m._id} value={m._id}>
                {m.name}
              </option>
            ))}
          </select>
          </div>
        )}
      </div>

      {/* warnings worth acting on */}
      {isAdmin && (k.ownerMismatch > 0 || k.stale > 0 || k.incomplete > 0) && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {k.stale > 0 && (
            <button type="button" onClick={() => onFilter?.('stale')} className="text-left">
              <Banner tone="warning" title={`${fmtInt(k.stale)} lead${k.stale === 1 ? '' : 's'} with no update for 14+ days`}>
                Ask the member, or give them to someone else. Tap to see them.
              </Banner>
            </button>
          )}
          {k.incomplete > 0 && (
            <button type="button" onClick={() => onFilter?.('incomplete')} className="text-left">
              <Banner tone="info" title={`${fmtInt(k.incomplete)} handover${k.incomplete === 1 ? '' : 's'} still without the seller’s number`}>
                Members have not added these sellers’ numbers yet. Tap to see them.
              </Banner>
            </button>
          )}
          {k.ownerMismatch > 0 && (
            <Banner tone="danger" title={`${fmtInt(k.ownerMismatch)} store${k.ownerMismatch === 1 ? '' : 's'} went to a different member`}>
              The lead was with one member but the store was assigned to another. Check these on the Sellers page.
            </Banner>
          )}
        </div>
      )}

      {/* headline numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon={Target} label={scopeName ? `${scopeName}'s leads` : isAdmin ? 'All leads' : 'My leads'} value={fmtInt(k.total)} sub={`${fmtInt(k.addedInPeriod)} added · ${change(k.addedInPeriod, k.prevAdded)}`} />
        <StatTile
          icon={TrendingUp}
          tone="green"
          label="Conversion rate"
          value={fmtPct(k.conversionRate)}
          sub={`${fmtInt(k.converted)} of ${fmtInt(k.assigned)} given leads registered`}
        />
        <StatTile icon={Store} tone="green" label={`Stores in ${days} days`} value={fmtInt(k.convertedInPeriod)} sub={change(k.convertedInPeriod, k.prevConverted)} />
        <StatTile
          icon={Timer}
          tone="blue"
          label="Avg. time to convert"
          value={k.avgDaysToConvert === null ? '—' : `${k.avgDaysToConvert.toFixed(k.avgDaysToConvert < 10 ? 1 : 0)} days`}
          sub="From given to store registered"
        />
      </div>

      <div className="grid lg:grid-cols-5 gap-4 sm:gap-6">
        {/* funnel */}
        <Card title="Funnel" hint="How far the given leads got" className="lg:col-span-2">
          <ol className="space-y-3.5">
            {data.funnel.map((f, i) => {
              const prev = i ? data.funnel[i - 1].value : null;
              const pct = (f.value / funnelMax) * 100;
              const color = [STATUS.new.color, STATUS.contacted.color, STATUS.interested.color, STATUS.converted.color][i];
              return (
                <li key={f.key}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-700">{f.name}</span>
                    <span className="tabular-nums">
                      <span className="font-extrabold text-slate-900">{fmtInt(f.value)}</span>
                      {prev !== null && <span className="text-slate-400"> · {prev ? fmtPct((f.value / prev) * 100) : '—'} of previous</span>}
                    </span>
                  </div>
                  <div className="mt-1.5 h-3 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(f.value ? 2 : 0, pct)}%`, background: color }} />
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
            <Mini label="Open" value={k.open} />
            <Mini label="Not converted" value={k.notConverted} />
            <Mini label="Stale" value={k.stale} warn={k.stale > 0} />
          </div>
        </Card>

        {/* trend */}
        <Card
          title="Leads added vs stores registered"
          hint={`Per day, last ${days} days`}
          className="lg:col-span-3"
          right={
            <LineLegend
              items={[
                { name: 'Added', color: ADDED },
                { name: 'Registered', color: CONVERTED },
              ]}
            />
          }
        >
          <LineChart
            labels={data.labels}
            series={[
              { key: 'added', name: 'Added', color: ADDED, values: data.added },
              { key: 'converted', name: 'Registered', color: CONVERTED, values: data.converted },
            ]}
            format={(v) => fmtInt(v)}
            height={240}
            ariaLabel={`Leads added and stores registered per day over ${days} days`}
          />
        </Card>
      </div>

      {/* members */}
      {isAdmin && !memberId && (
        <Card title="Members" hint="Who converts the leads they are given. Sorted by stores registered.">
          {data.members.length ? (
            <div className="overflow-x-auto -mx-4 sm:-mx-6">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-left text-[11px] text-slate-500 border-b border-slate-100">
                    <th className="font-semibold px-4 sm:px-6 py-2">Member</th>
                    <th className="font-semibold px-3 py-2 text-right">Leads</th>
                    <th className="font-semibold px-3 py-2 text-right">Open</th>
                    <th className="font-semibold px-3 py-2 text-right">Contacted</th>
                    <th className="font-semibold px-3 py-2 text-right">Stores</th>
                    <th className="font-semibold px-3 py-2 text-right">Lost</th>
                    <th className="font-semibold px-3 py-2 w-40">Conversion</th>
                    <th className="font-semibold px-3 py-2 text-right">Avg. days</th>
                    <th className="font-semibold px-4 sm:px-6 py-2 text-right">Stale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.members.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/70">
                      <td className="px-4 sm:px-6 py-3">
                        <p className="font-semibold text-slate-900 truncate">{m.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {m.role === 'admin' ? 'Partner' : 'Member'}
                          {m.selfAdded ? ` · ${fmtInt(m.selfAdded)} found himself` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold">{fmtInt(m.total)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600">{fmtInt(m.open)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600">{fmtInt(m.contacted)}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-bold text-emerald-700">{fmtInt(m.converted)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600">{fmtInt(m.notConverted)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, m.rate)}%`, background: CONVERTED }} />
                          </div>
                          <span className="text-xs font-bold tabular-nums w-10 text-right">{fmtPct(m.rate)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600">{m.avgDays === null ? '—' : m.avgDays.toFixed(1)}</td>
                      <td className="px-4 sm:px-6 py-3 text-right tabular-nums">
                        {m.stale ? <span className="font-bold text-red-600">{fmtInt(m.stale)}</span> : <span className="text-slate-300">0</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-6 text-center">No lead has been given to a member yet.</p>
          )}
        </Card>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <Card title="Where the leads come from" hint="Leads per source, and how many became stores">
          <BarList
            items={data.sources.map((s) => ({ id: s.id, name: sourceName(s.name), value: s.total, sub: `${fmtInt(s.converted)} stores · ${fmtPct(s.rate)} conversion` }))}
            format={fmtInt}
            emptyText="No leads yet"
          />
        </Card>
        <Card title="Why leads did not convert" hint="Reason chosen when a lead was closed">
          <DonutChart
            slices={data.lost.map((l, i) => ({ id: l.id, name: LOST_REASONS[l.name] || l.name, value: l.value, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }))}
            format={fmtInt}
            totalLabel="Not converted"
            emptyText="No lead was closed as not converted"
            vertical
          />
        </Card>
        <Card title="Given by admins vs found by members" hint="Conversion of each kind of lead">
          <div className="space-y-4">
            {['admin', 'member'].map((o) => {
              const row = data.origins.find((x) => x.id === o) || { total: 0, converted: 0, rate: 0 };
              return (
                <div key={o}>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="font-semibold text-slate-700">{o === 'admin' ? 'Given by admins' : 'Found by members'}</span>
                    <span className="tabular-nums text-slate-500">
                      <span className="font-extrabold text-slate-900">{fmtPct(row.rate)}</span> · {fmtInt(row.converted)}/{fmtInt(row.total)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, row.rate)}%`, background: o === 'admin' ? ADDED : '#7c3aed' }} />
                  </div>
                </div>
              );
            })}
            {isAdmin && k.duplicateAttempts !== undefined && (
              <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                <span className="w-8 h-8 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
                  <Copy className="w-4 h-4" />
                </span>
                <div className="text-xs">
                  <p className="font-bold text-slate-900">{fmtInt(k.duplicateAttempts)} double-contact attempts blocked</p>
                  <p className="text-slate-500">Someone tried to add or check a seller that another member already has.</p>
                </div>
              </div>
            )}
            {isAdmin && !memberId && k.unassigned > 0 && (
              <button type="button" onClick={() => onFilter?.('unassigned')} className="flex items-center gap-3 w-full text-left">
                <span className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
                  <UserX className="w-4 h-4" />
                </span>
                <span className="text-xs">
                  <span className="block font-bold text-slate-900">{fmtInt(k.unassigned)} leads in the pool</span>
                  <span className="text-slate-500">Not given to anyone yet. Tap to give them out.</span>
                </span>
              </button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Mini({ label, value, warn }) {
  return (
    <div>
      <p className={`text-lg font-extrabold tabular-nums ${warn ? 'text-red-600' : 'text-slate-900'}`}>{fmtInt(value)}</p>
      <p className="text-[11px] text-slate-500 font-semibold">{label}</p>
    </div>
  );
}
