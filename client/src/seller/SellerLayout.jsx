import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { sapi } from '../api.js';
import { getSocket } from '../socket.js';
import Ic from '../components/Icons.jsx';
import FloatingChatWidget from '../components/FloatingChatWidget.jsx';
import NotificationToast from '../components/NotificationToast.jsx';
import { playNotificationSound } from '../utils/audio.js';

const SELLER_NAV = [
  { to: '/seller', icon: 'grid', label: 'Dashboard', end: true },
  { to: '/seller/products', icon: 'tag', label: 'Product Catalog' },
  { to: '/seller/orders', icon: 'package', label: 'Orders & Dispatch' },
  { to: '/seller/refunds', icon: 'refresh', label: 'Refunds & Returns' },
  { to: '/seller/inventory', icon: 'box', label: 'Inventory Center' },
  { to: '/seller/discounts', icon: 'gift', label: 'Discounts & Coupons' },
  { to: '/seller/analytics', icon: 'eye', label: 'Analytics & Reports' },
  { to: '/seller/wallet', icon: 'banknote', label: 'My Wallet', badgeKey: 'wallet' },
  { to: '/seller/shipping', icon: 'truck', label: 'Shipping Settings' },
  { to: '/seller/support', icon: 'chat', label: 'Support & Chat', badgeKey: 'unreadChat' },
  { to: '/seller/settings', icon: 'shield', label: 'Store Settings' },
];

export default function SellerLayout() {
  const navigate = useNavigate();
  const token = localStorage.getItem('ng_seller_token');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [seller, setSeller] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ng_seller') || 'null');
    } catch {
      return null;
    }
  });
  const [unreadChat, setUnreadChat] = useState(0);
  const [toasts, setToasts] = useState([]);

  const addToast = (toast) => {
    const id = Date.now() + Math.random().toString(36).slice(2, 6);
    setToasts((prev) => [...prev.slice(-4), { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6500);
  };

  const refreshSeller = () => {
    sapi('/sellers/me')
      .then((data) => {
        setSeller(data);
        localStorage.setItem('ng_seller', JSON.stringify(data));
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!token) {
      navigate('/seller/login');
      return;
    }

    refreshSeller();

    // Check unread chat count
    sapi('/chat/seller/thread')
      .then((res) => {
        if (res.conversation?.unreadForSeller) {
          setUnreadChat(res.conversation.unreadForSeller);
        }
      })
      .catch(() => {});

    // Socket.io for live chat & wallet updates
    const socket = getSocket();
    const join = () => {
      if (seller?._id) socket.emit('seller:join', { token, sellerId: seller._id });
    };
    join();
    socket.on('connect', join);

    const onMessage = (msg) => {
      if (msg.sender === 'admin') {
        playNotificationSound('chat');
        setUnreadChat((prev) => prev + 1);
        addToast({
          type: 'chat',
          title: '💬 Message from Admin Support',
          body: msg.text ? (msg.text.length > 80 ? msg.text.slice(0, 80) + '...' : msg.text) : 'Sent an attachment',
          link: '/seller/support',
        });
      }
    };

    const onNotify = (n) => {
      const soundType = n.type === 'deposit' ? 'deposit' : n.type === 'withdrawal' ? 'withdrawal' : n.type === 'approval' ? 'approval' : n.type === 'order' ? 'order' : 'default';
      playNotificationSound(soundType);
      addToast({
        type: n.type || 'system',
        title: n.title || 'Notification',
        body: n.body || '',
        link: n.link || '/seller',
      });
      refreshSeller();
    };

    const onWalletUpdate = (data) => {
      playNotificationSound(data?.type === 'approval' ? 'approval' : 'deposit');
      refreshSeller();
    };

    const onOrderNew = (ord) => {
      playNotificationSound('order');
      addToast({
        type: 'order',
        title: '📦 New Order Received!',
        body: `Order #${ord.orderNumber} placed by customer`,
        link: '/seller/orders',
      });
    };

    socket.on('message:new', onMessage);
    socket.on('notify', onNotify);
    socket.on('wallet:update', onWalletUpdate);
    socket.on('order:new', onOrderNew);

    return () => {
      socket.off('connect', join);
      socket.off('message:new', onMessage);
      socket.off('notify', onNotify);
      socket.off('wallet:update', onWalletUpdate);
      socket.off('order:new', onOrderNew);
    };
  }, [token, navigate, seller?._id]);

  if (!token) return null;

  const logout = () => {
    localStorage.removeItem('ng_seller_token');
    localStorage.removeItem('ng_seller');
    navigate('/seller/login');
  };

  return (
    <div className="seller-portal">
      {/* Mobile Drawer Overlay Backdrop */}
      {mobileSidebarOpen && (
        <div className="mobile-drawer-backdrop" onClick={() => setMobileSidebarOpen(false)}></div>
      )}

      {/* Seller Sidebar */}
      <aside className={`seller-sidebar ${mobileSidebarOpen ? 'mobile-open' : ''}`}>
        <div className="seller-brand">
          <div className="seller-logo-title">
            <span className="amazon-name" style={{ letterSpacing: '-0.5px', fontWeight: 900 }}>Bazario</span>
            <span className="seller-badge-tag">SELLER CENTRAL</span>
            <button className="mobile-close-drawer" onClick={() => setMobileSidebarOpen(false)}>✕</button>
          </div>
          <div className="seller-store-card">
            <div className="seller-avatar-circle">
              {seller?.logo ? <img src={seller.logo} alt="Logo" /> : (seller?.storeName?.[0] || 'S')}
            </div>
            <div className="seller-store-meta">
              <b className="store-name-text">{seller?.storeName || 'My Store'}</b>
              <span className="seller-rating-pill">
                {seller?.rating ? `⭐ ${seller.rating.toFixed(1)}` : '🆕 New Seller'} • {seller?.commissionRate || 10}% fee
              </span>
            </div>
          </div>
        </div>

        <nav className="seller-nav">
          {SELLER_NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setMobileSidebarOpen(false)}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <Ic name={n.icon} size={18} />
              <span>{n.label}</span>
              {n.badgeKey === 'unreadChat' && unreadChat > 0 && (
                <span className="seller-nav-badge">{unreadChat}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="seller-sidebar-footer">
          <Link to={`/shop?seller=${seller?._id}`} target="_blank" className="view-storefront-btn">
            <Ic name="eye" size={16} /> View Storefront
          </Link>
          <Link to="/admin/login" className="view-storefront-btn" style={{ background: '#334155', color: '#fff', marginTop: 6 }}>
            <Ic name="shield" size={16} /> Admin Portal
          </Link>
          <button onClick={logout} className="seller-logout-btn" style={{ marginTop: 8 }}>
            <Ic name="logout" size={16} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="seller-main-wrap">
        <header className="seller-top-bar">
          <div className="seller-top-left">
            <button className="mobile-hamburger-btn" onClick={() => setMobileSidebarOpen(true)} aria-label="Toggle Menu">
              <Ic name="menu" size={22} />
            </button>
            <span className={`store-active-indicator ${seller?.status === 'frozen' || seller?.status === 'suspended' ? 'status-frozen' : ''}`}>
              <span className="pulse-dot"></span> Store Status: <b style={{ textTransform: 'uppercase' }}>{seller?.status || 'Active'}</b>
            </span>
            <span className="seller-sep hide-on-mobile">|</span>
            <span className="seller-owner-name hide-on-mobile">Owner: <b>{seller?.ownerName}</b></span>
          </div>

          <div className="seller-top-right">
            <Link to="/seller/support" className="seller-help-link">
              <Ic name="chat" size={16} /> <span className="help-text">Chat with Admin</span>
              {unreadChat > 0 && <span className="unread-dot-bubble">{unreadChat}</span>}
            </Link>
            <div className="seller-user-pill">
              <span className="seller-user-initial">{seller?.ownerName?.[0] || 'U'}</span>
              <span className="hide-on-mobile">{seller?.email}</span>
            </div>
          </div>
        </header>

        {/* Top Compliance & Status Announcement Banners */}
        {(seller?.status === 'frozen' || seller?.status === 'suspended') && (
          <div className="seller-compliance-banner banner-frozen">
            <div className="banner-icon-box">
              <Ic name="alert" size={22} />
            </div>
            <div className="banner-info-text">
              <b className="banner-title">
                ⛔ ACCOUNT {seller.status.toUpperCase()}: Action Required
              </b>
              <p className="banner-desc">
                <b>Reason from Admin:</b> {seller.freezeReason || 'Your account is temporarily restricted due to policy violation review.'}
              </p>
            </div>
            <Link to="/seller/support" className="banner-chat-btn">
              <Ic name="chat" size={15} /> Resolve with Support
            </Link>
          </div>
        )}

        {seller?.status === 'active' && seller?.warning?.active && seller?.warning?.message && (
          <div className={`seller-compliance-banner banner-warning level-${seller.warning.level || 'warning'}`}>
            <div className="banner-icon-box">
              <Ic name="alert" size={22} />
            </div>
            <div className="banner-info-text">
              <b className="banner-title">
                ⚠️ OFFICIAL COMPLIANCE WARNING ({seller.warning.level?.toUpperCase() || 'WARNING'})
              </b>
              <p className="banner-desc">
                {seller.warning.message}
              </p>
            </div>
            <Link to="/seller/support" className="banner-chat-btn">
              <Ic name="chat" size={15} /> Reply to Notice
            </Link>
          </div>
        )}

        <div className="seller-content-body">
          <Outlet context={{ seller, setSeller, setUnreadChat, isFrozen: seller?.status === 'frozen' || seller?.status === 'suspended' }} />
        </div>
      </div>

      {/* Global Floating Live Notification Toast Banner Stack */}
      <NotificationToast
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />

      {/* Global Floating Chat Bubble Widget */}
      <FloatingChatWidget role="seller" currentSeller={seller} />
    </div>
  );
}

