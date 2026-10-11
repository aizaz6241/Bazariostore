import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import ChatPermission from '@/lib/models/ChatPermission';
import ChatBlock from '@/lib/models/ChatBlock';
import ChatReport from '@/lib/models/ChatReport';
import ChatMessage from '@/lib/models/ChatMessage';
import Member from '@/lib/models/Member';
import { createRequest, expireDue, idsOfConversation, ACTIVE } from '@/lib/utils/chatAccess';

export const dynamic = 'force-dynamic';

const sid = (v) => (v === null || v === undefined ? '' : String(v));
const slim = (p) => ({
  _id: p._id,
  conversationId: p.conversationId,
  requesterId: p.requesterId,
  requesterName: p.requesterName,
  targetId: p.targetId,
  targetName: p.targetName,
  reason: p.reason,
  status: p.status,
  viaReferral: !!p.viaReferral,
  adminName: p.adminName || '',
  adminAt: p.adminAt || null,
  adminNote: p.adminNote || '',
  durationDays: p.durationDays || 0,
  memberAt: p.memberAt || null,
  openedAt: p.openedAt || null,
  expiresAt: p.expiresAt || null,
  closedAt: p.closedAt || null,
  closedByName: p.closedByName || '',
  closeReason: p.closeReason || '',
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

// GET /api/chat/requests
//   partners: everything about member <-> member chats (requests, open chats, history, blocks,
//             reports, and every member <-> member conversation so it can be read)
//   member:   the requests waiting for him, the ones he sent, and whom he blocked
export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    await expireDue();

    if (session.role !== 'admin') {
      const [incoming, outgoing, blocks] = await Promise.all([
        ChatPermission.find({ targetId: session._id, status: 'pending_member' }).sort({ createdAt: -1 }).lean(),
        ChatPermission.find({ requesterId: session._id }).sort({ createdAt: -1 }).limit(20).lean(),
        ChatBlock.find({ blockerId: session._id }).sort({ createdAt: -1 }).lean(),
      ]);
      // a member never sees the partners' names or notes on his requests, only the outcome
      const forMember = (p) => {
        const s = slim(p);
        delete s.adminName;
        delete s.closedByName;
        return s;
      };
      return NextResponse.json({
        incoming: incoming.map(forMember),
        outgoing: outgoing.map(forMember),
        blocked: blocks.map((b) => ({ _id: b._id, memberId: b.blockedId, name: b.blockedName, at: b.createdAt })),
      });
    }

    const [pending, waiting, open, history, blocks, openReports, oldReports, conversationIds, members] = await Promise.all([
      ChatPermission.find({ status: 'pending_admin' }).sort({ createdAt: 1 }).lean(),
      ChatPermission.find({ status: 'pending_member' }).sort({ createdAt: -1 }).lean(),
      ChatPermission.find({ status: 'open' }).sort({ openedAt: -1 }).lean(),
      ChatPermission.find({ status: { $nin: ACTIVE } }).sort({ updatedAt: -1 }).limit(60).lean(),
      ChatBlock.find({}).sort({ createdAt: -1 }).lean(),
      ChatReport.find({ status: 'open' }).sort({ createdAt: -1 }).lean(),
      ChatReport.find({ status: 'reviewed' }).sort({ reviewedAt: -1 }).limit(30).lean(),
      ChatMessage.distinct('conversationId', { conversationId: /^personal_/ }),
      Member.find({}).select('name role active').lean(),
    ]);

    // Every member <-> member conversation that has messages (old ones included), newest first
    const who = new Map(members.map((m) => [sid(m._id), m]));
    const pairs = conversationIds
      .map((c) => ({ conversationId: c, ids: idsOfConversation(c) }))
      .filter((x) => x.ids && x.ids.every((id) => who.get(id)?.role === 'member'));
    const lasts = await Promise.all(
      pairs.map((x) =>
        ChatMessage.findOne({ conversationId: x.conversationId })
          .sort({ createdAt: -1 })
          .select('createdAt messageType text senderName isDeleted')
          .lean()
      )
    );
    const openByConv = new Map(open.map((p) => [p.conversationId, p]));
    const conversations = pairs
      .map((x, i) => ({
        conversationId: x.conversationId,
        members: x.ids.map((id) => ({ _id: id, name: who.get(id)?.name || 'Member', active: who.get(id)?.active !== false })),
        lastMessage: lasts[i] || null,
        open: openByConv.has(x.conversationId),
      }))
      .filter((x) => x.lastMessage)
      .sort((a, b) => new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt));

    return NextResponse.json({
      pending: pending.map(slim),
      waiting: waiting.map(slim),
      open: open.map(slim),
      history: history.map(slim),
      blocks: blocks.map((b) => ({ _id: b._id, blockerId: b.blockerId, blockerName: b.blockerName, blockedId: b.blockedId, blockedName: b.blockedName, at: b.createdAt })),
      reports: [...openReports, ...oldReports],
      conversations,
    });
  } catch (err) {
    console.error('Chat requests list error:', err);
    return NextResponse.json({ message: err.message || 'Could not load chat requests' }, { status: 500 });
  }
}

// POST /api/chat/requests { targetId, reason } — a member asks to chat with another member
export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const res = await createRequest(session, { targetId: body.targetId, reason: body.reason });
    if (!res.ok) return NextResponse.json({ message: res.message }, { status: res.status || 400 });
    const p = slim(res.permission);
    delete p.adminName;
    return NextResponse.json({ message: res.permission.viaReferral ? 'Request sent' : 'Request sent to the admins', permission: p }, { status: 201 });
  } catch (err) {
    console.error('Chat request error:', err);
    return NextResponse.json({ message: err.message || 'Could not send the request' }, { status: 500 });
  }
}
