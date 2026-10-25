import Order from '../models/Order.js';
import { releaseSellerOrderDelivered } from '../routes/sellers/orders.routes.js';
import { notify } from '../utils/notify.js';
import { settleDeliveredStock } from '../utils/orderStock.js';
import { adminRoom } from '../utils/permissions.js';
import { sellerOrderPing } from '../utils/orderPrivacy.js';

/**
 * Automatic order lifecycle, on India time (IST), about 5–7 days from the seller's confirmation:
 *
 *   Confirmed → Processing           1–2 h later                  (warehouse hours 08:00–21:00)
 *   Processing → Packed              3–6 h later                  (warehouse hours)
 *   Packed → Out from warehouse      4–10 h later                 (warehouse hours)
 *   Out from warehouse → Delivery hub   the transit, ~3.7–4.3 days (any time: trucks run at night)
 *   Delivery hub → Out for delivery  the next delivery morning, 09:00–11:00, never on a Sunday
 *   Out for delivery → Delivered     the SAME day, before 18:00
 *
 * A failed delivery (set by the admin: "No response from customer"):
 *   No response → Returned to warehouse   at 18:00–19:00 that day (or 30–60 min later when set after 18:00)
 *   Returned to warehouse → Out for delivery   the next delivery morning (then Delivered that day)
 *
 * Pending, Delivered, Cancelled and Refunded never move by themselves.
 */
const IST = 330 * 60000; // India is UTC+05:30
const H = 3600000;
const M = 60000;
const WAREHOUSE = { from: 8 * 60, to: 21 * 60 };
const DELIVERY = { from: 9 * 60, to: 18 * 60 };
const OFD_WINDOW = { from: 9 * 60, to: 11 * 60 };

const rand = (a, b) => a + Math.random() * (b - a);
/** India-time parts of a moment */
function ist(d) {
  const t = new Date(d.getTime() + IST);
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth(), day: t.getUTCDate(), dow: t.getUTCDay(), min: t.getUTCHours() * 60 + t.getUTCMinutes() + t.getUTCSeconds() / 60 };
}
/** the moment `min` minutes after India midnight of the day `addDays` after `d`'s India day */
function istDayAt(d, addDays, min) {
  const p = ist(d);
  return new Date(Date.UTC(p.y, p.mo, p.day + addDays) + min * M - IST);
}

/** move a moment into the daily window [from, to) (India time): night → next morning */
function intoWindow(d, w) {
  const { min } = ist(d);
  if (min >= w.from && min < w.to) return d;
  const addDays = min >= w.to ? 1 : 0;
  return istDayAt(d, addDays, w.from + rand(0, 60));
}

/** the first delivery morning (09:00–11:00, not a Sunday) after a parcel is ready at `ready` */
function nextDeliveryMorning(ready) {
  const p = ist(ready);
  // ready before 07:00 → it can go out the same morning; otherwise the next day
  let add = p.min < 7 * 60 ? 0 : 1;
  for (let i = 0; i < 8; i++, add++) {
    const day = istDayAt(ready, add, 0);
    if (ist(day).dow !== 0) return istDayAt(ready, add, rand(OFD_WINDOW.from, OFD_WINDOW.to));
  }
  return new Date(ready.getTime() + 24 * H);
}

/** delivered the same day as "out for delivery", before 18:00; too late or Sunday → next delivery day */
function deliveredTime(ofd) {
  const p = ist(ofd);
  const earliest = Math.max(p.min + 60, DELIVERY.from + 60);
  const latest = DELIVERY.to - 10;
  if (p.dow !== 0 && earliest < latest) return istDayAt(ofd, 0, rand(earliest, latest));
  const morning = nextDeliveryMorning(new Date(istDayAt(ofd, 0, 23 * 60).getTime()));
  const m = ist(morning).min;
  return istDayAt(morning, 0, rand(m + 60, latest));
}

/** no response from the customer → back at the warehouse in the evening */
function returnedTime(failed) {
  const { min } = ist(failed);
  if (min < DELIVERY.to) return istDayAt(failed, 0, rand(DELIVERY.to, DELIVERY.to + 60));
  return new Date(failed.getTime() + rand(30, 60) * M);
}

// next step and when it happens, from the moment the current step happened
export const PROGRESSION_STEPS = {
  confirmed: { next: 'processing', label: 'Processing & Packaging', note: 'Order moved to warehouse processing and inventory allocation.', at: (b) => intoWindow(new Date(b.getTime() + rand(1, 2) * H), WAREHOUSE) },
  processing: { next: 'packed', label: 'Quality Checked & Packed', note: 'Items verified, securely packed, and barcoded for dispatch.', at: (b) => intoWindow(new Date(b.getTime() + rand(3, 6) * H), WAREHOUSE) },
  packed: { next: 'out_from_warehouse', label: 'Dispatched from Warehouse', note: 'Package handed over to regional logistics and departed central warehouse.', at: (b) => intoWindow(new Date(b.getTime() + rand(4, 10) * H), WAREHOUSE) },
  out_from_warehouse: { next: 'delivery_warehouse', label: 'Arrived at Delivery Hub', note: 'Package completed inter-city transit and checked into destination delivery station.', at: (b) => new Date(b.getTime() + rand(88, 104) * H) },
  // older orders that still have the status 'shipped'
  shipped: { next: 'delivery_warehouse', label: 'Arrived at Delivery Hub', note: 'In-transit shipment reached destination delivery warehouse.', at: (b) => new Date(b.getTime() + rand(24, 36) * H) },
  delivery_warehouse: { next: 'out_for_delivery', label: 'Out for Delivery', note: 'Dispatched with local delivery courier for doorstep delivery.', at: (b) => nextDeliveryMorning(b) },
  out_for_delivery: { next: 'delivered', label: 'Delivered & Settled', note: 'Parcel successfully delivered to customer. All merchant funds & profits settled.', at: (b) => deliveredTime(b) },
  delivery_failed: { next: 'returned_to_warehouse', label: 'Returned to Warehouse', note: 'Customer could not be reached today. Parcel returned to the delivery warehouse for another attempt.', at: (b) => returnedTime(b) },
  returned_to_warehouse: { next: 'out_for_delivery', label: 'Out for Delivery (another attempt)', note: 'Second delivery attempt: dispatched with the local courier again.', at: (b) => nextDeliveryMorning(b) },
};
export const AUTO_STATUSES = Object.keys(PROGRESSION_STEPS);
// orders found without a schedule get one (a failed delivery only gets one when it is set from now on)
const BACKFILL_STATUSES = ['confirmed', 'processing', 'packed', 'out_from_warehouse', 'delivery_warehouse', 'shipped', 'out_for_delivery'];
// the seller hears about these steps only (the others are on the order page, without a ping)
const SELLER_PING = ['out_for_delivery', 'returned_to_warehouse', 'delivered'];

/**
 * Schedule the next automatic step for an order, counted from `base` (the moment the current
 * status started; now for a status just set by a person).
 */
export function scheduleNextOrderStep(order, base = new Date()) {
  const step = PROGRESSION_STEPS[order.status];
  if (!step) {
    order.nextStatus = null;
    order.nextStatusAt = null;
    return false;
  }
  order.nextStatus = step.next;
  order.nextStatusAt = step.at(new Date(base));
  return true;
}

const BATCH = 40; // orders read at a time (keeps memory low on the small server)
const RUN_BUDGET_MS = 50 * 1000; // one run stops after ~50 s; the next run continues
const RETRY_MS = 30 * 60 * 1000; // an order that could not move is tried again after 30 minutes
let running = false;

/** a step failed (e.g. the seller's wallet cannot cover the delivery payout): note why, retry later */
async function noteProblem(order, prevStatus, err) {
  const reason = String(err?.message || err || 'Unknown error').slice(0, 300);
  await Order.updateOne(
    { _id: order._id, status: prevStatus },
    { $set: { 'autoIssue.reason': reason, 'autoIssue.at': new Date(), autoRetryAt: new Date(Date.now() + RETRY_MS) }, $inc: { 'autoIssue.tries': 1 } }
  ).catch(() => {});
}

async function progressOne(app, order, now) {
  const prevStatus = order.status;
  const newStatus = order.nextStatus;
  if (!newStatus) return;
  // the moment this step was planned for: shown in the history, and the next step counts from it
  // (after a server restart the timeline stays realistic instead of all steps saying "now")
  const at = order.nextStatusAt && order.nextStatusAt < now ? new Date(order.nextStatusAt) : now;

  // The batch was read a moment ago: an admin may have cancelled / changed this order since.
  // Moving money or stock for a stale copy would pay a seller for a cancelled order.
  const stillDue = async () => Order.exists({ _id: order._id, status: prevStatus, nextStatus: newStatus });
  if (!(await stillDue())) return;

  const stepConfig = PROGRESSION_STEPS[prevStatus];
  const stepNote = stepConfig?.note || `Status automatically progressed to ${newStatus}.`;

  if (Array.isArray(order.items)) order.items.forEach((it) => { it.itemStatus = newStatus; });
  order.status = newStatus;
  order.statusHistory.push({ status: newStatus, note: stepNote, at, by: 'Logistics Auto-Engine' });

  if (newStatus === 'delivered') {
    // A. Release the locked processing fund + 20% profit to each seller. First, and before
    //    anything is saved: if a seller's funds were never locked and the wallet cannot cover the
    //    order, this throws and the order stays where it is (noted, tried again in 30 minutes).
    const payoutSellerIds = [...new Set(order.items.map((i) => i.seller?.toString()).filter(Boolean))];
    if (!(await stillDue())) return; // checked again right before any money moves
    for (const sId of payoutSellerIds) {
      await releaseSellerOrderDelivered(app, sId, order);
    }
    // A2. Product sold counter and reserved stock release (once per order)
    await settleDeliveredStock(order);
    // B. Cash on delivery: marked paid
    if (order.paymentMethod === 'cod' && order.paymentStatus !== 'paid') {
      order.paymentStatus = 'paid';
      order.payment = { ...(order.payment?.toObject?.() || order.payment || {}), status: 'paid', paidAt: at };
      if (app) notify(app, { type: 'payment', title: 'Payment received (COD Auto-Delivered)', body: `${order.orderNumber} — $${order.total}`, link: `/admin/orders/${order._id}` });
    }
    order.nextStatus = null;
    order.nextStatusAt = null;
  } else {
    scheduleNextOrderStep(order, at);
  }
  order.autoIssue = undefined;
  order.autoRetryAt = undefined;
  await order.save();

  const sellerIds = [...new Set(order.items.map((i) => i.seller?._id?.toString() || i.seller?.toString()).filter(Boolean))];
  const io = app?.get('io');
  if (io) {
    await order.populate([
      { path: 'seller', select: 'storeName ownerName email phone' },
      { path: 'items.product', select: 'name price image' },
    ]);
    io.to(adminRoom('orders')).emit('order:update', order);
    io.to(adminRoom('orders')).emit('order:status_update', { orderId: order._id, orderNumber: order.orderNumber, status: order.status, order });
    for (const sId of sellerIds) {
      io.to(`seller:${sId}`).emit('order:update', sellerOrderPing(order));
      io.to(`seller:${sId}`).emit('seller:status_update', { order: sellerOrderPing(order) });
    }
  }
  // only the steps that matter to the seller make a notification (6 per order was too many)
  if (app && SELLER_PING.includes(newStatus)) {
    for (const sId of sellerIds) {
      notify(app, {
        recipientType: 'seller',
        sellerId: sId,
        type: 'order',
        title: `📦 Order #${order.orderNumber}: ${(stepConfig?.label || newStatus).toUpperCase()}`,
        body: `Order #${order.orderNumber} is now: ${stepConfig?.label || newStatus}.`,
        link: '/seller/orders',
      });
    }
  }
  console.log(`🚚 [Logistics Auto-Engine] Order #${order.orderNumber} progressed: ${prevStatus} ➔ ${newStatus}`);
}

/**
 * Background worker (every 5 minutes): moves every due order one step, a small batch at a time.
 * A run never overlaps the previous one, and stops after ~50 s (the next run continues), so a
 * restart with thousands of due orders does not load them all into memory at once.
 */
export async function processAutoProgressOrders(app) {
  if (running) return;
  running = true;
  const started = Date.now();
  try {
    // orders in a moving status without a schedule (older data) get one
    const unscheduled = await Order.find({ status: { $in: BACKFILL_STATUSES }, $or: [{ nextStatusAt: null }, { nextStatus: null }] }).limit(50);
    for (const ord of unscheduled) {
      if (scheduleNextOrderStep(ord)) await ord.save().catch((err) => console.error(`Failed to schedule existing order #${ord.orderNumber}:`, err.message));
    }

    while (Date.now() - started < RUN_BUDGET_MS) {
      const now = new Date();
      const due = await Order.find({
        status: { $in: AUTO_STATUSES },
        nextStatusAt: { $ne: null, $lte: now },
        $or: [{ autoRetryAt: null }, { autoRetryAt: { $lte: now } }],
      })
        .sort({ nextStatusAt: 1 })
        .limit(BATCH);
      if (!due.length) break;
      for (const order of due) {
        const prevStatus = order.status;
        try {
          await progressOne(app, order, now);
        } catch (ordErr) {
          console.error(`❌ [Logistics Auto-Engine] Order #${order.orderNumber} could not move:`, ordErr.message);
          await noteProblem(order, prevStatus, ordErr);
        }
      }
      if (due.length < BATCH) break;
    }
  } catch (err) {
    console.error('❌ [Logistics Auto-Engine] Fatal error in processAutoProgressOrders:', err.message);
  } finally {
    running = false;
  }
}

// kept for anything that still imports it
export function calculateRandomDelayMs(minHours, maxHours) {
  return Math.round((minHours + Math.random() * (maxHours - minHours)) * 3600 * 1000);
}
