import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { recordWalletPayout } from '@/lib/utils/wallet';

export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { userId, amount, currency, note } = body;

    // Security: Only admins can record payouts for others. Members can only record for themselves.
    let targetUserId = userId;
    if (!targetUserId || session.role !== 'admin') {
      targetUserId = session._id;
    }

    const tx = await recordWalletPayout({
      userId: targetUserId,
      amount: Number(amount),
      currency: currency || 'PKR',
      note: note || '',
      processedBy: session.name || session.username,
    });

    return NextResponse.json({
      message: 'Payout recorded successfully',
      transaction: tx,
    });
  } catch (err) {
    console.error('Wallet payout error:', err);
    return NextResponse.json({ message: err.message || 'Failed to record payout' }, { status: 500 });
  }
}
