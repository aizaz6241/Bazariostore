import crypto from 'crypto';
import { getAuthSession } from '@/lib/auth';
import Call from '@/lib/models/Call';
import ChatMessage from '@/lib/models/ChatMessage';
import { ok, fail, clean } from '@/lib/utils/routeHelpers';
import { livekitConfig, roomService } from '@/lib/utils/livekit';
import { activeCall, callView } from '@/lib/utils/calls';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/calls — is a team meeting live right now? (everybody; polled by the portal)
 *   + the last few meetings for admins
 */
export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return fail('Unauthorized', 401);
    const cfg = livekitConfig();
    const live = cfg ? await activeCall() : null;
    let recent = [];
    if (session.role === 'admin' && new URL(req.url).searchParams.get('recent')) {
      const rows = await Call.find({ status: 'ended' }).sort({ startedAt: -1 }).limit(10).lean();
      recent = rows.map((c) => callView(c, null, session));
    }
    return ok({
      configured: !!cfg,
      active: live ? callView(live.call, live.people, session) : null,
      recent,
    });
  } catch (err) {
    console.error('Calls list error:', err);
    return fail(err.message, 500);
  }
}

/**
 * POST /api/calls { kind: 'video' | 'audio', title? } — start a team meeting (admins only).
 * Everybody is told (push notification + a card in the team chat). Only one meeting at a time.
 */
export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session || session.role !== 'admin') return fail('Only admins can start a meeting.', 403);
    const cfg = livekitConfig();
    if (!cfg) return fail('Calls are not set up yet: the LiveKit keys are missing on the server.', 503);

    const rl = checkRateLimit(`call-start:${String(session._id)}`, 10, 10 * 60 * 1000);
    if (!rl.allowed) return fail('Too many meetings started in a short time. Please wait a little.', 429);

    const existing = await activeCall();
    if (existing) {
      return fail('A meeting is already live. Join it, or end it first.', 409, { active: callView(existing.call, existing.people, session) });
    }

    const body = await req.json().catch(() => ({}));
    const kind = body.kind === 'audio' ? 'audio' : 'video';
    const title = clean(body.title, 80) || (kind === 'audio' ? 'Team voice call' : 'Team meeting');
    const roomName = `bz-${crypto.randomBytes(16).toString('hex')}`;

    try {
      await roomService(cfg).createRoom({ name: roomName, emptyTimeout: 10 * 60, departureTimeout: 10 * 60, maxParticipants: 100 });
    } catch (e) {
      console.error('LiveKit createRoom failed:', e?.message);
      return fail('Could not reach the call service. Check the LiveKit keys / URL and try again.', 502);
    }

    const call = await Call.create({ roomName, kind, title, startedBy: session._id, startedByName: session.name });

    // the card in the team chat (everybody sees it; it shows "Join" while the meeting is live)
    try {
      const msg = await ChatMessage.create({
        chatType: 'group',
        conversationId: 'main_group',
        senderId: session._id,
        senderName: session.name,
        senderRole: 'admin',
        messageType: 'system_alert',
        text: `${kind === 'audio' ? '📞' : '📹'} ${session.name} started “${title}”`,
        callId: call._id,
        readBy: [session._id],
      });
      await Call.updateOne({ _id: call._id }, { $set: { chatMessageId: msg._id } });
      call.chatMessageId = msg._id;
    } catch (e) {
      console.error('Call chat card failed:', e.message);
    }

    try {
      const { sendPushToAllExcept } = await import('@/lib/utils/push');
      await Promise.race([
        sendPushToAllExcept(session._id, {
          title: kind === 'audio' ? '📞 Team voice call started' : '📹 Team meeting started',
          body: `${session.name} started “${title}”. Tap to join.`,
          url: `/call/${call._id}`,
          type: 'call',
          tag: `call-${call._id}`,
          vibrate: [300, 150, 300, 150, 300],
        }),
        new Promise((r) => setTimeout(r, 4000)),
      ]);
    } catch (e) {
      console.error('Call push failed:', e.message);
    }

    return ok({ message: 'Meeting started.', call: callView(call.toObject(), [], session) }, 201);
  } catch (err) {
    console.error('Call start error:', err);
    return fail(err.message, 500);
  }
}
