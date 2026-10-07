import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { submitAction } from '@/lib/utils/approvals';

export const dynamic = 'force-dynamic';

/**
 * POST /api/wallet/payout/reverse — { id, reason }
 *
 * Takes back a payout that was recorded by mistake (for example one written into the books
 * although no money was sent). Partners only, and always two of them: the one who asks and the
 * other one who approves. The payout row is kept and marked "reversed"; it is no longer counted,
 * so the person's wallet and the Binance total get the amount back.
 */
export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ message: 'Only a partner can reverse a payout' }, { status: 403 });

    const body = await req.json();
    const payload = { id: String(body.id || ''), reason: String(body.reason || '').trim().slice(0, 300) };
    const out = await submitAction({ session, action: 'payout_reverse', payload, gated: true });

    return NextResponse.json({ message: out.message, pendingApproval: out.pending });
  } catch (err) {
    console.error('Payout reverse error:', err);
    return NextResponse.json({ message: err.message || 'Could not reverse this payout' }, { status: 400 });
  }
}
