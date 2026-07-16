import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useCart } from '../cart.jsx';
import { useAuth } from '../auth.jsx';
import { useContent } from '../content.jsx';
import Ic from './Icons.jsx';
import ChatWidget from './ChatWidget.jsx';

function TopBar() {
  const { content } = useContent();
  const t = content.topbar || {};
  const social = content.social || {};
  return (
    <div className="topbar">
      <div className="container topbar-in">
        <span className="topbar-item"><Ic name="heart" size={15} /> {t.welcome || 'Welcome to Official Nayab Glow'}</span>
        <div className="topbar-mid">
          {(t.promos || []).map((p, i) => (
            <span className="topbar-item" key={i}><Ic name={p.icon || 'badgeCheck'} size={15} /> {p.text}</span>
          ))}
        </div>
        <div className="topbar-social">
          <a href={social.facebook || '#'} aria-label="Facebook"><Ic name="facebook" size={14} /></a>
          <a href={social.instagram || '#'} aria-label="Instagram"><Ic name="instagram" size={14} /></a>
          <a href={social.tiktok || '#'} aria-label="TikTok"><Ic name="tiktok" size={14} /></a>
          <a href={social.youtube || '#'} aria-label="YouTube"><Ic name="youtube" size={14} /></a>
        </div>
      </div>
    </div>
  );
}

export function Logo() {
  const { content } = useContent();
  const l = content.logo || {};
  return (
    <Link to="/" className="logo">
      <span className="logo-script">{l.script || 'Official'}</span>
      <span className="logo-name">{l.name || 'NAYAB GLOW'}</span>
      <span className="logo-tag">{l.tagline || 'Enhance Your Natural Beauty'}</span>
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
        <form className="searchbar" onSubmit={submit}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for products..." />
          <div className="search-cat">
            <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="search-btn" aria-label="Search"><Ic name="search" size={18} /></button>
        </form>
        <div className="header-actions">
          <div className="nav-drop header-account-drop">
            <Link to={user ? '/account' : '/login'} className="header-account">
              <Ic name="user" size={26} stroke={1.4} />
              <span>
                <small>{user ? `Hi, ${user.name.split(' ')[0]}` : 'Login / Register'}</small>
                <b>My Account <Ic name="chevDown" size={11} /></b>
              </span>
            </Link>
            <div className="nav-drop-menu">
              {user ? (
                <>
                  <Link to="/account">My Profile</Link>
                  <Link to="/account?tab=orders">Order History</Link>
                  <Link to="/account?tab=addresses">Saved Addresses</Link>
                  <Link to="/track-order">Track Order</Link>
                  <a href="#logout" onClick={(e) => { e.preventDefault(); logout(); navigate('/'); }}>Logout</a>
                </>
              ) : (
                <>
                  <Link to="/login">Login</Link>
                  <Link to="/register">Create Account</Link>
                  <Link to="/track-order">Track Order</Link>
                </>
              )}
            </div>
          </div>
          <Link to="/cart" className="header-cart">
            <span className="cart-icon">
              <Ic name="cart" size={26} stroke={1.4} />
              <span className="cart-badge">{count}</span>
            </span>
            <span><small>&nbsp;</small><b>My Cart</b></span>
          </Link>
        </div>
      </div>
    </header>
  );
}

function NavBar() {
  const { categories } = useContent();
  const navCats = categories.slice(0, 4);
  return (
    <nav className="navbar">
      <div className="container navbar-in">
        <Link to="/shop" className="allcat-btn">
          <Ic name="menu" size={17} /> ALL CATEGORIES <Ic name="chevDown" size={14} />
        </Link>
        <div className="nav-links">
          <NavLink to="/" end>HOME</NavLink>
          <NavLink to="/shop">SHOP</NavLink>
          {navCats.map((c) => (
            <div className="nav-drop" key={c.slug}>
              <NavLink to={`/shop?category=${c.slug}`}>{c.name.replace(' Products', '').toUpperCase()} <Ic name="chevDown" size={11} /></NavLink>
              <div className="nav-drop-menu">
                <Link to={`/shop?category=${c.slug}`}>All {c.name}</Link>
                <Link to={`/shop?category=${c.slug}&label=new`}>New Arrivals</Link>
                <Link to={`/shop?category=${c.slug}&label=sale`}>On Sale</Link>
                <Link to={`/shop?category=${c.slug}&sort=popular`}>Best Sellers</Link>
              </div>
            </div>
          ))}
          <NavLink to="/shop?sort=popular">BRANDS</NavLink>
          <NavLink to="/shop?label=new">NEW ARRIVALS</NavLink>
          <NavLink to="/shop?label=sale">OFFERS</NavLink>
        </div>
      </div>
    </nav>
  );
}

function Footer() {
  const { content, categories } = useContent();
  const f = content.footer || {};
  const contact = f.contact || {};
  const social = content.social || {};
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <h4 className="footer-h">{f.whyTitle || 'WHY CHOOSE OFFICIAL NAYAB GLOW?'}</h4>
          {(f.why || []).map((t) => (
            <p className="footer-check" key={t}><Ic name="checkCircle" size={15} /> {t}</p>
          ))}
        </div>
        <div>
          <h4 className="footer-h">QUICK LINKS</h4>
          <ul className="footer-links">
            <li><Link to="/">Home</Link></li>
            <li><Link to="/shop">Shop</Link></li>
            {categories.slice(0, 4).map((c) => (
              <li key={c.slug}><Link to={`/shop?category=${c.slug}`}>{c.name}</Link></li>
            ))}
            <li><Link to="/shop?label=new">New Arrivals</Link></li>
            <li><Link to="/shop?label=sale">Offers</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="footer-h">CUSTOMER SERVICE</h4>
          <ul className="footer-links">
            <li><Link to="/track-order">Track Your Order</Link></li>
            <li><Link to="/page/shipping-policy">Shipping Policy</Link></li>
            <li><Link to="/page/returns-policy">Returns & Refund Policy</Link></li>
            <li><Link to="/page/terms">Terms & Conditions</Link></li>
            <li><Link to="/page/privacy">Privacy Policy</Link></li>
            <li><Link to="/page/faqs">FAQs</Link></li>
          </ul>
        </div>
        <div className="footer-contact">
          <h4 className="footer-h">CONTACT US</h4>
          <p><Ic name="mapPin" size={15} /> {contact.location || 'Pakistan'}</p>
          <p><Ic name="mail" size={15} /> {contact.email || 'support@officialnayabglow.com'}</p>
          <p><Ic name="phone" size={15} /> {contact.phone || '+92 300 1234567'}</p>
          <p><Ic name="clock" size={15} /> {contact.hours || 'Mon - Sat / 10:00 AM - 8:00 PM'}</p>
        </div>
        <div className="footer-monogram" aria-hidden="true">
          <div className="monogram-ring"><span>N</span></div>
        </div>
      </div>
      <div className="footer-bottom">
        <div className="container footer-bottom-in">
          <span>{f.copyright || '© 2026 Official Nayab Glow. All Rights Reserved.'}</span>
          <span className="footer-pay">
            We Accept
            <i className="pay pay-visa">VISA</i>
            <i className="pay pay-mc"><s /><s /></i>
            <i className="pay pay-jazz">JazzCash</i>
            <i className="pay pay-easy">easypaisa</i>
          </span>
          <span className="footer-stay">
            Stay Connected
            <a href={social.facebook || '#'} aria-label="Facebook"><Ic name="facebook" size={13} /></a>
            <a href={social.instagram || '#'} aria-label="Instagram"><Ic name="instagram" size={13} /></a>
            <a href={social.tiktok || '#'} aria-label="TikTok"><Ic name="tiktok" size={13} /></a>
            <a href={social.youtube || '#'} aria-label="YouTube"><Ic name="youtube" size={13} /></a>
            <a href={social.whatsapp || '#'} aria-label="WhatsApp"><Ic name="whatsapp" size={13} /></a>
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
      <NavLink to="/shop"><Ic name="grid" size={20} /><span>Shop</span></NavLink>
      <NavLink to="/cart" className="mn-cart">
        <Ic name="cart" size={20} />
        {count > 0 && <em className="mn-badge">{count}</em>}
        <span>Cart</span>
      </NavLink>
      <NavLink to="/track-order"><Ic name="truck" size={20} /><span>Track</span></NavLink>
      <NavLink to={user ? '/account' : '/login'}><Ic name="user" size={20} /><span>{user ? 'Account' : 'Login'}</span></NavLink>
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
      <ChatWidget />
      <MobileNav />
      {toast && <div className="toast"><Ic name="checkCircle" size={17} /> {toast}</div>}
    </>
  );
}
