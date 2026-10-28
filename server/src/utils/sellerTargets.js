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
import Seller from '../models/Seller.js';
import { notify } from './notify.js';

const DAY = 24 * 60 * 60 * 1000;
const EPS = 0.005;

export const metricOf = (t) => (t?.metric === 'sales' ? 'sales' : 'orders');
const money = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
};

/** Progress of a target: { cur, goal, pct, left, reached } (sales in $, orders as a count). */
export function progressOf(t) {
  const sales = metricOf(t) === 'sales';
  const cur = sales ? Number(t?.currentAmount) || 0 : Number(t?.currentOrders) || 0;
  const goal = sales ? Number(t?.targetAmount) || 0 : Number(t?.targetOrders) || 0;
  const reached = goal > 0 && cur >= goal - (sales ? EPS : 0);
  const pct = goal > 0 ? Math.min(100, Math.floor((cur / goal) * 100)) : 0;
  const left = Math.max(0, Math.round((goal - cur) * 100) / 100);
  return { cur, goal, pct, left, reached, sales };
}

/** "3 more orders" / "$120 more in delivered sales" */
export function leftText(t) {
  const p = progressOf(t);
  if (p.sales) return `${money(p.left)} more in delivered orders`;
  return `${p.left} more order${p.left === 1 ? '' : 's'}`;
}

/** "Deliver 10 orders" / "Deliver $2,000 in orders" */
export function goalText(t) {
  if (metricOf(t) === 'sales') return `Deliver ${money(t.targetAmount)} in orders`;
  return `Deliver ${Number(t.targetOrders) || 0} order${Number(t.targetOrders) === 1 ? '' : 's'}`;
}

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
      type: 'system',
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
  const step = p.pct >= 80 ? 80 : p.pct >= 50 ? 50 : 0;
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
    type: 'system',
    title: step === 80 ? `🔥 Almost there: ${leftText(target)} for ${money(target.bonusAmount)}` : `💪 Halfway to your ${money(target.bonusAmount)} bonus`,
    body: `"${target.title}": ${p.pct}% done — ${leftText(target)} to get ${money(target.bonusAmount)} in your wallet.`,
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
            type: 'system',
            title: `⏳ 1 day left: ${leftText(t)} for ${money(t.bonusAmount)}`,
            body: `"${t.title}" ends ${end.toUTCString().slice(0, 22)} UTC. Confirm your orders on time to reach it.`,
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
