import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import ChatMessage from '@/lib/models/ChatMessage';
import Member from '@/lib/models/Member';
import { sendPushToUser, sendPushToAllExcept } from '@/lib/utils/push';

export const dynamic = 'force-dynamic';

const FIRST_PAGE = 50; // messages sent when a chat is opened
const OLDER_PAGE = 60; // messages per "Load earlier messages"

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

    // Older page ("Load earlier messages"): the messages just before the oldest one on screen.
    // Text only; pictures and voice notes are fetched separately by /api/chat/media.
    const beforeMs = Number(searchParams.get('before'));
    if (Number.isFinite(beforeMs) && beforeMs > 0) {
      const pageSize = Math.min(Math.max(parseInt(searchParams.get('limit'), 10) || OLDER_PAGE, 1), 100);
      const page = await ChatMessage.find({ conversationId, createdAt: { $lt: new Date(beforeMs) } })
        .select('-mediaUrl')
        .populate('readBy', 'name username avatar role')
        .sort({ createdAt: -1 })
        .limit(pageSize + 1)
        .lean();
      const hasMore = page.length > pageSize;
      return NextResponse.json({
        conversationId,
        older: true,
        hasMore,
        messages: page.slice(0, pageSize).reverse(),
      });
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

    // Cheap fingerprint of the conversation. The chat page polls every couple of seconds and sends
    // the fingerprint it already has; when nothing changed we answer without any messages.
    const [count, latest] = await Promise.all([
      ChatMessage.countDocuments({ conversationId }),
      ChatMessage.findOne({ conversationId }).sort({ updatedAt: -1 }).select('updatedAt').lean(),
    ]);
    const cursor = latest?.updatedAt ? new Date(latest.updatedAt).getTime() : 0;
    const sig = `${count}:${cursor}`;
    if (searchParams.get('sig') === sig) {
      return NextResponse.json({ conversationId, unchanged: true, sig, cursor, count });
    }

    // Delta: the page tells us the newest change it already has (`after`). We send only what is
    // new or changed since then, so a new message arrives in a tiny response instead of the
    // whole history. Pictures and voice notes are never part of it (see /api/chat/media).
    const afterMs = Number(searchParams.get('after'));
    if (Number.isFinite(afterMs) && afterMs > 0) {
      const afterDate = new Date(afterMs);
      const [fresh, changed] = await Promise.all([
        ChatMessage.find({ conversationId, createdAt: { $gt: afterDate } })
          .select('-mediaUrl')
          .populate('readBy', 'name username avatar role')
          .sort({ createdAt: 1 })
          .limit(300)
          .lean(),
        // Older messages that were edited, deleted or read: sent without their media
        ChatMessage.find({ conversationId, createdAt: { $lte: afterDate }, updatedAt: { $gt: afterDate } })
          .select('-mediaUrl')
          .populate('readBy', 'name username avatar role')
          .sort({ createdAt: 1 })
          .limit(300)
          .lean(),
      ]);

      return NextResponse.json({
        conversationId,
        delta: true,
        sig,
        cursor,
        count,
        messages: [...changed.map((m) => ({ ...m, partial: true })), ...fresh],
      });
    }

    // First load of a chat: only the newest messages, and without the pictures / voice notes
    // themselves (those are base64 and can be megabytes). The text shows at once; the page then
    // asks /api/chat/media for the media of the messages it is showing, and "Load earlier
    // messages" pages back through the history.
    const newest = await ChatMessage.find({ conversationId })
      .select('-mediaUrl')
      .populate('readBy', 'name username avatar role')
      .sort({ createdAt: -1 })
      .limit(FIRST_PAGE)
      .lean();
    const messages = newest.reverse();

    return NextResponse.json({
      conversationId,
      sig,
      cursor,
      count,
      hasMore: count > messages.length,
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

    // Asynchronously trigger push notifications to recipient(s) with custom message sound
    try {
      const previewBody =
        messageType === 'image'
          ? '📷 Sent a photo'
          : messageType === 'voice'
          ? '🎤 Sent a voice message'
          : (text ? text.trim().slice(0, 120) : 'New message');

      if (chatType === 'personal' && target) {
        sendPushToUser(target, {
          title: `💬 ${session.name}`,
          body: previewBody,
          url: '/chat',
          type: 'chat',
          sound: '/sounds/message.wav',
          vibrate: [200, 100, 200, 100, 200],
          data: { chatType: 'personal', senderId: session._id.toString() },
        }).catch((e) => console.error('Personal push error:', e));
      } else {
        sendPushToAllExcept(session._id, {
          title: `💬 ${session.name} (Bazario Team)`,
          body: previewBody,
          url: '/chat',
          type: 'chat',
          sound: '/sounds/message.wav',
          vibrate: [200, 100, 200, 100, 200],
          data: { chatType: 'group', senderId: session._id.toString() },
        }).catch((e) => console.error('Group push error:', e));
      }
    } catch (pushErr) {
      console.error('Trigger push error:', pushErr);
    }

    // The sender already has the picture / voice note it just uploaded: do not send it back.
    const sent = newMsg.toObject();
    delete sent.mediaUrl;

    return NextResponse.json(
      {
        message: 'Message sent',
        chatMessage: sent,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Send chat message error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}

// DELETE /api/chat — admin clears a whole conversation (the group chat, or the admin's
// own 1-on-1 chat with a member). The messages are removed for everyone and cannot be restored.
export async function DELETE(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ message: 'Only admins can clear a chat' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const chatType = searchParams.get('chatType') || 'group';
    const targetMemberId = searchParams.get('targetMemberId');

    let conversationId = 'main_group';
    if (chatType === 'personal') {
      if (!targetMemberId) {
        return NextResponse.json({ message: 'targetMemberId is required for personal chat' }, { status: 400 });
      }
      const parts = [session._id.toString(), targetMemberId.toString()].sort();
      conversationId = `personal_${parts.join('_')}`;
    }

    const result = await ChatMessage.deleteMany({ conversationId });

    return NextResponse.json({
      message: 'Chat cleared',
      conversationId,
      deleted: result?.deletedCount || 0,
    });
  } catch (err) {
    console.error('Clear chat error:', err);
    return NextResponse.json({ message: err.message || 'Failed to clear chat' }, { status: 500 });
  }
}
