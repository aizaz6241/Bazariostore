import { getAuthSession } from '@/lib/auth';
import Call from '@/lib/models/Call';
import { ok, fail } from '@/lib/utils/routeHelpers';
import { livekitConfig, joinTicket } from '@/lib/utils/livekit';
import { callView, isOidStr } from '@/lib/utils/calls';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/calls/:id/token — a short-lived ticket into the meeting room.
 * Any signed-in, active team member or admin, only while the meeting is live. The person's
 * identity in the room is always his own account (it cannot be chosen by the phone).
 */
export async function POST(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session) return fail('Unauthorized', 401);
    const cfg = livekitConfig();
    if (!cfg) return fail('Calls are not set up yet.', 503);
    if (!isOidStr(params.id)) return fail('Meeting not found', 404);

    const rl = checkRateLimit(`call-ticket:${String(session._id)}`, 40, 10 * 60 * 1000);
    if (!rl.allowed) return fail('Too many attempts. Please wait a minute and try again.', 429);

    const call = await Call.findById(params.id).lean();
    if (!call) return fail('Meeting not found', 404);
    if (call.status !== 'live') return fail('This meeting has ended.', 410, { call: callView(call, null, session) });

    if ((call.removed || []).some((r) => String(r) === String(session._id))) {
      return fail('An admin removed you from this meeting.', 403);
    }

    const token = await joinTicket({ cfg, roomName: call.roomName, member: session, kind: call.kind });

    // attendance (first join only)
    await Call.updateOne(
      { _id: call._id, 'joined.memberId': { $ne: session._id } },
      { $push: { joined: { memberId: session._id, name: session.name, at: new Date() } }, $set: { lastSeenAt: new Date() } }
    ).catch(() => {});

    return ok({ url: cfg.url, token, call: callView(call, null, session) });
  } catch (err) {
    console.error('Call ticket error:', err);
    return fail(err.message, 500);
  }
}
