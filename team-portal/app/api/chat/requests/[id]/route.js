import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { actOnRequest } from '@/lib/utils/chatAccess';

export const dynamic = 'force-dynamic';

// PATCH /api/chat/requests/[id] { action, durationDays?, note? }
//   approve (durationDays 1/3/7/0) | reject  — partners, on a request waiting for them
//   accept | decline                         — the member who was asked
//   cancel                                   — the member who asked, while it is waiting
//   close                                    — partners, an open or waiting chat
export async function PATCH(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const res = await actOnRequest(session, params.id, {
      action: String(body.action || ''),
      durationDays: body.durationDays,
      note: body.note,
    });
    if (!res.ok) return NextResponse.json({ message: res.message }, { status: res.status || 400 });
    return NextResponse.json({ message: 'Done', state: res.permission?.status });
  } catch (err) {
    console.error('Chat request action error:', err);
    return NextResponse.json({ message: err.message || 'Could not update the request' }, { status: 500 });
  }
}
