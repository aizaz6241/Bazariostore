import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { invalidateLedger } from '@/lib/utils/finance';

/**
 * 💎 DIAMOND UPGRADE FEE (approved request `diamond_upgrade`, asked from the store admin panel)
 *
 * The fee ($1,500) is recorded in the `withdrawals` collection as an approved DEPOSIT with
 * purpose 'diamond_fee', so that everything that reads deposits treats it as one:
 *   - the finance ledger divides its real USDT like any deposit of this store (owner's share,
 *     1:1 PKR rule, referral commission, partners)
 *   - rewards ($300 wallet reward, daily / weekly INR, device rewards) count it
 *   - helping amount is kept apart and never divided (no real money)
 * It is NOT added to the seller's store wallet (the store's balance does not change).
 * No real money at all (the admins paid it) → the record is marked "no real money" (finSkip).
 *
 * Then the store becomes Diamond for life and gets a chat message + notification.
 * Safe to run twice: one fee record per store, and an upgraded store is not upgraded again.
 */
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const r6 = (v) => Math.round(num(v) * 1e6) / 1e6;

export function diamondWelcomeText(storeName) {
  return (
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💎 WELCOME TO DIAMOND!\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Your store "${storeName}" has been upgraded to 💎 Diamond — for life.\n\n` +
    `Your Diamond benefits (from now on):\n` +
    `• 35% profit on every new order (instead of 20%)\n` +
    `• 72 hours (3 days) to confirm & process orders (instead of 48 hours)\n` +
    `• Remove products from My Store anytime\n` +
    `• Fast delivery: 3–5 days\n\n` +
    `Thank you for growing with Bazario!\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━`
  );
}

/** What the request is about (for the approval card). */
export async function describeDiamondUpgrade(p) {
  await connectDB();
  if (!p?.sellerId || !mongoose.Types.ObjectId.isValid(String(p.sellerId))) throw new Error('Seller not found');
  const seller = await mongoose.connection.db.collection('sellers').findOne({ _id: oid(p.sellerId) }, { projection: { storeName: 1, tier: 1 } });
  if (!seller) throw new Error('Seller not found');
  const usdt = r6(p.usdtAmount);
  const helping = num(p.helpingAmount);
  const fee = num(p.fee) || 1500;
  const fmt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return {
    summary: `Upgrade “${seller.storeName}” to 💎 Diamond — fee $${fmt(fee)}: ${usdt > 0 ? `₮${fmt(usdt)} real (₹${fmt(num(p.inrAmount))})` : 'no real money'}${helping > 0 ? `, $${fmt(helping)} helping` : ''}`,
    details: [
      usdt > 0 ? 'The real USDT is divided like a normal deposit of this store (owner, referral, partners) and counts for rewards.' : 'No real money came in: nothing is divided.',
      'The fee is NOT added to the store wallet. The store becomes Diamond for life.',
      ...(p.note ? [`Note: ${p.note}`] : []),
    ],
    targetId: String(p.sellerId),
    sellerId: String(p.sellerId),
    storeName: seller.storeName || '',
  };
}

export async function applyDiamondUpgrade(p, { by = '' } = {}) {
  await connectDB();
  const db = mongoose.connection.db;
  const sellers = db.collection('sellers');
  const withdrawals = db.collection('withdrawals');
  const seller = await sellers.findOne({ _id: oid(p.sellerId) }, { projection: { storeName: 1, tier: 1, tierSince: 1, status: 1 } });
  if (!seller) throw new Error('Seller not found');

  const now = new Date();
  const fee = num(p.fee) || 1500;
  const helping = Math.min(num(p.helpingAmount), fee);
  const usdt = r6(p.usdtAmount);
  const inr = num(p.inrAmount);
  const pkrRate = num(p.pkrRate);

  // 1. the fee record (once per store)
  let fee_doc = await withdrawals.findOne({ seller: seller._id, purpose: 'diamond_fee' }, { projection: { _id: 1 } });
  if (!fee_doc) {
    const doc = {
      seller: seller._id,
      storeName: seller.storeName || 'Store',
      type: 'deposit',
      purpose: 'diamond_fee',
      // the fee is paid to the platform: it never enters the store wallet
      noWalletCredit: true,
      amount: fee,
      approvedAmount: fee,
      helpingAmount: helping,
      usdtAmount: usdt > 0 ? usdt : 0,
      inrAmount: usdt > 0 ? inr : 0,
      pkrRate: usdt > 0 ? pkrRate : 0,
      binanceRate: usdt > 0 && inr > 0 ? Math.round((inr / usdt) * 100) / 100 : 0,
      finConfirmed: true,
      finSkip: !(usdt > 0),
      method: 'diamond_fee',
      status: 'approved',
      adminNote: `💎 Diamond upgrade fee${p.note ? ` — ${p.note}` : ''}`,
      depositNote: 'Diamond upgrade fee',
      processedAt: now,
      processedBy: by,
      createdAt: now,
      updatedAt: now,
      __v: 0,
    };
    const ins = await withdrawals.insertOne(doc);
    fee_doc = { _id: ins.insertedId };
  }

  // 2. the store becomes Diamond (for life)
  const wasDiamond = seller.tier === 'diamond';
  if (!wasDiamond) {
    await sellers.updateOne(
      { _id: seller._id },
      {
        $set: { tier: 'diamond', tierSince: now, tierRequest: { status: 'none', requestedAt: null }, updatedAt: now },
        $push: { tierHistory: { from: 'basic', to: 'diamond', at: now, by, note: p.note || '' } },
      }
    );

    // 3. tell the seller (chat + notification; the store panel shows them on its next refresh)
    try {
      const conv = await db.collection('conversations').find({ seller: seller._id, type: { $ne: 'internal' } }).sort({ lastAt: -1 }).limit(1).next();
      if (conv) {
        await db.collection('messages').insertOne({
          conversation: conv._id,
          seller: seller._id,
          sender: 'admin',
          senderName: by || 'Bazario',
          text: diamondWelcomeText(seller.storeName),
          attachment: null,
          attachmentType: null,
          isEdited: false,
          isDeleted: false,
          isAutoReply: false,
          isSeen: false,
          createdAt: now,
          updatedAt: now,
          __v: 0,
        });
        await db.collection('conversations').updateOne(
          { _id: conv._id },
          { $set: { lastMessage: '💎 Your store is now Diamond!', lastSender: 'admin', lastAt: now, updatedAt: now }, $inc: { unreadForSeller: 1 } }
        );
      }
      await db.collection('notifications').insertOne({
        recipientType: 'seller',
        seller: seller._id,
        type: 'system',
        title: '💎 Your store is now Diamond!',
        body: 'You now earn 35% profit on new orders, have 72 hours to confirm orders and can remove products from My Store.',
        link: '/seller/diamond',
        read: false,
        createdAt: now,
        updatedAt: now,
        __v: 0,
      });
    } catch (e) {
      console.error('[diamond] seller message failed:', e.message);
    }
  }

  invalidateLedger();
  return {
    before: { tier: wasDiamond ? 'diamond' : 'basic' },
    after: { tier: 'diamond', feeId: String(fee_doc._id), usdt, inr, helping, pkrRate, counted: usdt > 0 },
    storeName: seller.storeName || '',
  };
}
