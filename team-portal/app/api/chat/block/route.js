import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { setBlock } from '@/lib/utils/chatAccess';

export const dynamic = 'force-dynamic';

// POST /api/chat/block { targetId, block: true|false } — a member blocks / unblocks another member
export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const res = await setBlock(session, { targetId: body.targetId, block: body.block !== false });
    if (!res.ok) return NextResponse.json({ message: res.message }, { status: res.status || 400 });
    return NextResponse.json({ message: res.blocked ? 'Blocked' : 'Unblocked', blocked: res.blocked });
  } catch (err) {
    console.error('Chat block error:', err);
    return NextResponse.json({ message: err.message || 'Could not update' }, { status: 500 });
  }
}
