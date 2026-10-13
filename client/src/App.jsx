import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { applySeo } from './seo.js';
import StoreLayout from './components/StoreLayout.jsx';
import Home from './pages/Home.jsx';
import Shop from './pages/Shop.jsx';
import ProductPage from './pages/ProductPage.jsx';
import CartPage from './pages/CartPage.jsx';
import Checkout from './pages/Checkout.jsx';
import OrderSuccess from './pages/OrderSuccess.jsx';
import TrackOrder from './pages/TrackOrder.jsx';
import PolicyPage from './pages/PolicyPage.jsx';
import Account from './pages/Account.jsx';
import { Login, Register, Forgot, Reset } from './pages/AuthPages.jsx';

// ─── Seller Central ───────────────────────────────────────────
import SellerLogin from './seller/SellerLogin.jsx';

// ─── Super Admin ──────────────────────────────────────────────
import AdminLogin from './admin/AdminLogin.jsx';
// Legacy admin pages (accessible via URL, not shown in nav)
import InstallAppBanner from './components/InstallAppBanner.jsx';

// ─── perf: Seller Central and Super Admin are code-split ──────
// Each portal is one lazily loaded chunk, so storefront visitors download far less JavaScript.
// If a chunk fails to load (e.g. a new version was deployed while the tab was open), reload once
// to pick up the fresh build instead of showing an error.
function lazyWithRetry(factory, key) {
  const flag = `bz_chunk_reload_${key}`;
  return lazy(() =>
    factory()
      .then((mod) => {
        try { sessionStorage.removeItem(flag); } catch {}
        return mod;
      })
      .catch((err) => {
        let alreadyRetried = false;
        try { alreadyRetried = sessionStorage.getItem(flag) === '1'; } catch {}
        if (!alreadyRetried) {
          try { sessionStorage.setItem(flag, '1'); } catch {}
          window.location.reload();
          return new Promise(() => {});
        }
        throw err;
      })
  );
}

const SellerRoutes = lazyWithRetry(() => import('./seller/SellerRoutes.jsx'), 'seller');
const AdminRoutes = lazyWithRetry(() => import('./admin/AdminRoutes.jsx'), 'admin');

function PortalBoundary({ children }) {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 14 }}>
          Loading…
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

// Head tags for routes whose page component doesn't set its own (Home, Shop and ProductPage do).
// Private screens and the portals are kept out of search results.
const ROUTE_SEO = [
  ['/cart', { title: 'Your Cart', noindex: true }],
  ['/checkout', { title: 'Checkout', noindex: true }],
  ['/order-success', { title: 'Order Placed', noindex: true }],
  ['/account', { title: 'My Account', noindex: true }],
  ['/login', { title: 'Sign In', noindex: true }],
  ['/register', { title: 'Create Account', noindex: true }],
  ['/forgot-password', { title: 'Forgot Password', noindex: true }],
  ['/reset-password', { title: 'Reset Password', noindex: true }],
  ['/track-order', { title: 'Track Your Order', description: 'Track your Bazario order in real time — enter your order number to see dispatch, shipping and delivery status.' }],
  ['/seller/login', {
    title: 'Sell on Bazario — Start Dropshipping Without Inventory',
    description: 'Open your free Bazario store and start dropshipping: pick products from the central catalog, set your price and sell worldwide — no warehouse, no upfront stock.',
  }],
  ['/page/', { title: 'Bazario Policies' }],
  ['/seller', { title: 'Seller Central', noindex: true }],
  ['/sellers', { title: 'Seller Central', noindex: true }],
  ['/admin', { title: 'Admin', noindex: true }],
];

function RouteSeo() {
  const { pathname } = useLocation();
  useEffect(() => {
    const hit = ROUTE_SEO.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`));
    if (hit) applySeo({ path: pathname, ...hit[1] });
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <RouteSeo />
      <InstallAppBanner />
      <Routes>
        {/* ─── Customer Storefront ─────────────────────────────── */}
      <Route element={<StoreLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/product/:slug" element={<ProductPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/order-success" element={<OrderSuccess />} />
        <Route path="/track-order" element={<TrackOrder />} />
        <Route path="/page/:key" element={<PolicyPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<Forgot />} />
        <Route path="/reset-password" element={<Reset />} />
        <Route path="/account" element={<Account />} />
        <Route path="/seller/login" element={<SellerLogin />} />
        <Route path="/seller/register" element={<Navigate to="/seller/login?mode=register" replace />} />
        <Route path="/sellers/register" element={<Navigate to="/seller/login?mode=register" replace />} />
        <Route path="/become-seller" element={<Navigate to="/seller/login?mode=register" replace />} />
        <Route path="/admin/login" element={<AdminLogin />} />
      </Route>

      {/* ─── Seller Central Portal ───────────────────────────── */}
      <Route path="/seller/*" element={<PortalBoundary><SellerRoutes /></PortalBoundary>} />

      {/* ─── Aliases for /sellers -> /seller ─────────────────────── */}
      <Route path="/sellers" element={<Navigate to="/seller" replace />} />
      <Route path="/sellers/login" element={<Navigate to="/seller/login" replace />} />
      <Route path="/sellers/treasury" element={<Navigate to="/seller/treasury" replace />} />
      <Route path="/sellers/orders" element={<Navigate to="/seller/orders" replace />} />
      <Route path="/sellers/wallet" element={<Navigate to="/seller/wallet" replace />} />
      <Route path="/sellers/products" element={<Navigate to="/seller/products" replace />} />
      <Route path="/sellers/refunds" element={<Navigate to="/seller/refunds" replace />} />
      <Route path="/sellers/inventory" element={<Navigate to="/seller/inventory" replace />} />
      <Route path="/sellers/discounts" element={<Navigate to="/seller/discounts" replace />} />
      <Route path="/sellers/analytics" element={<Navigate to="/seller/analytics" replace />} />
      <Route path="/sellers/shipping" element={<Navigate to="/seller/shipping" replace />} />
      <Route path="/sellers/support" element={<Navigate to="/seller/support" replace />} />
      <Route path="/sellers/settings" element={<Navigate to="/seller/settings" replace />} />
      <Route path="/sellers/*" element={<Navigate to="/seller" replace />} />

      {/* ─── Super Admin Control Center ──────────────────────── */}
      <Route path="/admin/*" element={<PortalBoundary><AdminRoutes /></PortalBoundary>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
