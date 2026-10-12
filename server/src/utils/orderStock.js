import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { StockHistory } from '../models/StockHistory.js';
import { adjustTreasuryStock } from './stockSync.js';

/**
 * Stock movements of an order, each done exactly ONCE.
 *
 * Placing an order takes the items out of `stock` and puts them in `reservedStock`.
 *   - delivered  -> reservedStock goes down, `sold` goes up        (settleDeliveredStock)
 *   - cancelled / refunded with restock -> items go back to `stock` (restockOrder)
 *
 * Before, "delivered" was counted in two or three places (admin screen, the automatic delivery
 * engine and the payout function) and "cancelled" in two, so the numbers drifted. Now each one
 * first marks the order in the database ("stock settled" / "stock restored") and only the request
 * that manages to set that mark moves the stock; a second click or a retry does nothing.
 */

const qtyOf = (it) => Number(it.qty) || 1;
const idOf = (p) => (p && p._id ? p._id : p);

/** Delivered: release the reservation and count the sale. Safe to call any number of times. */
export async function settleDeliveredStock(order) {
  if (!order?._id) return false;
  const claimed = await Order.updateOne({ _id: order._id, stockSettled: { $ne: true }, stockRestored: { $ne: true } }, { $set: { stockSettled: true } });
  if (!claimed.modifiedCount) return false;
  order.stockSettled = true;

  for (const it of order.items || []) {
    if (!it.product) continue;
    const q = qtyOf(it);
    try {
      await Product.updateOne({ _id: idOf(it.product) }, { $inc: { reservedStock: -q, sold: q } });
      await Product.updateOne({ _id: idOf(it.product), reservedStock: { $lt: 0 } }, { $set: { reservedStock: 0 } });
    } catch (e) {
      console.error('settleDeliveredStock:', e.message);
    }
  }
  return true;
}

/** Cancelled / refunded: put the items back on the shelf. Safe to call any number of times. */
export async function restockOrder(order, reason, by) {
  if (!order?._id) return false;
  if (order.stockRestored) return false;
  // a delivered order (sale already counted) gets here only through a refund: the admin status
  // screen refuses to cancel a delivered order
  const filter = { _id: order._id, stockRestored: { $ne: true } };
  const claimed = await Order.updateOne(filter, { $set: { stockRestored: true } });
  if (!claimed.modifiedCount) {
    order.stockRestored = true;
    return false;
  }
  order.stockRestored = true;
  const wasSettled = order.stockSettled === true;

  for (const it of order.items || []) {
    if (!it.product) continue;
    const q = qtyOf(it);
    try {
      // settled orders already left the reservation and were counted as sold
      const inc = wasSettled ? { stock: q, sold: -q } : { stock: q, reservedStock: -q };
      const p = await Product.findOneAndUpdate({ _id: idOf(it.product) }, { $inc: inc }, { new: true });
      if (!p) continue;
      if ((p.reservedStock || 0) < 0) await Product.updateOne({ _id: p._id, reservedStock: { $lt: 0 } }, { $set: { reservedStock: 0 } });
      if ((p.sold || 0) < 0) await Product.updateOne({ _id: p._id, sold: { $lt: 0 } }, { $set: { sold: 0 } });
      await StockHistory.create({ product: p._id, productName: p.name, change: q, stockAfter: p.stock, reason, note: order.orderNumber, by });

      // If product is linked to Central Treasury, synchronize master and all sellers
      if (p.treasuryProduct) {
        await adjustTreasuryStock(p.treasuryProduct, q, {
          releaseReserved: true,
          reason: reason || 'order_restocked',
          note: `Order #${order.orderNumber} restocked`,
          by: by || 'Admin',
        });
      }
    } catch (e) {
      console.error('restockOrder:', e.message);
    }
  }
  return true;
}

/**
 * A cancelled / refunded order is brought back (confirmed, shipped, delivered...): its items were
 * put back on the shelf, so they are taken off it again — exactly what placing the order did.
 * Refuses (throws, status 400) before anything moves when a product no longer has enough stock.
 * Does nothing for an order whose stock was never put back. Safe to call any number of times.
 */
const orderLines = (order) => (order.items || []).filter((it) => it.product).map((it) => ({ id: idOf(it.product), q: qtyOf(it) }));

/** Throws (status 400) when the shelf no longer holds what bringing this order back would take. */
export async function checkStockForReinstate(order) {
  if (!order?._id || !order.stockRestored) return;
  const need = new Map();
  for (const l of orderLines(order)) need.set(String(l.id), (need.get(String(l.id)) || 0) + l.q);
  const products = await Product.find({ _id: { $in: [...need.keys()] } }).select('name stock').lean();
  for (const p of products) {
    const want = need.get(String(p._id)) || 0;
    if ((Number(p.stock) || 0) < want) {
      throw Object.assign(new Error(`"${p.name}" has only ${Math.max(0, Number(p.stock) || 0)} in stock (this order needs ${want}).`), { status: 400 });
    }
  }
}

export async function reinstateOrderStock(order, by) {
  if (!order?._id || !order.stockRestored) return false;
  await checkStockForReinstate(order);
  const lines = orderLines(order);

  const claimed = await Order.updateOne({ _id: order._id, stockRestored: true }, { $set: { stockRestored: false } });
  if (!claimed.modifiedCount) {
    order.stockRestored = false;
    return false;
  }
  order.stockRestored = false;
  // an order that had been delivered before the cancel was counted as sold again by restockOrder
  const wasSettled = order.stockSettled === true;

  for (const l of lines) {
    try {
      const inc = wasSettled ? { stock: -l.q, sold: l.q } : { stock: -l.q, reservedStock: l.q };
      const p = await Product.findOneAndUpdate({ _id: l.id }, { $inc: inc }, { new: true });
      if (!p) continue;
      await StockHistory.create({ product: p._id, productName: p.name, change: -l.q, stockAfter: p.stock, reason: 'order_reinstated', note: order.orderNumber, by });
      if (p.treasuryProduct) {
        await adjustTreasuryStock(p.treasuryProduct, -l.q, {
          reason: 'order_reinstated',
          note: `Order #${order.orderNumber} brought back`,
          by: by || 'Admin',
        });
      }
    } catch (e) {
      console.error('reinstateOrderStock:', e.message);
    }
  }
  return true;
}
