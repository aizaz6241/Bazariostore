import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation, Link, Navigate } from 'react-router-dom';
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
import { enablePush, pushState } from '../utils/push.js';
import VerifiedStoreBadge from '../components/VerifiedStoreBadge.jsx';
import { TourProvider, HelpButton } from './onboarding/TourProvider.jsx';

const SELLER_NAV = [
  { to: '/seller', icon: 'grid', label: 'Dashboard', end: true },
  { to: '/seller/treasury', icon: 'sparkle', label: 'Product Treasury', badge: 'Import' },
  { to: '/seller/products', icon: 'tag', label: 'My Store Products' },
  { to: '/seller/orders', icon: 'package', label: 'Orders & Dispatch' },
  { to: '/seller/refunds', icon: 'refresh', label: 'Refunds & Returns' },
  { to: '/seller/discounts', icon: 'gift', label: 'Discounts & Coupons' },
  { to: '/seller/analytics', icon: 'eye', label: 'Analytics & Reports' },
  { to: '/seller/wallet', icon: 'banknote', label: 'My Wallet', badgeKey: 'wallet' },
  { to: '/seller/shipping', icon: 'truck', label: 'Shipping Settings' },
  { to: '/seller/support', icon: 'chat', label: 'Support & Helpline', badgeKey: 'unreadChat' },
  { to: '/seller/settings', icon: 'shield', label: 'Store Settings' },
  { to: '/seller/diamond', icon: 'star', label: 'Diamond Plan', badgeKey: 'tier' },
];

export default function SellerLayout() {
  const navigate = useNavigate();
  const location = useLocation();
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
  // id of the seller logged in right now (a ref so socket handlers never see a stale one)
  const sellerIdRef = useRef(seller?._id || null);
  sellerIdRef.current = seller?._id || null;
  const isMine = (msg) => {
    const id = msg?.seller?._id || msg?.seller;
    return Boolean(id && sellerIdRef.current && String(id) === String(sellerIdRef.current));
  };
  const [unreadChat, setUnreadChat] = useState(0);
  const [toasts, setToasts] = useState([]);
  // Phone push: silently re-register when already allowed; otherwise show an "Enable alerts" button
  const [pushPerm, setPushPerm] = useState(() => pushState());
  useEffect(() => {
    if (pushState() === 'granted' && localStorage.getItem('ng_seller_token')) enablePush('seller').then(setPushPerm);
  }, []);

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
      // only this seller's own conversation may raise a toast
      if (!isMine(msg)) return;
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

    // support deleted a message: the unread badge follows the server's count (it used to stay at
    // "1" for a message that no longer exists)
    const onMessageDeleted = (payload) => {
      if (payload && typeof payload.unreadForSeller === 'number') setUnreadChat(payload.unreadForSeller);
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
      // a notification also arrives as 'wallet:update' (title, body...): not wallet figures, so it
      // is not mixed into the wallet (the 'notify' handler already refreshes the seller)
      if (wData?.notification) return;
      setSeller((prev) => {
        if (!prev) return prev;
        // some events send the figures flat ({ balance, ... }), others nested ({ wallet: {...} })
        const figures = wData?.wallet && typeof wData.wallet === 'object' ? wData.wallet : wData || {};
        const { sellerId: _sid, withdrawalLimit: _wl, ...walletFigures } = figures;
        const updated = { ...prev, wallet: { ...(prev.wallet || {}), ...walletFigures } };
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

    const onStatusUpdate = ({ seller: updatedSeller } = {}) => {
      // only this store's own record is ever taken (never another store's)
      if (updatedSeller && (!sellerIdRef.current || String(updatedSeller._id) === String(sellerIdRef.current))) {
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

    // an admin issued or cleared a warning: the banner follows at once
    const onWarningUpdate = ({ warning }) => {
      setSeller((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, warning: warning || { active: false } };
        localStorage.setItem('ng_seller', JSON.stringify(updated));
        return updated;
      });
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
    socket.on('message:delete', onMessageDeleted);
    // the server sends a seller's notifications as 'notify' (this listened to 'seller:notification',
    // which is never sent, so sellers never saw a notification pop up)
    socket.on('notify', onNotify);
    socket.on('wallet:update', onWalletUpdate);
    socket.on('seller:health_update', onHealthUpdate);
    socket.on('seller:status_update', onStatusUpdate);
    socket.on('seller:limit_update', onLimitUpdate);
    socket.on('limit:update', onLimitUpdate);
    socket.on('seller:targets_update', onTargetsUpdate);
    socket.on('seller:warning_update', onWarningUpdate);

    return () => {
      socket.off('message:new', onMessage);
      socket.off('message:delete', onMessageDeleted);
      socket.off('notify', onNotify);
      socket.off('wallet:update', onWalletUpdate);
      socket.off('seller:health_update', onHealthUpdate);
      socket.off('seller:status_update', onStatusUpdate);
      socket.off('seller:limit_update', onLimitUpdate);
      socket.off('limit:update', onLimitUpdate);
      socket.off('seller:warning_update', onWarningUpdate);
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
    // fresh read: after logout / account switch a reconnect must not re-join with the old token
    const join = () => {
      const t = localStorage.getItem('ng_seller_token');
      if (t && t === token) socket.emit('seller:join', { token: t, sellerId: seller._id });
    };
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
  } else if (healthScore <= 30) {
    // same limits as the admin Complaints page and the server: 80+ healthy, 31-79 at risk,
    // 30 and below critical (it used to be 75 / 60 here, so both sides saw different ratings)
    healthTier = 'suspended';
    healthLabel = 'CRITICAL';
  } else if (healthScore < 80) {
    healthTier = 'warning';
    healthLabel = 'AT RISK';
  }

  const isVerified = Boolean(seller?.verified || seller?.status === 'active');
  const isDiamondStore = seller?.tier === 'diamond';
  const storeInitials = (seller?.storeName || 'My Store').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'S';
  const statusKey = ['frozen', 'suspended', 'pending_approval', 'rejected'].includes(seller?.status) ? seller.status : 'active';
  const statusText = { frozen: 'Frozen', suspended: 'Suspended', pending_approval: 'Under review', rejected: 'Rejected' }[statusKey] || 'Active';

  return (
    <TourProvider seller={seller}>
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
              <div className="seller-sidebar-store-title-row">
                <span className="store-name-text" title={seller?.storeName}>{seller?.storeName || 'My Store'}</span>
                {isVerified && (
                  <VerifiedStoreBadge variant="icon" size={15} title="Official Verified Store" />
                )}
              </div>
              {isVerified ? (
                <div className="seller-sidebar-verified-badge-wrap">
                  <VerifiedStoreBadge variant="pill" size={12} text="Verified Store" />
                </div>
              ) : (
                <span className="seller-rating-pill">⭐ {seller?.rating?.toFixed(1) || '5.0'} • Merchant</span>
              )}
              <Link
                to="/seller/diamond"
                onClick={() => setMobileSidebarOpen(false)}
                className={seller?.tier === 'diamond' ? 'diamond-pill' : 'basic-pill'}
                style={{ marginTop: 4, alignSelf: 'flex-start' }}
                title={seller?.tier === 'diamond' ? 'Your store is Diamond' : 'Basic plan — tap to see Diamond'}
              >
                {seller?.tier === 'diamond' ? '💎 DIAMOND STORE' : 'BASIC PLAN'}
              </Link>
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="seller-nav" data-tour="nav">
          {SELLER_NAV.map((n) => {
            let badge = null;
            if (seller?.status === 'suspended' && n.to !== '/seller/support') {
              badge = <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.8 }} title="Closed while your account is suspended">🔒</span>;
            } else if (n.badgeKey === 'unreadChat' && unreadChat > 0) {
              badge = <span className="seller-nav-badge">{unreadChat}</span>;
            } else if (n.badgeKey === 'tier') {
              badge =
                seller?.tier === 'diamond' ? (
                  <span className="diamond-pill" style={{ marginLeft: 'auto' }}>💎 Active</span>
                ) : (
                  <span className="diamond-pill" style={{ marginLeft: 'auto' }}>Upgrade</span>
                );
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
                data-tour={`nav-${n.to.split('/').pop()}`}
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
        <header className="stb">
          <div className="stb-left">
            <button
              type="button"
              className="stb-burger"
              data-tour="menu-btn"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open navigation menu"
            >
              <Ic name="menu" size={20} />
            </button>

            <Link to="/seller" className="stb-store" title={seller?.storeName || 'My Store'}>
              <span className={`stb-avatar ${isDiamondStore ? 'is-diamond' : ''}`}>{storeInitials}</span>
              <span className="stb-store-text">
                <span className="stb-store-name">
                  <span className="stb-store-name-txt">{seller?.storeName || 'My Store'}</span>
                  {isVerified && <VerifiedStoreBadge variant="icon" size={14} />}
                </span>
                <span className="stb-store-sub">
                  <i className={`stb-status-dot st-${statusKey}`} />
                  {statusText}
                  <span className="stb-sub-sep">·</span>
                  {isDiamondStore ? 'Diamond plan' : 'Basic plan'}
                </span>
              </span>
            </Link>

            {isDiamondStore ? (
              <Link to="/seller/diamond" className="stb-diamond is-on" title="Your store is on the Diamond plan">
                <span className="stb-gem" aria-hidden="true">💎</span>
                <span className="stb-diamond-txt">Diamond</span>
              </Link>
            ) : ['pending', 'awaiting_approval'].includes(seller?.tierRequest?.status) ? (
              <Link to="/seller/diamond" className="stb-diamond is-pending" title="Diamond upgrade request sent">
                <span className="stb-gem" aria-hidden="true">💎</span>
                <span className="stb-diamond-txt">Upgrade requested</span>
              </Link>
            ) : (
              <Link to="/seller/diamond" className="stb-diamond" title="Upgrade to Diamond — earn 35% per order">
                <span className="stb-gem" aria-hidden="true">💎</span>
                <span className="stb-diamond-txt">Upgrade to Diamond</span>
                <span className="stb-diamond-rate">35%</span>
              </Link>
            )}
          </div>

          <div className="stb-right">
            <CurrencySelector compact className="stb-currency" />

            <Link
              to="/seller"
              className={`stb-chip stb-health tone-${healthTier}`}
              data-tour="topbar-health"
              title={`Account health ${healthScore}/100 (${healthLabel})`}
            >
              <Ic name="shield" size={15} />
              <span className="stb-chip-lbl">Health</span>
              <b>{healthScore}</b>
            </Link>

            <Link to="/seller/wallet" className="stb-chip stb-wallet" title="Wallet balance" data-tour="topbar-wallet">
              <Ic name="wallet" size={15} />
              <span className="stb-chip-col">
                <span className="stb-chip-lbl">Balance</span>
                <b>{formatMoney(seller?.wallet?.balance || 0)}</b>
              </span>
            </Link>

            {pushPerm !== 'granted' && pushPerm !== 'unsupported' && (
              <button
                type="button"
                className={`stb-icon-btn ${pushPerm === 'denied' ? 'is-blocked' : 'is-attn'}`}
                onClick={async () => setPushPerm(await enablePush('seller', { ask: true }))}
                title={pushPerm === 'denied' ? 'Notifications are blocked in this browser / phone settings' : 'Turn on order alerts'}
                aria-label="Order alerts"
              >
                <Ic name="bell" size={17} />
              </button>
            )}

            <button
              type="button"
              className="stb-icon-btn stb-hide-sm"
              onClick={() => setAppModalOpen(true)}
              title="Install the Bazario seller app"
              aria-label="Install app"
            >
              <Ic name="download" size={17} />
            </button>

            <HelpButton />

            <Link to="/seller/settings" className="stb-user" title="Store & account settings">
              <span className="stb-user-initial">{(seller?.ownerName || seller?.email || 'U')[0].toUpperCase()}</span>
              <span className="stb-user-text">
                <b>{seller?.ownerName || 'Store owner'}</b>
                <small>Settings</small>
              </span>
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
              {seller.status === 'frozen' && (
                <p className="banner-desc">
                  While frozen you can view your dashboard, orders and wallet, <b>deposit</b> and confirm pending orders. Payouts of delivered
                  orders are held in your Frozen amount{seller?.wallet?.frozenFund > 0 ? ` ($${Number(seller.wallet.frozenFund).toFixed(2)} now)` : ''} and
                  added to your wallet when the account is unfrozen. Withdrawals and changes to products, coupons, shipping and store settings are paused.
                  Chat with support to resolve it.
                </p>
              )}
              {seller.status === 'suspended' && (
                <p className="banner-desc">
                  While suspended your whole account is closed. Only the support chat is open — please contact support to resolve it.
                </p>
              )}
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
          {seller?.status === 'suspended' && !location.pathname.startsWith('/seller/support') ? (
            <div className="seller-suspended-screen">
              <div className="sss-icon">⛔</div>
              <h2>Your account is suspended</h2>
              <p>
                Everything in your seller account is closed while it is suspended. You can still talk to our support team to resolve it.
              </p>
              {seller?.freezeReason && (
                <p className="sss-reason">
                  <b>Reason:</b> {seller.freezeReason}
                </p>
              )}
              <Link to="/seller/support" className="sss-btn">
                <Ic name="chat" size={16} /> Open Support Chat
              </Link>
            </div>
          ) : (
            <Outlet context={{ seller, setSeller, setUnreadChat, isFrozen: seller?.status === 'frozen' || seller?.status === 'suspended' }} />
          )}
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
    </TourProvider>
  );
}
