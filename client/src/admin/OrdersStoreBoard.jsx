import { useMemo, useState } from 'react';
import { Seg, Avatar, Empty } from './insights.jsx';

/**
 * Orders by store (admin Orders page): what each active real client store has right now —
 * the order pipeline (pending → confirmed → warehouse → out for delivery), delivery problems,
 * delivered (placed in the chosen period), late (not delivered 7 days after the order) and
 * stopped (the automatic step is overdue or could not run). Every number filters the order list.
 * Data: GET /orders/analytics/stores (test, previous-store and Inactive stores are left out here).
 */

// the open pipeline, in order; colours are also used by the bar under each store
export const BOARD_COLUMNS = [
  { key: 'pending', label: 'Pending', short: 'Pending', filter: { status: 'pending' }, hint: 'Waiting for the store to confirm', color: '#f59e0b' },
  { key: 'confirmed', label: 'Confirmed', short: 'Confirmed', filter: { status: 'confirmed' }, color: '#3b82f6' },
  { key: 'warehouse', label: 'In warehouse', short: 'Warehouse', filter: { status: 'warehouse' }, hint: 'Processing, packed, out from warehouse, at the delivery hub', color: '#6366f1' },
  { key: 'ofd', label: 'Out for delivery', short: 'Out for del.', filter: { status: 'out_for_delivery' }, color: '#8b5cf6' },
  { key: 'problem', label: 'Delivery problem', short: 'Problem', filter: { status: 'problem' }, hint: 'No response from customer / returned to warehouse', color: '#f97316' },
];
const PIPE = BOARD_COLUMNS.slice(0, 4);
const PROBLEM = BOARD_COLUMNS[4];

const SORTS = [
  { value: 'attention', label: 'Needs attention' },
  { value: 'open', label: 'Most open' },
  { value: 'name', label: 'A–Z' },
];

const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const ageDays = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null);
const ageText = (d) => {
  const days = ageDays(d);
  if (days == null) return '—';
  return days < 1 ? 'Today' : `${days}d`;
};
const openOf = (s) => PIPE.reduce((a, c) => a + (s[c.key] || 0), 0) + (s.problem || 0);

/** Stacked bar: how this store's open orders split over the pipeline. */
function PipeBar({ s }) {
  const total = openOf(s);
  if (!total) return <span className="osb-bar is-empty" aria-hidden="true" />;
  return (
    <span className="osb-bar" role="img" aria-label={BOARD_COLUMNS.map((c) => `${s[c.key] || 0} ${c.label.toLowerCase()}`).join(', ')}>
      {BOARD_COLUMNS.map((c) =>
        s[c.key] ? <i key={c.key} style={{ width: `${(s[c.key] / total) * 100}%`, background: c.color }} title={`${s[c.key]} ${c.label.toLowerCase()}`} /> : null
      )}
    </span>
  );
}

export default function OrdersStoreBoard({ data, loading, days, onDays, onPick, activeSeller, activeFilter }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('attention');
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    // test accounts and stores marked Inactive (Sellers page) are not listed here
    const list = (data?.stores || []).filter((s) => !s.isTest && !s.isInactive && (!t || `${s.storeName} ${s.ownerName}`.toLowerCase().includes(t)));
    const by = {
      attention: (a, b) => b.late - a.late || b.stuck - a.stuck || (b.pending || 0) - (a.pending || 0) || openOf(b) - openOf(a),
      open: (a, b) => openOf(b) - openOf(a) || b.late - a.late,
      name: (a, b) => String(a.storeName).localeCompare(String(b.storeName)),
    }[sort];
    return [...list].sort(by);
  }, [data, q, sort]);

  const LIMIT = 10;
  const shown = showAll || q ? rows : rows.slice(0, LIMIT);
  const t = data?.totals;
  const hidden = data?.hiddenInactive;
  const isActive = (sid, f) => (activeSeller || '') === (sid || '') && activeFilter && Object.entries(f).every(([k, v]) => activeFilter[k] === v);
  const pipeTotal = t ? PIPE.reduce((a, c) => a + (t[c.key] || 0), 0) : 0;

  // one number in the summary
  const stat = ({ k, label, f, tone = '', sub }) => {
    const n = t?.[k] || 0;
    return (
      <button type="button" className={`osb-stat ${tone} ${isActive('', f) ? 'on' : ''}`} onClick={() => onPick('', f)} disabled={!n} aria-pressed={isActive('', f)}>
        <span className="osb-stat-label">{label}</span>
        <b>{fmt(n)}</b>
        {sub && <small>{sub}</small>}
      </button>
    );
  };

  // one number in a store row
  const num = ({ s, k, f, tone = '', label }) => {
    const n = s[k] || 0;
    if (!n) return <span className="osb-zero" aria-label={`0 ${label}`}>·</span>;
    return (
      <button type="button" className={`osb-num ${tone} ${isActive(s._id, f) ? 'on' : ''}`} onClick={() => onPick(s._id, f)} title={`Show ${n} ${label} of ${s.storeName}`}>
        {fmt(n)}
      </button>
    );
  };

  const statusChip = (s) =>
    s.storeStatus && s.storeStatus !== 'active' ? <span className={`osb-tag ${s.storeStatus}`}>{s.storeStatus === 'frozen' ? 'Frozen' : s.storeStatus === 'suspended' ? 'Suspended' : s.storeStatus}</span> : null;

  return (
    <section className="ins-card osb">
      <header className="osb-head">
        <div>
          <h3>Orders by store</h3>
          <p>
            <span className="osb-live" aria-hidden="true" /> Live · active real client stores · tap any number to open those orders
          </p>
        </div>
        <div className="osb-head-tools">
          <span className="osb-head-lbl">Delivered in</span>
          <Seg small label="Delivered period" value={days} onChange={onDays} options={[{ value: 7, label: '7d' }, { value: 30, label: '30d' }, { value: 90, label: '90d' }]} />
        </div>
      </header>

      {/* ── summary: the pipeline + what needs attention ── */}
      <div className={`osb-summary ${loading ? 'is-dim' : ''}`}>
        <div className="osb-group osb-pipe">
          <span className="osb-group-title">Open pipeline · {fmt(pipeTotal)}</span>
          <div className="osb-stats">
            {PIPE.map((c, i) => (
              <div key={c.key} className="osb-step">
                {stat({ k: c.key, label: c.label, f: c.filter, tone: c.key === 'pending' ? 'amber' : '' })}
                {i < PIPE.length - 1 && <span className="osb-arrow" aria-hidden="true">›</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="osb-group osb-done">
          <span className="osb-group-title">Done</span>
          <div className="osb-stats">
            {stat({ k: "delivered", label: `Delivered · ${days}d`, f: { status: 'delivered' }, tone: "green" })}
          </div>
        </div>
        <div className="osb-group osb-attn">
          <span className="osb-group-title">Needs attention</span>
          <div className="osb-stats">
            {stat({ k: "problem", label: "Delivery problem", f: PROBLEM.filter, tone: "orange" })}
            {stat({ k: "late", label: "Late 7d+", f: { late: true }, tone: "red", sub: t?.lateStores ? `${t.lateStores} ${t.lateStores === 1 ? 'store' : 'stores'}` : '' })}
            {stat({ k: "stuck", label: "Stopped moving", f: { stuck: true }, tone: "red" })}
          </div>
        </div>
      </div>

      {t && t.late > 0 && (
        <div className="osb-alert" role="status">
          <span className="osb-alert-dot" aria-hidden="true" />
          <p>
            <b>{fmt(t.late)} {t.late === 1 ? 'order is' : 'orders are'} not delivered after {data.lateDays} days</b> at {t.lateStores} {t.lateStores === 1 ? 'store' : 'stores'}
            {t.stuck > 0 && <> · {fmt(t.stuck)} stopped moving by themselves</>}
          </p>
          <button type="button" onClick={() => onPick('', { late: true })}>Review late orders →</button>
        </div>
      )}

      {/* ── stores ── */}
      <div className="osb-tools">
        <label className="osb-search">
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M11 4a7 7 0 1 0 4.2 12.6l3.6 3.6 1.4-1.4-3.6-3.6A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z" fill="currentColor" /></svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a store or owner" aria-label="Find a store" />
        </label>
        <div className="osb-tools-right">
          <span className="osb-count">{fmt(rows.length)} {rows.length === 1 ? 'store' : 'stores'}</span>
          <Seg small label="Sort stores" value={sort} onChange={setSort} options={SORTS} />
        </div>
      </div>

      <div className="osb-legend" aria-hidden="true">
        {BOARD_COLUMNS.map((c) => (
          <span key={c.key}><i style={{ background: c.color }} />{c.short}</span>
        ))}
      </div>

      {!data && loading ? (
        <div className="osb-skel">{Array.from({ length: 4 }).map((_, i) => <span key={i} />)}</div>
      ) : rows.length === 0 ? (
        <Empty icon="📦" text={q ? 'No store matches.' : 'No open or recently delivered orders.'} />
      ) : (
        <>
          {/* desktop / tablet: table */}
          <div className={`osb-table-wrap ${loading ? 'is-dim' : ''}`}>
            <table className="osb-table">
              <thead>
                <tr className="osb-th-group">
                  <th rowSpan={2} className="osb-th-store">Store</th>
                  <th colSpan={4} className="osb-g">Open pipeline</th>
                  <th rowSpan={2} className="num">Problem</th>
                  <th rowSpan={2} className="num">Delivered<small>{days}d</small></th>
                  <th colSpan={3} className="osb-g osb-g-attn">Attention</th>
                </tr>
                <tr className="osb-th-cols">
                  {PIPE.map((c) => (
                    <th key={c.key} className="num" title={c.hint || c.label}>{c.short}</th>
                  ))}
                  <th className="num" title="Not delivered 7 days after the order was placed">Late</th>
                  <th className="num" title="The next automatic step is overdue, or could not run (e.g. wallet too low)">Stopped</th>
                  <th className="num" title="Age of the oldest order that is not delivered yet">Oldest</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s._id} className={`${s.late ? 'is-late' : ''} ${(activeSeller || '') === s._id ? 'is-picked' : ''}`}>
                    <td className="osb-store">
                      <button type="button" className="osb-store-btn" onClick={() => onPick(s._id, {})} title={`Show all orders of ${s.storeName}`}>
                        <Avatar name={s.storeName} size={32} />
                        <span className="osb-store-txt">
                          <b>
                            <span className="osb-name">{s.storeName}</span>
                            {s.tier === 'diamond' && <span className="osb-dia" title="Diamond store">💎</span>}
                            {statusChip(s)}
                          </b>
                          <small>{s.ownerName || '—'} · {fmt(openOf(s))} open</small>
                          <PipeBar s={s} />
                        </span>
                      </button>
                    </td>
                    {PIPE.map((c) => (
                      <td key={c.key} className="num">{num({ s: s, k: c.key, f: c.filter, tone: c.key === 'pending' ? 'amber' : '', label: c.label.toLowerCase() })}</td>
                    ))}
                    <td className="num">{num({ s: s, k: "problem", f: PROBLEM.filter, tone: "orange", label: "delivery problems" })}</td>
                    <td className="num">{num({ s: s, k: "delivered", f: { status: 'delivered' }, tone: "green", label: "delivered" })}</td>
                    <td className="num osb-attn-col">{num({ s: s, k: "late", f: { late: true }, tone: "red", label: "late orders" })}</td>
                    <td className="num osb-attn-col">{num({ s: s, k: "stuck", f: { stuck: true }, tone: "red", label: "stopped orders" })}</td>
                    <td className="num osb-attn-col"><span className={`osb-age ${s.late ? 'bad' : ageDays(s.oldestOpenAt) >= 3 ? 'warn' : ''}`}>{ageText(s.oldestOpenAt)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* phone: one card per store */}
          <ul className={`osb-cards ${loading ? 'is-dim' : ''}`}>
            {shown.map((s) => (
              <li key={s._id} className={`osb-card ${s.late ? 'is-late' : ''}`}>
                <button type="button" className="osb-store-btn" onClick={() => onPick(s._id, {})}>
                  <Avatar name={s.storeName} size={34} />
                  <span className="osb-store-txt">
                    <b>
                      <span className="osb-name">{s.storeName}</span>
                      {s.tier === 'diamond' && <span className="osb-dia">💎</span>}
                      {statusChip(s)}
                    </b>
                    <small>{s.ownerName || '—'} · oldest open {ageText(s.oldestOpenAt)}</small>
                  </span>
                  <span className="osb-card-open"><b>{fmt(openOf(s))}</b><small>open</small></span>
                </button>
                <PipeBar s={s} />
                <div className="osb-card-grid">
                  {BOARD_COLUMNS.map((c) => (
                    <div key={c.key}>
                      <small><i style={{ background: c.color }} />{c.short}</small>
                      {num({ s: s, k: c.key, f: c.filter, tone: c.key === 'pending' ? 'amber' : c.key === 'problem' ? 'orange' : '', label: c.label.toLowerCase() })}
                    </div>
                  ))}
                  <div>
                    <small>Delivered {days}d</small>
                    {num({ s: s, k: "delivered", f: { status: 'delivered' }, tone: "green", label: "delivered" })}
                  </div>
                </div>
                {(s.late > 0 || s.stuck > 0) && (
                  <div className="osb-card-attn">
                    {s.late > 0 && <button type="button" onClick={() => onPick(s._id, { late: true })}>{fmt(s.late)} late 7d+</button>}
                    {s.stuck > 0 && <button type="button" onClick={() => onPick(s._id, { stuck: true })}>{fmt(s.stuck)} stopped</button>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <footer className="osb-foot">
        {hidden?.stores > 0 ? (
          <p className={`osb-hidden ${hidden.late ? 'has-late' : ''}`}>
            {hidden.stores} inactive {hidden.stores === 1 ? 'store is' : 'stores are'} hidden
            {hidden.open > 0 && <> · {fmt(hidden.open)} open {hidden.open === 1 ? 'order' : 'orders'}</>}
            {hidden.late > 0 && <> · <b>{fmt(hidden.late)} late</b></>}
            <span> — pick it in the store filter, or make it Active on the Sellers page.</span>
          </p>
        ) : (
          <span />
        )}
        {!q && rows.length > LIMIT && (
          <button type="button" className="osb-more" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show fewer' : `Show all ${fmt(rows.length)} stores`}
          </button>
        )}
      </footer>
    </section>
  );
}
