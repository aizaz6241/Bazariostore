'use client';

import React, { useState } from 'react';
import DepositCalendar from './DepositCalendar';
import MyCalendar from './MyCalendar';

/**
 * The calendar(s) on the dashboard.
 *   member:  My Calendar (his own earnings, day by day)
 *   partner: Business Calendar (everything that came into Binance) and My Calendar (his own
 *            earnings), one at a time
 */
export default function DashboardCalendars({ isAdmin }) {
  const [which, setWhich] = useState('business');
  if (!isAdmin) return <MyCalendar />;

  return (
    <div className="space-y-3">
      <div className="inline-flex p-1 rounded-xl bg-slate-200/70" role="tablist" aria-label="Which calendar">
        {[
          { id: 'business', label: 'Business Calendar' },
          { id: 'mine', label: 'My Calendar' },
        ].map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={which === t.id}
            onClick={() => setWhich(t.id)}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${which === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {which === 'business' ? <DepositCalendar /> : <MyCalendar />}
    </div>
  );
}
