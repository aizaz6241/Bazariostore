import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import ChatMessage from '@/lib/models/ChatMessage';
import Member from '@/lib/models/Member';
import { syncEcommerceAdmins } from '@/lib/adminSync';

export const dynamic = 'force-dynamic';

// GET /api/chat — fetch messages
export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const chatType = searchParams.get('chatType') || 'group'; // 'group' or 'personal'
    let targetMemberId = searchParams.get('targetMemberId'); // Used when opening personal chat

    let conversationId = 'main_group';

    if (chatType === 'personal') {
      if (!targetMemberId) {
        // Fallback default target if none provided in query
        if (session.role === 'member') {
          // Member default target: first active admin
          await syncEcommerceAdmins();
          const firstAdmin = await Member.findOne({ role: 'admin', active: true });
          if (firstAdmin) targetMemberId = firstAdmin._id.toString();
        } else {
          // Admin default target: first active member
          const firstMember = await Member.findOne({ role: 'member', active: true });
          if (firstMember) targetMemberId = firstMember._id.toString();
        }
      }

      if (targetMemberId) {
        const parts = [session._id.toString(), targetMemberId.toString()].sort();
        conversationId = `personal_${parts.join('_')}`;
      }
    }

    // Mark unread messages in this conversation as read by the current user
    try {
      await ChatMessage.updateMany(
        {
          conversationId,
          readBy: { $ne: session._id },
        },
        { $addToSet: { readBy: session._id } }
      );
    } catch (readErr) {
      console.error('Mark read error:', readErr);
    }

    const messages = await ChatMessage.find({ conversationId })
      .populate('readBy', 'name username avatar role')
      .sort({ createdAt: 1 })
      .limit(300);

    return NextResponse.json({
      conversationId,
      messages,
    });
  } catch (err) {
    console.error('Fetch chat messages error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}

// POST /api/chat — send message (text, voice note, image)
export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { chatType, targetMemberId, messageType, text, mediaUrl, audioDuration } = await req.json();

    let conversationId = 'main_group';
    let target = null;

    if (chatType === 'personal') {
      if (!targetMemberId) {
        return NextResponse.json({ message: 'Target user ID is required for personal chat' }, { status: 400 });
      }

      const targetMember = await Member.findById(targetMemberId);
      if (!targetMember) {
        return NextResponse.json({ message: 'Recipient user not found' }, { status: 404 });
      }

      const parts = [session._id.toString(), targetMemberId.toString()].sort();
      conversationId = `personal_${parts.join('_')}`;
      target = targetMember._id;
    }

    const newMsg = await ChatMessage.create({
      chatType: chatType || 'group',
      conversationId,
      senderId: session._id,
      senderName: session.name,
      senderRole: session.role,
      targetMemberId: target,
      messageType: messageType || 'text',
      text: text || '',
      mediaUrl: mediaUrl || '',
      audioDuration: audioDuration || 0,
      readBy: [session._id],
    });

    await newMsg.populate('readBy', 'name username avatar role');

    return NextResponse.json(
      {
        message: 'Message sent',
        chatMessage: newMsg,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Send chat message error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
