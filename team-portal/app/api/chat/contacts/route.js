import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import Member from '@/lib/models/Member';
import ChatMessage from '@/lib/models/ChatMessage';
import { syncEcommerceAdmins } from '@/lib/adminSync';
import { proofCounts } from '@/lib/utils/paymentProofs';

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

    const lastByConv = new Map(lastDocs.filter(Boolean).map((d) => [d.conversationId, d]));
    const unreadByConv = new Map(unreadAgg.map((x) => [x._id, x.n]));

    const enrichedContacts = contacts.map((contact) => {
      const conversationId = convIdFor(contact._id);
      return {
        _id: contact._id,
        name: contact.name,
        username: contact.username,
        role: contact.role,
        phone: contact.phone,
        avatar: contact.avatar,
        commissionLabel: contact.commissionLabel || 'pkr_1to1',
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
      } catch (e) {
        proofs = { draft: 0, latest: null };
      }
    }

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
    });
  } catch (err) {
    console.error('Fetch chat contacts error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
