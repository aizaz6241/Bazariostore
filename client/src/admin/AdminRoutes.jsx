// perf: this whole portal is loaded as one separate chunk (see App.jsx) so that
// storefront visitors do not download it. Routes are unchanged.
import { Routes, Route, Navigate, Link, useOutletContext } from 'react-router-dom';
import AdminLayout from './AdminLayout.jsx';
import Dashboard from './Dashboard.jsx';
import AdminTreasury from './AdminTreasury.jsx';
import AdminTreasuryEdit from './AdminTreasuryEdit.jsx';
import Sellers from './Sellers.jsx';
import Complaints from './Complaints.jsx';
import Applications from './Applications.jsx';
import Targets from './Targets.jsx';
import Referrals from './Referrals.jsx';
import AdminWithdrawals from './AdminWithdrawals.jsx';
import ChatInbox from './ChatInbox.jsx';
import Staff from './Staff.jsx';
import Backup from './Backup.jsx';
import Orders from './Orders.jsx';
import OrderDetail from './OrderDetail.jsx';
import Products from './Products.jsx';
import ProductEdit from './ProductEdit.jsx';
import Categories from './Categories.jsx';
import Discounts from './Discounts.jsx';
import Refunds from './Refunds.jsx';
import Shipping from './Shipping.jsx';
import Inventory from './Inventory.jsx';
import Finance from './Finance.jsx';
import Reports from './Reports.jsx';
import Audit from './Audit.jsx';
import Content from './Content.jsx';
import Settings from './Settings.jsx';

// A page opened by its address (bookmark, old link) is checked as well, not only hidden in the menu.
// The server refuses the data anyway; this shows a clear message instead of a half-broken page.
function Need({ perm, children }) {
  const { can } = useOutletContext() || {};
  if (!can || can(perm)) return children;
  return (
    <div className="card" style={{ padding: 28, maxWidth: 560, margin: '24px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 34, marginBottom: 6 }}>🔒</div>
      <h2 style={{ margin: '0 0 6px' }}>No access</h2>
      <p className="muted" style={{ margin: '0 0 14px' }}>
        Your role does not include the <b>{perm}</b> permission. Ask the Super Admin if you need this section.
      </p>
      <Link className="btn-primary" to="/admin">Back to dashboard</Link>
    </div>
  );
}

const guard = (perm, el) => <Need perm={perm}>{el}</Need>;

export default function AdminRoutes() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        {/* the Today page was removed from the panel; old links go to the dashboard */}
        <Route path="today" element={<Navigate to="/admin" replace />} />
        <Route path="treasury" element={guard('products', <AdminTreasury />)} />
        <Route path="treasury/new" element={guard('products', <AdminTreasuryEdit />)} />
        <Route path="treasury/:id" element={guard('products', <AdminTreasuryEdit />)} />
        <Route path="sellers" element={guard('sellers', <Sellers />)} />
        <Route path="complaints" element={guard('sellers', <Complaints />)} />
        <Route path="orders" element={guard('orders', <Orders />)} />
        <Route path="orders/:id" element={guard('orders', <OrderDetail />)} />
        <Route path="applications" element={guard('sellers', <Applications />)} />
        <Route path="targets" element={guard('sellers', <Targets />)} />
        <Route path="affiliates" element={guard('sellers', <Referrals />)} />
        <Route path="affiliate-codes" element={<Navigate to="/admin/affiliates" replace />} />
        <Route path="referrals" element={<Navigate to="/admin/affiliates" replace />} />
        <Route path="referral-codes" element={<Navigate to="/admin/affiliates" replace />} />
        <Route path="withdrawals" element={guard('finance', <AdminWithdrawals />)} />
        <Route path="payouts" element={<Navigate to="/admin/withdrawals" replace />} />
        <Route path="chat" element={guard('chat', <ChatInbox />)} />
        <Route path="staff" element={guard('staff', <Staff />)} />
        <Route path="backup" element={guard('backup', <Backup />)} />
        {/* Legacy routes — accessible via URL */}
        <Route path="products" element={guard('products', <Products />)} />
        <Route path="products/new" element={guard('products', <ProductEdit />)} />
        <Route path="products/:id" element={guard('products', <ProductEdit />)} />
        <Route path="categories" element={guard('categories', <Categories />)} />
        <Route path="discounts" element={guard('discounts', <Discounts />)} />
        <Route path="refunds" element={guard('refunds', <Refunds />)} />
        <Route path="shipping" element={guard('shipping', <Shipping />)} />
        <Route path="inventory" element={guard('inventory', <Inventory />)} />
        <Route path="finance" element={guard('finance', <Finance />)} />
        <Route path="reports" element={guard('reports', <Reports />)} />
        <Route path="audit" element={guard('audit', <Audit />)} />
        <Route path="content" element={guard('content', <Content />)} />
        <Route path="settings" element={guard('settings', <Settings />)} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
