import { Router } from 'express';
import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import Seller from '../models/Seller.js';
import Order from '../models/Order.js';
import { authAdmin } from '../middleware/auth.js';

const router = Router();

// Seller-side links → the matching admin page (the admin bell also shows sellers' notifications)
function adminLinkFor(link = '', type = '') {
  if (!link || !link.startsWith('/seller')) return link;
  if (link.startsWith('/seller/orders')) return '/admin/orders';
  if (link.startsWith('/seller/wallet')) return '/admin/withdrawals';
  if (link.startsWith('/seller/chat') || link.startsWith('/seller/support') || type === 'chat') return '/admin/chat';
  if (link.startsWith('/seller/products')) return '/admin/products';
  return '/admin/sellers';
}

const ORDER_NO = /(?:order\s*#?\s*|#)([A-Za-z0-9-]{2,})/i;

router.get('/', authAdmin(), async (req, res) => {
  const [docs, unread] = await Promise.all([
    Notification.find().sort({ createdAt: -1 }).limit(50).lean(),
    Notification.countDocuments({ read: false }),
  ]);

  // Which store each notification is about, and which order it names
  const sellerIds = [...new Set(docs.map((n) => n.seller && String(n.seller)).filter(Boolean))];
  const orderNos = new Set();
  for (const n of docs) {
    const m = `${n.title || ''} ${n.body || ''}`.match(ORDER_NO);
    if (m && (n.type === 'order' || n.type === 'payment' || /order/i.test(n.title || ''))) orderNos.add(m[1]);
  }
  const [sellers, orders] = await Promise.all([
    sellerIds.length ? Seller.find({ _id: { $in: sellerIds.filter((id) => mongoose.Types.ObjectId.isValid(id)) } }).select('storeName').lean() : [],
    orderNos.size ? Order.find({ orderNumber: { $in: [...orderNos] } }).select('orderNumber seller items.seller items.sellerName').lean() : [],
  ]);
  const storeOf = new Map(sellers.map((s) => [String(s._id), s.storeName]));
  const orderOf = new Map(orders.map((o) => [String(o.orderNumber), o]));
  const missingStores = new Set();
  for (const o of orders) if (o.seller && !storeOf.has(String(o.seller))) missingStores.add(String(o.seller));
  if (missingStores.size) {
    const more = await Seller.find({ _id: { $in: [...missingStores] } }).select('storeName').lean();
    for (const s of more) storeOf.set(String(s._id), s.storeName);
  }

  const items = docs.map((n) => {
    const m = `${n.title || ''} ${n.body || ''}`.match(ORDER_NO);
    const order = m ? orderOf.get(m[1]) : null;
    let store = n.seller ? storeOf.get(String(n.seller)) : '';
    if (!store && order) store = (order.seller && storeOf.get(String(order.seller))) || order.items?.find((i) => i.sellerName)?.sellerName || '';
    const link = order ? `/admin/orders/${order._id}` : adminLinkFor(n.link, n.type);
    return {
      ...n,
      storeName: store || '',
      orderNumber: order ? order.orderNumber : '',
      // the admin sees which store it was about, e.g. "SN Products · 📦 Order #57 … DELIVERED"
      title: store && !String(n.title || '').includes(store) ? `${store} · ${n.title || ''}` : n.title,
      link,
    };
  });
  res.json({ items, unread });
});

router.post('/:id/read', authAdmin(), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) return res.status(404).json({ message: 'Not found' });
  await Notification.updateOne({ _id: req.params.id }, { $set: { read: true } });
  res.json({ ok: true });
});

router.post('/read-all', authAdmin(), async (req, res) => {
  const r = await Notification.updateMany({ read: false }, { $set: { read: true } });
  res.json({ ok: true, updated: r.modifiedCount || 0, unread: 0 });
});

export default router;
