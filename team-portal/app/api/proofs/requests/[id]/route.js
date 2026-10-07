import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { closeProofRequest } from '@/lib/utils/proofRequests';

export const dynamic = 'force-dynamic';

// POST /api/proofs/requests/[id] — a partner answers a request: { action: 'done' | 'declined', reply }
export async function POST(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ message: 'Partners only' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const request = await closeProofRequest({ session, id: params.id, action: body.action, reply: body.reply });
    return NextResponse.json({ request });
  } catch (err) {
    return NextResponse.json({ message: err.message || 'Could not answer the request' }, { status: 400 });
  }
}
