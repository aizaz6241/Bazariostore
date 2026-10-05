import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { submitAction, assertPayoutPossible } from '@/lib/utils/approvals';
import { payoutNeedsApproval } from '@/lib/utils/approvalRules';

export const dynamic = 'force-dynamic';

/**
 * POST /api/wallet/payout
 *
 * A payout you write for YOURSELF is recorded at once (it only lowers your own wallet).
 * A payout written for SOMEONE ELSE is stored as a request: it is recorded only after another
 * partner approves it, or the person who received the money confirms it.
 */
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

    const payload = { userId: String(targetUserId), amount: Number(amount), currency: currency || 'USDT', note: String(note || '').trim() };
    if (!payload.amount || payload.amount <= 0) throw new Error('Valid payout amount is required');
    if (String(payload.currency).toUpperCase() !== 'USDT') throw new Error('Payouts are recorded in USDT (Binance) only');

    const gated = payoutNeedsApproval({ recorderId: session._id, payeeId: targetUserId });
    if (gated) await assertPayoutPossible(payload); // refuse an impossible amount before asking anyone

    const out = await submitAction({ session, action: 'payout', payload, gated });

    return NextResponse.json({
      message: out.pending ? out.message : 'Payout recorded successfully',
      pendingApproval: out.pending,
      transaction: out.result || null,
    });
  } catch (err) {
    console.error('Wallet payout error:', err);
    return NextResponse.json({ message: err.message || 'Failed to record payout' }, { status: 400 });
  }
}
