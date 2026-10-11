import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import Member from '@/lib/models/Member';
import ChatMessage from '@/lib/models/ChatMessage';
import { syncEcommerceAdmins } from '@/lib/adminSync';
import { proofCounts, myProofCounts } from '@/lib/utils/paymentProofs';
import { openProofRequestCount, myProofRequestCounts } from '@/lib/utils/proofRequests';
import { chatStatesFor, requestCounts } from '@/lib/utils/chatAccess';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Admin accounts are kept in sync at most once a minute (this route is polled by the chat page)
    syncEcommerceAdmins().catch(() => {});

    // Universal Contact Access: Everyone (Admins & Members) can message all other active users
    const contacts = await Member.find({
      _id: { $ne: session._id },
      active: true,
    })
      .select('name username role phone avatar active commissionLabel')
      .sort({ role: 1, name: 1 })
      .lean();

    const myId = session._id.toString();
    const convIdFor = (contactId) => `personal_${[myId, contactId.toString()].sort().join('_')}`;
    const conversationIds = ['main_group', 'materials_group', ...contacts.map((c) => convIdFor(c._id))];

    // Unread counts for every conversation in one query; the newest message of each
    // conversation through the (conversationId, createdAt) index, without loading media.
    const [unreadAgg, lastDocs] = await Promise.all([
      ChatMessage.aggregate([
        {
          $match: {
            conversationId: { $in: conversationIds },
            senderId: { $ne: session._id },
            readBy: { $ne: session._id },
          },
        },
        { $group: { _id: '$conversationId', n: { $sum: 1 } } },
      ]),
      Promise.all(
        conversationIds.map((conversationId) =>
          ChatMessage.findOne({ conversationId })
            .sort({ createdAt: -1 })
            .select('conversationId messageType text createdAt senderId senderName isDeleted isEdited')
            .lean()
        )
      ),
    ]);

    // Member <-> member chats are locked unless a request went through: where each one stands
    let states = new Map();
    let chatRequests = null;
    try {
      [states, chatRequests] = await Promise.all([chatStatesFor(session, contacts), requestCounts(session)]);
    } catch (e) {
      console.error('Chat access state error:', e.message);
    }
    const viewerIsAdmin = session.role === 'admin';

    const lastByConv = new Map(lastDocs.filter(Boolean).map((d) => [d.conversationId, d]));
    const unreadByConv = new Map(unreadAgg.map((x) => [x._id, x.n]));

    const enrichedContacts = contacts.map((contact) => {
      const conversationId = convIdFor(contact._id);
      return {
        _id: contact._id,
        name: contact.name,
        // Members never get another member's username or phone number (so nobody can take a
        // number and message outside the portal); the partners see everything.
        ...(viewerIsAdmin ? { username: contact.username, phone: contact.phone } : contact.role === 'admin' ? { username: contact.username } : {}),
        role: contact.role,
        avatar: contact.avatar,
        // member viewing another member: open / locked / waiting / incoming request / blocked
        ...(!viewerIsAdmin && contact.role !== 'admin' ? { chat: states.get(String(contact._id)) || { state: 'locked' } } : {}),
        // a member's deal is the partners' business only (members never see each other's deal)
        ...(session.role === 'admin' ? { commissionLabel: contact.commissionLabel || 'pkr_1to1' } : {}),
        conversationId,
        lastMessage: lastByConv.get(conversationId) || null,
        unreadCount: unreadByConv.get(conversationId) || 0,
      };
    });

    const groupLastMsg = lastByConv.get('main_group') || null;
    const groupUnreadCount = unreadByConv.get('main_group') || 0;

    const materialsLastMsg = lastByConv.get('materials_group') || null;
    const materialsUnreadCount = unreadByConv.get('materials_group') || 0;

    const totalUnreadCount = Array.from(unreadByConv.values()).reduce((sum, n) => sum + (n || 0), 0);

    // "Payment Proofs" group (partners only): how many deposits still wait for their proof
    let proofs = null;
    if (session.role === 'admin') {
      try {
        proofs = await proofCounts();
        proofs.requests = await openProofRequestCount();
      } catch (e) {
        proofs = { draft: 0, latest: null, requests: 0 };
      }
    }
    // Everyone's OWN proofs group: the complete proofs of the person's own sellers
    let myProofs = { total: 0, fresh: 0, latest: null, open: 0, answered: 0 };
    try {
      const [counts, reqs] = await Promise.all([myProofCounts(session._id), myProofRequestCounts(session._id)]);
      myProofs = { ...counts, ...reqs };
    } catch (e) {}

    return NextResponse.json({
      contacts: enrichedContacts,
      group: {
        lastMessage: groupLastMsg,
        unreadCount: groupUnreadCount,
      },
      materialsGroup: {
        lastMessage: materialsLastMsg,
        unreadCount: materialsUnreadCount,
      },
      totalUnreadCount,
      proofs,
      myProofs,
      chatRequests,
    });
  } catch (err) {
    console.error('Fetch chat contacts error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
