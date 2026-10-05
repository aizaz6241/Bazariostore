import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { listApprovals, decideApproval } from '@/lib/utils/approvals';

export const dynamic = 'force-dynamic';

// GET /api/finance/approvals — what is waiting for a second person
// (partners: everything; a member: only payouts written in their own name)
export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    return NextResponse.json(await listApprovals({ session }));
  } catch (err) {
    console.error('Approvals list error:', err);
    return NextResponse.json({ message: err.message || 'Failed to load approvals' }, { status: 500 });
  }
}

// POST /api/finance/approvals — { id, decision: 'approve' | 'reject' | 'cancel', note? }
// Who may decide is checked in decideApproval (never the person who asked).
export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const out = await decideApproval({ id: body.id, decision: body.decision, session, note: body.note });
    const approvals = await listApprovals({ session });
    return NextResponse.json({ message: out.message, approvals });
  } catch (err) {
    console.error('Approval decision error:', err);
    return NextResponse.json({ message: err.message || 'Could not save the decision' }, { status: 400 });
  }
}
