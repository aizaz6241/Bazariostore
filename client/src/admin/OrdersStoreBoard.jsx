import { useMemo, useState } from 'react';
import { Seg, Avatar, Empty } from './insights.jsx';

/**
 * Orders by store (admin Orders page): what each real client store has right now — pending,
 * confirmed, in the warehouse, out for delivery, delivery problems, delivered (placed in the chosen
 * period), late (not delivered 7 days after the order) and stuck (the automatic step is overdue or
 * could not run). Every number is a button that filters the order list below.
 * Data: GET /orders/analytics/stores (test, previous-store and Inactive stores are left out here).
 */
export const BOARD_COLUMNS = [
  { key: 'pending', label: 'Pending', filter: { status: 'pending' }, hint: 'Waiting for the store to confirm' },
  { key: 'confirmed', label: 'Confirmed', filter: { status: 'confirmed' } },
  { key: 'warehouse', label: 'Warehouse', filter: { status: 'warehouse' }, hint: 'Processing, packed, out from warehouse, at the delivery hub' },
  { key: 'ofd', label: 'Out for delivery', short: 'Out for del.', filter: { status: 'out_for_delivery' } },
  { key: 'problem', label: 'Delivery problem', short: 'Problem', filter: { status: 'problem' }, hint: 'No response from customer / returned to warehouse' },
  { key: 'delivered', label: 'Delivered', filter: { status: 'delivered' } },
];

const fmtAge = (d) => {
  if (!d) return '—';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  return days < 1 ? 'today' : `${days}d`;
};

export default function OrdersStoreBoard({ data, loading, days, onDays, onPick, activeSeller, activeFilter }) {
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    // test accounts and stores marked Inactive (Sellers page) are not listed here
    return (data?.stores || []).filter((s) => !s.isTest && !s.isInactive && (!t || `${s.storeName} ${s.ownerName}`.toLowerCase().includes(t)));
  }, [data, q]);
  const shown = showAll || q ? rows : rows.slice(0, 12);
  const t = data?.totals;
  const hidden = data?.hiddenInactive;
  const isActive = (sid, f) => (activeSeller || '') === (sid || '') && activeFilter && Object.entries(f).every(([k, v]) => activeFilter[k] === v);

  const chip = (key, label, f, tone = '') => (
    <button type="button" className={`otl-chip ${tone} ${isActive('', f) ? 'on' : ''}`} onClick={() => onPick('', f)} disabled={!t?.[key]}>
      <b>{(t?.[key] || 0).toLocaleString('en-US')}</b>
      <span>{label}</span>
    </button>
  );

  const cell = (s, key, f, tone = '') => {
    const n = s[key] || 0;
    if (!n) return <span className="otl-zero">–</span>;
    return (
      <button type="button" className={`otl-num ${tone} ${isActive(s._id, f) ? 'on' : ''}`} onClick={() => onPick(s._id, f)} title={`Show these ${n} orders`}>
        {n.toLocaleString('en-US')}
      </button>
    );
  };

  return (
    <section className="ins-card otl-board">
      <div className="ins-card-head" style={{ paddingBottom: 10 }}>
        <div>
          <h3>🏪 Orders by store</h3>
          <span className="ins-card-hint">Right now, active real client stores only (no test or inactive stores) · Delivered = orders placed in the last {days} days · click a number to see those orders</span>
        </div>
        <div className="ins-card-actions">
          <Seg small label="Delivered period" value={days} onChange={onDays} options={[{ value: 7, label: '7d' }, { value: 30, label: '30d' }, { value: 90, label: '90d' }]} />
        </div>
      </div>

      <div className="ins-card-body" style={{ paddingTop: 0 }}>
        {t && t.late > 0 && (
          <div className="otl-alert" role="status">
            <span aria-hidden="true">⚠️</span>
            <p>
              <b>{t.late.toLocaleString('en-US')} {t.late === 1 ? 'order is' : 'orders are'} not delivered after {data.lateDays} days</b> at {t.lateStores} {t.lateStores === 1 ? 'store' : 'stores'}.
              {t.stuck > 0 && <> {t.stuck} {t.stuck === 1 ? 'order has' : 'orders have'} stopped moving by themselves.</>}
            </p>
            <button type="button" className="ins-btn ins-btn-sm" onClick={() => onPick('', { late: true })}>Show late orders</button>
          </div>
        )}

        <div className={`otl-chips ${loading ? 'is-dim' : ''}`}>
          {chip('pending', 'Pending', { status: 'pending' }, 'warn')}
          {chip('confirmed', 'Confirmed', { status: 'confirmed' })}
          {chip('warehouse', 'In warehouse', { status: 'warehouse' })}
          {chip('ofd', 'Out for delivery', { status: 'out_for_delivery' })}
          {chip('problem', 'Delivery problem', { status: 'problem' }, 'warn')}
          {chip('delivered', `Delivered (${days}d)`, { status: 'delivered' }, 'good')}
          {chip('late', 'Late 7+ days', { late: true }, 'bad')}
          {chip('stuck', 'Stopped moving', { stuck: true }, 'bad')}
        </div>

        <div className="otl-board-tools">
          <div className="ins-search" style={{ maxWidth: 300 }}>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a store…" aria-label="Find a store" />
          </div>
          <span className="ins-card-hint">{rows.length} {rows.length === 1 ? 'store' : 'stores'} with orders · late ones first</span>
        </div>

        {hidden?.stores > 0 && (
          <p className={`otl-hidden-note ${hidden.late ? 'has-late' : ''}`}>
            💤 {hidden.stores} inactive {hidden.stores === 1 ? 'store is' : 'stores are'} hidden here
            {hidden.open > 0 && <> · {hidden.open.toLocaleString('en-US')} open {hidden.open === 1 ? 'order' : 'orders'}</>}
            {hidden.late > 0 && <> · <b>{hidden.late} late</b></>}
            <span> — pick the store in the store filter to see them, or make it Active on the Sellers page.</span>
          </p>
        )}

        {!data && loading ? (
          <Empty icon="⏳" text="Loading stores…" />
        ) : rows.length === 0 ? (
          <Empty icon="📦" text={q ? 'No store matches.' : 'No open or recently delivered orders.'} />
        ) : (
          <div className={`ins-table-scroll ${loading ? 'is-dim' : ''}`}>
            <table className="ins-table otl-table">
              <thead>
                <tr>
                  <th>Store</th>
                  {BOARD_COLUMNS.map((c) => (
                    <th key={c.key} className="num" title={c.hint || c.label}>{c.short || c.label}</th>
                  ))}
                  <th className="num" title="Not delivered 7 days after the order was placed">Late 7d+</th>
                  <th className="num" title="The next automatic step is overdue, or could not run (e.g. wallet too low)">Stopped</th>
                  <th className="num" title="Age of the oldest order that is not delivered yet">Oldest</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s._id} className={s.late ? 'has-late' : ''}>
                    <td>
                      <div className="ins-cell-who">
                        <Avatar name={s.storeName} size={30} />
                        <div style={{ minWidth: 0 }}>
                          <b className="ins-clip" style={{ maxWidth: 190 }} title={s.storeName}>
                            {s.storeName}
                            {s.tier === 'diamond' && <span className="otl-dia" title="Diamond store">💎</span>}
                          </b>
                          <span className="ins-sub">{s.ownerName || '—'}{s.storeStatus && s.storeStatus !== 'active' ? ` · ${s.storeStatus}` : ''}</span>
                        </div>
                      </div>
                    </td>
                    {BOARD_COLUMNS.map((c) => (
                      <td key={c.key} className="num">{cell(s, c.key, c.filter, c.key === 'problem' ? 'warn' : c.key === 'delivered' ? 'good' : '')}</td>
                    ))}
                    <td className="num">{cell(s, 'late', { late: true }, 'bad')}</td>
                    <td className="num">{cell(s, 'stuck', { stuck: true }, 'bad')}</td>
                    <td className="num"><span className={s.late ? 'otl-old bad' : 'otl-old'}>{fmtAge(s.oldestOpenAt)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!q && rows.length > 12 && (
          <button type="button" className="ins-btn ins-btn-sm ins-btn-ghost otl-more" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show fewer stores ▴' : `Show all ${rows.length} stores ▾`}
          </button>
        )}
      </div>
    </section>
  );
}
