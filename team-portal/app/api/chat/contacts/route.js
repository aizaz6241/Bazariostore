import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import Member from '@/lib/models/Member';
import ChatMessage from '@/lib/models/ChatMessage';
import { syncEcommerceAdmins } from '@/lib/adminSync';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Keep all admins synchronized from ecommerce database
    await syncEcommerceAdmins();

    // Universal Contact Access: Everyone (Admins & Members) can message all other active users
    const contacts = await Member.find({
      _id: { $ne: session._id },
      active: true,
    })
      .select('name username role phone avatar active commissionLabel')
      .sort({ role: 1, name: 1 });

    // Fetch conversation preview and unread counts for each contact
    const enrichedContacts = await Promise.all(
      contacts.map(async (contact) => {
        const parts = [session._id.toString(), contact._id.toString()].sort();
        const conversationId = `personal_${parts.join('_')}`;

        const lastMsg = await ChatMessage.findOne({ conversationId })
          .sort({ createdAt: -1 })
          .select('messageType text mediaUrl createdAt senderId senderName isDeleted isEdited');

        const unreadCount = await ChatMessage.countDocuments({
          conversationId,
          senderId: contact._id,
          readBy: { $ne: session._id },
        });

        return {
          _id: contact._id,
          name: contact.name,
          username: contact.username,
          role: contact.role,
          phone: contact.phone,
          avatar: contact.avatar,
          commissionLabel: contact.commissionLabel || 'pkr_1to1',
          conversationId,
          lastMessage: lastMsg,
          unreadCount,
        };
      })
    );

    // Group chat metadata
    const groupLastMsg = await ChatMessage.findOne({ conversationId: 'main_group' })
      .sort({ createdAt: -1 })
      .select('messageType text mediaUrl createdAt senderId senderName isDeleted isEdited');

    const groupUnreadCount = await ChatMessage.countDocuments({
      conversationId: 'main_group',
      senderId: { $ne: session._id },
      readBy: { $ne: session._id },
    });

    return NextResponse.json({
      contacts: enrichedContacts,
      group: {
        lastMessage: groupLastMsg,
        unreadCount: groupUnreadCount,
      },
    });
  } catch (err) {
    console.error('Fetch chat contacts error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
