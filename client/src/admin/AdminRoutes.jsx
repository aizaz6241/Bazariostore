// perf: this whole portal is loaded as one separate chunk (see App.jsx) so that
// storefront visitors do not download it. Routes are unchanged.
import { Routes, Route, Navigate } from 'react-router-dom';
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

export default function AdminRoutes() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="treasury" element={<AdminTreasury />} />
        <Route path="treasury/new" element={<AdminTreasuryEdit />} />
        <Route path="treasury/:id" element={<AdminTreasuryEdit />} />
        <Route path="sellers" element={<Sellers />} />
        <Route path="complaints" element={<Complaints />} />
        <Route path="orders" element={<Orders />} />
        <Route path="orders/:id" element={<OrderDetail />} />
        <Route path="applications" element={<Applications />} />
        <Route path="targets" element={<Targets />} />
        <Route path="affiliates" element={<Referrals />} />
        <Route path="affiliate-codes" element={<Navigate to="/admin/affiliates" replace />} />
        <Route path="referrals" element={<Navigate to="/admin/affiliates" replace />} />
        <Route path="referral-codes" element={<Navigate to="/admin/affiliates" replace />} />
        <Route path="withdrawals" element={<AdminWithdrawals />} />
        <Route path="payouts" element={<Navigate to="/admin/withdrawals" replace />} />
        <Route path="chat" element={<ChatInbox />} />
        <Route path="staff" element={<Staff />} />
        <Route path="backup" element={<Backup />} />
        {/* Legacy routes — accessible via URL */}
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
  );
}
