// perf: this whole portal is loaded as one separate chunk (see App.jsx) so that
// storefront visitors do not download it. Routes are unchanged.
import { Routes, Route, Navigate } from 'react-router-dom';
import SellerLayout from './SellerLayout.jsx';
import SellerDashboard from './SellerDashboard.jsx';
import SellerProducts from './SellerProducts.jsx';
import SellerOrders from './SellerOrders.jsx';
import SellerRefunds from './SellerRefunds.jsx';
import SellerInventory from './SellerInventory.jsx';
import SellerDiscounts from './SellerDiscounts.jsx';
import SellerAnalytics from './SellerAnalytics.jsx';
import SellerWallet from './SellerWallet.jsx';
import SellerShipping from './SellerShipping.jsx';
import SellerSupport from './SellerSupport.jsx';
import SellerSettings from './SellerSettings.jsx';
import SellerTreasury from './SellerTreasury.jsx';

export default function SellerRoutes() {
  return (
    <Routes>
      <Route element={<SellerLayout />}>
        <Route index element={<SellerDashboard />} />
        <Route path="treasury" element={<SellerTreasury />} />
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
