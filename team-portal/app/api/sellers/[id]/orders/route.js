import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getAuthSession } from '@/lib/auth';
import { Seller, Order } from '@/lib/models/SharedModels';
import SellerAssignment from '@/lib/models/SellerAssignment';

export const dynamic = 'force-dynamic';

// Same "pending" statuses the Sellers list counts
const PENDING_ORDER_STATUSES = ['pending', 'processing', 'unfulfilled', 'payment_pending'];

// GET /api/sellers/:id/orders — the pending orders of one store (with items) + its wallet.
// A member only gets the stores assigned to him.
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
      status: { $in: PENDING_ORDER_STATUSES },
    })
      .select('orderNumber status total items createdAt seller')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const sid = String(sellerId);
    const list = orders.map((o) => {
      const all = Array.isArray(o.items) ? o.items : [];
      // In a multi-store order only this store's items are shown
      const own = all.filter((it) => !it.seller || String(it.seller) === sid || String(o.seller) === sid);
      const items = (own.length ? own : all).map((it) => ({
        name: it.name || 'Item',
        image: it.image || '',
        size: it.size || '',
        variant: it.variant || '',
        qty: Number(it.qty) || 1,
        price: Number(it.price) || 0,
        status: it.itemStatus || o.status,
      }));
      const amount = items.reduce((s, it) => s + it.price * it.qty, 0);
      return {
        _id: o._id,
        orderNumber: o.orderNumber || String(o._id).slice(-6),
        status: o.status,
        createdAt: o.createdAt,
        amount: Math.round((amount || Number(o.total) || 0) * 100) / 100,
        items,
      };
    });

    const w = seller.wallet || {};
    return NextResponse.json({
      storeName: seller.storeName,
      wallet: {
        available: Number(w.balance) || 0,
        locked: Number(w.processingFund) || 0,
      },
      orders: list,
    });
  } catch (err) {
    console.error('Seller pending orders error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
