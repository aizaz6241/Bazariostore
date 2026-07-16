import { Router } from 'express';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import Refund from '../models/Refund.js';
import Expense from '../models/Expense.js';
import Discount from '../models/Discount.js';
import { authAdmin } from '../middleware/auth.js';
import { sendReport } from '../services/exporter.js';

const router = Router();

const fmt = (d) => new Date(d).toLocaleString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });

function rangeFilter(req, field = 'createdAt') {
  const { from, to } = req.query;
  const f = {};
  if (from) f.$gte = new Date(from);
  if (to) f.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
  return Object.keys(f).length ? { [field]: f } : {};
}

const builders = {
  sales: async (req) => {
    const orders = await Order.find(rangeFilter(req)).sort({ createdAt: -1 }).limit(2000);
    return {
      title: 'Sales Report',
      columns: [
        { key: 'orderNumber', label: 'Order #' }, { key: 'date', label: 'Date' }, { key: 'customer', label: 'Customer' },
        { key: 'city', label: 'City' }, { key: 'payment', label: 'Payment' }, { key: 'status', label: 'Status' },
        { key: 'subtotal', label: 'Subtotal' }, { key: 'discount', label: 'Discount' }, { key: 'shipping', label: 'Shipping' }, { key: 'total', label: 'Total' },
      ],
      rows: orders.map((o) => ({
        orderNumber: o.orderNumber, date: fmt(o.createdAt), customer: o.shippingAddress?.fullName, city: o.shippingAddress?.city,
        payment: o.paymentMethod, status: o.status, subtotal: o.subtotal, discount: o.discount, shipping: o.shipping?.cost || 0, total: o.total,
      })),
    };
  },
  customers: async (req) => {
    const users = await User.find(rangeFilter(req)).sort({ createdAt: -1 }).limit(2000);
    const agg = await Order.aggregate([{ $match: { user: { $ne: null } } }, { $group: { _id: '$user', orders: { $sum: 1 }, spent: { $sum: '$total' } } }]);
    const map = Object.fromEntries(agg.map((a) => [String(a._id), a]));
    return {
      title: 'Customers Report',
      columns: [
        { key: 'name', label: 'Name' }, { key: 'email', label: 'Email', width: 28 }, { key: 'phone', label: 'Phone' },
        { key: 'joined', label: 'Joined' }, { key: 'orders', label: 'Orders' }, { key: 'spent', label: 'Total Spent' },
      ],
      rows: users.map((u) => ({
        name: u.name, email: u.email, phone: u.phone || '', joined: fmt(u.createdAt),
        orders: map[String(u._id)]?.orders || 0, spent: map[String(u._id)]?.spent || 0,
      })),
    };
  },
  products: async () => {
    const products = await Product.find().populate('category', 'name');
    return {
      title: 'Products Report',
      columns: [
        { key: 'name', label: 'Product', width: 34 }, { key: 'sku', label: 'SKU' }, { key: 'category', label: 'Category' },
        { key: 'price', label: 'Price' }, { key: 'cost', label: 'Purchase Cost' }, { key: 'stock', label: 'Stock' },
        { key: 'sold', label: 'Sold' }, { key: 'revenue', label: 'Revenue' }, { key: 'active', label: 'Active' },
      ],
      rows: products.map((p) => ({
        name: p.name, sku: p.sku || '', category: p.category?.name || '', price: p.price, cost: p.costs?.purchase || 0,
        stock: p.stock, sold: p.sold, revenue: p.sold * p.price, active: p.active ? 'Yes' : 'No',
      })),
    };
  },
  refunds: async (req) => {
    const refunds = await Refund.find(rangeFilter(req)).sort({ createdAt: -1 });
    return {
      title: 'Refunds Report',
      columns: [
        { key: 'orderNumber', label: 'Order #' }, { key: 'customer', label: 'Customer' }, { key: 'amount', label: 'Amount' },
        { key: 'reason', label: 'Reason', width: 34 }, { key: 'status', label: 'Status' }, { key: 'requested', label: 'Requested' },
      ],
      rows: refunds.map((r) => ({
        orderNumber: r.orderNumber, customer: r.customer?.name, amount: r.amount, reason: r.reason || '',
        status: r.status, requested: fmt(r.createdAt),
      })),
    };
  },
  inventory: async () => {
    const products = await Product.find().sort({ stock: 1 });
    return {
      title: 'Inventory Report',
      columns: [
        { key: 'name', label: 'Product', width: 34 }, { key: 'sku', label: 'SKU' }, { key: 'stock', label: 'Current Stock' },
        { key: 'reserved', label: 'Reserved' }, { key: 'threshold', label: 'Low Alert At' }, { key: 'state', label: 'Status' },
      ],
      rows: products.map((p) => ({
        name: p.name, sku: p.sku || '', stock: p.stock, reserved: p.reservedStock, threshold: p.lowStockThreshold,
        state: p.stock <= 0 ? 'OUT OF STOCK' : p.stock <= p.lowStockThreshold ? 'LOW' : 'OK',
      })),
    };
  },
  finance: async (req) => {
    const orders = await Order.find({ status: { $nin: ['cancelled', 'refunded'] }, ...rangeFilter(req) });
    const expenses = await Expense.find(rangeFilter(req, 'date'));
    const rows = [
      { item: 'Revenue (orders)', amount: orders.reduce((s, o) => s + o.total, 0) },
      ...['delivery', 'packaging', 'marketing', 'refund', 'misc'].map((t) => ({
        item: `Expense — ${t}`, amount: -expenses.filter((e) => e.type === t).reduce((s, e) => s + e.amount, 0),
      })),
    ];
    rows.push({ item: 'NET', amount: rows.reduce((s, r) => s + r.amount, 0) });
    return { title: 'Finance Report', columns: [{ key: 'item', label: 'Item', width: 34 }, { key: 'amount', label: 'Amount (Rs)' }], rows };
  },
  taxes: async (req) => {
    const orders = await Order.find({ status: { $nin: ['cancelled', 'refunded'] }, ...rangeFilter(req) }).sort({ createdAt: -1 }).limit(2000);
    const ids = [...new Set(orders.flatMap((o) => o.items.map((i) => String(i.product))))];
    const products = await Product.find({ _id: { $in: ids } }).select('costs');
    const taxMap = Object.fromEntries(products.map((p) => [String(p._id), p.costs?.tax || 0]));
    return {
      title: 'Taxes Report',
      columns: [
        { key: 'orderNumber', label: 'Order #' }, { key: 'date', label: 'Date' }, { key: 'total', label: 'Order Total' }, { key: 'tax', label: 'Tax (Rs)' },
      ],
      rows: orders.map((o) => ({
        orderNumber: o.orderNumber, date: fmt(o.createdAt), total: o.total,
        tax: o.items.reduce((s, i) => s + (taxMap[String(i.product)] || 0) * i.qty, 0),
      })),
    };
  },
  coupons: async () => {
    const discounts = await Discount.find({ code: { $ne: '' } });
    return {
      title: 'Coupons Report',
      columns: [
        { key: 'code', label: 'Code' }, { key: 'name', label: 'Name', width: 26 }, { key: 'type', label: 'Type' },
        { key: 'value', label: 'Value' }, { key: 'used', label: 'Times Used' }, { key: 'active', label: 'Active' },
      ],
      rows: discounts.map((d) => ({ code: d.code, name: d.name, type: d.type, value: d.value, used: d.usedCount, active: d.active ? 'Yes' : 'No' })),
    };
  },
  discounts: async () => {
    const discounts = await Discount.find();
    return {
      title: 'Discounts Report',
      columns: [
        { key: 'name', label: 'Name', width: 26 }, { key: 'code', label: 'Code' }, { key: 'type', label: 'Type' },
        { key: 'value', label: 'Value' }, { key: 'scope', label: 'Scope' }, { key: 'minPurchase', label: 'Min Purchase' },
        { key: 'used', label: 'Used' }, { key: 'active', label: 'Active' },
      ],
      rows: discounts.map((d) => ({
        name: d.name, code: d.code || '(auto)', type: d.type, value: d.value, scope: d.scope,
        minPurchase: d.minPurchase, used: d.usedCount, active: d.active ? 'Yes' : 'No',
      })),
    };
  },
};

// GET /api/reports/:type?format=json|csv|xlsx|pdf&from=&to=
router.get('/:type', authAdmin('reports'), async (req, res) => {
  const builder = builders[req.params.type];
  if (!builder) return res.status(404).json({ message: 'Unknown report type' });
  try {
    const report = await builder(req);
    await sendReport(res, { ...report, format: req.query.format || 'json' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

export default router;
