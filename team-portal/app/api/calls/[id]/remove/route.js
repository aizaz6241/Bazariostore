import { getAuthSession } from '@/lib/auth';
import Call from '@/lib/models/Call';
import Member from '@/lib/models/Member';
import { ok, fail } from '@/lib/utils/routeHelpers';
import { roomService } from '@/lib/utils/livekit';
import { isOidStr } from '@/lib/utils/calls';

export const dynamic = 'force-dynamic';

/**
 * POST /api/calls/:id/remove { identity, mute? } — admins only:
 *   mute: true  → switch that person's microphone off (he can switch it on again)
 *   otherwise   → take him out of the meeting (he cannot join this meeting again)
 */
export async function POST(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') return fail('Only admins can do this.', 403);
    if (!isOidStr(params.id)) return fail('Meeting not found', 404);
    const call = await Call.findById(params.id).lean();
    if (!call || call.status !== 'live') return fail('This meeting is not live.', 410);
    const { identity, mute } = await req.json().catch(() => ({}));
    if (!isOidStr(identity)) return fail('Choose a person.');
    if (String(identity) === String(session._id)) return fail('That is you.');
    const svc = roomService();
    if (!svc) return fail('Calls are not set up yet.', 503);

    if (mute) {
      const p = await svc.getParticipant(call.roomName, String(identity));
      const mic = (p.tracks || []).find((t) => t.source === 2 || /MICROPHONE/i.test(String(t.source)));
      if (!mic) return ok({ message: 'Microphone is already off.' });
      await svc.mutePublishedTrack(call.roomName, String(identity), mic.sid, true);
      return ok({ message: 'Microphone switched off.' });
    }

    const target = await Member.findById(identity).select('name role').lean();
    await Call.updateOne({ _id: call._id }, { $addToSet: { removed: target?._id || identity } });
    await svc.removeParticipant(call.roomName, String(identity));
    return ok({ message: `${target?.name || 'Participant'} was removed from the meeting.` });
  } catch (err) {
    console.error('Call remove error:', err);
    return fail(/not.?found/i.test(err?.message || '') ? 'This person is not in the meeting any more.' : err.message, 400);
  }
}
