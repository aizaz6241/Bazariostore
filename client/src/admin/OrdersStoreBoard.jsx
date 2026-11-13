import { useEffect, useMemo, useState } from 'react';
import { Seg, Avatar, Empty } from './insights.jsx';
import { Nick, useNicknames } from './nicknames.jsx';

/**
 * Orders by store (admin Orders page): what each active real client store has right now —
 * the order pipeline (pending → confirmed → warehouse → out for delivery), delivery problems,
 * delivered (placed in the chosen period), late (not delivered 11 days after the order) and
 * stopped (the automatic step is overdue or could not run). Every number filters the order list.
 * Compact: a one-line summary is always shown; the store list opens and closes (remembered).
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

const OPEN_KEY = 'admin.orders.storeBoard.open';
const readOpen = () => {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
};

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
  const [open, setOpen] = useState(readOpen);
  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, open ? '1' : '0');
    } catch {
      /* storage blocked: not remembered */
    }
  }, [open]);

  const nickMap = useNicknames();
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    // test accounts and stores marked Inactive (Sellers page) are not listed here
    const list = (data?.stores || []).filter((s) => !s.isTest && !s.isInactive && (!t || `${s.storeName} ${nickMap[String(s._id)] || ''} ${s.ownerName}`.toLowerCase().includes(t)));
    const by = {
      attention: (a, b) => b.late - a.late || b.stuck - a.stuck || (b.pending || 0) - (a.pending || 0) || openOf(b) - openOf(a),
      open: (a, b) => openOf(b) - openOf(a) || b.late - a.late,
      name: (a, b) => String(a.storeName).localeCompare(String(b.storeName)),
    }[sort];
    return [...list].sort(by);
  }, [data, q, sort, nickMap]);

  const storeTotal = useMemo(() => (data?.stores || []).filter((s) => !s.isTest && !s.isInactive).length, [data]);
  const LIMIT = 8;
  const shown = showAll || q ? rows : rows.slice(0, LIMIT);
  const t = data?.totals;
  const hidden = data?.hiddenInactive;
  const isActive = (sid, f) => (activeSeller || '') === (sid || '') && activeFilter && Object.entries(f).every(([k, v]) => activeFilter[k] === v);
  const pipeTotal = t ? PIPE.reduce((a, c) => a + (t[c.key] || 0), 0) : 0;
  const attnTotal = (t?.late || 0) + (t?.stuck || 0) + (t?.problem || 0);

  // one number in the summary strip
  const chip = ({ k, label, f, tone = '', dot, sub }) => {
    const n = t?.[k] || 0;
    const on = isActive('', f);
    return (
      <button
        type="button"
        key={k}
        className={`osb2-chip ${tone} ${on ? 'on' : ''} ${n ? '' : 'is-zero'}`}
        onClick={() => onPick('', f)}
        disabled={!n}
        aria-pressed={on}
        title={n ? `Show ${fmt(n)} ${label.toLowerCase()} orders` : `No ${label.toLowerCase()} orders`}
      >
        <span className="osb2-chip-lbl">
          {dot && <i style={{ background: dot }} aria-hidden="true" />}
          {label}
        </span>
        <b>{t ? fmt(n) : '–'}</b>
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
    <section className={`ins-card osb osb2 ${open ? 'is-open' : 'is-closed'}`} aria-labelledby="osb2-title">
      <header className="osb2-head">
        <button type="button" className="osb2-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="osb2-body">
          <span className="osb2-chev" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16"><path d="M8.6 5.6 15 12l-6.4 6.4-1.4-1.4 5-5-5-5 1.4-1.4Z" fill="currentColor" /></svg>
          </span>
          <span className="osb2-title">
            <b id="osb2-title">Orders by store</b>
            <small>
              <span className="osb-live" aria-hidden="true" />
              {fmt(storeTotal)} active client {storeTotal === 1 ? 'store' : 'stores'} · {fmt(pipeTotal)} open
              {attnTotal > 0 && <span className="osb2-attn-pill">{fmt(attnTotal)} need attention</span>}
            </small>
          </span>
          <span className="osb2-toggle-txt">{open ? 'Hide stores' : 'Show stores'}</span>
        </button>
        <div className="osb2-days">
          <span className="osb-head-lbl">Delivered in</span>
          <Seg small label="Delivered period" value={days} onChange={onDays} options={[{ value: 7, label: '7d' }, { value: 30, label: '30d' }, { value: 90, label: '90d' }]} />
        </div>
      </header>

      {/* ── summary strip: always visible, every number filters the list below ── */}
      <div className={`osb2-strip ${loading ? 'is-dim' : ''}`} role="group" aria-label="Order totals of active client stores">
        <div className="osb2-group">
          {PIPE.map((c) => chip({ k: c.key, label: c.short === 'Out for del.' ? 'Out for delivery' : c.short, f: c.filter, tone: c.key === 'pending' ? 'amber' : '', dot: c.color }))}
        </div>
        <div className="osb2-group">
          {chip({ k: 'delivered', label: `Delivered ${days}d`, f: { status: 'delivered' }, tone: 'green', dot: '#16a34a' })}
        </div>
        <div className="osb2-group osb2-group-attn">
          {chip({ k: 'problem', label: 'Problem', f: PROBLEM.filter, tone: 'orange', dot: PROBLEM.color })}
          {chip({ k: 'late', label: `Late ${data?.lateDays || 11}d+`, f: { late: true }, tone: 'red', sub: t?.lateStores ? `${t.lateStores} ${t.lateStores === 1 ? 'store' : 'stores'}` : '' })}
          {chip({ k: 'stuck', label: 'Stopped', f: { stuck: true }, tone: 'red' })}
        </div>
      </div>

      {open && (
        <div id="osb2-body" className="osb2-body">
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

          {!data && loading ? (
            <div className="osb-skel">{Array.from({ length: 3 }).map((_, i) => <span key={i} />)}</div>
          ) : rows.length === 0 ? (
            <Empty icon="📦" text={q ? 'No store matches.' : 'No open or recently delivered orders.'} />
          ) : (
            <>
              {/* desktop / tablet: table */}
              <div className={`osb-table-wrap ${loading ? 'is-dim' : ''}`}>
                <table className="osb-table osb2-table">
                  <thead>
                    <tr>
                      <th className="osb-th-store">Store</th>
                      {PIPE.map((c) => (
                        <th key={c.key} className="num" title={c.hint || c.label}>
                          <span className="osb2-th"><i style={{ background: c.color }} aria-hidden="true" />{c.short}</span>
                        </th>
                      ))}
                      <th className="num" title={PROBLEM.hint}><span className="osb2-th"><i style={{ background: PROBLEM.color }} aria-hidden="true" />Problem</span></th>
                      <th className="num">Delivered {days}d</th>
                      <th className="num osb2-th-attn" title={`Not delivered ${data?.lateDays || 11} days after the order was placed`}>Late</th>
                      <th className="num osb2-th-attn" title="The next automatic step is overdue, or could not run (e.g. wallet too low)">Stopped</th>
                      <th className="num" title="Age of the oldest order that is not delivered yet">Oldest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((s) => (
                      <tr key={s._id} className={`${s.late ? 'is-late' : ''} ${(activeSeller || '') === s._id ? 'is-picked' : ''}`}>
                        <td className="osb-store">
                          <button type="button" className="osb-store-btn" onClick={() => onPick(s._id, {})} title={`Show all orders of ${s.storeName}`}>
                            <Avatar name={s.storeName} size={28} />
                            <span className="osb-store-txt">
                              <b>
                                <span className="osb-name">{s.storeName}</span>
                                <Nick id={s._id} compact />
                                {s.tier === 'diamond' && <span className="osb-dia" title="Diamond store">💎</span>}
                                {statusChip(s)}
                              </b>
                              <small>{s.ownerName || '—'} · {fmt(openOf(s))} open</small>
                              <PipeBar s={s} />
                            </span>
                          </button>
                        </td>
                        {PIPE.map((c) => (
                          <td key={c.key} className="num">{num({ s, k: c.key, f: c.filter, tone: c.key === 'pending' ? 'amber' : '', label: c.label.toLowerCase() })}</td>
                        ))}
                        <td className="num">{num({ s, k: 'problem', f: PROBLEM.filter, tone: 'orange', label: 'delivery problems' })}</td>
                        <td className="num">{num({ s, k: 'delivered', f: { status: 'delivered' }, tone: 'green', label: 'delivered' })}</td>
                        <td className="num">{num({ s, k: 'late', f: { late: true }, tone: 'red', label: 'late orders' })}</td>
                        <td className="num">{num({ s, k: 'stuck', f: { stuck: true }, tone: 'red', label: 'stopped orders' })}</td>
                        <td className="num"><span className={`osb-age ${s.late ? 'bad' : ageDays(s.oldestOpenAt) >= 3 ? 'warn' : ''}`}>{ageText(s.oldestOpenAt)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* phone: one compact card per store */}
              <ul className={`osb-cards osb2-cards ${loading ? 'is-dim' : ''}`}>
                {shown.map((s) => (
                  <li key={s._id} className={`osb-card ${s.late ? 'is-late' : ''}`}>
                    <button type="button" className="osb-store-btn" onClick={() => onPick(s._id, {})}>
                      <Avatar name={s.storeName} size={30} />
                      <span className="osb-store-txt">
                        <b>
                          <span className="osb-name">{s.storeName}</span>
                          <Nick id={s._id} compact />
                          {s.tier === 'diamond' && <span className="osb-dia">💎</span>}
                          {statusChip(s)}
                        </b>
                        <small>{s.ownerName || '—'} · oldest {ageText(s.oldestOpenAt)}</small>
                      </span>
                      <span className="osb-card-open"><b>{fmt(openOf(s))}</b><small>open</small></span>
                    </button>
                    <PipeBar s={s} />
                    <div className="osb2-card-nums">
                      {BOARD_COLUMNS.map((c) => (
                        <div key={c.key}>
                          <small><i style={{ background: c.color }} />{c.key === 'ofd' ? 'Out' : c.short}</small>
                          {num({ s, k: c.key, f: c.filter, tone: c.key === 'pending' ? 'amber' : c.key === 'problem' ? 'orange' : '', label: c.label.toLowerCase() })}
                        </div>
                      ))}
                      <div>
                        <small><i style={{ background: '#16a34a' }} />Done</small>
                        {num({ s, k: 'delivered', f: { status: 'delivered' }, tone: 'green', label: 'delivered' })}
                      </div>
                    </div>
                    {(s.late > 0 || s.stuck > 0) && (
                      <div className="osb-card-attn">
                        {s.late > 0 && <button type="button" onClick={() => onPick(s._id, { late: true })}>{fmt(s.late)} late {data?.lateDays || 11}d+</button>}
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
        </div>
      )}
    </section>
  );
}
