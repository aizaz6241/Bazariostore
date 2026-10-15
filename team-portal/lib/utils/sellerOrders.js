import mongoose from 'mongoose';
import { Order } from '@/lib/models/SharedModels';

/**
 * "Pending" orders the way the store itself counts them: an order is waiting for a seller while
 * one of HIS items is still "pending" (not confirmed yet) and the order is not closed. The seller
 * must confirm it in the store (Orders & Dispatch), which locks the item's price from his wallet;
 * after 24 h he is warned and after 48 h his store is frozen.
 *
 * (Before, the portal counted orders by their overall status, which also counted orders the seller
 * had already confirmed, and did not count the second store of a two-store order.)
 */
export const CLOSED_ORDER_STATUSES = ['cancelled', 'refunded', 'delivered'];

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/** Per seller: how many orders wait for his confirmation, the money needed to confirm them all, and since when the oldest waits. */
export async function unconfirmedBySeller(sellerIds) {
  const ids = (sellerIds || []).filter((v) => v && mongoose.Types.ObjectId.isValid(String(v))).map(oid);
  const out = new Map();
  if (!ids.length) return out;
  const rows = await Order.aggregate([
    { $match: { status: { $nin: CLOSED_ORDER_STATUSES }, $or: [{ 'items.seller': { $in: ids } }, { seller: { $in: ids } }] } },
    { $project: { seller: 1, items: 1, since: { $ifNull: ['$pendingSince', '$createdAt'] } } },
    { $unwind: '$items' },
    { $addFields: { owner: { $ifNull: ['$items.seller', '$seller'] }, st: { $ifNull: ['$items.itemStatus', 'pending'] } } },
    { $match: { owner: { $in: ids }, st: 'pending' } },
    {
      $group: {
        _id: { owner: '$owner', order: '$_id' },
        since: { $first: '$since' },
        amount: {
          $sum: {
            $cond: [
              { $or: [{ $eq: ['$items.processingLocked', true] }, { $eq: ['$items.payoutSettled', true] }] },
              0,
              { $multiply: [{ $ifNull: ['$items.price', 0] }, { $ifNull: ['$items.qty', 1] }] },
            ],
          },
        },
      },
    },
    { $group: { _id: '$_id.owner', orders: { $sum: 1 }, amount: { $sum: '$amount' }, oldest: { $min: '$since' } } },
  ]);
  for (const r of rows) out.set(String(r._id), { orders: r.orders, amount: Math.round(r.amount * 100) / 100, oldest: r.oldest });
  return out;
}

/** All orders waiting for confirmation in the whole store (admin dashboard). */
export function countUnconfirmedOrders() {
  return Order.countDocuments({
    status: { $nin: CLOSED_ORDER_STATUSES },
    items: { $elemMatch: { $or: [{ itemStatus: 'pending' }, { itemStatus: { $exists: false } }, { itemStatus: null }] } },
  });
}
