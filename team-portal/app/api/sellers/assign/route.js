import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { submitAction } from '@/lib/utils/approvals';
import { currentOwnerOf } from '@/lib/utils/sellerAssign';

export const dynamic = 'force-dynamic';

/**
 * POST /api/sellers/assign
 *
 * A seller that has no owner yet is assigned at once.
 * Moving a seller that already belongs to someone else changes who earns from it, so it is
 * stored as a request and applied only after the other partner approves it.
 */
export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ message: 'Forbidden. Admin access required.' }, { status: 403 });
    }

    const { sellerId, memberId } = await req.json();

    if (!sellerId || !memberId) {
      return NextResponse.json({ message: 'Seller ID and Member ID are required' }, { status: 400 });
    }

    const current = await currentOwnerOf(sellerId).catch(() => null);
    const moving = !!current && String(current.memberId) !== String(memberId);

    const out = await submitAction({
      session,
      action: moving ? 'reassign' : 'assign',
      payload: { sellerId: String(sellerId), memberId: String(memberId) },
      gated: moving,
    });

    if (out.pending) {
      return NextResponse.json({ message: out.message, pendingApproval: true });
    }
    return NextResponse.json({
      message: `Seller "${out.result.seller.storeName}" successfully assigned to ${out.result.targetMember.name}`,
      assignment: out.result.assignment,
    });
  } catch (err) {
    console.error('Assign seller error:', err);
    const notFound = /not found/i.test(err.message || '');
    return NextResponse.json({ message: err.message }, { status: notFound ? 404 : 500 });
  }
}
