import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { inlineShot, canSeeProofShots } from '@/lib/utils/paymentProofs';

export const dynamic = 'force-dynamic';

// GET /api/proofs/[id]/shot — a screenshot that is kept in the database (file storage was not
// available when it was added). Partners only; the browser sends the sign-in cookie with <img>.
export async function GET(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session) return new NextResponse('Unauthorized', { status: 401 });
    // partners: any proof. Anyone else: only the complete proofs of his own sellers
    if (!(await canSeeProofShots(session, params.id))) return new NextResponse('Not allowed', { status: 403 });
    const kind = new URL(req.url).searchParams.get('kind') === 'usdt' ? 'usdt' : 'inr';
    const shot = await inlineShot(params.id, kind);
    if (!shot) return new NextResponse('Not found', { status: 404 });
    return new NextResponse(shot.bytes, {
      headers: { 'Content-Type': shot.mime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (err) {
    return new NextResponse('Error', { status: 500 });
  }
}
