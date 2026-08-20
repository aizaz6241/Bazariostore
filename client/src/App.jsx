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
import SellerLayout from './seller/SellerLayout.jsx';
import SellerDashboard from './seller/SellerDashboard.jsx';
import SellerProducts from './seller/SellerProducts.jsx';
import SellerOrders from './seller/SellerOrders.jsx';
import SellerRefunds from './seller/SellerRefunds.jsx';
import SellerInventory from './seller/SellerInventory.jsx';
import SellerDiscounts from './seller/SellerDiscounts.jsx';
import SellerAnalytics from './seller/SellerAnalytics.jsx';
import SellerWallet from './seller/SellerWallet.jsx';
import SellerShipping from './seller/SellerShipping.jsx';
import SellerSupport from './seller/SellerSupport.jsx';
import SellerSettings from './seller/SellerSettings.jsx';

// ─── Super Admin ──────────────────────────────────────────────
import AdminLogin from './admin/AdminLogin.jsx';
import AdminLayout from './admin/AdminLayout.jsx';
import Dashboard from './admin/Dashboard.jsx';
import Sellers from './admin/Sellers.jsx';
import AdminWithdrawals from './admin/AdminWithdrawals.jsx';
import ChatInbox from './admin/ChatInbox.jsx';
import Staff from './admin/Staff.jsx';
// Legacy admin pages (accessible via URL, not shown in nav)
import Orders from './admin/Orders.jsx';
import OrderDetail from './admin/OrderDetail.jsx';
import Products from './admin/Products.jsx';
import ProductEdit from './admin/ProductEdit.jsx';
import Categories from './admin/Categories.jsx';
import Discounts from './admin/Discounts.jsx';
import Refunds from './admin/Refunds.jsx';
import Shipping from './admin/Shipping.jsx';
import Inventory from './admin/Inventory.jsx';
import Finance from './admin/Finance.jsx';
import Reports from './admin/Reports.jsx';
import Audit from './admin/Audit.jsx';
import Content from './admin/Content.jsx';
import Settings from './admin/Settings.jsx';
import InstallAppBanner from './components/InstallAppBanner.jsx';

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
      </Route>

      {/* ─── Seller Central Portal ───────────────────────────── */}
      <Route path="/seller/login" element={<SellerLogin />} />
      <Route path="/seller" element={<SellerLayout />}>
        <Route index element={<SellerDashboard />} />
        <Route path="products" element={<SellerProducts />} />
        <Route path="orders" element={<SellerOrders />} />
        <Route path="refunds" element={<SellerRefunds />} />
        <Route path="inventory" element={<SellerInventory />} />
        <Route path="discounts" element={<SellerDiscounts />} />
        <Route path="analytics" element={<SellerAnalytics />} />
        <Route path="wallet" element={<SellerWallet />} />
        <Route path="shipping" element={<SellerShipping />} />
        <Route path="support" element={<SellerSupport />} />
        <Route path="settings" element={<SellerSettings />} />
      </Route>

      {/* ─── Super Admin Control Center ──────────────────────── */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="sellers" element={<Sellers />} />
        <Route path="withdrawals" element={<AdminWithdrawals />} />
        <Route path="chat" element={<ChatInbox />} />
        <Route path="staff" element={<Staff />} />
        {/* Legacy routes — accessible but not in sidebar */}
        <Route path="orders" element={<Orders />} />
        <Route path="orders/:id" element={<OrderDetail />} />
        <Route path="products" element={<Products />} />
        <Route path="products/new" element={<ProductEdit />} />
        <Route path="products/:id" element={<ProductEdit />} />
        <Route path="categories" element={<Categories />} />
        <Route path="discounts" element={<Discounts />} />
        <Route path="refunds" element={<Refunds />} />
        <Route path="shipping" element={<Shipping />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="finance" element={<Finance />} />
        <Route path="reports" element={<Reports />} />
        <Route path="audit" element={<Audit />} />
        <Route path="content" element={<Content />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
