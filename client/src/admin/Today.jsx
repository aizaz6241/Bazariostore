import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import { getSocket } from '../socket.js';
import Ic from '../components/Icons.jsx';
import StoreLink from './hub/StoreLink.jsx';
import { HUB_REFRESH_EVENT, STATUS_LABELS, ago, chatPath, orderPath, profilePath, usd } from './hub/hubBus.js';

/**
 * TODAY — the admin's work queue: everything that waits for an admin, in one place.
 *   - summary tiles per area (Payments, Support, Orders, Stores, Refunds) that also filter the page
 *   - "Urgent only" shows just the red rows (the server marks them, with the same rules everywhere)
 *   - each list: what it is, its items (oldest / closest to a deadline first), a link to the full page
 * Only what this admin's role covers (the server sends nothing else).
 */
const GROUPS = [
  { key: 'payments', label: 'Payments', icon: 'banknote' },
  { key: 'support', label: 'Support', icon: 'chat' },
  { key: 'orders', label: 'Orders', icon: 'package' },
  { key: 'stores', label: 'Stores', icon: 'users' },
  { key: 'refunds', label: 'Refunds', icon: 'refresh' },
];

const span = (h) => {
  const abs = Math.abs(h);
  if (abs >= 24) return `${Math.floor(abs / 24)}d ${Math.round(abs % 24)}h`;
  if (abs >= 1) return `${Math.floor(abs)}h ${Math.round((abs % 1) * 60)}m`;
  return `${Math.max(1, Math.round(abs * 60))}m`;
};
const waited = (at) => {
  const a = ago(at);
  return !a ? '' : a === 'just now' ? 'just now' : `${a} ago`;
};

export default function Today() {
  const { can } = useOutletContext() || {};
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState('all');
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [, setTick] = useState(0);
  const timer = useRef(null);

  const load = useCallback((fresh = false) => {
    if (fresh) setLoading(true);
    api(`/admin-hub/today${fresh ? '?fresh=1' : ''}`)
      .then((d) => {
        setData(d);
        setErr('');
      })
      .catch((e) => setErr(e.message || 'Could not load Today.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(true);
    const every = setInterval(() => load(false), 60000);
    const clock = setInterval(() => setTick((x) => x + 1), 30000);
    const soon = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => load(false), 2500);
    };
    window.addEventListener(HUB_REFRESH_EVENT, soon);
    window.addEventListener('focus', soon);
    const socket = getSocket();
    const events = ['notify', 'message:new', 'order:new', 'order:update', 'withdrawal:new', 'withdrawal:changed', 'sellers:changed', 'chat:broadcast_done'];
    events.forEach((ev) => socket?.on(ev, soon));
    return () => {
      clearInterval(every);
      clearInterval(clock);
      clearTimeout(timer.current);
      window.removeEventListener(HUB_REFRESH_EVENT, soon);
      window.removeEventListener('focus', soon);
      events.forEach((ev) => socket?.off(ev, soon));
    };
  }, [load]);

  const c = data?.counts || {};
  const U = c.urgent || {};
  const L = data?.lists || {};
  const late = data?.rules?.lateDeliveryDays || 7;

  // every list: its area, what it is, who may see it, its rows
  const sections = useMemo(() => {
    const store = (x) => (x.sellerId ? <StoreLink id={x.sellerId} name={x.storeName} /> : x.storeName || '—');
    return [
      {
        id: 'deposits',
        group: 'payments',
        show: can?.('finance') && L.deposits,
        icon: 'banknote',
        title: 'Deposits to approve',
        hint: 'Stores wait for these to confirm their orders. Urgent after 30 minutes.',
        count: c.deposits,
        urgent: U.deposits,
        more: { to: '/admin/withdrawals', label: 'Open Payouts' },
        rows: (L.deposits || []).map((x) => ({
          key: x.id,
          go: () => navigate('/admin/withdrawals'),
          title: store(x),
          sub: x.status === 'processing' ? 'Being applied…' : x.ref ? `UTR ${x.ref}` : 'No reference',
          amount: usd(x.amount),
          time: waited(x.at),
          urgent: x.urgent,
        })),
      },
      {
        id: 'withdrawals',
        group: 'payments',
        show: can?.('finance') && L.withdrawals,
        icon: 'wallet',
        title: 'Withdrawals to pay',
        hint: 'Urgent after 24 hours.',
        count: c.withdrawals,
        urgent: U.withdrawals,
        more: { to: '/admin/withdrawals', label: 'Open Payouts' },
        rows: (L.withdrawals || []).map((x) => ({
          key: x.id,
          go: () => navigate('/admin/withdrawals'),
          title: store(x),
          sub: x.status === 'processing' ? 'Being applied…' : 'Waiting for payout',
          amount: usd(x.amount),
          time: waited(x.at),
          urgent: x.urgent,
        })),
      },
      {
        id: 'limits',
        group: 'payments',
        show: can?.('finance') && L.limitRequests,
        icon: 'trend',
        title: 'Payout limit requests',
        count: c.limitRequests,
        more: { to: '/admin/withdrawals', label: 'Open Payouts' },
        rows: (L.limitRequests || []).map((x) => ({
          key: x.sellerId,
          go: () => navigate('/admin/withdrawals'),
          title: store(x),
          sub: x.status === 'accepted_by_seller' ? 'Store accepted your offer — finalize it' : `Asked for ${x.requested ? usd(x.requested) : 'a higher limit'}`,
          tag: x.status === 'accepted_by_seller' ? { text: 'Accepted', tone: 'green' } : null,
          time: x.at ? waited(x.at) : '',
        })),
      },
      {
        id: 'chats',
        group: 'support',
        show: can?.('chat') && L.chats,
        icon: 'chat',
        title: 'Chats waiting for a reply',
        hint: 'The last message is from the store or visitor. Urgent after 30 minutes.',
        count: c.chats,
        urgent: U.chats,
        more: { to: '/admin/chat', label: 'Open Support desk' },
        rows: (L.chats || []).map((x) => ({
          key: x.id,
          go: () => navigate(chatPath(x.id)),
          title: x.name,
          tag: x.guest ? { text: 'Visitor', tone: 'slate' } : null,
          sub: x.lastMessage || '—',
          badge: x.unread > 0 ? x.unread : null,
          time: waited(x.at),
          urgent: x.urgent,
        })),
      },
      {
        id: 'confirm',
        group: 'orders',
        show: can?.('orders') && L.ordersConfirm,
        icon: 'clock',
        title: 'Close to the confirmation deadline',
        hint: 'The store has not confirmed yet; at the deadline it is frozen. Urgent under 6 hours.',
        count: c.ordersConfirm,
        urgent: U.ordersConfirm,
        more: { to: '/admin/orders?status=pending', label: 'Pending orders' },
        rows: (L.ordersConfirm || []).map((x) => ({
          key: `${x.id}:${x.sellerId}`,
          go: () => navigate(orderPath(x.id)),
          title: <>#{x.orderNumber}</>,
          store: store(x),
          sub: x.depositWaiting ? 'Deposit waiting for approval' : x.short ? 'Wallet too low to confirm' : 'Wallet covers it',
          subTone: x.depositWaiting ? 'blue' : x.short ? 'red' : '',
          amount: usd(x.value),
          due: x.hoursLeft < 0 ? `${span(x.hoursLeft)} over` : `${span(x.hoursLeft)} left`,
          urgent: x.urgent,
        })),
      },
      {
        id: 'decision',
        group: 'orders',
        show: can?.('orders') && L.ordersDecision,
        icon: 'alert',
        title: 'Delivery problems — decision needed',
        hint: 'Delivery failed or the parcel came back. These never move by themselves.',
        count: c.ordersDecision,
        urgent: U.ordersDecision,
        rows: (L.ordersDecision || []).map((x) => ({
          key: x.id,
          go: () => navigate(orderPath(x.id)),
          title: <>#{x.orderNumber}</>,
          store: store(x),
          sub: STATUS_LABELS[x.status] || x.status,
          amount: usd(x.value),
          time: waited(x.at),
          urgent: x.urgent,
        })),
      },
      {
        id: 'stuck',
        group: 'orders',
        show: can?.('orders') && L.ordersStuck,
        icon: 'truck',
        title: 'Orders that stopped moving',
        hint: 'The next delivery step is more than an hour overdue. Often the store wallet could not cover it.',
        count: c.ordersStuck,
        urgent: U.ordersStuck,
        rows: (L.ordersStuck || []).map((x) => ({
          key: x.id,
          go: () => navigate(orderPath(x.id)),
          title: <>#{x.orderNumber}</>,
          store: store(x),
          sub: `${STATUS_LABELS[x.status] || x.status} → ${STATUS_LABELS[x.nextStatus] || x.nextStatus || 'next step'}`,
          amount: usd(x.value),
          due: `${span(x.hoursOver)} overdue`,
          urgent: x.urgent,
        })),
      },
      {
        id: 'late',
        group: 'orders',
        show: can?.('orders') && L.ordersLate,
        icon: 'package',
        title: `Taking longer than ${late} days`,
        hint: `Confirmed more than ${late} days ago and still not delivered.`,
        count: c.ordersLate,
        urgent: U.ordersLate,
        rows: (L.ordersLate || []).map((x) => ({
          key: x.id,
          go: () => navigate(orderPath(x.id)),
          title: <>#{x.orderNumber}</>,
          store: store(x),
          sub: STATUS_LABELS[x.status] || x.status,
          amount: usd(x.value),
          due: `${x.days} days`,
          urgent: x.urgent,
        })),
      },
      {
        id: 'health',
        group: 'stores',
        show: can?.('sellers') && L.criticalHealth,
        icon: 'shield',
        title: 'Stores in critical health',
        hint: 'Account health below 40. Review the store — nothing is suspended automatically.',
        count: c.criticalHealth,
        urgent: U.criticalHealth,
        rows: (L.criticalHealth || []).map((x) => ({
          key: x.sellerId,
          go: () => navigate(profilePath(x.sellerId, 'health')),
          title: store(x),
          sub: `Health ${x.score}/100`,
          subTone: 'red',
          tag: x.status === 'frozen' ? { text: 'Frozen', tone: 'blue' } : null,
          time: x.at ? waited(x.at) : '',
          urgent: x.urgent,
        })),
      },
      {
        id: 'applications',
        group: 'stores',
        show: can?.('sellers') && L.applications,
        icon: 'users',
        title: 'New store applications',
        count: c.applications,
        more: { to: '/admin/applications', label: 'Open Applications' },
        rows: (L.applications || []).map((x) => ({
          key: x.sellerId,
          go: () => navigate('/admin/applications'),
          title: x.storeName,
          sub: x.ownerName,
          time: waited(x.at),
        })),
      },
      {
        id: 'diamond',
        group: 'stores',
        show: can?.('sellers') && L.diamond,
        icon: 'sparkle',
        title: 'Diamond upgrade requests',
        count: c.diamond,
        rows: (L.diamond || []).map((x) => ({
          key: x.sellerId,
          go: () => navigate(profilePath(x.sellerId, 'upgrades')),
          title: store(x),
          sub: x.status === 'awaiting_approval' ? 'Fee entered — waiting for the partner’s approval' : 'Asked to upgrade',
          tag: x.status === 'awaiting_approval' ? { text: 'Partner approval', tone: 'violet' } : null,
          time: x.at ? waited(x.at) : '',
        })),
      },
      {
        id: 'refunds',
        group: 'refunds',
        show: can?.('refunds') && L.refunds,
        icon: 'refresh',
        title: 'Refund requests',
        count: c.refunds,
        more: { to: '/admin/refunds', label: 'Open Refunds' },
        rows: (L.refunds || []).map((x) => ({
          key: x.id,
          go: () => navigate('/admin/refunds'),
          title: <>#{x.orderNumber || '—'}</>,
          store: x.storeName ? store(x) : null,
          sub: x.customer || 'Customer',
          amount: usd(x.amount),
          time: waited(x.at),
        })),
      },
    ].filter((s) => s.show);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, can, navigate]);

  const groups = GROUPS.map((g) => {
    const list = sections.filter((s) => s.group === g.key);
    return { ...g, visible: list.length > 0, count: list.reduce((t, s) => t + (s.count || 0), 0), urgent: list.reduce((t, s) => t + (s.urgent || 0), 0) };
  }).filter((g) => g.visible);
  const total = c.total || 0;
  const urgentTotal = U.total || 0;

  const shown = sections
    .filter((s) => group === 'all' || s.group === group)
    .map((s) => ({ ...s, rows: urgentOnly ? s.rows.filter((r) => r.urgent) : s.rows }))
    .filter((s) => s.count > 0 && s.rows.length > 0);
  // lists with urgent items first (otherwise in their usual order)
  shown.sort((a, b) => (b.urgent > 0) - (a.urgent > 0));
  const clear = sections.filter((s) => !s.count && (group === 'all' || s.group === group));

  const now = new Date();
  const hour = now.getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const groupLabel = group === 'all' ? '' : GROUPS.find((g) => g.key === group)?.label || '';

  return (
    <div className="td">
      <header className="td-head">
        <div>
          <p className="td-date">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <h1>Today</h1>
          <p className="td-sub">
            {loading && !data ? (
              'Checking what needs you…'
            ) : total ? (
              <>
                {hello}. <b>{total}</b> {total === 1 ? 'item is' : 'items are'} waiting
                {urgentTotal > 0 && (
                  <>
                    {' '}
                    — <b className="td-red">{urgentTotal} urgent</b>
                  </>
                )}
                .
              </>
            ) : (
              <>{hello}. Nothing is waiting for you.</>
            )}
          </p>
        </div>
        <div className="td-head-side">
          {data?.at && <span className="td-updated">Updated {waited(data.at)}</span>}
          <button type="button" className="td-btn" onClick={() => load(true)} disabled={loading}>
            <Ic name="refresh" size={15} /> {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {err && (
        <div className="td-err">
          <Ic name="alert" size={16} /> {err}
          <button type="button" onClick={() => load(true)}>
            Try again
          </button>
        </div>
      )}

      {data && (
        <div className="td-tiles" role="tablist" aria-label="Areas">
          <button type="button" role="tab" aria-selected={group === 'all'} className={`td-tile ${group === 'all' ? 'on' : ''}`} onClick={() => setGroup('all')}>
            <span className="td-tile-top">
              <span className="td-tile-ico">
                <Ic name="grid" size={15} />
              </span>
              All
            </span>
            <b>{total}</b>
            <small className={urgentTotal ? 'red' : ''}>{urgentTotal ? `${urgentTotal} urgent` : total ? 'none urgent' : 'all clear'}</small>
          </button>
          {groups.map((g) => (
            <button
              type="button"
              role="tab"
              aria-selected={group === g.key}
              key={g.key}
              className={`td-tile ${group === g.key ? 'on' : ''} ${g.count ? '' : 'is-clear'}`}
              onClick={() => setGroup(g.key)}
            >
              <span className="td-tile-top">
                <span className="td-tile-ico">
                  <Ic name={g.icon} size={15} />
                </span>
                {g.label}
              </span>
              <b>{g.count}</b>
              <small className={g.urgent ? 'red' : ''}>{g.urgent ? `${g.urgent} urgent` : g.count ? 'none urgent' : 'all clear'}</small>
            </button>
          ))}
        </div>
      )}

      {data && (
        <div className="td-bar">
          <h2>{groupLabel || 'Everything waiting'}</h2>
          <label className={`td-switch ${urgentOnly ? 'on' : ''}`}>
            <input type="checkbox" checked={urgentOnly} onChange={(e) => setUrgentOnly(e.target.checked)} />
            <i aria-hidden="true" />
            Urgent only
          </label>
        </div>
      )}

      {loading && !data && (
        <div className="td-list">
          {[0, 1, 2].map((i) => (
            <div key={i} className="td-sec td-skel">
              <div />
              <div />
              <div />
            </div>
          ))}
        </div>
      )}

      {data && shown.length === 0 && (
        <div className="td-empty">
          <span>
            <Ic name="checkCircle" size={26} />
          </span>
          <h3>{urgentOnly ? 'Nothing urgent' : 'All clear'}</h3>
          <p>
            {urgentOnly
              ? 'No item has passed its time limit. Turn off “Urgent only” to see the rest.'
              : `Nothing is waiting${groupLabel ? ` in ${groupLabel}` : ''}. New items appear here by themselves.`}
          </p>
        </div>
      )}

      <div className="td-list">
        {shown.map((s) => (
          <section key={s.id} className={`td-sec ${s.urgent ? 'has-urgent' : ''}`} aria-label={s.title}>
            <header className="td-sec-head">
              <span className="td-sec-ico">
                <Ic name={s.icon} size={16} />
              </span>
              <div className="td-sec-title">
                <h3>
                  {s.title}
                  <em>{s.count}</em>
                  {s.urgent > 0 && <em className="red">{s.urgent} urgent</em>}
                </h3>
                {s.hint && <p>{s.hint}</p>}
              </div>
              {s.more && (
                <Link to={s.more.to} className="td-more">
                  {s.more.label} <Ic name="chevRight" size={14} />
                </Link>
              )}
            </header>
            <ul className="td-rows">
              {s.rows.map((r) => (
                <li key={r.key}>
                  <div
                    role="button"
                    tabIndex={0}
                    className={`td-row ${r.urgent ? 'urgent' : ''}`}
                    onClick={r.go}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        r.go();
                      }
                    }}
                  >
                    <span className="td-dot" aria-hidden="true" />
                    <span className="td-main">
                      <span className="td-title">
                        <b>{r.title}</b>
                        {r.store && <span className="td-store">{r.store}</span>}
                        {r.tag && <span className={`td-tag ${r.tag.tone}`}>{r.tag.text}</span>}
                        {r.badge && <span className="td-count">{r.badge}</span>}
                      </span>
                      {r.sub && <small className={r.subTone ? `t-${r.subTone}` : ''}>{r.sub}</small>}
                    </span>
                    <span className="td-amount">{r.amount || ''}</span>
                    <span className="td-time">
                      {r.due ? <span className={`td-due ${r.urgent ? 'red' : ''}`}>{r.due}</span> : r.time ? <span className={r.urgent ? 'td-due red' : ''}>{r.time}</span> : null}
                    </span>
                    <Ic name="chevRight" size={15} className="td-chev" />
                  </div>
                </li>
              ))}
            </ul>
            {!urgentOnly && s.count > s.rows.length && (
              <div className="td-sec-foot">
                Showing {s.rows.length} of {s.count}
                {s.more && (
                  <>
                    {' · '}
                    <Link to={s.more.to}>see all</Link>
                  </>
                )}
              </div>
            )}
          </section>
        ))}
      </div>

      {data && clear.length > 0 && !urgentOnly && (
        <div className="td-clear">
          <span>
            <Ic name="check" size={13} /> Nothing waiting:
          </span>
          {clear.map((s) => (
            <em key={s.id}>{s.title}</em>
          ))}
        </div>
      )}
    </div>
  );
}
