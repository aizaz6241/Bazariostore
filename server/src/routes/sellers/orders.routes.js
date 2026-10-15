import express from 'express';
import mongoose from 'mongoose';
import Seller from '../../models/Seller.js';
import Product from '../../models/Product.js';
import Order from '../../models/Order.js';
import Withdrawal from '../../models/Withdrawal.js';
import { nextSeq } from '../../models/System.js';
import { authSeller, authAdmin, authSellerOrAdmin } from '../../middleware/auth.js';
import { notify } from '../../utils/notify.js';
import { audit } from '../../utils/audit.js';
import { adjustTreasuryStock } from '../../utils/stockSync.js';
import { scheduleNextOrderStep } from '../../services/orderProgressionService.js';
import { Conversation, Message } from '../../models/Chat.js';
import { walletApply, walletNow } from '../../utils/wallet.js';
import { restockOrder, settleDeliveredStock } from '../../utils/orderStock.js';
import { adminRoom } from '../../utils/permissions.js';
import { toAdmins } from '../../utils/realtime.js';
import { blockWhenFrozen } from './helpers.js';
import { profitRateFor, confirmHoursFor, warnHoursFor, tierOf } from '../../utils/sellerTier.js';

const router = express.Router();

// Helper: securely find seller from authenticated token payload or verified admin request
async function getSellerFromReq(req) {
  // If caller is an Admin, allow targeting specific seller via params / body / query
  if (req.admin) {
    const sId = req.params?.id || req.body?.sellerId || req.query?.sellerId || req.seller?.id || req.seller?._id;
    if (sId && mongoose.Types.ObjectId.isValid(sId)) {
      const s = await Seller.findById(sId);
      if (s) return s;
    }
  }

  // If caller is a Seller, strictly use authenticated seller token payload
  if (req.seller) {
    const sId = req.seller.id || req.seller._id;
    if (sId && mongoose.Types.ObjectId.isValid(sId)) {
      const s = await Seller.findById(sId);
      if (s) return s;
    }
    if (req.seller.email) {
      const s = await Seller.findOne({ email: req.seller.email.toLowerCase() });
      if (s) return s;
    }
    if (req.seller.storeSlug) {
      const s = await Seller.findOne({ storeSlug: req.seller.storeSlug });
      if (s) return s;
    }
  }

  return null;
}

// ----------------------------------------------------
// FINANCIAL SETTLEMENT HELPERS (PROCESSING FUND & 20% PROFIT)
// ----------------------------------------------------
//
// How these three functions stay correct when a request is repeated, clicked twice, runs at the
// same time as another one, or the server stops in the middle:
//
//   1. The money moves in ONE database step that carries the step's name
//      (lock:<order>:<seller>:<n>, deliver:<order>:<seller>, cancel:<order>:<seller>:<n>).
//      The database refuses a step whose name it has already applied, so nothing can be locked,
//      paid out or refunded twice (utils/wallet.js).
//   2. Each item's flags (locked / settled) are then written straight to the order in the
//      database, not left in memory for a later save that might never happen.
//   3. The flags are read fresh from the database first, so a stale copy of the order cannot
//      lead to a wrong decision.

const money = (n) => Number((Number(n) || 0).toFixed(2));
const itemValue = (it) => (Number(it.price) || 0) * (Number(it.qty) || 1);
const ownedBy = (it, sellerId) => !!it.seller && String(it.seller._id || it.seller) === String(sellerId);

/** Copy the money flags of every item from the database onto this (possibly older) order object. */
async function refreshItemFlags(order) {
  if (!order?._id) return;
  const fresh = await Order.findById(order._id).select('items stockSettled stockRestored').lean();
  if (!fresh) return;
  const byId = new Map((fresh.items || []).map((i) => [String(i._id), i]));
  order.items.forEach((it) => {
    const f = byId.get(String(it._id));
    if (!f) return;
    it.processingLocked = f.processingLocked === true;
    it.payoutSettled = f.payoutSettled === true;
    it.lockedAmount = f.lockedAmount || 0;
    it.profitAmount = f.profitAmount || 0;
    it.profitRate = Number(f.profitRate) || 20;
    it.lockGen = f.lockGen || 0;
    if (f.settledAt) it.settledAt = f.settledAt;
  });
  if (fresh.stockSettled) order.stockSettled = true;
  if (fresh.stockRestored) order.stockRestored = true;
}

/** Write item fields straight to the order in the database (and keep the object in step). */
async function setItemFields(order, index, fields) {
  const it = order.items[index];
  const $set = {};
  for (const [k, v] of Object.entries(fields)) {
    $set[`items.${index}.${k}`] = v;
    it[k] = v;
  }
  await Order.updateOne({ _id: order._id, [`items.${index}._id`]: it._id }, { $set });
}

const ledgerLine = async (doc) => {
  try {
    await Withdrawal.create(doc);
  } catch (e) {
    // the money has already moved correctly; a missing history line must not undo or repeat it
    console.error(`[wallet-ledger] could not write "${doc.type}" for order ${doc.orderNumber}:`, e.message);
  }
};

/**
 * 1. Lock Order Processing Fund:
 * When seller or admin confirms an order, deducts item total amount from available balance
 * and moves it into seller.wallet.processingFund.
 */
export async function lockSellerOrderFund(app, sellerId, order) {
  await refreshItemFlags(order);

  const mine = [];
  order.items.forEach((it, index) => {
    if (ownedBy(it, sellerId) && !it.processingLocked && !it.payoutSettled) mine.push(index);
  });
  if (mine.length === 0) return { totalToLock: 0, itemsLocked: 0 };

  // profit % by the seller's tier: Diamond 35% for orders placed after the upgrade, else 20%
  const tierDoc = await Seller.findById(sellerId).select('tier tierSince').lean();
  const rate = profitRateFor(tierDoc, order);
  const pct = rate / 100;

  const totalToLock = mine.reduce((sum, i) => sum + itemValue(order.items[i]), 0);
  const gen = Math.max(0, ...mine.map((i) => Number(order.items[i].lockGen) || 0));
  const opId = `lock:${order._id}:${sellerId}:${gen}`;

  const moved = await walletApply(sellerId, { balance: -totalToLock, processingFund: totalToLock }, { requireBalance: totalToLock, opId });
  if (!moved) {
    const now = await walletNow(sellerId);
    if (!now) return { totalToLock: 0, itemsLocked: 0 }; // seller no longer exists
    const availableBal = Number(now.wallet.balance) || 0;
    const deficit = (totalToLock - availableBal).toFixed(2);
    // status 400: this is something the seller has to do, not a fault of the server
    throw Object.assign(
      new Error(
        `Insufficient wallet balance ($${availableBal.toFixed(2)}). To confirm and process this order ($${totalToLock.toFixed(2)}), you must deposit at least $${deficit} into your merchant wallet.`
      ),
      { status: 400 }
    );
  }

  for (const index of mine) {
    const itemVal = itemValue(order.items[index]);
    await setItemFields(order, index, {
      processingLocked: true,
      lockedAmount: itemVal,
      profitRate: rate, // 20% Basic / 35% Diamond
      profitAmount: money(itemVal * pct),
      lockGen: gen + 1,
    });
  }

  if (moved.already) return { totalToLock: 0, itemsLocked: mine.length }; // a repeat of a step already done

  if (totalToLock > 0) {
    await ledgerLine({
      type: 'order_processing_lock',
      seller: sellerId,
      storeName: moved.storeName,
      amount: totalToLock,
      principalAmount: totalToLock,
      profitAmount: money(totalToLock * pct),
      profitRate: rate,
      order: order._id,
      orderNumber: order.orderNumber,
      status: 'completed',
      balanceAfter: moved.wallet.balance,
      processingFundAfter: moved.wallet.processingFund,
      adminNote: `Order #${order.orderNumber} Confirmed — $${totalToLock.toFixed(2)} moved to Processing Fund (${rate}% Profit on Delivery: +$${(totalToLock * pct).toFixed(2)})`,
      processedAt: new Date(),
    });

    if (app) {
      notify(app, {
        recipientType: 'seller',
        sellerId: String(sellerId),
        type: 'order',
        title: `⚡ Order #${order.orderNumber} Confirmed`,
        body: `$${totalToLock.toFixed(2)} moved to Processing Fund. You will earn +$${(totalToLock * pct).toFixed(2)} (${rate}% profit) upon delivery! Total return: $${(totalToLock * (1 + pct)).toFixed(2)}.`,
        link: '/seller/orders',
      });

      app.get('io')?.to(`seller:${sellerId}`).emit('wallet:update', {
        balance: moved.wallet.balance,
        processingFund: moved.wallet.processingFund,
      });
    }
  }

  return { totalToLock, itemsLocked: mine.length };
}

/** Sales-target milestones: one more delivered order; pays the bonus once when a target is reached. */
async function advanceSellerTargets(app, sellerId) {
  const seller = await Seller.findById(sellerId).select('targets storeName');
  if (!seller || !Array.isArray(seller.targets) || seller.targets.length === 0) return;

  let touched = false;
  const nowTime = Date.now();
  // Every step finds the target by its id (positional "$"), never by its place in the list: an
  // admin adding or removing a target at the same moment shifts the places, and the delivery was
  // then silently not counted.
  const thisTarget = (target) => ({ _id: seller._id, targets: { $elemMatch: { _id: target._id, status: 'active' } } });
  for (const target of seller.targets) {
    if (target.status !== 'active') continue;

    // past its deadline: the target closes as "expired" and this delivery no longer counts for it
    if (target.expiresAt && new Date(target.expiresAt).getTime() < nowTime) {
      const closed = await Seller.updateOne(thisTarget(target), { $set: { 'targets.$.status': 'expired' } });
      if (closed.modifiedCount) touched = true;
      continue;
    }

    // count this delivery (in the database, so two deliveries at once are both counted)
    const after = await Seller.findOneAndUpdate(thisTarget(target), { $inc: { 'targets.$.currentOrders': 1 } }, { new: true, projection: { targets: 1 } }).lean();
    if (!after) continue;
    touched = true;
    const now = (after.targets || []).find((t) => String(t._id) === String(target._id));
    if (!now || (now.currentOrders || 0) < (now.targetOrders || 0)) continue;

    // reached: only the request that flips it to "completed" pays the bonus
    const done = await Seller.updateOne(thisTarget(target), { $set: { 'targets.$.status': 'completed', 'targets.$.completedAt': new Date() } });
    if (!done.modifiedCount) continue;

    const bonusAmt = Number(target.bonusAmount) || 0;
    if (bonusAmt <= 0) continue;
    const paid = await walletApply(sellerId, { balance: bonusAmt, totalProfitEarned: bonusAmt, totalEarned: bonusAmt }, { opId: `target:${target._id}` });
    if (!paid || paid.already) continue;

    await ledgerLine({
      type: 'adjustment',
      seller: seller._id,
      storeName: seller.storeName,
      amount: bonusAmt,
      approvedAmount: bonusAmt,
      balanceAfter: paid.wallet.balance,
      isManualAdjustment: true,
      status: 'approved',
      adminNote: `🎯 Target Completed Bonus: "${target.title}" (${target.targetOrders} orders delivered)`,
      processedAt: new Date(),
      processedBy: 'Platform Growth Rewards',
    });

    // Celebrate in Seller-Admin chat
    try {
      const conv = await Conversation.findOne({ seller: seller._id });
      if (conv) {
        const bonusMsg =
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🏆 SALES TARGET COMPLETED & BONUS CREDITED!\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Target: ${target.title}\n` +
          `Goal: ${target.targetOrders} Delivered Orders\n` +
          `Bonus Credited: +$${bonusAmt.toLocaleString('en-US')} Cash\n` +
          `New Wallet Balance: $${Number(paid.wallet.balance || 0).toLocaleString('en-US')}\n\n` +
          `Great performance! Your reward has been credited directly to your balance.\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━`;

        const msg = await Message.create({
          conversation: conv._id,
          seller: seller._id,
          sender: 'admin',
          senderName: 'Platform Rewards Desk',
          text: bonusMsg,
        });

        conv.lastMessage = `🏆 Bonus Credited: +$${bonusAmt}`;
        conv.lastSender = 'admin';
        conv.lastAt = new Date();
        conv.unreadForSeller = (conv.unreadForSeller || 0) + 1;
        await conv.save();

        app?.get('io')?.to(`seller:${seller._id}`).emit('message:new', msg);
      }
    } catch (targetChatErr) {
      console.error('Target bonus chat error:', targetChatErr.message);
    }

    if (app) {
      notify(app, {
        recipientType: 'seller',
        sellerId: seller._id.toString(),
        type: 'approval',
        title: `🏆 Target Completed: +$${bonusAmt} Bonus!`,
        body: `You completed "${target.title}"! $${bonusAmt} cash bonus has been credited to your wallet balance.`,
        link: '/seller/wallet',
      });
    }
  }

  if (touched) {
    const latest = await Seller.findById(sellerId).select('targets').lean();
    app?.get('io')?.to(`seller:${sellerId}`).emit('seller:targets_update', { targets: latest?.targets || [] });
  }
}

/**
 * A delivered order was refunded: it no longer counts toward the seller's RUNNING targets (those
 * that were already open when it was delivered). A bonus already paid for a completed target
 * stays paid. Once per order (marked on the order), whatever path the refund takes.
 */
export async function undoTargetProgressForOrder(app, order) {
  if (!order?._id) return;
  const claimed = await Order.updateOne({ _id: order._id, targetProgressUndone: { $ne: true } }, { $set: { targetProgressUndone: true } });
  if (!claimed.modifiedCount) return;
  const fresh = await Order.findById(order._id).select('items.seller items.payoutSettled items.settledAt').lean();
  const deliveredAt = new Map();
  for (const it of fresh?.items || []) {
    if (!it.payoutSettled || !it.seller) continue;
    const sid = String(it.seller);
    const t = it.settledAt ? new Date(it.settledAt) : new Date();
    if (!deliveredAt.has(sid) || t > deliveredAt.get(sid)) deliveredAt.set(sid, t);
  }
  for (const [sid, at] of deliveredAt) {
    try {
      const r = await Seller.updateOne(
        { _id: sid },
        { $inc: { 'targets.$[t].currentOrders': -1 } },
        { arrayFilters: [{ 't.status': 'active', 't.createdAt': { $lte: at }, 't.currentOrders': { $gt: 0 } }] }
      );
      if (r.modifiedCount) {
        const latest = await Seller.findById(sid).select('targets').lean();
        app?.get('io')?.to(`seller:${sid}`).emit('seller:targets_update', { targets: latest?.targets || [] });
      }
    } catch (e) {
      console.error('[targets] could not take back the progress of a refunded order:', e.message);
    }
  }
}

/**
 * 2. Release Delivered Order Fund (Principal + 20% Profit):
 * When order is delivered, releases locked processing fund + 20% profit directly into available balance!
 *
 * An item is paid out only for funds that were really locked. If an order reaches "delivered"
 * without ever having been confirmed, the funds are locked first (the seller needs the balance
 * for it, exactly as when confirming). Before, such an order paid the seller the item price plus
 * 20% although nothing had ever been taken from the wallet.
 */
export async function releaseSellerOrderDelivered(app, sellerId, order) {
  await refreshItemFlags(order);
  const empty = { totalPrincipal: 0, totalProfit: 0, totalPayout: 0, settledItems: 0 };

  const neverLocked = order.items.some((it) => ownedBy(it, sellerId) && !it.processingLocked && !it.payoutSettled);
  if (neverLocked) await lockSellerOrderFund(app, sellerId, order); // throws when the wallet cannot cover it

  const mine = [];
  order.items.forEach((it, index) => {
    if (ownedBy(it, sellerId) && it.processingLocked && !it.payoutSettled) mine.push(index);
  });
  if (mine.length === 0) return empty;

  let totalPrincipal = 0;
  let totalProfit = 0;
  const parts = mine.map((index) => {
    const it = order.items[index];
    const itemVal = it.lockedAmount || itemValue(it);
    const itemProfit = it.profitAmount || money(itemVal * ((Number(it.profitRate) || 20) / 100));
    totalPrincipal += itemVal;
    totalProfit += itemProfit;
    return { index, itemVal, itemProfit };
  });
  const totalPayout = totalPrincipal + totalProfit;
  // the % shown in the history: one rate for the whole order (20 or 35), else the effective one
  const rates = [...new Set(mine.map((i) => Number(order.items[i].profitRate) || 20))];
  const payoutRate = rates.length === 1 ? rates[0] : totalPrincipal > 0 ? Math.round((totalProfit / totalPrincipal) * 100) : 20;

  const moved = await walletApply(
    sellerId,
    { processingFund: -totalPrincipal, balance: totalPayout, totalProfitEarned: totalProfit, totalEarned: totalPayout },
    { opId: `deliver:${order._id}:${sellerId}` }
  );
  if (!moved) return empty; // seller no longer exists

  const settledAt = new Date();
  for (const part of parts) {
    await setItemFields(order, part.index, { payoutSettled: true, settledAt, lockedAmount: part.itemVal, profitAmount: part.itemProfit });
  }

  if (moved.already) return { ...empty, settledItems: parts.length }; // a repeat of a step already done

  if (totalPayout > 0) {
    await ledgerLine({
      type: 'order_delivered_release',
      seller: sellerId,
      storeName: moved.storeName,
      amount: totalPayout,
      principalAmount: totalPrincipal,
      profitAmount: totalProfit,
      profitRate: payoutRate,
      order: order._id,
      orderNumber: order.orderNumber,
      status: 'completed',
      balanceAfter: moved.wallet.balance,
      processingFundAfter: moved.wallet.processingFund,
      adminNote: `Order #${order.orderNumber} Delivered — $${totalPrincipal.toFixed(2)} Processing Fund released + $${totalProfit.toFixed(2)} Profit (${payoutRate}%) credited! Total: +$${totalPayout.toFixed(2)}`,
      processedAt: new Date(),
    });

    // Check & Advance Performance Target Milestones
    try {
      await advanceSellerTargets(app, sellerId);
    } catch (targetErr) {
      console.error('Seller target update error:', targetErr.message);
    }

    if (app) {
      const latest = (await walletNow(sellerId)) || moved;
      notify(app, {
        recipientType: 'seller',
        sellerId: String(sellerId),
        type: 'order',
        title: `🎉 Order #${order.orderNumber} Delivered & Settled!`,
        body: `+$${totalPayout.toFixed(2)} credited to your wallet! ($${totalPrincipal.toFixed(2)} processing release + $${totalProfit.toFixed(2)} ${payoutRate}% profit).`,
        link: '/seller/wallet',
      });

      app.get('io')?.to(`seller:${sellerId}`).emit('wallet:update', {
        balance: latest.wallet.balance,
        processingFund: latest.wallet.processingFund,
        totalProfitEarned: latest.wallet.totalProfitEarned,
      });
    }
  }

  return { totalPrincipal, totalProfit, totalPayout, settledItems: parts.length };
}

/**
 * 3. Release Cancelled Order Fund:
 * Returns locked processing fund back to available balance without profit/loss.
 * (Putting the items back in stock is done once for the whole order by restockOrder,
 * see utils/orderStock.js.)
 *
 * Also used when an admin moves a confirmed order BACK to "pending" (reason: 'pending'): the
 * order is waiting again, so the money locked for it returns to the available balance. It is
 * locked again when the order is confirmed again. `onlyWaiting` limits it to items that are
 * themselves waiting (used by the background check below).
 */
export async function releaseSellerOrderCancelled(app, sellerId, order, { reason = 'cancelled', onlyWaiting = false } = {}) {
  await refreshItemFlags(order);
  const backToPending = reason === 'pending';
  const what = backToPending ? 'moved back to Pending' : reason === 'refunded' ? 'Refunded' : 'Cancelled';
  const waiting = (it) => !it.itemStatus || it.itemStatus === 'pending';

  const mine = [];
  order.items.forEach((it, index) => {
    if (ownedBy(it, sellerId) && it.processingLocked && !it.payoutSettled && (!onlyWaiting || waiting(it))) mine.push(index);
  });
  if (mine.length === 0) return;

  const totalToRefund = mine.reduce((sum, i) => sum + (order.items[i].lockedAmount || itemValue(order.items[i])), 0);
  const gen = Math.max(0, ...mine.map((i) => Number(order.items[i].lockGen) || 0));

  const moved = await walletApply(sellerId, { processingFund: -totalToRefund, balance: totalToRefund }, { opId: `cancel:${order._id}:${sellerId}:${gen}` });
  if (!moved) return; // seller no longer exists

  for (const index of mine) {
    await setItemFields(order, index, { processingLocked: false, lockedAmount: 0, profitAmount: 0 });
  }

  if (moved.already || totalToRefund <= 0) return; // a repeat of a step already done

  await ledgerLine({
    type: 'order_cancelled_release',
    seller: sellerId,
    storeName: moved.storeName,
    amount: totalToRefund,
    principalAmount: totalToRefund,
    profitAmount: 0,
    order: order._id,
    orderNumber: order.orderNumber,
    status: 'completed',
    balanceAfter: moved.wallet.balance,
    processingFundAfter: moved.wallet.processingFund,
    adminNote: `Order #${order.orderNumber} ${what} — $${totalToRefund.toFixed(2)} Processing Fund returned to Available Balance`,
    processedAt: new Date(),
  });

  if (app) {
    notify(app, {
      recipientType: 'seller',
      sellerId: String(sellerId),
      type: 'order',
      title: `↩️ Order #${order.orderNumber} ${what}`,
      body: backToPending
        ? `$${totalToRefund.toFixed(2)} processing fund returned to your available balance. Confirm the order again to process it.`
        : `$${totalToRefund.toFixed(2)} processing fund returned to your available balance.`,
      link: '/seller/wallet',
    });

    app.get('io')?.to(`seller:${sellerId}`).emit('wallet:update', {
      balance: moved.wallet.balance,
      processingFund: moved.wallet.processingFund,
    });
  }
}

/**
 * Background check: a WAITING order must not hold locked money.
 *
 * Orders that were moved back to "pending" before that step released the funds still have the
 * amount sitting in the processing fund, and the seller cannot confirm them again ("already
 * confirmed"). This returns the amount to the available balance, once per order (same once-only
 * wallet step as a cancellation). Only items that are themselves waiting are touched, and only
 * orders nobody changed in the last 10 minutes, so a confirmation in progress is never undone.
 */
export async function releaseLocksOfWaitingOrders(app) {
  try {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000);
    const orders = await Order.find({
      status: 'pending',
      updatedAt: { $lt: cutoff },
      'items.processingLocked': true,
    }).limit(200);

    for (const order of orders) {
      const sellerIds = [
        ...new Set(
          order.items
            .filter((it) => it.processingLocked && !it.payoutSettled && (!it.itemStatus || it.itemStatus === 'pending'))
            .map((it) => it.seller?.toString())
            .filter(Boolean)
        ),
      ];
      for (const sId of sellerIds) {
        try {
          await releaseSellerOrderCancelled(app, sId, order, { reason: 'pending', onlyWaiting: true });
          console.log(`[orders] released the locked funds of waiting order #${order.orderNumber} (seller ${sId})`);
        } catch (e) {
          console.error(`[orders] could not release the locked funds of order #${order.orderNumber}:`, e.message);
        }
      }
    }
  } catch (e) {
    console.error('[orders] waiting-order lock check failed:', e.message);
  }

  // A cancelled or refunded order must not hold locked money either. Refunds used to leave it
  // locked for good; this returns it once (same once-only wallet step as a cancellation).
  try {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000);
    const closed = await Order.find({
      status: { $in: ['cancelled', 'refunded'] },
      updatedAt: { $lt: cutoff },
      items: { $elemMatch: { processingLocked: true, payoutSettled: { $ne: true } } },
    }).limit(200);

    for (const order of closed) {
      const sellerIds = [
        ...new Set(order.items.filter((it) => it.processingLocked && !it.payoutSettled).map((it) => it.seller?.toString()).filter(Boolean)),
      ];
      for (const sId of sellerIds) {
        try {
          await releaseSellerOrderCancelled(app, sId, order, { reason: order.status });
          console.log(`[orders] released the locked funds of ${order.status} order #${order.orderNumber} (seller ${sId})`);
        } catch (e) {
          console.error(`[orders] could not release the locked funds of order #${order.orderNumber}:`, e.message);
        }
      }
    }
  } catch (e) {
    console.error('[orders] closed-order lock check failed:', e.message);
  }
}

// ----------------------------------------------------
// SELLER ORDER MANAGEMENT ROUTES
// ----------------------------------------------------

// GET /api/sellers/orders
router.get('/orders', authSellerOrAdmin, async (req, res) => {
  try {
    const seller = await getSellerFromReq(req);
    if (!seller) return res.status(404).json({ message: 'Seller not found. Please log in again.' });

    const sellerId = seller._id.toString();
    const sellerProducts = await Product.find({
      $or: [
        { seller: seller._id },
        { sellerName: seller.storeName },
        { sellerSlug: seller.storeSlug },
      ],
    }, '_id');
    const sellerProdIds = sellerProducts.map((p) => p._id);

    const orders = await Order.find({
      $or: [
        { 'items.seller': seller._id },
        { seller: seller._id },
        { 'items.product': { $in: sellerProdIds } },
      ],
    })
      .populate('items.product')
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 });

    // Safely backfill items only where seller ID was genuinely missing
    for (const ord of orders) {
      let changed = false;
      for (const it of ord.items) {
        const itProdId = it.product?._id ? it.product._id.toString() : (it.product ? it.product.toString() : '');
        const matchesSellerProd = sellerProdIds.some((pid) => pid.toString() === itProdId);

        // Only fill if it.seller is completely missing/null - never overwrite an existing seller
        if (!it.seller) {
          if (matchesSellerProd) {
            it.seller = seller._id;
            it.sellerName = seller.storeName || 'Verified Store';
            if (!it.costPrice && it.price) it.costPrice = Math.round(it.price * 0.8);
            changed = true;
          } else if (ord.seller && ord.seller.toString() === sellerId) {
            it.seller = seller._id;
            it.sellerName = seller.storeName || 'Verified Store';
            if (!it.costPrice && it.price) it.costPrice = Math.round(it.price * 0.8);
            changed = true;
          }
        }
      }
      if (!ord.seller && ord.items.some((it) => it.seller?.toString() === sellerId)) {
        ord.seller = seller._id;
        changed = true;
      }
      if (changed) {
        await ord.save().catch(() => {});
      }
    }

    // Filter items to show only this seller's items and item totals
    const formatted = orders
      .map((ord) => {
        const sellerItems = ord.items.filter((it) => {
          // If seller is explicitly assigned, strictly verify ownership
          if (it.seller) {
            return it.seller.toString() === sellerId;
          }
          // Only fallback to product or order seller if item.seller is unassigned
          const itProdId = it.product?._id ? it.product._id.toString() : (it.product ? it.product.toString() : '');
          if (sellerProdIds.some((pid) => pid.toString() === itProdId)) return true;
          if (ord.seller && ord.seller.toString() === sellerId) return true;
          return false;
        });

        if (sellerItems.length === 0) return null;

        const sellerTotal = sellerItems.reduce((acc, it) => acc + (it.price || 0) * (it.qty || 1), 0);
        // locked / settled items keep the profit fixed at confirmation; waiting items show what
        // they will earn at the seller's current tier (Diamond 35% only for orders placed after upgrade)
        const projectedRate = profitRateFor(seller, ord);
        const sellerProfit = money(
          sellerItems.reduce((acc, it) => {
            const val = (it.price || 0) * (it.qty || 1);
            if (it.processingLocked || it.payoutSettled) return acc + (Number(it.profitAmount) || val * ((Number(it.profitRate) || 20) / 100));
            return acc + (val * projectedRate) / 100;
          }, 0)
        );
        const sellerReturn = money(sellerTotal + sellerProfit);
        const profitRate = sellerTotal > 0 ? Math.round((sellerProfit / sellerTotal) * 100) : projectedRate;
        const isLocked = sellerItems.some((it) => it.processingLocked);
        const isSettled = sellerItems.every((it) => it.payoutSettled);

        return {
          ...ord.toObject(),
          sellerItems,
          sellerTotal,
          sellerProfit,
          sellerReturn,
          profitRate,
          isLocked,
          isSettled,
        };
      })
      .filter(Boolean);

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/sellers/orders/:id/confirm (Dedicated 1-Click Order Confirm Action)
// a FROZEN store may still confirm its pending orders (with enough wallet balance); a suspended
// one cannot (the login check refuses it)
router.post('/orders/:id/confirm', authSellerOrAdmin, async (req, res) => {
  try {
    const seller = await getSellerFromReq(req);
    if (!seller) return res.status(404).json({ message: 'Seller not found. Please log in again.' });

    const sellerId = seller._id.toString();
    const order = await Order.findById(req.params.id).populate('items.product');
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const sellerProducts = await Product.find({
      $or: [
        { seller: seller._id },
        { sellerName: seller.storeName },
        { sellerSlug: seller.storeSlug },
      ],
    }, '_id');
    const sellerProdIds = sellerProducts.map((p) => p._id.toString());

    // Idempotency: If this seller's items are already confirmed/locked, return cleanly without duplicate fund actions
    const myItems = order.items.filter((it) => {
      const itProdId = it.product?._id ? it.product._id.toString() : (it.product ? it.product.toString() : '');
      const itSellerId = it.seller ? it.seller.toString() : '';
      return itSellerId === sellerId || (!itSellerId && sellerProdIds.includes(itProdId));
    });

    if (myItems.length > 0 && myItems.every((it) => it.itemStatus === 'confirmed' || it.processingLocked)) {
      return res.json({
        ok: true,
        order,
        lockedAmount: 0,
        alreadyConfirmed: true,
        message: 'Order is already confirmed',
      });
    }

    // Only an order that is still waiting can be confirmed. A cancelled, refunded, shipped or
    // delivered order is never pulled back to "confirmed" (and its funds are never locked again).
    const waiting = (it) => !it.itemStatus || it.itemStatus === 'pending';
    if (['cancelled', 'refunded'].includes(order.status) || (myItems.length > 0 && !myItems.some(waiting))) {
      return res.status(400).json({ message: `This order is already "${String(order.status).replace(/_/g, ' ')}" and cannot be confirmed again.` });
    }

    let updatedAny = false;
    order.items.forEach((it) => {
      const itProdId = it.product?._id ? it.product._id.toString() : (it.product ? it.product.toString() : '');
      const itSellerId = it.seller ? it.seller.toString() : '';

      // Strictly verify ownership: either it has this sellerId, or if unassigned, matches seller's catalog
      const isMyItem = itSellerId === sellerId || (!itSellerId && sellerProdIds.includes(itProdId));

      if ((isMyItem || req.admin) && waiting(it)) {
        if (!it.seller && isMyItem) {
          it.seller = seller._id;
          it.sellerName = seller.storeName || 'Verified Store';
        }
        it.itemStatus = 'confirmed';
        updatedAny = true;
      }
    });

    if (!updatedAny && !req.admin) {
      return res.status(403).json({ message: 'Access denied: none of the products in this order belong to your store to confirm' });
    }

    // Lock processing funds into seller.wallet.processingFund
    const fundResult = await lockSellerOrderFund(req.app, seller._id, order);

    const allStatuses = order.items.map((it) => it.itemStatus || order.status);
    if (allStatuses.every((s) => s === 'confirmed')) {
      order.status = 'confirmed';
      scheduleNextOrderStep(order);
    }

    order.statusHistory.push({
      status: 'confirmed',
      note: `Confirmed by seller (${seller.storeName}) — Funds moved to Processing`,
      at: new Date(),
      by: seller.storeName,
    });

    await order.save();

    // Re-populate order before broadcasting so it has complete details for frontend
    await order.populate([
      { path: 'seller', select: 'storeName ownerName email phone' },
      { path: 'items.product', select: 'name price image' },
    ]);

    // Real-time synchronization to Admin and Seller sockets
    const io = req.app.get('io');
    if (io) {
      io.to(adminRoom('orders')).emit('order:update', order);
      io.to(adminRoom('orders')).emit('order:status_update', { orderId: order._id, orderNumber: order.orderNumber, status: order.status, order });
      io.to(`seller:${sellerId}`).emit('order:update', order);
      io.to(`seller:${sellerId}`).emit('seller:status_update', { order });
    }

    // Notify Admins about seller confirmation
    notify(req.app, {
      recipientType: 'admin',
      type: 'order',
      title: `⚡ Order #${order.orderNumber} Confirmed by Merchant`,
      body: `${seller.storeName} confirmed order #${order.orderNumber}. Ready for admin fulfillment dispatch.`,
      link: `/admin/orders/${order._id}`,
    });

    res.json({ ok: true, order, lockedAmount: fundResult?.totalToLock || 0 });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// PUT / PATCH / POST /api/sellers/orders/:id/status
export const handleStatusUpdate = async (req, res) => {
  try {
    const { status, trackingNumber, note } = req.body || {};
    const isSeller = Boolean(req.seller && !req.admin);

    // SECURITY RESTRICTION: Sellers can ONLY confirm pending orders; all other status changes belong to Admin
    if (isSeller) {
      if (status !== 'confirmed') {
        return res.status(403).json({
          message: 'Sellers are only permitted to confirm orders. Fulfillment and delivery statuses (Shipped, Delivered, Cancelled) are managed exclusively by Platform Operations.',
        });
      }
    }

    const seller = await getSellerFromReq(req);
    const storeName = req.admin ? (req.admin.name || 'Platform Admin') : (seller?.storeName || 'Merchant');
    const sellerId = seller ? seller._id.toString() : (req.seller?.id || req.seller?._id || '');

    const order = await Order.findById(req.params.id).populate('items.product');
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // A seller can confirm an order that is still waiting, nothing else. Sending "confirmed" for
    // an order that has already moved on (shipped, delivered, cancelled...) used to pull its
    // status backwards.
    if (isSeller && order.status !== 'pending' && !order.items.some((it) => !it.itemStatus || it.itemStatus === 'pending')) {
      return res.status(400).json({ message: `This order is already "${String(order.status).replace(/_/g, ' ')}" and cannot be confirmed again.` });
    }

    // same rule as the admin order screen: a delivered (already paid out) order is not cancelled
    if (order.status === 'delivered' && status === 'cancelled') {
      return res.status(400).json({ message: 'A delivered order cannot be cancelled. Use a refund instead.' });
    }

    let sellerProducts = [];
    if (seller) {
      sellerProducts = await Product.find({
        $or: [
          { seller: seller._id },
          { sellerName: seller.storeName },
          { sellerSlug: seller.storeSlug },
        ],
      }, '_id');
    }
    const sellerProdIds = sellerProducts.map((p) => p._id.toString());

    let updatedAny = false;
    order.items.forEach((it) => {
      const itProdId = it.product?._id ? it.product._id.toString() : (it.product ? it.product.toString() : '');
      const itSellerId = it.seller ? it.seller.toString() : '';
      const ordSellerId = order.seller ? order.seller.toString() : '';

      const isOwnedBySeller = itSellerId === sellerId || (!itSellerId && sellerProdIds.includes(itProdId)) || (!itSellerId && ordSellerId === sellerId);
      const isAdmin = Boolean(req.admin);

      // for a seller, only items that are still waiting move to "confirmed"
      const sellerMayChange = !isSeller || !it.itemStatus || it.itemStatus === 'pending';
      if ((isOwnedBySeller || isAdmin) && sellerMayChange) {
        if (seller && isOwnedBySeller && !it.seller) {
          it.seller = seller._id;
          it.sellerName = seller.storeName;
        }
        if (status) it.itemStatus = status;
        if (trackingNumber) it.trackingNumber = trackingNumber;
        updatedAny = true;
      }
    });

    if (!updatedAny && !req.admin) {
      return res.status(403).json({ message: 'Access denied: this order does not contain products from your store' });
    }

    // Financial settlement triggers
    const affectedSellerIds = [...new Set(order.items.map((i) => i.seller?.toString()).filter(Boolean))];
    if (seller && !affectedSellerIds.includes(seller._id.toString())) {
      affectedSellerIds.push(seller._id.toString());
    }

    for (const sId of affectedSellerIds) {
      if (status === 'confirmed' || status === 'processing') {
        await lockSellerOrderFund(req.app, sId, order);
      } else if (status === 'delivered') {
        await releaseSellerOrderDelivered(req.app, sId, order);
      } else if (status === 'cancelled') {
        await releaseSellerOrderCancelled(req.app, sId, order);
      }
    }

    // Stock follows the order once, however many sellers or clicks are involved
    if (status === 'delivered' && order.items.every((it) => it.itemStatus === 'delivered')) await settleDeliveredStock(order);
    if (status === 'cancelled' && order.items.every((it) => it.itemStatus === 'cancelled')) await restockOrder(order, 'order_cancelled', storeName);

    // If all items share same status, update parent order status
    const allStatuses = order.items.map((it) => it.itemStatus || order.status);
    if (allStatuses.every((s) => s === status)) {
      order.status = status;
    }

    order.statusHistory.push({
      status: status || order.status,
      note: note || `Status updated to ${status} by ${storeName}`,
      at: new Date(),
      by: storeName,
    });

    await order.save();

    // Re-populate order before broadcasting
    await order.populate([
      { path: 'seller', select: 'storeName ownerName email phone' },
      { path: 'items.product', select: 'name price image' },
    ]);

    // Broadcast real-time socket events to Admin and all affected Sellers
    const io = req.app.get('io');
    if (io) {
      io.to(adminRoom('orders')).emit('order:update', order);
      io.to(adminRoom('orders')).emit('order:status_update', { orderId: order._id, orderNumber: order.orderNumber, status: order.status, order });
      for (const sId of affectedSellerIds) {
        io.to(`seller:${sId}`).emit('order:update', order);
        io.to(`seller:${sId}`).emit('seller:status_update', { order });
      }
    }

    // Send notifications to sellers when admin changes status
    if (req.admin) {
      for (const sId of affectedSellerIds) {
        notify(req.app, {
          recipientType: 'seller',
          sellerId: sId,
          type: 'order',
          title: `📦 Order #${order.orderNumber} Status: ${status.replace(/_/g, ' ').toUpperCase()}`,
          body: `Order #${order.orderNumber} has been updated to "${status.replace(/_/g, ' ').toUpperCase()}" by Platform Operations.`,
          link: '/seller/orders',
        });
      }
    } else if (isSeller) {
      // Notify admin when merchant updates status
      notify(req.app, {
        recipientType: 'admin',
        type: 'order',
        title: `⚡ Order #${order.orderNumber} Confirmed by Merchant`,
        body: `${storeName} updated order #${order.orderNumber} to "${(status || '').replace(/_/g, ' ').toUpperCase()}".`,
        link: `/admin/orders/${order._id}`,
      });
    }

    res.json({ ok: true, order });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

router.put('/orders/:id/status', authSellerOrAdmin, blockWhenFrozen('confirming or processing orders'), handleStatusUpdate);
router.patch('/orders/:id/status', authSellerOrAdmin, blockWhenFrozen('confirming or processing orders'), handleStatusUpdate);
router.post('/orders/:id/status', authSellerOrAdmin, blockWhenFrozen('confirming or processing orders'), handleStatusUpdate);
router.put('/orders/:id', authSellerOrAdmin, blockWhenFrozen('confirming or processing orders'), handleStatusUpdate);
router.patch('/orders/:id', authSellerOrAdmin, blockWhenFrozen('confirming or processing orders'), handleStatusUpdate);
router.post('/orders/:id', authSellerOrAdmin, blockWhenFrozen('confirming or processing orders'), handleStatusUpdate);

// POST /api/sellers/place-order (Admin manually places an order for a specific seller)
router.post('/place-order', authAdmin('orders'), async (req, res) => {
  try {
    const { sellerId, items, customer, shippingAddress, paymentMethod, adminNotes } = req.body;
    if (!sellerId) return res.status(400).json({ message: 'Seller ID is required' });
    if (!items || !items.length) return res.status(400).json({ message: 'At least one product item is required' });

    const seller = await Seller.findById(sellerId);
    if (!seller) return res.status(404).json({ message: 'Seller not found' });

    const orderNumber = `ORD-${await nextSeq('order')}`;

    let subtotal = 0;
    const lineItems = [];
    const wanted = [];

    for (const item of items) {
      if (!item.productId) return res.status(400).json({ message: 'Product ID is required for each line item' });
      const prod = await Product.findById(item.productId);
      if (!prod) return res.status(404).json({ message: `Product not found: ${item.productId}` });

      // Ownership validation: verify that this product belongs to the selected seller
      const prodSellerId = prod.seller?._id ? prod.seller._id.toString() : (prod.seller ? prod.seller.toString() : '');
      if (prodSellerId && prodSellerId !== seller._id.toString()) {
        return res.status(400).json({
          message: `Product "${prod.name}" belongs to seller "${prod.sellerName || 'another merchant'}" and cannot be ordered under store "${seller.storeName}".`
        });
      }

      const price = item.price !== undefined ? Number(item.price) : prod ? prod.price : 0;
      const costPrice = prod?.costs?.purchase || 0;
      const qty = Number(item.qty) || 1;
      const itemSub = price * qty;
      subtotal += itemSub;

      lineItems.push({
        product: prod ? prod._id : null,
        seller: seller._id,
        sellerName: seller.storeName,
        name: item.name || prod?.name || 'Item',
        image: item.image || prod?.image || '',
        price,
        costPrice,
        qty,
        itemStatus: 'pending', // Starts as pending so seller confirms it normally
        trackingNumber: item.trackingNumber || '',
      });

      wanted.push({ prod, qty });
    }

    // Take the stock the same way a checkout does (shelf -> reserved, Central Treasury included),
    // all lines or none. Before, the stock was taken without a reservation, "sold" was counted at
    // once and the Treasury master was not touched, but a later cancel still put the items back
    // on the master — so every cancelled manual order created stock out of nothing.
    // When the stock is not there, the order is still created (as before) but holds no stock.
    const taken = [];
    let stockHeld = true;
    for (const { prod, qty } of wanted) {
      const p = await Product.findOneAndUpdate({ _id: prod._id, stock: { $gte: qty } }, { $inc: { stock: -qty, reservedStock: qty } }, { new: true });
      if (!p) { stockHeld = false; break; }
      taken.push({ p, qty });
      if (p.treasuryProduct) {
        const master = await adjustTreasuryStock(p.treasuryProduct, -qty, { kind: 'reserve', reason: 'order_placement', note: `Manual order ${orderNumber}`, by: req.admin?.name || 'Admin' });
        if (!master) { stockHeld = false; break; }
        taken[taken.length - 1].treasury = p.treasuryProduct;
      }
    }
    if (!stockHeld) {
      for (const { p, qty, treasury } of taken) {
        await Product.updateOne({ _id: p._id }, { $inc: { stock: qty, reservedStock: -qty } });
        if (treasury) await adjustTreasuryStock(treasury, qty, { kind: 'release', reason: 'order_placement_undone', note: `Manual order ${orderNumber}` });
      }
    }

    const shippingCost = Number(req.body.shippingCost || 0);
    const total = subtotal + shippingCost;

    const order = new Order({
      orderNumber,
      seller: seller._id,
      placedBy: 'customer',
      items: lineItems,
      contact: {
        email: customer?.email || '',
        phone: customer?.phone || '',
      },
      shippingAddress: {
        fullName: customer?.name || shippingAddress?.fullName || 'Customer',
        street: shippingAddress?.street || '',
        apartment: shippingAddress?.apartment || '',
        city: shippingAddress?.city || 'New York',
        state: shippingAddress?.state || 'NY',
        postalCode: shippingAddress?.postalCode || '',
        country: shippingAddress?.country || 'United States',
      },
      shipping: {
        name: req.body.shippingMethodName || 'Standard Express Delivery',
        cost: shippingCost,
        eta: '2-4 business days',
      },
      subtotal,
      total,
      paymentMethod: paymentMethod || 'cod',
      paymentStatus: paymentMethod === 'cod' ? 'pending' : 'paid',
      status: 'pending', // Starts as pending so seller confirms to lock funds
      adminNotes: adminNotes || '',
      // an order that could not take its stock holds none: a cancel must not put any back
      stockRestored: !stockHeld,
      statusHistory: [
        {
          status: 'pending',
          note: 'Order placed by customer via store checkout (Awaiting Merchant Confirmation)',
          at: new Date(),
          by: 'Customer',
        },
      ],
    });

    await order.save();

    // Update seller stats
    seller.totalOrders = (seller.totalOrders || 0) + 1;
    seller.totalSales = (seller.totalSales || 0) + total;
    await seller.save();

    audit(req, 'create', 'order', order._id, `Order ${orderNumber} created for seller ${seller.storeName}`);

    // Send real-time notification to the seller
    const customerName = customer?.name || shippingAddress?.fullName || 'Customer';
    notify(req.app, {
      recipientType: 'seller',
      sellerId: seller._id,
      type: 'order',
      title: `📦 New Order #${orderNumber}`,
      body: `You received a new order for ${lineItems.length} item(s)! Customer: ${customerName} ($${total.toLocaleString('en-US')})`,
      link: '/seller/orders',
    });

    req.app.get('io')?.to(`seller:${seller._id}`).emit('order:new', {
      _id: order._id,
      orderNumber: order.orderNumber,
      total: order.total,
      itemsCount: lineItems.length,
      name: customerName,
    });

    // Re-populate order before broadcasting
    await order.populate([
      { path: 'seller', select: 'storeName ownerName email phone' },
      { path: 'items.product', select: 'name price image' },
    ]);

    // Admin notification & live broadcast
    notify(req.app, {
      recipientType: 'admin',
      type: 'order',
      title: `📦 Order #${orderNumber} Created`,
      body: `Order for ${seller.storeName} created for ${customerName} ($${total.toLocaleString('en-US')})`,
      link: `/admin/orders/${order._id}`,
    });

    req.app.get('io')?.to(adminRoom('orders')).emit('order:new', order);
    req.app.get('io')?.to(adminRoom('orders')).emit('order:update', order);

    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * Background Automated Penalty & Reminder Task
 * Runs periodically (every 5-10 minutes) to check for unconfirmed orders.
 * 24h unconfirmed: Sends warning notification & chat message.
 * 48h unconfirmed: Applies 25-point penalty to Account Health & freezes merchant account.
 */
/**
 * The sellers who still owe a confirmation on this order: the owners of the items that are still
 * waiting. Before, the warning and the 48h penalty always went to the order's FIRST seller, so in a
 * two-seller order the seller who had confirmed was frozen and the one who had not went free.
 */
async function sellersStillToConfirm(ord) {
  const waiting = (ord.items || []).filter((it) => !it.itemStatus || it.itemStatus === 'pending');
  const ids = [...new Set(waiting.map((it) => it.seller?._id?.toString() || it.seller?.toString()).filter(Boolean))];
  if (!ids.length && waiting.length && ord.seller) ids.push(ord.seller._id?.toString() || ord.seller.toString());
  return ids.length ? Seller.find({ _id: { $in: ids } }) : [];
}

// "Waiting longer than X": counted from when the order (last) became pending, not from when it
// was placed. An old order moved back to pending by an admin used to be penalised at once.
const waitingSince = (cutoff) => ({ $or: [{ pendingSince: { $lt: cutoff } }, { pendingSince: null, createdAt: { $lt: cutoff } }] });

/**
 * A store made active again after a SUSPENSION gets a fresh confirmation deadline for the
 * orders that were waiting on it — it could not confirm them while suspended. Only orders where
 * every waiting item is this store's own are restarted (a shared order keeps the other store's clock).
 */
export async function restartSellerDeadlines(sellerId) {
  try {
    const id = String(sellerId);
    const orders = await Order.find({ status: 'pending', $or: [{ 'items.seller': sellerId }, { seller: sellerId }] })
      .select('_id seller items.seller items.itemStatus')
      .lean();
    const ids = orders
      .filter((o) => {
        const waiting = (o.items || []).filter((it) => !it.itemStatus || it.itemStatus === 'pending');
        const owners = new Set(waiting.map((it) => String(it.seller || o.seller || '')));
        return owners.size === 1 && owners.has(id);
      })
      .map((o) => o._id);
    if (!ids.length) return 0;
    await Order.updateMany(
      { _id: { $in: ids } },
      { $set: { pendingSince: new Date(), warning24hSent: false, penalty48hApplied: false }, $pull: { warnedSellers: id, penalizedSellers: id } }
    );
    return ids.length;
  } catch (e) {
    console.error('[orders] restart deadlines:', e.message);
    return 0;
  }
}

/** Hours this order has been waiting for confirmation (from when it last became pending). */
const hoursWaiting = (ord, now) => (now.getTime() - new Date(ord.pendingSince || ord.createdAt).getTime()) / 3600000;

/**
 * Deadlines follow each seller's tier (utils/sellerTier.js):
 *   Basic   — warning after 24h, freeze after 48h
 *   Diamond — warning after 48h, freeze after 72h (always 24h of warning before the deadline)
 * The order's own flags (warning24hSent / penalty48hApplied) are set once EVERY seller still to
 * confirm has been warned / penalised; warnedSellers / penalizedSellers remember who already was,
 * so a Diamond seller in the same order is still handled later and nobody is handled twice.
 */
export async function processOrderPenalties(app) {
  try {
    const now = new Date();
    // the shortest deadlines (Basic) decide which orders are looked at; Diamond sellers in them
    // are skipped until their own, later time comes
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // 1. Warnings (24h before each seller's deadline)
    const warnOrders = await Order.find({
      status: 'pending',
      ...waitingSince(twentyFourHoursAgo),
      warning24hSent: { $ne: true },
    });

    for (const ord of warnOrders) {
      const waited = hoursWaiting(ord, now);
      const sellers = await sellersStillToConfirm(ord);
      const done = new Set((ord.warnedSellers || []).map(String));
      // a SUSPENDED store cannot confirm orders, so it is not warned or penalised while suspended;
      // it gets a fresh deadline when it is made active again (restartSellerDeadlines).
      // A frozen store can still confirm, so its deadlines keep running.
      const due = sellers.filter((s) => s.status !== 'suspended' && !done.has(String(s._id)) && waited >= warnHoursFor(s));
      const allWarned = sellers.every((s) => done.has(String(s._id)) || due.includes(s));
      if (!due.length && !allWarned) continue; // only Diamond sellers left, not yet due

      const upd = {};
      if (due.length) upd.$addToSet = { warnedSellers: { $each: due.map((s) => String(s._id)) } };
      if (allWarned) upd.$set = { warning24hSent: true };
      await Order.updateOne({ _id: ord._id }, upd);

      for (const seller of due) {
        const tier = tierOf(seller);
        const warnH = warnHoursFor(seller);
        const confirmH = confirmHoursFor(seller);
        notify(app, {
          recipientType: 'seller',
          sellerId: seller._id.toString(),
          type: 'compliance',
          title: `⚠️ ${warnH}-Hour Urgent Order Confirmation Warning: #${ord.orderNumber}`,
          body: `Order #${ord.orderNumber} has been unconfirmed for over ${warnH} hours! Please confirm and process within 24 hours to avoid a 25-point account health penalty and store freeze.`,
          link: '/seller/orders',
        });

        try {
          let conv = await Conversation.findOne({ seller: seller._id });
          if (conv) {
            const warnMsg =
              `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `⚠️ URGENT ${warnH}-HOUR ORDER CONFIRMATION NOTICE\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `Order Number: #${ord.orderNumber}\n` +
              `Placed On: ${ord.createdAt.toLocaleString('en-US')}\n` +
              `Status: PENDING CONFIRMATION (>${warnH} Hours)\n\n` +
              `Policy Reminder: All ${tier.label} merchant orders must be confirmed within ${confirmH} hours. Failure to confirm will result in a 25-point Account Health penalty and immediate account freeze.\n` +
              `Please go to "Orders & Dispatch" and confirm this order now.\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━`;

            const msg = await Message.create({
              conversation: conv._id,
              seller: seller._id,
              sender: 'admin',
              senderName: 'Compliance Enforcement Bot',
              text: warnMsg,
            });

            conv.lastMessage = `⚠️ ${warnH}h Warning: Unconfirmed Order #${ord.orderNumber}`;
            conv.lastSender = 'admin';
            conv.lastAt = new Date();
            conv.unreadForSeller = (conv.unreadForSeller || 0) + 1;
            await conv.save();

            app?.get('io')?.to(`seller:${seller._id}`).emit('message:new', msg);
          }
        } catch (chatErr) {}
      }
    }

    // 2. Penalty & freeze (at each seller's deadline: 48h Basic, 72h Diamond)
    const penaltyOrders = await Order.find({
      status: 'pending',
      ...waitingSince(fortyEightHoursAgo),
      penalty48hApplied: { $ne: true },
    });

    for (const ord of penaltyOrders) {
      const waited = hoursWaiting(ord, now);
      const sellers = await sellersStillToConfirm(ord);
      const done = new Set((ord.penalizedSellers || []).map(String));
      const due = sellers.filter((s) => s.status !== 'suspended' && !done.has(String(s._id)) && waited >= confirmHoursFor(s));
      const allDone = sellers.every((s) => done.has(String(s._id)) || due.includes(s));
      if (!due.length && !allDone) continue; // only Diamond sellers left, deadline not reached

      const upd = {};
      if (due.length) upd.$addToSet = { penalizedSellers: { $each: due.map((s) => String(s._id)) } };
      if (allDone) upd.$set = { penalty48hApplied: true };
      await Order.updateOne({ _id: ord._id }, upd);

      for (const seller of due) {
        const confirmH = confirmHoursFor(seller);
        const prevScore = seller.accountHealth?.score ?? 100;
        const newScore = Math.max(0, prevScore - 25);

        seller.accountHealth = seller.accountHealth || {};
        seller.accountHealth.score = newScore;
        // only an active store is frozen here: a suspended store must stay suspended (setting it to
        // "frozen" quietly lifted the suspension) and a frozen one keeps its original reason
        if (seller.status === 'active') {
          seller.accountHealth.status = 'frozen';
          seller.status = 'frozen';
          seller.freezeReason = `Automatic Freeze: Order #${ord.orderNumber} remained unconfirmed for over ${confirmH} hours.`;
          // when and by whom, like a freeze by an admin (the Complaints page sorts and shows by it)
          seller.frozenAt = new Date();
          seller.frozenBy = `Automatic (${confirmH}-hour rule)`;
        }

        seller.accountHealth.history = seller.accountHealth.history || [];
        seller.accountHealth.history.unshift({
          previousScore: prevScore,
          newScore,
          delta: -25,
          reason: `Automatic penalty for unconfirmed order #${ord.orderNumber} (>${confirmH} hours)`,
          changedBy: 'System Enforcement',
          createdAt: new Date(),
        });

        seller.markModified('accountHealth');
        await seller.save();
        toAdmins('sellers', 'sellers:changed', { sellerId: String(seller._id) });

        notify(app, {
          recipientType: 'seller',
          sellerId: seller._id.toString(),
          type: 'freeze',
          title: `🚫 Account Frozen: ${confirmH}h Unconfirmed Order #${ord.orderNumber}`,
          body: `Your merchant account has been frozen and penalized -25 points due to failure to confirm order #${ord.orderNumber} within ${confirmH} hours. Please contact support.`,
          link: '/seller/support',
        });

        try {
          let conv = await Conversation.findOne({ seller: seller._id });
          if (conv) {
            const freezeMsg =
              `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `🚫 COMPLIANCE PENALTY & ACCOUNT FROZEN\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `Order Number: #${ord.orderNumber}\n` +
              `Reason: Exceeded ${confirmH}-Hour Confirmation Deadline\n` +
              `Health Score Penalty: -25 Points (New Score: ${newScore}/100)\n` +
              `Account Status: ${String(seller.status || 'frozen').toUpperCase()}\n\n` +
              `Your seller store has been temporarily frozen. Please contact platform support immediately to request unfreezing.\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━`;

            const msg = await Message.create({
              conversation: conv._id,
              seller: seller._id,
              sender: 'admin',
              senderName: 'Compliance Enforcement Bot',
              text: freezeMsg,
            });

            conv.lastMessage = `🚫 Account Frozen: Order #${ord.orderNumber} (>${confirmH}h)`;
            conv.lastSender = 'admin';
            conv.lastAt = new Date();
            conv.unreadForSeller = (conv.unreadForSeller || 0) + 1;
            await conv.save();

            app?.get('io')?.to(`seller:${seller._id}`).emit('message:new', msg);
            app?.get('io')?.to(`seller:${seller._id}`).emit('seller:health_update', {
              accountHealth: seller.accountHealth,
              status: seller.status,
            });
            app?.get('io')?.to(`seller:${seller._id}`).emit('seller:status_update', { seller: seller.toObject() });
          }
        } catch (chatErr) {}
      }
    }
  } catch (err) {
    console.error('Error in processOrderPenalties:', err.message);
  }
}

export default router;

