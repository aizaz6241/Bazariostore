import { getAuthSession } from '@/lib/auth';
import Call from '@/lib/models/Call';
import { ok, fail } from '@/lib/utils/routeHelpers';
import { endCall, isOidStr } from '@/lib/utils/calls';

export const dynamic = 'force-dynamic';

/** POST /api/calls/:id/end — end the meeting for everyone (admins only). */
export async function POST(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') return fail('Only admins can end a meeting.', 403);
    if (!isOidStr(params.id)) return fail('Meeting not found', 404);
    const call = await Call.findById(params.id).lean();
    if (!call) return fail('Meeting not found', 404);
    if (call.status !== 'live') return ok({ message: 'This meeting had already ended.' });
    await endCall(call, { byName: session.name, reason: 'ended' });
    return ok({ message: 'Meeting ended for everyone.' });
  } catch (err) {
    console.error('Call end error:', err);
    return fail(err.message, 500);
  }
}
