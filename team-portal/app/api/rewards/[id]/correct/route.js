import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { submitAction } from '@/lib/utils/approvals';

export const dynamic = 'force-dynamic';

// POST /api/rewards/:id/correct  { action: 'reverse' | 'move', reason, memberId? }
// An APPROVED reward is already in someone's wallet, so taking it back or moving it to another
// person always goes to the other partner for approval (like every other money correction).
export async function POST(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden. Admin access required.' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const action = body.action === 'move' ? 'bonus_move' : body.action === 'reverse' ? 'bonus_reverse' : '';
    if (!action) return NextResponse.json({ message: 'Unknown correction' }, { status: 400 });
    const payload = { id: String(params.id), reason: String(body.reason || '').trim(), ...(action === 'bonus_move' ? { memberId: String(body.memberId || '') } : {}) };
    const out = await submitAction({ session, action, payload, gated: true });
    return NextResponse.json({ message: out.message, pending: out.pending });
  } catch (err) {
    return NextResponse.json({ message: err.message }, { status: 400 });
  }
}
