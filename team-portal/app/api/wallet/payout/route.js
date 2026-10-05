import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { recordWalletPayout } from '@/lib/utils/wallet';

export const dynamic = 'force-dynamic';

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
      currency: currency || 'USDT',
      note: note || '',
      processedBy: session.name || session.username,
    });

    try {
      const { sendPushToUser } = await import('@/lib/utils/push');
      sendPushToUser(targetUserId, {
        title: `💳 Payout Processed: ${amount} ${currency || 'USDT'}`,
        body: `Payout has been processed by ${session.name || 'Admin'}. Check your wallet balance.`,
        url: '/wallet',
        type: 'finance',
        sound: '/sounds/cash.wav',
        vibrate: [250, 100, 250, 100, 250],
      }).catch((e) => console.error('Payout push error:', e));
    } catch (pushErr) {
      console.error('Trigger payout push error:', pushErr);
    }

    return NextResponse.json({
      message: 'Payout recorded successfully',
      transaction: tx,
    });
  } catch (err) {
    console.error('Wallet payout error:', err);
    return NextResponse.json({ message: err.message || 'Failed to record payout' }, { status: 400 });
  }
}
