import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useCart } from '../cart.jsx';
import { useAuth } from '../auth.jsx';
import { useContent } from '../content.jsx';
import Ic from './Icons.jsx';

function TopBar() {
  const { content } = useContent();
  const t = content.topbar || {};
  return (
    <div className="topbar">
      <div className="container topbar-in">
        <span className="topbar-item">
          <Ic name="badgeCheck" size={15} /> {t.welcome || 'Welcome to Bazario — The World\'s Multi-Vendor Marketplace'}
        </span>
        <div className="topbar-mid">
          {(t.promos || []).map((p, i) => (
            <span className="topbar-item" key={i}>
              <Ic name={p.icon || 'truck'} size={15} /> {p.text}
            </span>
          ))}
        </div>
        <div className="topbar-right-links">
          <Link to="/seller/login" className="seller-portal-cta">
            🏬 <b>Seller Central</b>
          </Link>
        </div>
      </div>
    </div>
  );
}

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
  const { user, logout } = useAuth();
  const { categories } = useContent();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (cat) params.set('category', cat);
    navigate('/shop?' + params.toString());
  };

  return (
    <header className="header">
      <div className="container header-in">
        <Logo />

        {/* Location selector */}
        <div className="header-deliver-to">
          <Ic name="mapPin" size={18} />
          <div>
            <small>Deliver to</small>
            <b>Worldwide</b>
          </div>
        </div>

        {/* Amazon search bar with category picker */}
        <form className="searchbar amazon-search-style" onSubmit={submit}>
          <div className="search-cat">
            <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
              <option value="">All Departments</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search Amazon Marketplace (e.g. iPhone, Sony, Nike, Laptops)..."
          />
          <button type="submit" className="search-btn" aria-label="Search">
            <Ic name="search" size={19} />
          </button>
        </form>

        {/* Header Right Actions */}
        <div className="header-actions">
          {/* Seller Central Shortcut */}
          <Link to="/seller/login" className="header-seller-link" title="Vendor Management Portal">
            <small>Become a</small>
            <b>Seller</b>
          </Link>

          {/* User Account */}
          <div className="nav-drop header-account-drop">
            <Link to={user ? '/account' : '/login'} className="header-account">
              <span>
                <small>{user ? `Hello, ${user.name.split(' ')[0]}` : 'Hello, sign in'}</small>
                <b>Account & Lists <Ic name="chevDown" size={11} /></b>
              </span>
            </Link>
            <div className="nav-drop-menu">
              {user ? (
                <>
                  <Link to="/account">My Profile</Link>
                  <Link to="/account?tab=orders">Your Orders & Tracking</Link>
                  <Link to="/account?tab=addresses">Your Addresses</Link>
                  <Link to="/track-order">Live Package Tracker</Link>
                  <a href="#logout" onClick={(e) => { e.preventDefault(); logout(); navigate('/'); }}>Sign Out</a>
                </>
              ) : (
                <>
                  <Link to="/login" className="btn-menu-signin">Sign in</Link>
                  <div className="menu-new-cust">
                    <small>New customer? <Link to="/register">Start here.</Link></small>
                  </div>
                  <hr className="menu-divider" />
                  <Link to="/track-order">Track Orders</Link>
                  <Link to="/seller/login">Seller Central Login</Link>
                  <Link to="/admin/login">Admin Control Center</Link>
                </>
              )}
            </div>
          </div>

          {/* Returns & Orders */}
          <Link to={user ? '/account?tab=orders' : '/track-order'} className="header-orders-link">
            <small>Returns</small>
            <b>& Orders</b>
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
          <NavLink to="/seller/login" className="nav-seller-pill">
            🏬 Sell on Bazario
          </NavLink>
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
  const { user } = useAuth();
  return (
    <nav className="mobile-nav">
      <NavLink to="/" end><Ic name="home" size={20} /><span>Home</span></NavLink>
      <NavLink to="/shop"><Ic name="grid" size={20} /><span>Deals</span></NavLink>
      <NavLink to="/seller/login"><Ic name="tag" size={20} /><span>Seller</span></NavLink>
      <NavLink to="/cart" className="mn-cart">
        <Ic name="cart" size={20} />
        {count > 0 && <em className="mn-badge">{count}</em>}
        <span>Cart</span>
      </NavLink>
      <NavLink to={user ? '/account' : '/login'}><Ic name="user" size={20} /><span>{user ? 'Account' : 'Sign In'}</span></NavLink>
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
      <TopBar />
      <Header />
      <NavBar />
      <main>
        <Outlet />
      </main>
      <Footer />
      <MobileNav />
      {toast && <div className="toast"><Ic name="checkCircle" size={17} /> {toast}</div>}
    </>
  );
}
