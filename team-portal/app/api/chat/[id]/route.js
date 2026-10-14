import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import ChatMessage from '@/lib/models/ChatMessage';
import { deleteChatPictures } from '@/lib/utils/chatMedia';
import { deleteVoiceOf } from '@/lib/utils/chatAudio';
import Member from '@/lib/models/Member';
import { canSendPersonal, idsOfConversation } from '@/lib/utils/chatAccess';

const readersOf = (session) => (session.role === 'admin' ? 'name username avatar role' : 'name avatar role');
const isSystem = (m) => String(m.messageType || '').startsWith('system');

export const dynamic = 'force-dynamic';

// PATCH /api/chat/[id] — Edit a message (Admin or Original Sender)
export async function PATCH(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const { text } = await req.json();

    if (!text || !text.trim()) {
      return NextResponse.json({ message: 'Message text cannot be empty' }, { status: 400 });
    }

    const message = await ChatMessage.findById(id);
    if (!message) {
      return NextResponse.json({ message: 'Message not found' }, { status: 404 });
    }

    // Permission check: Admins can edit, or sender can edit their own message
    const isAdmin = session.role === 'admin';
    const isSender = message.senderId.toString() === session._id.toString();

    if (!isAdmin && !isSender) {
      return NextResponse.json({ message: 'Forbidden. You do not have permission to edit this message.' }, { status: 403 });
    }

    if (message.isDeleted) {
      return NextResponse.json({ message: 'Cannot edit a deleted message.' }, { status: 400 });
    }
    // lines written by the portal itself ("Chat opened"...) are not edited
    if (isSystem(message)) {
      return NextResponse.json({ message: 'This line cannot be edited.' }, { status: 400 });
    }
    // a member <-> member chat that is closed: nothing new may be written into it, edits included
    const pair = idsOfConversation(message.conversationId);
    if (pair && !isAdmin) {
      const otherId = pair.find((x) => x !== session._id.toString());
      const other = otherId ? await Member.findById(otherId).select('_id role').lean() : null;
      const access = await canSendPersonal(session, other);
      if (!access.ok) return NextResponse.json({ message: access.message, locked: !!access.locked }, { status: 403 });
    }

    message.text = text.trim();
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();
    // replies that quote this message show the new text
    if (message.messageType === 'text') {
      await ChatMessage.updateMany({ 'replyTo.messageId': message._id }, { $set: { 'replyTo.text': message.text.slice(0, 200) } }).catch(() => {});
    }

    await message.populate('readBy', readersOf(session));

    return NextResponse.json({
      message: 'Message edited successfully',
      chatMessage: message,
    });
  } catch (err) {
    console.error('Edit chat message error:', err);
    return NextResponse.json({ message: err.message || 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/chat/[id] — Delete a message (WhatsApp style: Admin or Original Sender)
export async function DELETE(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const message = await ChatMessage.findById(id);
    if (!message) {
      return NextResponse.json({ message: 'Message not found' }, { status: 404 });
    }

    // Permission check: Admins can delete any message, or sender can delete their own
    const isAdmin = session.role === 'admin';
    const isSender = message.senderId.toString() === session._id.toString();

    if (!isAdmin && !isSender) {
      return NextResponse.json({ message: 'Forbidden. You do not have permission to delete this message.' }, { status: 403 });
    }
    if (!isAdmin && isSystem(message)) {
      return NextResponse.json({ message: 'This line cannot be deleted.' }, { status: 403 });
    }

    // Mark as deleted WhatsApp style
    message.isDeleted = true;
    message.deletedAt = new Date();
    message.deletedBy = session._id;
    message.text = 'This message was deleted';
    const storedKey = message.mediaKey || '';
    message.mediaUrl = '';
    message.mediaLink = '';
    message.mediaKey = '';
    message.audioDuration = 0;
    const hadLongVoice = (message.messageType === 'voice' || message.messageType === 'file') && message.mediaSize > 0;
    message.mediaSize = 0;
    message.fileName = '';
    await message.save();
    // a long voice note kept in the database: its pieces are removed
    if (hadLongVoice) await deleteVoiceOf([message._id]);
    // a picture on the file storage is removed there too
    if (storedKey) await deleteChatPictures([storedKey]);
    // replies that quote this message now say "This message was deleted"
    await ChatMessage.updateMany(
      { 'replyTo.messageId': message._id },
      { $set: { 'replyTo.deleted': true, 'replyTo.text': '', 'replyTo.thumb': '' } }
    ).catch(() => {});

    await message.populate('readBy', readersOf(session));

    return NextResponse.json({
      message: 'Message deleted successfully',
      chatMessage: message,
    });
  } catch (err) {
    console.error('Delete chat message error:', err);
    return NextResponse.json({ message: err.message || 'Internal server error' }, { status: 500 });
  }
}
