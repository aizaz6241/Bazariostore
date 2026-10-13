'use client';

import React, { useEffect, useState } from 'react';
import { LineChart, LineLegend, ColumnChart, BarList, CATEGORY_COLORS } from '@/components/Charts';
import { api, Card, Banner, Skeleton, Pill, fmtInt, fmtMoney, fmtDate, Segmented } from '@/components/ui/kit';
import { NUMBER_STATUS } from './meta';

/** Costs, renewals, bans and lead use of the company WhatsApp numbers. */
export default function NumbersAnalytics({ onOpen }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [currency, setCurrency] = useState('');

  useEffect(() => {
    api('/api/numbers/analytics')
      .then((r) => {
        setData(r);
        setCurrency(r.spend?.[0]?.currency || '');
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <Banner tone="danger">{error}</Banner>;
  if (!data) {
    return (
      <div className="grid lg:grid-cols-2 gap-4">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const monthLabels = data.months.map((m) => ({ short: m.short, full: m.full }));
  const spend = data.spend.find((s) => s.currency === currency);
  const statusSlices = Object.entries(data.byStatus).filter(([, v]) => v > 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
        <Card
          title="Subscription paid per month"
          hint="From the renewals you recorded"
          right={
            data.spend.length > 1 ? (
              <Segmented size="sm" label="Currency" value={currency} onChange={setCurrency} options={data.spend.map((s) => ({ value: s.currency, label: s.currency }))} />
            ) : null
          }
        >
          {spend ? (
            <ColumnChart
              labels={monthLabels}
              series={[{ key: 'paid', name: `Paid (${currency})`, color: CATEGORY_COLORS[0], values: spend.values }]}
              format={(v) => fmtMoney(v, currency)}
              ariaLabel="Subscription paid per month"
            />
          ) : (
            <p className="text-xs text-slate-400 py-16 text-center">No renewal recorded yet. Press “Renewed” on a number when you pay for it.</p>
          )}
        </Card>

        <Card
          title="Numbers added vs banned"
          hint="Per month, last 6 months"
          right={
            <LineLegend
              items={[
                { name: 'Added', color: CATEGORY_COLORS[0] },
                { name: 'Banned', color: NUMBER_STATUS.banned.color },
              ]}
            />
          }
        >
          <LineChart
            labels={monthLabels}
            series={[
              { key: 'added', name: 'Added', color: CATEGORY_COLORS[0], values: data.added },
              { key: 'banned', name: 'Banned', color: NUMBER_STATUS.banned.color, values: data.bans },
            ]}
            format={fmtInt}
            height={220}
            ariaLabel="Numbers added and banned per month"
          />
          <p className="text-xs text-slate-500 mt-3">
            {data.avgDaysBeforeBan === null ? (
              'No number has been banned yet.'
            ) : (
              <>
                A number lasts <span className="font-bold text-slate-900">{fmtInt(data.avgDaysBeforeBan)} days</span> on average before it gets banned.
              </>
            )}
          </p>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <Card title="Leads per number" hint="Leads talked to from each number, and stores they became">
          <BarList
            items={data.usage.map((u) => ({ id: u.id, name: u.name, value: u.leads, sub: `${fmtInt(u.converted)} stores · ${NUMBER_STATUS[u.status]?.label}` }))}
            format={fmtInt}
            emptyText="No lead has a number set yet"
          />
        </Card>
        <Card title="Numbers per member" hint="Active numbers each person holds">
          <BarList items={data.holders} format={fmtInt} color={CATEGORY_COLORS[2]} emptyText="No number is linked to anyone" />
        </Card>
        <Card title="By country and status">
          <BarList items={data.countries} format={fmtInt} color={CATEGORY_COLORS[3]} emptyText="No active numbers" />
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100">
            {statusSlices.map(([k, v]) => (
              <Pill key={k} color={NUMBER_STATUS[k].color}>
                {NUMBER_STATUS[k].label} {fmtInt(v)}
              </Pill>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Renewals coming up" hint="Due in the next 14 days, or already overdue">
        {data.upcoming.length ? (
          <ul className="divide-y divide-slate-100 -my-2">
            {data.upcoming.map((u) => (
              <li key={u._id}>
                <button type="button" onClick={() => onOpen?.(u._id)} className="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-slate-50 rounded-xl px-2 -mx-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900 truncate tabular-nums">{u.number}</span>
                    <span className="block text-[11px] text-slate-500">{[u.label, u.country].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className={`block text-xs font-bold ${u.daysLeft < 0 ? 'text-red-600' : u.daysLeft <= 7 ? 'text-amber-600' : 'text-slate-600'}`}>
                      {u.daysLeft < 0 ? `Overdue ${-u.daysLeft} d` : u.daysLeft === 0 ? 'Today' : `In ${u.daysLeft} d`} · {fmtDate(u.nextRenewalAt)}
                    </span>
                    <span className="block text-[11px] text-slate-500 tabular-nums">{fmtMoney(u.monthlyCost, u.currency)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400 py-6 text-center">Nothing due in the next 14 days.</p>
        )}
      </Card>
    </div>
  );
}
