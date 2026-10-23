import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import { getSocket } from '../socket.js';
import Ic from '../components/Icons.jsx';
import StoreLink from './hub/StoreLink.jsx';
import { HUB_REFRESH_EVENT, STATUS_LABELS, ago, chatPath, orderPath, profilePath, usd } from './hub/hubBus.js';

/**
 * TODAY — everything that waits for an admin, in one place, oldest / most urgent first:
 * chats without a reply, deposits and withdrawals to check, payout limit requests, orders close to
 * the confirmation deadline, delivery problems, orders that stopped moving or are taking too long,
 * new applications, Diamond requests and refund requests. Only what this admin's role covers.
 */
const hoursLabel = (h) => {
  const abs = Math.abs(h);
  const txt = abs >= 24 ? `${Math.floor(abs / 24)}d ${Math.round(abs % 24)}h` : abs >= 1 ? `${Math.floor(abs)}h ${Math.round((abs % 1) * 60)}m` : `${Math.round(abs * 60)}m`;
  return h < 0 ? `${txt} over the deadline` : `${txt} left`;
};

export default function Today() {
  const { can } = useOutletContext() || {};
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);
  const timer = useRef(null);

  const load = useCallback((fresh = false) => {
    if (fresh) setLoading(true);
    api(`/admin-hub/today${fresh ? '?fresh=1' : ''}`)
      .then((d) => {
        setData(d);
        setErr('');
      })
      .catch((e) => setErr(e.message))
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
    const events = ['notify', 'message:new', 'order:new', 'order:update', 'withdrawal:new', 'sellers:changed', 'chat:broadcast_done'];
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
  const L = data?.lists || {};
  const late = data?.rules?.lateDeliveryDays || 7;

  // every section: what it is, who may see it, its rows
  const sections = [
    {
      id: 'chats',
      show: can?.('chat') && L.chats,
      icon: '💬',
      title: 'Chats waiting for a reply',
      count: c.chats,
      tone: 'blue',
      more: { to: '/admin/chat', label: 'Support desk' },
      rows: (L.chats || []).map((x) => ({
        key: x.id,
        onClick: () => navigate(chatPath(x.id)),
        main: x.name,
        sub: x.lastMessage,
        right: ago(x.at),
        urgent: Date.now() - new Date(x.at).getTime() > 30 * 60000,
      })),
    },
    {
      id: 'deposits',
      show: can?.('finance') && L.deposits,
      icon: '↓',
      title: 'Deposits to check',
      count: c.deposits,
      tone: 'green',
      more: { to: '/admin/withdrawals', label: 'Payouts' },
      rows: (L.deposits || []).map((x) => ({
        key: x.id,
        onClick: () => navigate('/admin/withdrawals'),
        main: <StoreLink id={x.sellerId} name={x.storeName} />,
        sub: x.ref ? `UTR ${x.ref}` : x.status === 'processing' ? 'Being applied…' : 'Waiting for approval',
        amount: usd(x.amount),
        right: ago(x.at),
        urgent: Date.now() - new Date(x.at).getTime() > 2 * 3600000,
      })),
    },
    {
      id: 'withdrawals',
      show: can?.('finance') && L.withdrawals,
      icon: '↑',
      title: 'Withdrawals to pay',
      count: c.withdrawals,
      tone: 'violet',
      more: { to: '/admin/withdrawals', label: 'Payouts' },
      rows: (L.withdrawals || []).map((x) => ({
        key: x.id,
        onClick: () => navigate('/admin/withdrawals'),
        main: <StoreLink id={x.sellerId} name={x.storeName} />,
        sub: x.status === 'processing' ? 'Being applied…' : 'Waiting for payout',
        amount: usd(x.amount),
        right: ago(x.at),
        urgent: Date.now() - new Date(x.at).getTime() > 24 * 3600000,
      })),
    },
    {
      id: 'confirm',
      show: can?.('orders') && L.ordersConfirm,
      icon: '⏰',
      title: 'Orders close to the confirmation deadline',
      hint: 'The store has not confirmed yet. At the deadline the store is frozen.',
      count: c.ordersConfirm,
      tone: 'amber',
      more: { to: '/admin/orders?status=pending', label: 'Pending orders' },
      rows: (L.ordersConfirm || []).map((x) => ({
        key: `${x.id}:${x.sellerId}`,
        onClick: () => navigate(orderPath(x.id)),
        main: (
          <>
            #{x.orderNumber} · <StoreLink id={x.sellerId} name={x.storeName} />
          </>
        ),
        sub: hoursLabel(x.hoursLeft),
        amount: usd(x.value),
        urgent: x.hoursLeft < 6,
      })),
    },
    {
      id: 'decision',
      show: can?.('orders') && L.ordersDecision,
      icon: '🚚',
      title: 'Delivery problems — your decision needed',
      hint: 'Delivery failed or the parcel came back. These never move by themselves.',
      count: c.ordersDecision,
      tone: 'red',
      rows: (L.ordersDecision || []).map((x) => ({
        key: x.id,
        onClick: () => navigate(orderPath(x.id)),
        main: (
          <>
            #{x.orderNumber} · <StoreLink id={x.sellerId} name={x.storeName} />
          </>
        ),
        sub: STATUS_LABELS[x.status] || x.status,
        amount: usd(x.value),
        right: ago(x.at),
        urgent: true,
      })),
    },
    {
      id: 'stuck',
      show: can?.('orders') && L.ordersStuck,
      icon: '⚠️',
      title: 'Orders that stopped moving',
      hint: 'The next delivery step is overdue (it did not move by itself). Open the order to check — often the store wallet could not cover it.',
      count: c.ordersStuck,
      tone: 'red',
      rows: (L.ordersStuck || []).map((x) => ({
        key: x.id,
        onClick: () => navigate(orderPath(x.id)),
        main: (
          <>
            #{x.orderNumber} · <StoreLink id={x.sellerId} name={x.storeName} />
          </>
        ),
        sub: `${STATUS_LABELS[x.status] || x.status} → ${STATUS_LABELS[x.nextStatus] || x.nextStatus || 'next step'} · ${Math.round(x.hoursOver)}h overdue`,
        amount: usd(x.value),
        urgent: true,
      })),
    },
    {
      id: 'late',
      show: can?.('orders') && L.ordersLate,
      icon: '🐢',
      title: `Taking longer than ${late} days`,
      hint: `Confirmed more than ${late} days ago and still not delivered.`,
      count: c.ordersLate,
      tone: 'amber',
      rows: (L.ordersLate || []).map((x) => ({
        key: x.id,
        onClick: () => navigate(orderPath(x.id)),
        main: (
          <>
            #{x.orderNumber} · <StoreLink id={x.sellerId} name={x.storeName} />
          </>
        ),
        sub: `${STATUS_LABELS[x.status] || x.status} · ${x.days} days since confirmed`,
        amount: usd(x.value),
        urgent: x.days >= late + 3,
      })),
    },
    {
      id: 'limits',
      show: can?.('finance') && L.limitRequests,
      icon: '📈',
      title: 'Payout limit requests',
      count: c.limitRequests,
      tone: 'blue',
      more: { to: '/admin/withdrawals', label: 'Payouts' },
      rows: (L.limitRequests || []).map((x) => ({
        key: x.sellerId,
        onClick: () => navigate('/admin/withdrawals'),
        main: <StoreLink id={x.sellerId} name={x.storeName} />,
        sub: x.status === 'accepted_by_seller' ? 'Store accepted your offer — finalize it' : `Asked for ${x.requested ? usd(x.requested) : 'a higher limit'}`,
        right: x.at ? ago(x.at) : '',
      })),
    },
    {
      id: 'applications',
      show: can?.('sellers') && L.applications,
      icon: '🆕',
      title: 'New store applications',
      count: c.applications,
      tone: 'green',
      more: { to: '/admin/applications', label: 'Applications' },
      rows: (L.applications || []).map((x) => ({
        key: x.sellerId,
        onClick: () => navigate('/admin/applications'),
        main: x.storeName,
        sub: x.ownerName,
        right: ago(x.at),
      })),
    },
    {
      id: 'diamond',
      show: can?.('sellers') && L.diamond,
      icon: '💎',
      title: 'Diamond upgrade requests',
      count: c.diamond,
      tone: 'violet',
      rows: (L.diamond || []).map((x) => ({
        key: x.sellerId,
        onClick: () => navigate(profilePath(x.sellerId, 'upgrades')),
        main: <StoreLink id={x.sellerId} name={x.storeName} />,
        sub: x.status === 'awaiting_approval' ? 'Fee entered — waiting for the partner’s approval' : 'Asked to upgrade',
        right: x.at ? ago(x.at) : '',
      })),
    },
    {
      id: 'health',
      show: can?.('sellers') && L.criticalHealth,
      icon: '🛡️',
      title: 'Stores in critical health',
      hint: 'Account health below 40. Review the store — nothing is suspended automatically.',
      count: c.criticalHealth,
      tone: 'red',
      rows: (L.criticalHealth || []).map((x) => ({
        key: x.sellerId,
        onClick: () => navigate(profilePath(x.sellerId, 'health')),
        main: <StoreLink id={x.sellerId} name={x.storeName} />,
        sub: `Health ${x.score}/100${x.status === 'frozen' ? ' · frozen' : ''}`,
        right: x.at ? ago(x.at) : '',
        urgent: x.score < 20,
      })),
    },
    {
      id: 'refunds',
      show: can?.('refunds') && L.refunds,
      icon: '↩️',
      title: 'Refund requests',
      count: c.refunds,
      tone: 'amber',
      more: { to: '/admin/refunds', label: 'Refunds' },
      rows: (L.refunds || []).map((x) => ({
        key: x.id,
        onClick: () => navigate('/admin/refunds'),
        main: `#${x.orderNumber || '—'}`,
        sub: x.customer || 'Customer',
        amount: usd(x.amount),
        right: ago(x.at),
      })),
    },
  ].filter((s) => s.show);

  const busy = sections.filter((s) => s.count > 0);
  const clear = sections.filter((s) => !s.count);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="hub-today">
      <div className="hub-today-head">
        <div>
          <h1>{hello} 👋</h1>
          <p>
            {loading && !data
              ? 'Checking what needs you…'
              : c.total
              ? `${c.total} ${c.total === 1 ? 'thing needs' : 'things need'} your attention.`
              : 'Nothing is waiting for you. All clear ✓'}
            {data?.at && <span className="hub-muted"> · updated {ago(data.at) === 'just now' ? 'just now' : `${ago(data.at)} ago`}</span>}
          </p>
        </div>
        <button type="button" className="hub-btn" onClick={() => load(true)} disabled={loading}>
          <Ic name="refresh" size={15} /> {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {err && <div className="hub-err">{err}</div>}

      {busy.length > 0 && (
        <div className="hub-chips">
          {busy.map((s) => (
            <a key={s.id} href={`#today-${s.id}`} className={`hub-chip tone-${s.tone}`}>
              <span>{s.icon}</span> {s.title} <b>{s.count}</b>
            </a>
          ))}
        </div>
      )}

      <div className="hub-grid">
        {busy.map((s) => (
          <section key={s.id} id={`today-${s.id}`} className={`hub-card tone-${s.tone}`}>
            <header>
              <span className="hub-card-ico">{s.icon}</span>
              <div>
                <h3>
                  {s.title} <em>{s.count}</em>
                </h3>
                {s.hint && <p>{s.hint}</p>}
              </div>
              {s.more && (
                <Link to={s.more.to} className="hub-more">
                  {s.more.label} <Ic name="chevRight" size={14} />
                </Link>
              )}
            </header>
            <ul>
              {s.rows.map((r) => (
                <li key={r.key}>
                  <div role="button" tabIndex={0} className={`hub-row ${r.urgent ? 'urgent' : ''}`} onClick={r.onClick} onKeyDown={(e) => e.key === 'Enter' && r.onClick()}>
                    <span className="hub-row-main">
                      <b>{r.main}</b>
                      {r.sub && <small>{r.sub}</small>}
                    </span>
                    <span className="hub-row-side">
                      {r.amount && <b>{r.amount}</b>}
                      {r.right && <small>{r.right}</small>}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            {s.count > s.rows.length && <div className="hub-card-foot">+ {s.count - s.rows.length} more</div>}
          </section>
        ))}
      </div>

      {clear.length > 0 && (
        <div className="hub-clear">
          <span>✓ All clear:</span>
          {clear.map((s) => (
            <em key={s.id}>
              {s.icon} {s.title}
            </em>
          ))}
        </div>
      )}

    </div>
  );
}
