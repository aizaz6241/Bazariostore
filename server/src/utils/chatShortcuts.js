import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { Message } from '../models/Chat.js';
import { toAdmins } from './realtime.js';

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
    // a deposit card can carry the amount to deposit (filled in on the seller's deposit form)
    const amount = key === 'deposit' ? Math.round((Number(raw.amount) || 0) * 100) / 100 : 0;
    if (key === 'deposit' && raw.amount !== undefined && raw.amount !== '' && raw.amount !== null && !(amount >= 1 && amount <= 1000000)) {
      throw fail('Enter a deposit amount between $1 and $1,000,000.');
    }
    if (amount > 0) return { kind, key, refId: '', amount, label: `💰 Deposit $${amount.toLocaleString('en-US')}`, sub: 'Tap to open the deposit form with this amount' };
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

/** Ready-made buttons for the system's own messages (warnings, approvals…). */
export function pageAction(key, over = {}) {
  const page = SHORTCUT_PAGES[key];
  if (!page) return undefined;
  const out = { kind: 'page', key, refId: '', label: over.label || page.label, sub: over.sub ?? page.sub };
  if (key === 'deposit' && Number(over.amount) > 0) out.amount = Math.round(Number(over.amount) * 100) / 100;
  return out;
}
export function orderAction(order, over = {}) {
  if (!order?._id) return undefined;
  return { kind: 'order', key: '', refId: String(order._id), label: over.label || `🧾 Open order ${order.orderNumber}`, sub: over.sub || 'Tap to see this order' };
}

/**
 * The seller did what a button asked (sent a deposit request, confirmed the order, asked for
 * Diamond…): the buttons of the last 30 days that asked for it get a "done" mark, shown to support.
 * @param {string} sellerId
 * @param {object} match   { key } for a page button, { refId } for an order button
 * @param {string} text    e.g. 'Deposit request sent'
 */
export async function markShortcutDone(sellerId, match, text) {
  try {
    if (!sellerId || !mongoose.Types.ObjectId.isValid(String(sellerId))) return;
    const filter = {
      seller: new mongoose.Types.ObjectId(String(sellerId)),
      'action.label': { $exists: true },
      $or: [{ 'action.doneAt': null }, { 'action.doneAt': { $exists: false } }],
      createdAt: { $gte: new Date(Date.now() - 30 * 86400000) },
      isDeleted: { $ne: true },
    };
    if (match.refId) Object.assign(filter, { 'action.kind': 'order', 'action.refId': String(match.refId) });
    else Object.assign(filter, { 'action.kind': 'page', 'action.key': String(match.key || '') });
    const ids = (await Message.find(filter).select('_id conversation').limit(50).lean()).map((m) => ({ id: String(m._id), conversation: String(m.conversation) }));
    if (!ids.length) return;
    const at = new Date();
    await Message.updateMany({ _id: { $in: ids.map((x) => x.id) } }, { $set: { 'action.doneAt': at, 'action.doneText': String(text || 'Done').slice(0, 80) } });
    toAdmins('chat', 'message:action_done', { messageIds: ids.map((x) => x.id), doneAt: at, doneText: text });
  } catch (e) {
    console.error('[chat shortcuts] done mark failed:', e.message);
  }
}
