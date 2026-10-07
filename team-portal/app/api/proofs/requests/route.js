import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { createProofRequest } from '@/lib/utils/proofRequests';

export const dynamic = 'force-dynamic';

// POST /api/proofs/requests — "my seller paid, but the proof is not there": tells the partners
export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const request = await createProofRequest({ session, sellerId: body.sellerId, amount: body.amount, paidOn: body.paidOn, note: body.note });
    return NextResponse.json({ request }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ message: err.message || 'Could not send the request' }, { status: 400 });
  }
}
