import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, Link, Navigate } from 'react-router-dom';
import { sapi } from '../api.js';
import { useAuth } from '../auth.jsx';
import { getSocket } from '../socket.js';
import Ic from '../components/Icons.jsx';
import FloatingChatWidget from '../components/FloatingChatWidget.jsx';
import NotificationToast from '../components/NotificationToast.jsx';
import SellerAppModal from '../components/SellerAppModal.jsx';
import CurrencySelector from '../components/CurrencySelector.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';
import { playNotificationSound } from '../utils/audio.js';

const SELLER_NAV = [
  { to: '/seller', icon: 'grid', label: 'Dashboard', end: true },
  { to: '/seller/treasury', icon: 'sparkle', label: 'Product Treasury', badge: 'Import' },
  { to: '/seller/products', icon: 'tag', label: 'My Store Products' },
  { to: '/seller/orders', icon: 'package', label: 'Orders & Dispatch' },
  { to: '/seller/refunds', icon: 'refresh', label: 'Refunds & Returns' },
  { to: '/seller/inventory', icon: 'box', label: 'Inventory Center' },
  { to: '/seller/discounts', icon: 'gift', label: 'Discounts & Coupons' },
  { to: '/seller/analytics', icon: 'eye', label: 'Analytics & Reports' },
  { to: '/seller/wallet', icon: 'banknote', label: 'My Wallet', badgeKey: 'wallet' },
  { to: '/seller/shipping', icon: 'truck', label: 'Shipping Settings' },
  { to: '/seller/support', icon: 'chat', label: 'Support & Helpline', badgeKey: 'unreadChat' },
  { to: '/seller/settings', icon: 'shield', label: 'Store Settings' },
];

export default function SellerLayout() {
  const navigate = useNavigate();
  const { logoutSeller } = useAuth();
  const token = localStorage.getItem('ng_seller_token');
  const { formatMoney } = useCurrency();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [appModalOpen, setAppModalOpen] = useState(false);
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
    if (!token) return;

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
        body: n.body || n.message || '',
        link: n.link || null,
      });
      refreshSeller();
    };

    const onWalletUpdate = (wData) => {
      setSeller((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, wallet: { ...(prev.wallet || {}), ...wData } };
        localStorage.setItem('ng_seller', JSON.stringify(updated));
        return updated;
      });
      // Also refresh from API to ensure localStorage has full fresh data
      // This is important for SellerWallet page's localStorage fallback
      refreshSeller();
    };

    const onHealthUpdate = ({ accountHealth, status }) => {
      setSeller((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, accountHealth: accountHealth || prev.accountHealth, status: status || prev.status };
        localStorage.setItem('ng_seller', JSON.stringify(updated));
        return updated;
      });
    };

    const onStatusUpdate = ({ seller: updatedSeller }) => {
      if (updatedSeller) {
        setSeller(updatedSeller);
        localStorage.setItem('ng_seller', JSON.stringify(updatedSeller));
      }
    };

    const onLimitUpdate = (payload) => {
      if (payload?.withdrawalLimit) {
        setSeller((prev) => {
          if (!prev) return prev;
          const updated = { ...prev, withdrawalLimit: payload.withdrawalLimit };
          localStorage.setItem('ng_seller', JSON.stringify(updated));
          return updated;
        });
      }
      refreshSeller();
    };

    const onTargetsUpdate = ({ targets }) => {
      setSeller((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, targets };
        localStorage.setItem('ng_seller', JSON.stringify(updated));
        return updated;
      });
    };

    socket.on('message:new', onMessage);
    socket.on('seller:notification', onNotify);
    socket.on('wallet:update', onWalletUpdate);
    socket.on('seller:health_update', onHealthUpdate);
    socket.on('seller:status_update', onStatusUpdate);
    socket.on('seller:limit_update', onLimitUpdate);
    socket.on('limit:update', onLimitUpdate);
    socket.on('seller:targets_update', onTargetsUpdate);

    return () => {
      socket.off('message:new', onMessage);
      socket.off('seller:notification', onNotify);
      socket.off('wallet:update', onWalletUpdate);
      socket.off('seller:health_update', onHealthUpdate);
      socket.off('seller:status_update', onStatusUpdate);
      socket.off('seller:limit_update', onLimitUpdate);
      socket.off('limit:update', onLimitUpdate);
      socket.off('seller:targets_update', onTargetsUpdate);
    };
  }, [token]);

  // ─── Dedicated seller:join effect ─────────────────────────────────────────
  // الگ effect اس لیے ضروری ہے: اوپر والے effect میں seller?._id stale closure تھا۔
  // token effect mount ہوتے وقت seller ابھی null ہو سکتا ہے (refreshSeller async ہے)۔
  // seller._id dependency سے یہ effect seller load ہونے پر خود re-run ہوگا
  // اور seller اپنے صحیح socket room میں join ہو جائے گا۔
  useEffect(() => {
    if (!token || !seller?._id) return;
    const socket = getSocket();
    const join = () => socket.emit('seller:join', { token, sellerId: seller._id });
    // اگر socket پہلے سے connected ہو تو فوراً join کریں
    if (socket.connected) join();
    // disconnect/reconnect کی صورت میں دوبارہ join کریں
    socket.on('connect', join);
    return () => socket.off('connect', join);
  }, [token, seller?._id]);

  if (!token) {
    return <Navigate to="/seller/login" replace />;
  }

  const handleLogout = () => {
    logoutSeller();
    navigate('/seller/login');
  };

  // Health calculation: ensure accountHealth score is accurately read
  const healthScore = seller?.accountHealth?.score ?? seller?.healthScore ?? 100;
  let healthTier = 'healthy';
  let healthLabel = 'HEALTHY';
  if (seller?.status === 'suspended') {
    healthTier = 'suspended';
    healthLabel = 'SUSPENDED';
  } else if (seller?.status === 'frozen') {
    healthTier = 'freeze';
    healthLabel = 'FROZEN';
  } else if (healthScore < 60) {
    healthTier = 'suspended';
    healthLabel = 'CRITICAL';
  } else if (healthScore < 75) {
    healthTier = 'warning';
    healthLabel = 'AT RISK';
  }

  return (
    <div className="seller-portal-layout">
      {/* Mobile Backdrop */}
      {mobileSidebarOpen && (
        <div className="seller-sidebar-backdrop" onClick={() => setMobileSidebarOpen(false)} />
      )}

      {/* ─── SELLER LEFT SIDEBAR ─── */}
      <aside
        className={`seller-sidebar ${mobileSidebarOpen ? 'drawer-open mobile-open' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="seller-brand">
          <div className="seller-logo-title">
            <span className="amazon-name">BAZARIO</span>
            <span className="seller-badge-tag">SELLER CENTRAL</span>
            <button
              type="button"
              className="mobile-close-drawer"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Close Navigation"
            >
              <Ic name="x" size={20} />
            </button>
          </div>

          {/* Store Profile Card */}
          <div className="seller-store-card">
            <div className="seller-avatar-circle">
              {seller?.logo ? (
                <img src={seller.logo} alt="Store logo" />
              ) : (
                <span>{seller?.storeName?.[0] || 'S'}</span>
              )}
            </div>
            <div className="seller-store-meta">
              <span className="store-name-text" title={seller?.storeName}>{seller?.storeName || 'My Store'}</span>
              <span className="seller-rating-pill">⭐ {seller?.rating?.toFixed(1) || '5.0'} • Merchant</span>
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="seller-nav">
          {SELLER_NAV.map((n) => {
            let badge = null;
            if (n.badgeKey === 'unreadChat' && unreadChat > 0) {
              badge = <span className="seller-nav-badge">{unreadChat}</span>;
            } else if (n.badge) {
              badge = (
                <span
                  style={{
                    marginLeft: 'auto',
                    background: '#10b981',
                    color: '#fff',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '10px',
                    letterSpacing: '0.4px',
                  }}
                >
                  {n.badge}
                </span>
              );
            }
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                onClick={() => setMobileSidebarOpen(false)}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                <Ic name={n.icon} size={18} />
                <span>{n.label}</span>
                {badge}
              </NavLink>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="seller-sidebar-footer">
          <button
            type="button"
            className="seller-install-app-sidebar-btn"
            onClick={() => {
              setMobileSidebarOpen(false);
              setAppModalOpen(true);
            }}
          >
            <Ic name="download" size={16} />
            <span>Install Seller App</span>
            <span className="app-badge-new">APK</span>
          </button>

          <Link
            to="/"
            className="view-storefront-btn"
            target="_blank"
            onClick={() => setMobileSidebarOpen(false)}
          >
            <Ic name="external" size={15} /> Open Storefront
          </Link>
          <button
            type="button"
            className="seller-logout-btn"
            onClick={() => {
              setMobileSidebarOpen(false);
              handleLogout();
            }}
          >
            <Ic name="logout" size={16} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="seller-main-wrap">
        <header className="seller-top-bar">
          <div className="seller-top-left">
            <button
              type="button"
              className="mobile-hamburger-btn"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open Navigation Menu"
              title="Open Navigation Menu"
            >
              <Ic name="menu" size={20} />
            </button>

            {/* Mobile Brand Title */}
            <div className="seller-mobile-brand show-on-mobile-flex">
              <span className="smb-logo">BAZARIO</span>
              <span className="smb-sub">SELLER</span>
            </div>

            <span className={`store-active-indicator hide-on-mobile ${seller?.status === 'frozen' || seller?.status === 'suspended' ? 'status-frozen' : ''}`}>
              <span className="pulse-dot"></span> Store: <b style={{ textTransform: 'uppercase' }}>{seller?.status || 'Active'}</b>
            </span>
            <span className="seller-sep hide-on-tablet">|</span>
            <span className="seller-owner-name hide-on-tablet">Owner: <b>{seller?.ownerName}</b></span>
          </div>

          <div className="seller-top-right">
            {/* Global Real-Time Currency Selector */}
            <CurrencySelector compact className="seller-topbar-curr-select" />

            {/* Live Account Health Pill */}
            <div
              className={`seller-topbar-health-pill health-tier-${healthTier}`}
              title={`Account Health Score: ${healthScore}/100 (${healthLabel})`}
            >
              <div className="sthp-icon">
                <Ic name="shield" size={14} />
              </div>
              <div className="sthp-body">
                <span className="sthp-lbl hide-on-tablet">Health</span>
                <b className="sthp-score">{healthScore}</b>
                <span className="sthp-max hide-on-mobile">/100</span>
              </div>
              <span className={`sthp-tag health-tag-${healthTier} hide-on-mobile`}>{healthLabel}</span>
            </div>

            {/* Live Merchant Wallet Quick Pill */}
            <Link to="/seller/wallet" className="seller-topbar-wallet-pill" title="Merchant Wallet & Financial Ledger">
              <div className="stwp-icon"><Ic name="banknote" size={15} /></div>
              <div className="stwp-body">
                <span className="stwp-lbl hide-on-tablet">Wallet</span>
                <b className="stwp-val">{formatMoney(seller?.wallet?.balance || 0)}</b>
              </div>
              {(seller?.wallet?.processingFund > 0) && (
                <span className="stwp-proc hide-on-mobile" title="Locked in Order Processing">
                  🔒 {formatMoney(seller.wallet.processingFund)}
                </span>
              )}
            </Link>

            {/* Install App Button */}
            <button
              type="button"
              onClick={() => setAppModalOpen(true)}
              className="seller-app-pill-btn hide-on-tablet"
              title="Install Bazario App on Android / iOS"
            >
              <Ic name="download" size={13} />
              <span>App</span>
            </button>

            {/* Desktop Quick Settings / Profile */}
            <Link to="/seller/settings" className="seller-user-pill" title="Store & Account Settings">
              <span className="seller-user-initial">{seller?.ownerName?.[0] || 'U'}</span>
              <span className="seller-user-email-text hide-on-laptop">{seller?.ownerName || seller?.email}</span>
              <Ic name="gear" size={14} className="hide-on-mobile" />
            </Link>
          </div>
        </header>

        {/* Zero Wallet Balance Alert Banner */}
        {seller?.status === 'active' && (!seller?.wallet?.balance || seller.wallet.balance <= 0) && (
          <div className="zero-balance-top-banner">
            <div className="zbb-content">
              <span style={{ fontSize: 18 }}>⚠️</span>
              <div>
                <b>MERCHANT WALLET ALERT: Zero Balance ($0.00)</b> — You cannot confirm or dispatch customer orders until you deposit funds to lock required processing amounts.
              </div>
            </div>
            <Link to="/seller/wallet" className="zbb-btn">
              <Ic name="plusCircle" size={14} /> Deposit Funds Now
            </Link>
          </div>
        )}

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

      {/* Seller App Setup & APK Installer Modal */}
      <SellerAppModal isOpen={appModalOpen} onClose={() => setAppModalOpen(false)} />
    </div>
  );
}
