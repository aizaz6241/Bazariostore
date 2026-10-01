import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { getWalletData } from '@/lib/utils/wallet';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const period = searchParams.get('period') || 'all';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const targetMemberId = searchParams.get('memberId');

    let targetUserId = session._id;

    // If admin requests another member's statement
    if (targetMemberId && session.role === 'admin') {
      targetUserId = targetMemberId;
    }

    const walletData = await getWalletData({
      userId: targetUserId,
      period,
      startDate,
      endDate,
    });

    return NextResponse.json(walletData);
  } catch (err) {
    console.error('Wallet statement error:', err);
    return NextResponse.json({ message: err.message || 'Failed to fetch wallet data' }, { status: 500 });
  }
}
