import express from 'express';

import authRoutes from './sellers/auth.routes.js';
import dashboardRoutes from './sellers/dashboard.routes.js';
import productRoutes from './sellers/products.routes.js';
import orderRoutes, {
  lockSellerOrderFund,
  releaseSellerOrderDelivered,
  releaseSellerOrderCancelled,
} from './sellers/orders.routes.js';
import refundRoutes from './sellers/refunds.routes.js';
import couponRoutes from './sellers/coupons.routes.js';
import shippingRoutes from './sellers/shipping.routes.js';
import walletRoutes from './sellers/wallet.routes.js';
import adminRoutes from './sellers/admin.routes.js';
import treasuryRoutes from './sellers/treasury.routes.js';
import { slugify, calculateHealthStatus } from './sellers/helpers.js';

const router = express.Router();

// Mount domain-specific sub-routers in explicit precedence order
router.use(authRoutes);
router.use(dashboardRoutes);
router.use(productRoutes);
router.use(treasuryRoutes);
router.use(orderRoutes);
router.use(refundRoutes);
router.use(couponRoutes);
router.use(shippingRoutes);
router.use(walletRoutes);
router.use(adminRoutes);

// Re-export core helpers for external consumers (e.g. server/src/routes/orders.js)
export {
  lockSellerOrderFund,
  releaseSellerOrderDelivered,
  releaseSellerOrderCancelled,
  calculateHealthStatus,
  slugify,
};

export default router;
