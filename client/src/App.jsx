import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
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

export default function App() {
  return (
    <>
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
