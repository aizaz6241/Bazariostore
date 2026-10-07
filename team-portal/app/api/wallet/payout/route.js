import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { submitAction, assertPayoutPossible } from '@/lib/utils/approvals';
import { payoutNeedsApproval } from '@/lib/utils/approvalRules';

export const dynamic = 'force-dynamic';

/**
 * POST /api/wallet/payout
 *
 * A MEMBER can only ask: the request waits until a partner has paid it on Binance and approves
 * it. Only then is the payout recorded and the wallet lowered.
 * A PARTNER's own payout is recorded at once (it only lowers the partner's own wallet).
 * A payout a partner writes for SOMEONE ELSE is stored as a request: it is recorded only after
 * the other partner approves it, or the person who received the money confirms it.
 */
export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { userId, amount, currency, note } = body;
    const isAdmin = session.role === 'admin';

    // Security: Only admins can record payouts for others. Members can only ask for themselves.
    let targetUserId = userId;
    if (!targetUserId || !isAdmin) {
      targetUserId = session._id;
    }

    const payload = { userId: String(targetUserId), amount: Number(amount), currency: currency || 'USDT', note: String(note || '').trim().slice(0, 300) };
    if (!Number.isFinite(payload.amount) || payload.amount <= 0) throw new Error('Valid payout amount is required');
    if (String(payload.currency).toUpperCase() !== 'USDT') throw new Error('Payouts are recorded in USDT (Binance) only');
    if (!isAdmin) payload.selfRequest = true;

    const gated = payoutNeedsApproval({ recorderId: session._id, payeeId: targetUserId, recorderRole: session.role });
    if (gated) await assertPayoutPossible(payload); // refuse an impossible amount before asking anyone

    const out = await submitAction({ session, action: 'payout', payload, gated });

    return NextResponse.json({
      message: out.pending
        ? isAdmin
          ? out.message
          : 'Payout request sent. An admin will pay you on Binance and approve it; nothing is deducted from your wallet until then.'
        : 'Payout recorded successfully',
      pendingApproval: out.pending,
      transaction: out.result || null,
    });
  } catch (err) {
    console.error('Wallet payout error:', err);
    return NextResponse.json({ message: err.message || 'Failed to record payout' }, { status: 400 });
  }
}
