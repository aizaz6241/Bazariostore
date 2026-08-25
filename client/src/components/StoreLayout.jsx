import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useCart } from '../cart.jsx';
import { useAuth } from '../auth.jsx';
import { useContent } from '../content.jsx';
import Ic from './Icons.jsx';
import CurrencySelector from './CurrencySelector.jsx';
import FloatingChatWidget from './FloatingChatWidget.jsx';

export function Logo() {
  return (
    <Link to="/" className="amazon-main-logo">
      <div className="amazon-logo-group">
        <span className="amazon-word" style={{ color: '#fff', fontWeight: 900, fontSize: 28, letterSpacing: '-1px' }}>Bazario</span>
        <span className="amazon-smile" style={{ color: '#f59e0b', fontSize: 10, fontWeight: 700, letterSpacing: 2 }}>MARKETPLACE</span>
      </div>
    </Link>
  );
}

function Header() {
  const { count } = useCart();
  const { user, seller, admin, logout, logoutSeller, logoutAdmin, logoutAll } = useAuth();
  const { categories } = useContent();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const loc = useLocation();

  const isAdmin = Boolean(admin && localStorage.getItem('ng_admin_token'));
  const isSeller = Boolean(seller && localStorage.getItem('ng_seller_token'));
  const isCustomer = Boolean(user && localStorage.getItem('ng_user_token'));
  const isLoggedIn = isAdmin || isSeller || isCustomer;

  useEffect(() => {
    const p = new URLSearchParams(loc.search);
    setQ(p.get('q') || '');
    setCat(p.get('category') || 'All');
  }, [loc.search]);

  const search = (e) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (cat && cat !== 'All') p.set('category', cat);
    navigate(`/shop?${p.toString()}`);
  };

  // Compute active user display info for header
  let accountSmall = 'Hello, sign in';
  let accountBold = 'Account & Lists';
  let accountMainLink = '/login';

  if (isAdmin) {
    accountSmall = '👑 Admin Portal';
    accountBold = `${admin?.name?.split(' ')[0] || 'Admin'} Dashboard`;
    accountMainLink = '/admin';
  } else if (isSeller) {
    const sellerDisplayName = (seller?.storeName || seller?.ownerName || 'Seller').split(' ')[0];
    accountSmall = `🏬 ${sellerDisplayName}`;
    accountBold = 'Seller Dashboard';
    accountMainLink = '/seller';
  } else if (isCustomer) {
    accountSmall = `Hello, ${user?.name?.split(' ')[0] || 'Customer'}`;
    accountBold = 'My Account';
    accountMainLink = '/account';
  }

  // Count active sessions if multiple
  const activeSessionCount = [isAdmin, isSeller, isCustomer].filter(Boolean).length;

  return (
    <header className="header amazon-header">
      <div className="container header-in">
        {/* Brand / Logo */}
        <Link to="/" className="brand amazon-brand" aria-label="Bazario Home">
          <div className="amazon-logo-group">
            <span className="brand-name prime-bold" style={{ color: '#fff', fontWeight: 900, fontSize: 28 }}>Bazario</span>
            <span className="brand-dot" style={{ color: '#f59e0b', fontSize: 10, fontWeight: 700 }}>.store</span>
            <span className="brand-slogan-sub">GLOBAL MARKETPLACE</span>
          </div>
        </Link>

        {/* Amazon-style Big Search Bar */}
        <form onSubmit={search} className="search-bar amazon-search-bar">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search Bazario Marketplace (e.g. iPhone, Sony, Nike, Laptops)..."
          />
          <button type="submit" className="search-btn" aria-label="Search">
            <Ic name="search" size={19} />
          </button>
        </form>

        {/* Header Right Actions */}
        <div className="header-actions">
          {/* Global Currency Selector in Header */}
          <CurrencySelector compact />

          {/* User Account / Dashboard Dropdown */}
          <div className="nav-drop header-account-drop">
            <Link to={accountMainLink} className="header-account">
              <span>
                <small>{accountSmall}</small>
                <b>{accountBold} <Ic name="chevDown" size={11} /></b>
              </span>
            </Link>

            <div className="nav-drop-menu">
              {isLoggedIn ? (
                <>
                  {/* Active User Card */}
                  <div className="menu-user-card">
                    <div className={`menu-user-avatar ${isAdmin ? 'avatar-admin' : isSeller ? 'avatar-seller' : 'avatar-customer'}`}>
                      {isAdmin ? '👑' : isSeller ? '🏬' : (user?.name?.[0]?.toUpperCase() || '👤')}
                    </div>
                    <div className="menu-user-meta">
                      <b className="menu-user-name">
                        {isAdmin ? (admin?.name || 'Super Admin') : isSeller ? (seller?.storeName || seller?.ownerName) : user?.name}
                      </b>
                      <span className={`menu-role-tag ${isAdmin ? 'tag-admin' : isSeller ? 'tag-seller' : 'tag-customer'}`}>
                        {isAdmin ? 'Super Admin' : isSeller ? 'Verified Seller' : 'Customer'}
                      </span>
                    </div>
                  </div>

                  {/* Admin Specific Links */}
                  {isAdmin && (
                    <div className="menu-section">
                      <Link to="/admin" className="menu-primary-portal-btn admin-theme-btn">
                        <Ic name="grid" size={15} /> <b>Open Admin Dashboard →</b>
                      </Link>
                      <Link to="/admin/sellers"><Ic name="package" size={14} /> Sellers &amp; Vendors</Link>
                      <Link to="/admin/withdrawals"><Ic name="banknote" size={14} /> Withdrawal Requests</Link>
                      <Link to="/admin/chat"><Ic name="chat" size={14} /> Seller Support Desk</Link>
                      <Link to="/admin/staff"><Ic name="user" size={14} /> Staff &amp; Team</Link>
                    </div>
                  )}

                  {/* Seller Specific Links */}
                  {isSeller && !isAdmin && (
                    <div className="menu-section">
                      <Link to="/seller" className="menu-primary-portal-btn seller-theme-btn">
                        <Ic name="grid" size={15} /> <b>Open Seller Dashboard →</b>
                      </Link>
                      <Link to="/seller/products"><Ic name="tag" size={14} /> Product Catalog</Link>
                      <Link to="/seller/orders"><Ic name="package" size={14} /> Orders &amp; Dispatch</Link>
                      <Link to="/seller/wallet"><Ic name="banknote" size={14} /> Merchant Wallet</Link>
                      <Link to="/seller/settings"><Ic name="shield" size={14} /> Store Settings</Link>
                      <Link to="/seller/support"><Ic name="chat" size={14} /> Support &amp; Helpline</Link>
                    </div>
                  )}

                  {/* Customer Specific Links */}
                  {isCustomer && (
                    <div className="menu-section">
                      {!isAdmin && !isSeller && (
                        <Link to="/account" className="menu-primary-portal-btn customer-theme-btn">
                          <Ic name="user" size={15} /> <b>My Account Dashboard →</b>
                        </Link>
                      )}
                      <Link to="/account"><Ic name="user" size={14} /> My Profile &amp; Settings</Link>
                      <Link to="/account?tab=orders"><Ic name="package" size={14} /> Your Orders &amp; Tracking</Link>
                      <Link to="/account?tab=addresses"><Ic name="mapPin" size={14} /> Saved Addresses</Link>
                      <Link to="/track-order"><Ic name="truck" size={14} /> Live Package Tracker</Link>
                    </div>
                  )}

                  {/* Cross-Role Quick Switches */}
                  {isCustomer && !isSeller && !isAdmin && (
                    <>
                      <hr className="menu-divider" />
                      <Link to="/seller/login" className="menu-link-subtle">
                        <Ic name="tag" size={14} /> Sell on Bazario (Seller Central)
                      </Link>
                    </>
                  )}

                  {isAdmin && isCustomer && (
                    <div className="menu-section-divider">
                      <Link to="/account" className="menu-link-subtle">
                        <Ic name="user" size={14} /> Open Customer Profile
                      </Link>
                    </div>
                  )}

                  {isSeller && isCustomer && (
                    <div className="menu-section-divider">
                      <Link to="/account" className="menu-link-subtle">
                        <Ic name="user" size={14} /> Open Customer Profile
                      </Link>
                    </div>
                  )}

                  <hr className="menu-divider" />

                  {/* Sign Out Actions */}
                  {isAdmin && (
                    <a
                      href="#logout-admin"
                      className="menu-logout-item"
                      onClick={(e) => {
                        e.preventDefault();
                        logoutAdmin();
                        navigate('/');
                      }}
                    >
                      <Ic name="logout" size={14} /> Sign Out (Super Admin)
                    </a>
                  )}

                  {isSeller && (
                    <a
                      href="#logout-seller"
                      className="menu-logout-item"
                      onClick={(e) => {
                        e.preventDefault();
                        logoutSeller();
                        navigate('/');
                      }}
                    >
                      <Ic name="logout" size={14} /> Sign Out (Seller Hub)
                    </a>
                  )}

                  {isCustomer && (
                    <a
                      href="#logout-customer"
                      className="menu-logout-item"
                      onClick={(e) => {
                        e.preventDefault();
                        logout();
                        navigate('/');
                      }}
                    >
                      <Ic name="logout" size={14} /> Sign Out (Customer Account)
                    </a>
                  )}

                  {activeSessionCount > 1 && (
                    <a
                      href="#logout-all"
                      className="menu-logout-all-item"
                      onClick={(e) => {
                        e.preventDefault();
                        logoutAll();
                        navigate('/');
                      }}
                    >
                      <Ic name="logout" size={13} /> Sign Out of All Sessions
                    </a>
                  )}
                </>
              ) : (
                <>
                  <Link to="/login" className="btn-menu-signin">Sign in</Link>
                  <div className="menu-new-cust">
                    <small>New customer? <Link to="/register">Start here.</Link></small>
                  </div>
                  <hr className="menu-divider" />
                  <Link to="/track-order"><Ic name="truck" size={14} /> Track Orders</Link>
                  <Link to="/seller/login"><Ic name="tag" size={14} /> Seller Central Login</Link>
                  <Link to="/admin/login"><Ic name="shield" size={14} /> Admin Control Center</Link>
                </>
              )}
            </div>
          </div>

          {/* Returns & Orders */}
          <Link
            to={isAdmin ? '/admin' : isSeller ? '/seller/orders' : isCustomer ? '/account?tab=orders' : '/track-order'}
            className="header-orders-link"
          >
            <small>{isAdmin ? 'Admin' : isSeller ? 'Merchant' : 'Returns'}</small>
            <b>{isAdmin ? 'Panel' : isSeller ? 'Orders' : '& Orders'}</b>
          </Link>

          {/* Cart */}
          <Link to="/cart" className="header-cart">
            <span className="cart-icon">
              <Ic name="cart" size={28} stroke={1.5} />
              <span className="cart-badge">{count}</span>
            </span>
            <span className="cart-text"><b>Cart</b></span>
          </Link>
        </div>
      </div>
    </header>
  );
}

function NavBar() {
  const { categories } = useContent();
  const { seller, admin } = useAuth();
  const isAdmin = Boolean(admin && localStorage.getItem('ng_admin_token'));
  const isSeller = Boolean(seller && localStorage.getItem('ng_seller_token'));

  return (
    <nav className="navbar">
      <div className="container navbar-in">
        <Link to="/shop" className="allcat-btn">
          <Ic name="menu" size={17} /> All Categories <Ic name="chevDown" size={14} />
        </Link>
        <div className="nav-links">
          <NavLink to="/" end>Today's Deals</NavLink>
          <NavLink to="/shop">Shop Marketplace</NavLink>
          {categories.map((c) => (
            <NavLink key={c.slug} to={`/shop?category=${c.slug}`}>
              {c.name}
            </NavLink>
          ))}
          {isAdmin ? (
            <NavLink to="/admin" className="nav-seller-pill admin-nav-pill">
              👑 Super Admin Portal
            </NavLink>
          ) : isSeller ? (
            <NavLink to="/seller" className="nav-seller-pill seller-nav-pill">
              🏬 Seller Dashboard
            </NavLink>
          ) : (
            <NavLink to="/seller/login" className="nav-seller-pill">
              🏬 Sell on Bazario
            </NavLink>
          )}
        </div>
      </div>
    </nav>
  );
}

function Footer() {
  const { categories } = useContent();

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="footer">
      <button onClick={scrollToTop} className="back-to-top-btn">
        Back to top ↑
      </button>

      <div className="container footer-grid">
        <div>
          <h4 className="footer-h">GET TO KNOW US</h4>
          <ul className="footer-links">
            <li><Link to="/">About Bazario</Link></li>
            <li><Link to="/page/shipping-policy">Fast Express Delivery</Link></li>
            <li><Link to="/page/returns-policy">14-Day Easy Returns</Link></li>
            <li><Link to="/page/terms">Terms of Service</Link></li>
            <li><Link to="/page/privacy">Privacy Notice</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="footer-h">MAKE MONEY WITH US</h4>
          <ul className="footer-links">
            <li><Link to="/seller/login"><b>Sell on Bazario (Seller Central)</b></Link></li>
            <li><Link to="/seller/login">Vendor Onboarding</Link></li>
            <li><Link to="/seller/login">Fulfillment & Shipping</Link></li>
            <li><Link to="/seller/login">Vendor Payouts & Support</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="footer-h">POPULAR DEPARTMENTS</h4>
          <ul className="footer-links">
            {categories.slice(0, 5).map((c) => (
              <li key={c.slug}><Link to={`/shop?category=${c.slug}`}>{c.name}</Link></li>
            ))}
          </ul>
        </div>
        <div className="footer-contact">
          <h4 className="footer-h">HELP & CUSTOMER CARE</h4>
          <p><Ic name="truck" size={15} /> Express Worldwide Delivery</p>
          <p><Ic name="shield" size={15} /> 100% Genuine Verified Sellers</p>
          <p><Ic name="banknote" size={15} /> Secure Online Payments</p>
          <p><Ic name="headset" size={15} /> 24/7 Platform Support Desk</p>
          <div className="mt-3">
            <Link to="/track-order" className="footer-track-btn">Track Your Order →</Link>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="container footer-bottom-in">
          <div className="footer-logo-small">
            <span className="logo-text" style={{ color: '#f59e0b', fontWeight: 900, fontSize: 18, letterSpacing: '-0.5px' }}>Bazario</span>
          </div>
          <span>© 2026 Bazario Multi-Vendor Marketplace. All Rights Reserved.</span>
          <span className="footer-pay">
            Safe & Secure Payments:
            <i className="pay pay-visa">VISA</i>
            <i className="pay pay-mc"><s /><s /></i>
            <i className="pay pay-stripe">Stripe</i>
            <i className="pay pay-pp">PayPal</i>
            <i className="pay pay-cod">COD</i>
          </span>
        </div>
      </div>
    </footer>
  );
}

function MobileNav() {
  const { count } = useCart();
  const { user, seller, admin } = useAuth();

  const isAdmin = Boolean(admin && localStorage.getItem('ng_admin_token'));
  const isSeller = Boolean(seller && localStorage.getItem('ng_seller_token'));
  const isCustomer = Boolean(user && localStorage.getItem('ng_user_token'));

  let navTo = '/login';
  let navLabel = 'Sign In';
  let navIcon = 'user';

  if (isAdmin) {
    navTo = '/admin';
    navLabel = 'Admin';
    navIcon = 'shield';
  } else if (isSeller) {
    navTo = '/seller';
    navLabel = 'Seller';
    navIcon = 'tag';
  } else if (isCustomer) {
    navTo = '/account';
    navLabel = 'Account';
    navIcon = 'user';
  }

  return (
    <nav className="mobile-nav">
      <NavLink to="/" end><Ic name="home" size={20} /><span>Home</span></NavLink>
      <NavLink to="/shop"><Ic name="grid" size={20} /><span>Deals</span></NavLink>
      <NavLink to="/cart" className="mn-cart">
        <Ic name="cart" size={20} />
        {count > 0 && <em className="mn-badge">{count}</em>}
        <span>Cart</span>
      </NavLink>
      <NavLink to={navTo}><Ic name={navIcon} size={20} /><span>{navLabel}</span></NavLink>
    </nav>
  );
}

export default function StoreLayout() {
  const { toast } = useCart();
  const { pathname, search } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname, search]);

  return (
    <>
      <Header />
      <NavBar />
      <main>
        <Outlet />
      </main>
      <Footer />
      <MobileNav />
      <FloatingChatWidget role="guest" />
      {toast && <div className="toast"><Ic name="checkCircle" size={17} /> {toast}</div>}
    </>
  );
}
