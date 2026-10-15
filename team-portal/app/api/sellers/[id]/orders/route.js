import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getAuthSession } from '@/lib/auth';
import { Seller, Order } from '@/lib/models/SharedModels';
import SellerAssignment from '@/lib/models/SellerAssignment';
import { CLOSED_ORDER_STATUSES } from '@/lib/utils/sellerOrders';

export const dynamic = 'force-dynamic';

const HOUR = 3600 * 1000;
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * GET /api/sellers/:id/orders — one store's open orders + its store wallet.
 *   waiting     orders with items this seller has NOT confirmed yet (he must confirm them in the
 *               store; confirming locks the items' price from his wallet; 24 h → warning,
 *               48 h → store frozen)
 *   inProgress  orders he confirmed that are not delivered yet
 * A member only gets the stores assigned to him. No customer details are sent.
 */
export async function GET(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const { id } = params;
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return NextResponse.json({ message: 'Seller not found' }, { status: 404 });
    }
    const sellerId = new mongoose.Types.ObjectId(String(id));

    if (session.role !== 'admin') {
      const mine = await SellerAssignment.findOne({ sellerId, memberId: session._id, status: 'active' }).lean();
      if (!mine) return NextResponse.json({ message: 'You are not assigned to this store.' }, { status: 403 });
    }

    const seller = await Seller.findById(sellerId).select('storeName ownerName wallet').lean();
    if (!seller) return NextResponse.json({ message: 'Seller not found' }, { status: 404 });

    const orders = await Order.find({
      $or: [{ seller: sellerId }, { 'items.seller': sellerId }],
      status: { $nin: CLOSED_ORDER_STATUSES },
    })
      .select('orderNumber status total items.seller items.name items.image items.size items.variant items.qty items.price items.itemStatus items.processingLocked items.payoutSettled createdAt pendingSince seller')
      .sort({ createdAt: -1 })
      .limit(300)
      .lean();

    const sid = String(sellerId);
    const now = Date.now();
    const waiting = [];
    const inProgress = [];
    for (const o of orders) {
      const all = Array.isArray(o.items) ? o.items : [];
      // this store's lines only (a line without a seller belongs to the order's seller)
      const own = all.filter((it) => (it.seller ? String(it.seller) === sid : String(o.seller) === sid));
      if (!own.length) continue;
      const items = own.map((it) => ({
        name: it.name || 'Item',
        image: it.image || '',
        size: it.size || '',
        variant: it.variant || '',
        qty: Number(it.qty) || 1,
        price: Number(it.price) || 0,
        status: it.itemStatus || 'pending',
        confirmed: !!it.processingLocked || (it.itemStatus && it.itemStatus !== 'pending'),
      }));
      const open = own.filter((it) => (it.itemStatus || 'pending') === 'pending' && !it.processingLocked && !it.payoutSettled);
      const since = o.pendingSince || o.createdAt;
      const row = {
        _id: o._id,
        orderNumber: o.orderNumber || String(o._id).slice(-6),
        status: o.status,
        createdAt: o.createdAt,
        amount: money(items.reduce((s, it) => s + it.price * it.qty, 0) || o.total),
        items,
      };
      if (own.some((it) => (it.itemStatus || 'pending') === 'pending')) {
        row.toConfirm = money(open.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 1), 0));
        row.waitingSince = since;
        row.waitingHours = Math.max(0, Math.floor((now - new Date(since).getTime()) / HOUR));
        waiting.push(row);
      } else {
        inProgress.push(row);
      }
    }
    // oldest first: the ones closest to the 48 h freeze on top
    waiting.sort((a, b) => new Date(a.waitingSince) - new Date(b.waitingSince));

    const w = seller.wallet || {};
    const available = Number(w.balance) || 0;
    const needed = money(waiting.reduce((s, o) => s + o.toConfirm, 0));
    return NextResponse.json({
      storeName: seller.storeName,
      wallet: {
        available,
        locked: Number(w.processingFund) || 0,
      },
      needed, // money the seller needs in his store wallet to confirm every waiting order
      shortBy: money(Math.max(0, needed - available)),
      waiting,
      inProgress,
      // older screens read `orders`
      orders: waiting,
    });
  } catch (err) {
    console.error('Seller pending orders error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
