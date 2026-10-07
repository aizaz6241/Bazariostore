import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { listMyProofs } from '@/lib/utils/paymentProofs';
import { myProofRequests, mySellers } from '@/lib/utils/proofRequests';

export const dynamic = 'force-dynamic';

// GET /api/proofs/mine — a person's own Payment Proofs group: the complete proofs of his own
// sellers (never a draft, never another person's seller), his requests, and his sellers.
export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const [proofs, requests, sellers] = await Promise.all([
      listMyProofs({ session, limit: searchParams.get('limit') || 60 }),
      myProofRequests(session._id),
      mySellers(session._id),
    ]);
    return NextResponse.json({ ...proofs, requests, sellers });
  } catch (err) {
    console.error('My payment proofs error:', err);
    return NextResponse.json({ message: err.message || 'Could not load payment proofs' }, { status: 500 });
  }
}
