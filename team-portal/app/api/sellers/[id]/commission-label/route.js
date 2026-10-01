import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { Seller } from '@/lib/models/SharedModels';
import SellerAssignment from '@/lib/models/SellerAssignment';

export async function PUT(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden. Admin access required.' }, { status: 403 });
    }

    const { id: sellerId } = params;
    const body = await req.json();
    const { commissionLabel } = body;

    if (!['inr_50', 'pkr_1to1'].includes(commissionLabel)) {
      return NextResponse.json(
        { message: 'Invalid commission label. Allowed values: inr_50, pkr_1to1' },
        { status: 400 }
      );
    }

    // 1. Update Seller in marketplace database
    const seller = await Seller.findByIdAndUpdate(
      sellerId,
      { $set: { commissionLabel } },
      { new: true }
    );

    if (!seller) {
      return NextResponse.json({ message: 'Seller not found' }, { status: 404 });
    }

    // 2. Update active assignment if any
    await SellerAssignment.updateMany(
      { sellerId: seller._id, status: 'active' },
      { $set: { commissionLabel } }
    );

    return NextResponse.json({
      message: `Seller commission model updated to ${commissionLabel === 'inr_50' ? '50% INR Split' : '1:1 INR-to-PKR'}`,
      seller,
      commissionLabel,
    });
  } catch (err) {
    console.error('Update commission label error:', err);
    return NextResponse.json({ message: err.message || 'Failed to update commission label' }, { status: 500 });
  }
}
