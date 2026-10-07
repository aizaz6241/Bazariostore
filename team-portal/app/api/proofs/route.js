import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { listProofs } from '@/lib/utils/paymentProofs';
import { openProofRequests } from '@/lib/utils/proofRequests';

export const dynamic = 'force-dynamic';

// GET /api/proofs — the cards of the "Payment Proofs" group (partners only)
export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ message: 'Partners only' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const data = await listProofs({
      status: searchParams.get('status') || 'all',
      limit: searchParams.get('limit') || 60,
      before: searchParams.get('before'),
    });
    // members' "payment made, proof missing" requests that still wait for an answer
    data.requests = await openProofRequests().catch(() => []);
    return NextResponse.json(data);
  } catch (err) {
    console.error('Payment proofs list error:', err);
    return NextResponse.json({ message: err.message || 'Could not load payment proofs' }, { status: 500 });
  }
}
