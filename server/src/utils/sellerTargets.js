/**
 * Sales targets & bonuses (Admin → Targets & Bonuses).
 *
 * A target is a goal an admin gives one store (or many at once): deliver N orders, or deliver
 * $X of order value, optionally before a deadline, and get a cash bonus in the wallet.
 * Counting and paying happen in routes/sellers/orders.routes.js (advanceSellerTargets) when an
 * order is delivered. This file holds what is shared:
 *  - how far a target is and whether it is reached (orders or sales goal)
 *  - what a store's screens may see of a target (no admin names, no internal history)
 *  - the monitor: closes targets whose deadline passed (and tells the store), sends a
 *    "1 day left" reminder once, and the 50% / 80% "keep going" nudges.
 */
import mongoose from 'mongoose';
import Seller from '../models/Seller.js';
import { notify } from './notify.js';

const DAY = 24 * 60 * 60 * 1000;
const EPS = 0.005;

export const metricOf = (t) => (t?.metric === 'sales' ? 'sales' : t?.metric === 'total' ? 'total' : 'orders');
const money = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
};

/**
 * Progress of a target: { cur, goal, pct, left, reached, runPct }.
 *  orders: cur = new orders delivered since it was given, goal = N
 *  total:  cur = lifetime delivered (base + new), goal = the total to reach
 *  sales:  cur = $ delivered since it was given, goal = $X
 * runPct = how much of the distance from the start is done (for "halfway" nudges: a store at
 * 100 of 200 total starts at 50% on the bar, but has done 0% of the way).
 */
export function progressOf(t) {
  const m = metricOf(t);
  const sales = m === 'sales';
  const total = m === 'total';
  const base = total ? Number(t?.baseOrders) || 0 : 0;
  const cur = sales ? Number(t?.currentAmount) || 0 : base + (Number(t?.currentOrders) || 0);
  const goal = sales ? Number(t?.targetAmount) || 0 : Number(t?.targetOrders) || 0;
  const reached = goal > 0 && cur >= goal - (sales ? EPS : 0);
  const pct = goal > 0 ? Math.min(100, Math.floor((cur / goal) * 100)) : 0;
  const left = Math.max(0, Math.round((goal - cur) * 100) / 100);
  const way = goal - base;
  const runPct = way > 0 ? Math.min(100, Math.floor(((cur - base) / way) * 100)) : pct;
  return { cur, goal, pct, left, reached, sales, total, base, runPct };
}

/** "3 more orders" / "80 more orders to reach 200 delivered" / "$120 more in delivered orders" */
export function leftText(t) {
  const p = progressOf(t);
  if (p.sales) return `${money(p.left)} more in delivered orders`;
  if (p.total) return `${p.left} more order${p.left === 1 ? '' : 's'} to reach ${p.goal} delivered`;
  return `${p.left} more order${p.left === 1 ? '' : 's'}`;
}

/** "Deliver 10 orders" / "Reach 200 delivered orders in total" / "Deliver $2,000 in orders" */
export function goalText(t) {
  const m = metricOf(t);
  if (m === 'sales') return `Deliver ${money(t.targetAmount)} in orders`;
  if (m === 'total') return `Reach ${Number(t.targetOrders) || 0} delivered orders in total`;
  return `Deliver ${Number(t.targetOrders) || 0} order${Number(t.targetOrders) === 1 ? '' : 's'}`;
}

// the store's FIRST item in an order decides its status for the store, as on its dashboard
const FIRST_ITEM = { $arrayElemAt: [{ $filter: { input: '$items', cond: { $eq: ['$$this.seller', '$stores'] } } }, 0] };
const WAITING = ['pending'];
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Where every store's orders stand — counted EXACTLY like the store's own dashboard (an order
 * counts once per store, by the status of the store's first item in it; refunded / cancelled
 * orders never count), so the seller sees the same "Delivered" number in both places.
 *   delivered      orders delivered in its whole life
 *   inProgress     confirmed and on their way (processing … out for delivery, failed attempt)
 *   pending        still waiting for the store to confirm
 *   d7 / d30       delivered in the last 7 / 30 days (its pace)
 *   *Value         the same in $ (the store's own items)
 * @param {string[]|null} sellerIds  null = every store
 * @returns {Promise<Map<string, object>>}
 */
export async function orderStatsBySellers(sellerIds = null) {
  const { default: Order } = await import('../models/Order.js');
  const ids = Array.isArray(sellerIds) ? sellerIds.filter((id) => mongoose.Types.ObjectId.isValid(String(id))).map((id) => new mongoose.Types.ObjectId(String(id))) : null;
  const sellerMatch = ids ? { $in: ids } : { $ne: null };
  const now = Date.now();
  const d7 = new Date(now - 7 * DAY_MS);
  const d30 = new Date(now - 30 * DAY_MS);
  const rows = await Order.aggregate([
    { $match: { 'items.seller': sellerMatch, status: { $nin: ['refunded', 'cancelled'] } } },
    { $project: { status: 1, updatedAt: 1, items: { seller: 1, itemStatus: 1, settledAt: 1, price: 1, qty: 1 }, stores: { $setUnion: [{ $ifNull: ['$items.seller', []] }] } } },
    { $unwind: '$stores' },
    { $match: { stores: sellerMatch } },
    {
      $project: {
        s: '$stores',
        st: { $ifNull: [{ $let: { vars: { f: FIRST_ITEM }, in: '$$f.itemStatus' } }, '$status'] },
        at: { $ifNull: [{ $let: { vars: { f: FIRST_ITEM }, in: '$$f.settledAt' } }, '$updatedAt'] },
        value: {
          $sum: {
            $map: {
              input: { $filter: { input: '$items', cond: { $eq: ['$$this.seller', '$stores'] } } },
              in: { $multiply: [{ $ifNull: ['$$this.price', 0] }, { $max: [{ $ifNull: ['$$this.qty', 1] }, 1] }] },
            },
          },
        },
      },
    },
    { $match: { st: { $nin: ['cancelled', 'refunded'] } } },
    {
      $group: {
        _id: '$s',
        delivered: { $sum: { $cond: [{ $eq: ['$st', 'delivered'] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $in: ['$st', WAITING] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $and: [{ $ne: ['$st', 'delivered'] }, { $not: [{ $in: ['$st', WAITING] }] }] }, 1, 0] } },
        d7: { $sum: { $cond: [{ $and: [{ $eq: ['$st', 'delivered'] }, { $gte: ['$at', d7] }] }, 1, 0] } },
        d30: { $sum: { $cond: [{ $and: [{ $eq: ['$st', 'delivered'] }, { $gte: ['$at', d30] }] }, 1, 0] } },
        pendingValue: { $sum: { $cond: [{ $in: ['$st', WAITING] }, '$value', 0] } },
        inProgressValue: { $sum: { $cond: [{ $and: [{ $ne: ['$st', 'delivered'] }, { $not: [{ $in: ['$st', WAITING] }] }] }, '$value', 0] } },
        d30Value: { $sum: { $cond: [{ $and: [{ $eq: ['$st', 'delivered'] }, { $gte: ['$at', d30] }] }, '$value', 0] } },
      },
    },
  ]);
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  return new Map(
    rows.map((r) => [
      String(r._id),
      { delivered: r.delivered, inProgress: r.inProgress, pending: r.pending, d7: r.d7, d30: r.d30, pendingValue: r2(r.pendingValue), inProgressValue: r2(r.inProgressValue), d30Value: r2(r.d30Value) },
    ])
  );
}

/** Lifetime delivered orders per store (see orderStatsBySellers). @returns {Promise<Map<string, number>>} */
export async function deliveredTotals(sellerIds = null) {
  const stats = await orderStatsBySellers(sellerIds);
  return new Map([...stats].map(([id, st]) => [id, st.delivered]));
}

/** A date as the stores read it (India time), e.g. "30 Nov 2026". */
export const indiaDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

// what a store's own screens never get: who created / changed it, internal notes on why it closed
const PRIVATE = ['createdBy', 'changes', 'batchId', 'cancelReason', 'nudges', 'reminderSentAt', 'expiredNotifiedAt'];

/** Targets as a store may see them (dashboard, wallet, live updates). */
export function sellerSafeTargets(targets) {
  return (Array.isArray(targets) ? targets : []).map((t) => {
    const o = t && typeof t.toObject === 'function' ? t.toObject() : { ...(t || {}) };
    for (const k of PRIVATE) delete o[k];
    o.metric = metricOf(o);
    return o;
  });
}

/** Send a store its targets again (after any change). */
export async function pushTargets(app, sellerId) {
  try {
    const io = app?.get?.('io');
    if (!io) return;
    const s = await Seller.findById(sellerId).select('targets').lean();
    io.to(`seller:${sellerId}`).emit('seller:targets_update', { targets: sellerSafeTargets(s?.targets) });
  } catch (e) {
    console.error('[targets] live update failed:', e.message);
  }
}

/**
 * Close one target whose deadline passed (once — only the step that flips it tells the store).
 * @returns {Promise<boolean>} true when this call closed it
 */
export async function closeExpiredTarget(app, sellerId, target) {
  const r = await Seller.updateOne(
    { _id: sellerId, targets: { $elemMatch: { _id: target._id, status: 'active' } } },
    { $set: { 'targets.$.status': 'expired', 'targets.$.expiredAt': new Date(), 'targets.$.expiredNotifiedAt': new Date() } }
  );
  if (!r.modifiedCount) return false;
  const p = progressOf(target);
  if (app) {
    notify(app, {
      recipientType: 'seller',
      sellerId: String(sellerId),
      type: 'approval',
      title: `⌛ Target ended: ${target.title}`,
      body: p.sales
        ? `The time for this target is over. You delivered ${money(p.cur)} of ${money(p.goal)}. Keep delivering on time — new targets come to active stores.`
        : `The time for this target is over. You delivered ${p.cur} of ${p.goal} orders. Keep delivering on time — new targets come to active stores.`,
      link: '/seller',
    });
  }
  return true;
}

/**
 * After a delivery was counted: a short "keep going" notification at 50% and at 80% (once each;
 * a jump past both sends only the 80% one).
 */
export async function nudgeProgress(app, sellerId, target) {
  const p = progressOf(target);
  if (p.reached) return;
  const sent = Array.isArray(target.nudges) ? target.nudges : [];
  const step = p.runPct >= 80 ? 80 : p.runPct >= 50 ? 50 : 0;
  if (!step || sent.includes(step)) return;
  const marks = step === 80 ? [50, 80] : [50];
  const r = await Seller.updateOne(
    { _id: sellerId, targets: { $elemMatch: { _id: target._id, status: 'active', nudges: { $ne: step } } } },
    { $addToSet: { 'targets.$.nudges': { $each: marks } } }
  );
  if (!r.modifiedCount || !app) return;
  notify(app, {
    recipientType: 'seller',
    sellerId: String(sellerId),
    type: 'approval',
    title: step === 80 ? `🔥 Almost there: ${leftText(target)} for ${money(target.bonusAmount)}` : `💪 Halfway to your ${money(target.bonusAmount)} bonus`,
    body: `"${target.title}": ${p.sales ? `${money(p.cur)} of ${money(p.goal)}` : `${p.cur} of ${p.goal}`} delivered — ${leftText(target)} to get ${money(target.bonusAmount)} in your wallet.`,
    link: '/seller',
    push: true,
  });
}

/**
 * The monitor (every 15 minutes):
 *  1. targets past their deadline → "expired", and the store is told
 *  2. one "1 day left" reminder for targets that run longer than 2 days and are not reached
 */
let APP = null;
let running = false;
export async function targetSweep(app = APP) {
  if (running) return { closed: 0, reminded: 0 };
  running = true;
  let closed = 0;
  let reminded = 0;
  try {
    const now = new Date();
    const due = await Seller.find({ targets: { $elemMatch: { status: 'active', expiresAt: { $ne: null, $lte: now } } } })
      .select('targets')
      .lean();
    for (const s of due) {
      let touched = false;
      for (const t of s.targets || []) {
        if (t.status !== 'active' || !t.expiresAt || new Date(t.expiresAt) > now) continue;
        if (await closeExpiredTarget(app, s._id, t)) {
          closed += 1;
          touched = true;
        }
      }
      if (touched) await pushTargets(app, s._id);
    }

    const soon = new Date(now.getTime() + DAY);
    const ending = await Seller.find({
      targets: { $elemMatch: { status: 'active', expiresAt: { $gt: now, $lte: soon }, reminderSentAt: null } },
    })
      .select('targets')
      .lean();
    for (const s of ending) {
      for (const t of s.targets || []) {
        if (t.status !== 'active' || !t.expiresAt || t.reminderSentAt) continue;
        const end = new Date(t.expiresAt);
        if (end <= now || end > soon) continue;
        // a target of 1–2 days does not need a "1 day left" message
        if (end.getTime() - new Date(t.createdAt || now).getTime() <= 2 * DAY) continue;
        if (progressOf(t).reached) continue;
        const r = await Seller.updateOne(
          { _id: s._id, targets: { $elemMatch: { _id: t._id, status: 'active', reminderSentAt: null } } },
          { $set: { 'targets.$.reminderSentAt': now } }
        );
        if (!r.modifiedCount) continue;
        reminded += 1;
        if (app) {
          notify(app, {
            recipientType: 'seller',
            sellerId: String(s._id),
            type: 'approval',
            title: `⏳ 1 day left: ${leftText(t)} for ${money(t.bonusAmount)}`,
            body: `"${t.title}" ends on ${indiaDate(end)}. Confirm your orders on time to reach it.`,
            link: '/seller',
          });
        }
      }
    }
  } catch (e) {
    console.error('[targets] sweep failed:', e.message);
  } finally {
    running = false;
  }
  return { closed, reminded };
}

export function startTargetMonitor(app) {
  APP = app;
  const t = setInterval(() => targetSweep(app), 15 * 60 * 1000);
  t.unref?.();
  setTimeout(() => targetSweep(app), 90 * 1000).unref?.();
}
