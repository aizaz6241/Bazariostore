import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';

/**
 * SUPPORT SHORTCUTS — buttons that support sends in a seller's chat. The seller taps one and lands
 * on the right page of the seller panel (a page, one of his orders, one of his products).
 *
 * Only pages from this list can be sent (no free links), and an order / product must belong to
 * the store of the chat. The link itself is built on the seller's screen from kind + key / refId.
 * Keep the keys in step with client/src/utils/chatShortcuts.js.
 */
export const SHORTCUT_PAGES = {
  diamond: { label: '💎 Upgrade to Diamond', sub: 'See Diamond benefits and send the upgrade request' },
  deposit: { label: '💰 Deposit funds', sub: 'Wallet → Deposit' },
  withdraw: { label: '💸 Withdraw funds', sub: 'Wallet → Withdraw' },
  wallet: { label: '👛 My Wallet', sub: 'Balance and history' },
  orders: { label: '🛒 My Orders', sub: 'Orders & dispatch' },
  products: { label: '📦 My Store Products', sub: 'Products in your store' },
  treasury: { label: '✨ Product Treasury', sub: 'Add products to your store' },
  refunds: { label: '🔄 Refunds & Returns', sub: 'Return requests' },
  discounts: { label: '🎟️ Discounts & Coupons', sub: 'Coupons for your store' },
  shipping: { label: '🚚 Shipping Settings', sub: 'Delivery options' },
  analytics: { label: '📊 Analytics & Reports', sub: 'Sales and profit' },
  settings: { label: '⚙️ Store Settings', sub: 'Store details and payout methods' },
  dashboard: { label: '🏠 Dashboard', sub: 'Store overview' },
};

const oid = (v) => (mongoose.Types.ObjectId.isValid(String(v || '')) ? new mongoose.Types.ObjectId(String(v)) : null);
const ownsOrder = (sellerId) => ({ $or: [{ seller: sellerId }, { 'items.seller': sellerId }] });
const fail = (message) => Object.assign(new Error(message), { status: 400 });

/**
 * The action as it will be stored, or throws with a message for the admin.
 * @param {object} raw     { kind: 'page', key } | { kind: 'order'|'product', refId }
 * @param {object} conv    the conversation (must be a store's chat)
 */
export async function resolveShortcut(raw, conv) {
  if (!raw || typeof raw !== 'object') return null;
  if (!conv?.seller) throw fail('Shortcut buttons can only be sent in a store’s chat.');
  const sellerId = oid(conv.seller);
  const kind = String(raw.kind || '');

  if (kind === 'page') {
    const key = String(raw.key || '');
    const page = Object.prototype.hasOwnProperty.call(SHORTCUT_PAGES, key) ? SHORTCUT_PAGES[key] : null;
    if (!page) throw fail('Unknown page.');
    return { kind, key, refId: '', label: page.label, sub: page.sub };
  }
  if (kind === 'order') {
    const id = oid(raw.refId);
    const ord = id ? await Order.findOne({ _id: id, ...ownsOrder(sellerId) }).select('orderNumber').lean() : null;
    if (!ord) throw fail('This order does not belong to this store.');
    return { kind, key: '', refId: String(ord._id), label: `🧾 Open order ${ord.orderNumber}`, sub: 'Tap to see this order' };
  }
  if (kind === 'product') {
    const id = oid(raw.refId);
    const p = id ? await Product.findOne({ _id: id, seller: sellerId }).select('name').lean() : null;
    if (!p) throw fail('This product is not in this store.');
    const name = String(p.name || 'Product');
    return { kind, key: '', refId: String(p._id), label: `📦 ${name.length > 60 ? `${name.slice(0, 57)}…` : name}`, sub: 'Tap to open it in My Store Products' };
  }
  throw fail('Unknown shortcut.');
}

/** Search this store's orders / products for the admin's picker (newest first, 20 at most). */
export async function searchShortcutTargets(conv, kind, q = '') {
  const sellerId = oid(conv?.seller);
  if (!sellerId) return [];
  const term = String(q || '').trim().slice(0, 60);
  const rx = term ? new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
  if (kind === 'order') {
    const filter = { ...ownsOrder(sellerId) };
    if (rx) filter.$and = [{ $or: [{ orderNumber: rx }, { 'items.name': rx }, { 'shippingAddress.fullName': rx }] }];
    const list = await Order.find(filter).select('orderNumber status createdAt items.name items.seller').sort({ createdAt: -1 }).limit(20).lean();
    return list.map((o) => ({
      id: String(o._id),
      title: o.orderNumber,
      sub: `${o.status} · ${(o.items || [])
        .filter((it) => !it.seller || String(it.seller) === String(sellerId))
        .map((it) => it.name)
        .join(', ')
        .slice(0, 70)}`,
      date: o.createdAt,
    }));
  }
  if (kind === 'product') {
    const filter = { seller: sellerId };
    if (rx) filter.$or = [{ name: rx }, { sku: rx }, { brand: rx }];
    const list = await Product.find(filter).select('name price image active').sort({ createdAt: -1 }).limit(20).lean();
    return list.map((p) => ({ id: String(p._id), title: p.name, sub: `$${Number(p.price || 0).toFixed(2)}${p.active === false ? ' · hidden' : ''}`, image: p.image || '' }));
  }
  return [];
}
