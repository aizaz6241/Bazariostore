import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, fmtDate } from '../api.js';
import { getSocket } from '../socket.js';
import Ic from '../components/Icons.jsx';

const NAV = [
  { to: '/admin', icon: 'grid', label: 'Dashboard', end: true },
  { to: '/admin/orders', icon: 'package', label: 'Orders', perm: 'orders' },
  { to: '/admin/refunds', icon: 'refresh', label: 'Refunds', perm: 'refunds' },
  { to: '/admin/products', icon: 'tag', label: 'Products', perm: 'products' },
  { to: '/admin/categories', icon: 'list', label: 'Categories', perm: 'categories' },
  { to: '/admin/discounts', icon: 'gift', label: 'Discounts', perm: 'discounts' },
  { to: '/admin/inventory', icon: 'box', label: 'Inventory', perm: 'inventory' },
  { to: '/admin/shipping', icon: 'truck', label: 'Shipping', perm: 'shipping' },
  { to: '/admin/finance', icon: 'banknote', label: 'Finance', perm: 'finance' },
  { to: '/admin/reports', icon: 'eye', label: 'Reports', perm: 'reports' },
  { to: '/admin/chat', icon: 'chat', label: 'Support Chat', perm: 'chat' },
  { to: '/admin/content', icon: 'sparkle', label: 'Website Content', perm: 'content' },
  { to: '/admin/staff', icon: 'user', label: 'Staff & Roles', perm: 'staff' },
  { to: '/admin/audit', icon: 'clock', label: 'Audit Logs', perm: 'audit' },
  { to: '/admin/settings', icon: 'shield', label: 'Settings', perm: 'settings' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const token = localStorage.getItem('ng_admin_token');
  const admin = (() => {
    try {
      return JSON.parse(localStorage.getItem('ng_admin') || 'null') || { name: localStorage.getItem('ng_admin_name') || 'Admin', permissions: [] };
    } catch {
      return { name: 'Admin', permissions: [] };
    }
  })();
  const can = (perm) => !perm || admin.role === 'super_admin' || (admin.permissions || []).includes(perm);

  const [notice, setNotice] = useState(null);
  const [notif, setNotif] = useState({ items: [], unread: 0 });
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef(null);

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
      setNotice({ text: `New order ${o.orderNumber} — ${o.name || 'Customer'} (${o.city || ''})`, id: o._id });
      setTimeout(() => setNotice(null), 6000);
    };
    const onNotify = (n) => setNotif((prev) => ({ items: [n, ...prev.items].slice(0, 50), unread: prev.unread + 1 }));
    socket.on('order:new', onOrder);
    socket.on('notify', onNotify);
    return () => {
      socket.off('connect', join);
      socket.off('order:new', onOrder);
      socket.off('notify', onNotify);
    };
  }, [token, navigate]);

  useEffect(() => {
    const close = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
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
      <aside className="admin-side">
        <div className="admin-logo">
          <span className="logo-script">Official</span>
          <span className="logo-name">NAYAB GLOW</span>
          <small>Admin Panel</small>
        </div>
        <nav>
          {NAV.filter((n) => can(n.perm)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}><Ic name={n.icon} size={17} /> {n.label}</NavLink>
          ))}
        </nav>
        <div className="admin-side-bottom">
          <Link to="/" target="_blank"><Ic name="eye" size={16} /> View Store</Link>
          <button onClick={logout}><Ic name="logout" size={16} /> Logout</button>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-top">
          <b>Store Management</b>
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
            <span className="admin-user"><span className="admin-av">{admin.name[0]}</span> {admin.name}</span>
          </span>
        </header>
        <div className="admin-content">
          <Outlet context={{ admin, can }} />
        </div>
      </div>
      {notice && (
        <button className="admin-notice" onClick={() => navigate(`/admin/orders/${notice.id}`)}>
          <Ic name="package" size={17} /> {notice.text}
        </button>
      )}
    </div>
  );
}
