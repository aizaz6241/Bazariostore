import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { submitAction } from '@/lib/utils/approvals';

export const dynamic = 'force-dynamic';

/**
 * POST /api/finance/reserve — { type: 'add' | 'take', source?: 'wallets' | 'pocket', amount, note? }
 *
 * The reserve pool is the two partners' money, half each. Putting money in (from the wallets or
 * from their own pockets) and moving it back to the wallets is always agreed by both: one
 * partner asks here, the other one approves on the Finance screen. Nothing changes until then.
 */
export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ message: 'Only a partner can move reserve money' }, { status: 403 });

    const body = await req.json();
    const type = body.type === 'take' ? 'take' : 'add';
    const payload = {
      amount: Number(body.amount),
      source: type === 'add' ? (body.source === 'pocket' ? 'pocket' : 'wallets') : '',
      note: String(body.note || '').trim().slice(0, 300),
    };
    if (!Number.isFinite(payload.amount) || payload.amount <= 0) throw new Error('Enter the amount (greater than 0)');

    const out = await submitAction({ session, action: type === 'add' ? 'reserve_add' : 'reserve_take', payload, gated: true });
    return NextResponse.json({ message: out.message, pendingApproval: out.pending });
  } catch (err) {
    console.error('Reserve move error:', err);
    return NextResponse.json({ message: err.message || 'Could not move reserve money' }, { status: 400 });
  }
}
