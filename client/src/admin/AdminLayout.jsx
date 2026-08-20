import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, fmtDate } from '../api.js';
import { getSocket } from '../socket.js';
import Ic from '../components/Icons.jsx';
import FloatingChatWidget from '../components/FloatingChatWidget.jsx';
import NotificationToast from '../components/NotificationToast.jsx';
import { playNotificationSound } from '../utils/audio.js';

const NAV = [
  { to: '/admin', icon: 'grid', label: 'Dashboard', end: true },
  { to: '/admin/sellers', icon: 'package', label: 'Sellers & Vendors', perm: 'sellers' },
  { to: '/admin/withdrawals', icon: 'banknote', label: 'Withdrawal Requests', perm: 'finance' },
  { to: '/admin/chat', icon: 'chat', label: 'Seller Support Desk', perm: 'chat' },
  { to: '/admin/staff', icon: 'user', label: 'Staff & Team', perm: 'staff' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const token = localStorage.getItem('ng_admin_token');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const admin = (() => {
    try {
      return JSON.parse(localStorage.getItem('ng_admin') || 'null') || { name: localStorage.getItem('ng_admin_name') || 'Admin', permissions: [] };
    } catch {
      return { name: 'Admin', permissions: [] };
    }
  })();
  const can = (perm) => !perm || admin.role === 'super_admin' || (admin.permissions || []).includes(perm);

  const [toasts, setToasts] = useState([]);
  const [notif, setNotif] = useState({ items: [], unread: 0 });
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef(null);

  const addToast = (toast) => {
    const id = Date.now() + Math.random().toString(36).slice(2, 6);
    setToasts((prev) => [...prev.slice(-4), { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6500);
  };

  const loadNotif = () => api('/notifications').then(setNotif).catch(() => {});

  useEffect(() => {
    if (!token) {
      navigate('/admin/login');
      return;
    }
    loadNotif();
    const socket = getSocket();
    const join = () => socket.emit('admin:join', { token });
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
      if (msg.sender === 'seller') {
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

    socket.on('order:new', onOrder);
    socket.on('message:new', onMessage);
    socket.on('notify', onNotify);

    return () => {
      socket.off('connect', join);
      socket.off('order:new', onOrder);
      socket.off('message:new', onMessage);
      socket.off('notify', onNotify);
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

  const logout = () => {
    localStorage.removeItem('ng_admin_token');
    localStorage.removeItem('ng_admin');
    localStorage.removeItem('ng_admin_name');
    navigate('/admin/login');
  };

  const NOTIF_ICONS = { order: 'package', payment: 'banknote', refund: 'refresh', customer: 'user', stock: 'box', chat: 'chat', system: 'sparkle' };

  return (
    <div className="admin">
      {/* Mobile Drawer Overlay Backdrop */}
      {mobileSidebarOpen && (
        <div className="mobile-drawer-backdrop" onClick={() => setMobileSidebarOpen(false)}></div>
      )}

      <aside className={`admin-side ${mobileSidebarOpen ? 'mobile-open' : ''}`}>
        <div className="admin-logo">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div>
              <span className="logo-script">Bazario</span>
              <span className="logo-name">ADMIN HUB</span>
            </div>
            <button className="mobile-close-drawer" onClick={() => setMobileSidebarOpen(false)}>✕</button>
          </div>
          <small>Super Admin Control Center</small>
        </div>
        <nav>
          {NAV.filter((n) => can(n.perm)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setMobileSidebarOpen(false)}
            >
              <Ic name={n.icon} size={17} /> {n.label}
            </NavLink>
          ))}
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
            <b className="hide-on-mobile">Platform Governance & Multi-Vendor Hub</b>
            <b className="show-on-mobile" style={{ fontSize: 14 }}>Bazario Admin</b>
          </div>
          <span className="admin-top-right">
            <span className="bell-wrap" ref={bellRef}>
              <button className="bell" onClick={() => { setBellOpen(!bellOpen); }} aria-label="Notifications">
                <Ic name="bell" size={20} />
                {notif.unread > 0 && <span className="bell-badge">{notif.unread}</span>}
              </button>
              {bellOpen && (
                <div className="bell-panel">
                  <div className="bell-head">
                    <b>Notifications</b>
                    <button onClick={() => { api('/notifications/read-all', { method: 'POST' }).then(loadNotif); }}>Mark all read</button>
                  </div>
                  {notif.items.length === 0 && <p className="muted-sm bell-empty">No notifications yet.</p>}
                  {notif.items.map((n) => (
                    <button
                      key={n._id}
                      className={'bell-item' + (n.read ? '' : ' unread')}
                      onClick={() => {
                        api(`/notifications/${n._id}/read`, { method: 'POST' }).then(loadNotif);
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
            <span className="admin-user"><span className="admin-av">{admin.name[0]}</span> <span className="hide-on-mobile">{admin.name}</span></span>
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

      {/* Floating Chat Widget for Super Admin */}
      <FloatingChatWidget role="admin" />
    </div>
  );
}
