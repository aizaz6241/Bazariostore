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
    const targetMemberId = searchParams.get('targetMemberId'); // Target user ID

    let conversationId = 'main_group';

    if (chatType === 'personal') {
      if (!targetMemberId) {
        return NextResponse.json({ message: 'targetMemberId is required for personal chat' }, { status: 400 });
      }

      const parts = [session._id.toString(), targetMemberId.toString()].sort();
      conversationId = `personal_${parts.join('_')}`;
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

    // Cheap fingerprint of the conversation. The chat page polls every few seconds and sends the
    // fingerprint it already has; when nothing changed we answer without re-sending the messages
    // (which carry base64 voice notes and images).
    const [count, latest] = await Promise.all([
      ChatMessage.countDocuments({ conversationId }),
      ChatMessage.findOne({ conversationId }).sort({ updatedAt: -1 }).select('updatedAt').lean(),
    ]);
    const sig = `${count}:${latest?.updatedAt ? new Date(latest.updatedAt).getTime() : 0}`;
    if (searchParams.get('sig') === sig) {
      return NextResponse.json({ conversationId, unchanged: true, sig });
    }

    // Newest 300 messages, returned oldest-first (it used to return the FIRST 300 ever sent,
    // so in a long conversation new messages stopped appearing).
    const newest = await ChatMessage.find({ conversationId })
      .populate('readBy', 'name username avatar role')
      .sort({ createdAt: -1 })
      .limit(300);
    const messages = newest.reverse();

    return NextResponse.json({
      conversationId,
      sig,
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

    if (messageType === 'image' && (!mediaUrl || !mediaUrl.trim())) {
      return NextResponse.json({ message: 'Image data is required' }, { status: 400 });
    }

    if (messageType === 'text' && (!text || !text.trim())) {
      return NextResponse.json({ message: 'Message text cannot be empty' }, { status: 400 });
    }

    const newMsg = await ChatMessage.create({
      chatType: chatType || 'group',
      conversationId,
      senderId: session._id,
      senderName: session.name,
      senderRole: session.role,
      targetMemberId: target,
      messageType: messageType || 'text',
      text: text ? text.trim() : '',
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
