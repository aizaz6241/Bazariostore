import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, fmtDate } from '../api.js';
import { useAuth } from '../auth.jsx';
import { getSocket } from '../socket.js';
import Ic from '../components/Icons.jsx';
import FloatingChatWidget from '../components/FloatingChatWidget.jsx';
import NotificationToast from '../components/NotificationToast.jsx';
import { playNotificationSound } from '../utils/audio.js';
import { enablePush, pushState } from '../utils/push.js';
import CommandPalette from './hub/CommandPalette.jsx';
import SellerPeek from './hub/SellerPeek.jsx';
import { HUB_REFRESH_EVENT, openSearch } from './hub/hubBus.js';

// Sidebar, grouped by job. Same links and permissions as before.
const NAV_GROUPS = [
  {
    title: 'Overview',
    items: [
      { to: '/admin', icon: 'grid', label: 'Dashboard', end: true },
      { to: '/admin/reports', icon: 'chart', label: 'Analytics & Reports', perm: 'reports' },
    ],
  },
  {
    title: 'Commerce',
    items: [
      { to: '/admin/orders', icon: 'box', label: 'Orders', perm: 'orders', badge: 'orders' },
      { to: '/admin/treasury', icon: 'package', label: 'Product Treasury', perm: 'products' },
      { to: '/admin/complaints', icon: 'alert', label: 'Complaints', perm: 'sellers' },
    ],
  },
  {
    title: 'Sellers',
    items: [
      { to: '/admin/sellers', icon: 'users', label: 'Sellers & Vendors', perm: 'sellers', badge: 'diamond' },
      { to: '/admin/applications', icon: 'badgeCheck', label: 'New Applications', perm: 'sellers', badge: 'applications' },
      { to: '/admin/affiliates', icon: 'tag', label: 'Affiliate Codes', perm: 'sellers' },
      { to: '/admin/targets', icon: 'trend', label: 'Targets & Bonuses', perm: 'sellers' },
      { to: '/admin/chat', icon: 'chat', label: 'Seller Support Desk', perm: 'chat', badge: 'chats' },
    ],
  },
  {
    title: 'Finance',
    items: [{ to: '/admin/withdrawals', icon: 'banknote', label: 'Payouts', perm: 'finance', badge: 'payouts' }],
  },
  {
    title: 'System',
    items: [
      { to: '/admin/staff', icon: 'user', label: 'Staff & Team', perm: 'staff' },
      { to: '/admin/backup', icon: 'database', label: 'Database Backup', perm: 'backup' },
    ],
  },
];
const NAV = NAV_GROUPS.flatMap((g) => g.items);

const ROLE_TITLES = {
  super_admin: 'Super Admin Control Center',
  admin: 'Administrator',
  manager: 'Store Manager',
  support: 'Support Agent',
  order_manager: 'Order Fulfillment',
  inventory: 'Inventory Specialist',
};

function storedAdmin() {
  try {
    return JSON.parse(localStorage.getItem('ng_admin') || 'null') || { name: localStorage.getItem('ng_admin_name') || 'Admin', permissions: [] };
  } catch {
    return { name: 'Admin', permissions: [] };
  }
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logoutAdmin } = useAuth();
  const token = localStorage.getItem('ng_admin_token');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [admin, setAdmin] = useState(storedAdmin);
  // The role / permissions saved at login can be out of date (changed on the Staff screen since):
  // ask the server for the current ones, and again whenever this tab comes back into focus.
  useEffect(() => {
    if (!token) return undefined;
    const refresh = () =>
      api('/auth/me')
        .then((res) => {
          if (!res?.admin) return;
          const prev = storedAdmin();
          const next = { ...prev, ...res.admin };
          localStorage.setItem('ng_admin', JSON.stringify(next));
          // access changed: re-join so live updates follow the new permissions
          if (prev.role !== next.role || JSON.stringify(prev.permissions || []) !== JSON.stringify(next.permissions || [])) {
            const t = localStorage.getItem('ng_admin_token');
            if (t) getSocket()?.emit('admin:join', { token: t });
          }
          setAdmin((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
        })
        .catch(() => {});
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [token]);
  const can = (n) => {
    if (typeof n === 'string') return !n || admin.role === 'super_admin' || (admin.permissions || []).includes(n);
    if (n?.superAdminOnly) return admin.role === 'super_admin';
    return !n?.perm || admin.role === 'super_admin' || (admin.permissions || []).includes(n.perm);
  };

  const [toasts, setToasts] = useState([]);

  // How many things wait in each part of the panel (menu badges); live: every 45 s, when this tab
  // comes back, after an action, and a moment after a live event (new order, message, deposit…)
  const [hubCounts, setHubCounts] = useState({});
  useEffect(() => {
    if (!token) return undefined;
    let timer = null;
    const load = () =>
      api('/admin-hub/counts')
        .then((d) => d?.counts && setHubCounts(d.counts))
        .catch(() => {});
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 2500);
    };
    load();
    const every = setInterval(load, 45000);
    window.addEventListener('focus', soon);
    window.addEventListener(HUB_REFRESH_EVENT, soon);
    const socket = getSocket();
    const events = ['notify', 'message:new', 'order:new', 'order:update', 'withdrawal:new', 'sellers:changed', 'chat:broadcast_done'];
    events.forEach((ev) => socket.on(ev, soon));
    return () => {
      clearInterval(every);
      clearTimeout(timer);
      window.removeEventListener('focus', soon);
      window.removeEventListener(HUB_REFRESH_EVENT, soon);
      events.forEach((ev) => socket.off(ev, soon));
    };
  }, [token]);
  const [notif, setNotif] = useState({ items: [], unread: 0 });
  const [bellOpen, setBellOpen] = useState(false);
  // Phone push: silently re-register when already allowed; otherwise show an "Enable alerts" button
  const [pushPerm, setPushPerm] = useState(() => pushState());
  useEffect(() => {
    if (pushState() === 'granted') enablePush('admin').then(setPushPerm);
  }, []);
  const bellRef = useRef(null);

  const addToast = (toast) => {
    const id = Date.now() + Math.random().toString(36).slice(2, 6);
    setToasts((prev) => [...prev.slice(-4), { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6500);
  };

  const loadNotif = () => api('/notifications').then(setNotif).catch(() => {});

  // WhatsApp-style: while this panel is on screen and in use, tell the server, so chat pushes are
  // not sent to this admin's other devices (phone / laptop) at the same time
  useEffect(() => {
    if (!token) return undefined;
    const socket = getSocket();
    let lastInput = Date.now();
    const onInput = () => { lastInput = Date.now(); };
    const isActive = () =>
      document.visibilityState === 'visible' && (typeof document.hasFocus !== 'function' || document.hasFocus()) && Date.now() - lastInput < 2 * 60 * 1000;
    let lastSent = null;
    const beat = (force) => {
      const active = isActive();
      if (!force && active === false && lastSent === false) return; // already said "away"
      lastSent = active;
      try { socket.emit('admin:active', { active }); } catch {}
    };
    const onChange = () => { if (document.visibilityState === 'visible') onInput(); beat(true); };
    const inputEvents = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'mousemove'];
    inputEvents.forEach((e) => window.addEventListener(e, onInput, { passive: true }));
    document.addEventListener('visibilitychange', onChange);
    window.addEventListener('focus', onChange);
    window.addEventListener('blur', onChange);
    socket.on('connect', onChange);
    beat(true);
    const t = setInterval(() => beat(false), 20000);
    return () => {
      clearInterval(t);
      inputEvents.forEach((e) => window.removeEventListener(e, onInput));
      document.removeEventListener('visibilitychange', onChange);
      window.removeEventListener('focus', onChange);
      window.removeEventListener('blur', onChange);
      socket.off('connect', onChange);
    };
  }, [token]);

  useEffect(() => {
    if (!token) {
      navigate('/admin/login');
      return;
    }
    loadNotif();
    const socket = getSocket();
    // read the token when joining, not when this screen opened: after a logout / account switch
    // a reconnect must never re-join the admin room with the old admin's token
    const join = () => {
      const t = localStorage.getItem('ng_admin_token');
      if (t) socket.emit('admin:join', { token: t });
    };
    join();
    socket.on('connect', join);

    const onOrder = (o) => {
      playNotificationSound('order');
      addToast({
        type: 'order',
        title: '🛒 New Order Received!',
        body: `Order #${o.orderNumber || ''} created`,
        link: `/admin/orders/${o._id}`,
      });
    };

    const onMessage = (msg) => {
      if (msg.sender === 'seller' || msg.sender === 'guest' || msg.sender === 'customer') {
        playNotificationSound('chat');
        addToast({
          type: 'chat',
          title: `💬 New message from ${msg.senderName || 'Seller'}`,
          body: msg.text ? (msg.text.length > 80 ? msg.text.slice(0, 80) + '...' : msg.text) : 'Sent an attachment',
          link: '/admin/chat',
        });
      }
    };

    const onNotify = (n) => {
      // a chat message already showed its own toast and sound (onMessage): the bell only
      // (every seller message used to ring twice and show two toasts)
      if (n.type === 'chat') {
        loadNotif();
        return;
      }
      const soundType = n.type === 'deposit' ? 'deposit' : n.type === 'withdrawal' ? 'withdrawal' : n.type === 'approval' ? 'approval' : n.type === 'order' ? 'order' : 'default';
      playNotificationSound(soundType);
      addToast({
        type: n.type || 'system',
        title: n.title || 'System Notification',
        body: n.body || '',
        link: n.link || '/admin',
      });
      loadNotif();
    };

    // the server closed this admin account (switched off / deleted): check with the server, which
    // answers 401 and signs this browser out
    const onSessionEnded = () => {
      api('/auth/me').catch(() => {});
    };

    socket.on('order:new', onOrder);
    socket.on('message:new', onMessage);
    socket.on('notify', onNotify);
    socket.on('admin:session_ended', onSessionEnded);

    return () => {
      socket.off('connect', join);
      socket.off('order:new', onOrder);
      socket.off('message:new', onMessage);
      socket.off('notify', onNotify);
      socket.off('admin:session_ended', onSessionEnded);
    };
  }, [token, navigate]);

  useEffect(() => {
    const fn = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  if (!token) return null;

  // the menu entry that matches the open page (longest match wins: /admin/orders/123 -> Orders)
  const path = location.pathname.replace(/\/+$/, '') || '/admin';
  const currentPage = NAV.filter((n) => (n.end ? path === n.to : path === n.to || path.startsWith(n.to + '/'))).sort((a, b) => b.to.length - a.to.length)[0];

  const logout = () => {
    logoutAdmin();
    navigate('/admin/login');
  };

  const NOTIF_ICONS = { order: 'package', payment: 'banknote', refund: 'refresh', customer: 'user', stock: 'box', chat: 'chat', system: 'sparkle' };

  return (
    <div className="admin">
      {/* Mobile Drawer Overlay Backdrop */}
      {mobileSidebarOpen && (
        <div className="mobile-drawer-backdrop" onClick={() => setMobileSidebarOpen(false)}></div>
      )}

      <aside
        className={`admin-side ${mobileSidebarOpen ? 'mobile-open drawer-open' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-logo">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div>
              <span className="logo-script">Bazario</span>
              <span className="logo-name">ADMIN HUB</span>
            </div>
            <button className="mobile-close-drawer" onClick={() => setMobileSidebarOpen(false)}>✕</button>
          </div>
          <small>{ROLE_TITLES[admin.role] || 'Admin Control Center'}</small>
        </div>
        <nav>
          {NAV_GROUPS.map((g) => {
            const items = g.items.filter(can);
            if (!items.length) return null;
            return (
              <div className="admin-nav-group" key={g.title}>
                <span className="admin-nav-title">{g.title}</span>
                {items.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    onClick={() => setMobileSidebarOpen(false)}
                  >
                    <Ic name={n.icon} size={17} /> {n.label}
                    {n.badge && hubCounts[n.badge] > 0 && (
                      <span className={`nav-hub-badge ${n.badge === 'total' ? 'is-total' : ''}`}>{hubCounts[n.badge] > 99 ? '99+' : hubCounts[n.badge]}</span>
                    )}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="admin-side-bottom">
          <Link to="/seller" target="_blank"><Ic name="tag" size={16} /> Seller Central</Link>
          <Link to="/" target="_blank"><Ic name="eye" size={16} /> Customer Storefront</Link>
          <button onClick={logout}><Ic name="logout" size={16} /> Logout</button>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-top">
          <div className="admin-top-title">
            <button className="mobile-hamburger-btn" onClick={() => setMobileSidebarOpen(true)} aria-label="Toggle Menu">
              <Ic name="menu" size={22} />
            </button>
            <span className="admin-top-crumb hide-on-mobile">
              <small>Bazario Admin</small>
              <b>{currentPage?.label || 'Control Center'}</b>
            </span>
            <b className="show-on-mobile" style={{ fontSize: 14 }}>{currentPage?.label || 'Bazario Admin'}</b>
          </div>
          <span className="admin-top-right">
            <button type="button" className="hub-search-btn" onClick={openSearch} title="Search stores, orders, chats, UTR, pages (Ctrl + K)" aria-label="Search">
              <Ic name="search" size={17} />
              <span className="hide-on-mobile">Search…</span>
              <kbd className="hide-on-mobile">Ctrl K</kbd>
            </button>
            {pushPerm !== 'granted' && pushPerm !== 'unsupported' && (
              <button
                type="button"
                onClick={async () => setPushPerm(await enablePush('admin', { ask: true }))}
                title={pushPerm === 'denied' ? 'Notifications are blocked in this browser/phone settings' : 'Get phone notifications'}
                style={{ border: '1px solid #f59e0b', background: '#fffbeb', color: '#92400e', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700, marginRight: 6 }}
              >
                🔔 {pushPerm === 'denied' ? 'Alerts blocked' : 'Enable alerts'}
              </button>
            )}
            <span className="bell-wrap" ref={bellRef}>
              <button className="bell" onClick={() => { setBellOpen(!bellOpen); }} aria-label="Notifications">
                <Ic name="bell" size={20} />
                {notif.unread > 0 && <span className="bell-badge">{notif.unread}</span>}
              </button>
              {bellOpen && (
                <div className="bell-panel">
                  <div className="bell-head">
                    <b>Notifications</b>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // show it at once, then confirm with the server
                        setNotif((cur) => ({ ...cur, unread: 0, items: (cur.items || []).map((x) => ({ ...x, read: true })) }));
                        api('/notifications/read-all', { method: 'POST' }).catch(() => {}).finally(loadNotif);
                      }}
                    >Mark all read</button>
                  </div>
                  {notif.items.length === 0 && <p className="muted-sm bell-empty">No notifications yet.</p>}
                  {notif.items.map((n) => (
                    <button
                      key={n._id}
                      className={'bell-item' + (n.read ? '' : ' unread')}
                      onClick={() => {
                        if (!n.read) setNotif((cur) => ({ ...cur, unread: Math.max(0, (cur.unread || 0) - 1), items: cur.items.map((x) => (x._id === n._id ? { ...x, read: true } : x)) }));
                        api(`/notifications/${n._id}/read`, { method: 'POST' }).catch(() => {}).finally(loadNotif);
                        setBellOpen(false);
                        if (n.link) navigate(n.link);
                      }}
                    >
                      <i><Ic name={NOTIF_ICONS[n.type] || 'sparkle'} size={15} /></i>
                      <span><b>{n.title}</b><small>{n.body}</small><small className="muted">{fmtDate(n.createdAt)}</small></span>
                    </button>
                  ))}
                </div>
              )}
            </span>
            <span className="admin-user"><span className="admin-av">{(admin.name || 'A')[0]}</span> <span className="hide-on-mobile">{admin.name}</span></span>
          </span>
        </header>
        <div className="admin-content">
          <Outlet context={{ admin, can }} />
        </div>
      </div>

      {/* Global Floating Live Notification Toast Banner Stack */}
      <NotificationToast
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />

      {/* Ctrl + K search and the store quick-view panel (open from anywhere) */}
      <CommandPalette pages={NAV.filter(can)} />
      <SellerPeek can={can} />

      {/* Floating Chat Widget for Super Admin */}
      <FloatingChatWidget role="admin" />
    </div>
  );
}
