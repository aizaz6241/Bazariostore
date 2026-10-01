import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import ChatMessage from '@/lib/models/ChatMessage';
import Member from '@/lib/models/Member';

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
    const targetMemberId = searchParams.get('targetMemberId'); // Used when opening personal chat

    let conversationId = 'main_group';

    if (chatType === 'personal') {
      if (session.role === 'member') {
        // A member is only allowed to chat with Admin
        // Find default admin or target admin
        const adminUser = await Member.findOne({ role: 'admin' });
        const adminId = adminUser ? adminUser._id.toString() : 'admin';
        const parts = [session._id.toString(), adminId].sort();
        conversationId = `personal_${parts.join('_')}`;
      } else {
        // Admin chatting with a specific member
        if (!targetMemberId) {
          return NextResponse.json({ message: 'targetMemberId required for personal chat' }, { status: 400 });
        }
        const parts = [session._id.toString(), targetMemberId.toString()].sort();
        conversationId = `personal_${parts.join('_')}`;
      }
    }

    const messages = await ChatMessage.find({ conversationId })
      .sort({ createdAt: 1 })
      .limit(200);

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
      if (session.role === 'member') {
        // Member can only send to Admin
        const adminUser = await Member.findOne({ role: 'admin' });
        if (!adminUser) return NextResponse.json({ message: 'Admin not found' }, { status: 404 });
        const parts = [session._id.toString(), adminUser._id.toString()].sort();
        conversationId = `personal_${parts.join('_')}`;
        target = adminUser._id;
      } else {
        // Admin sending to Member
        if (!targetMemberId) {
          return NextResponse.json({ message: 'targetMemberId required' }, { status: 400 });
        }
        const parts = [session._id.toString(), targetMemberId.toString()].sort();
        conversationId = `personal_${parts.join('_')}`;
        target = targetMemberId;
      }
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

    return NextResponse.json({
      message: 'Message sent',
      chatMessage: newMsg,
    }, { status: 201 });
  } catch (err) {
    console.error('Send chat message error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
