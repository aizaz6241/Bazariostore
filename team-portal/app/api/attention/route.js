import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import RewardClaim from '@/lib/models/RewardClaim';
import { listApprovals } from '@/lib/utils/approvals';
import { buildLedger } from '@/lib/utils/finance';

export const dynamic = 'force-dynamic';

/**
 * GET /api/attention — partners only. Small counts for the Home screen, so daily jobs are not
 * forgotten: approvals waiting, rewards to approve, finance entries not counted yet, sellers
 * without an owner. Read-only; uses the same cached ledger as the Finance screen.
 */
export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ message: 'Admins only' }, { status: 403 });

    await connectDB();
    const [approvals, rewardsPending, ledger] = await Promise.all([
      listApprovals({ session }).catch(() => null),
      RewardClaim.countDocuments({ status: 'pending' }).catch(() => null),
      buildLedger().catch(() => null),
    ]);

    const pending = approvals?.pending || [];
    return NextResponse.json({
      approvalsForMe: approvals ? approvals.waitingForMe || 0 : null,
      approvalsWaiting: approvals ? pending.length : null,
      approvalsMine: approvals ? pending.filter((a) => a.canCancel).length : null,
      rewardsPending,
      financePending: ledger ? (ledger.pending || []).length : null,
      unassignedSellers: ledger ? (ledger.unassignedSellers || []).length : null,
      at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Attention counts error:', err);
    return NextResponse.json({ message: err.message || 'Failed to load' }, { status: 500 });
  }
}
