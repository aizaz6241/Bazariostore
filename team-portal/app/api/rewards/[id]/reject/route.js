import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import RewardClaim from '@/lib/models/RewardClaim';

export async function POST(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden. Admin access required.' }, { status: 403 });
    }

    const { id } = params;
    const body = await req.json().catch(() => ({}));

    const claim = await RewardClaim.findById(id);
    if (!claim) {
      return NextResponse.json({ message: 'Reward claim not found' }, { status: 404 });
    }

    claim.status = 'rejected';
    claim.adminNote = body.adminNote || 'Declined by Admin';
    claim.rejectedAt = new Date();
    await claim.save();

    return NextResponse.json({
      message: 'Reward claim rejected',
      claim,
    });
  } catch (err) {
    console.error('Reject reward error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
