import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import ChatMessage from '@/lib/models/ChatMessage';

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

    message.text = text.trim();
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    await message.populate('readBy', 'name username avatar role');

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

    // Mark as deleted WhatsApp style
    message.isDeleted = true;
    message.deletedAt = new Date();
    message.deletedBy = session._id;
    message.text = 'This message was deleted';
    message.mediaUrl = '';
    message.audioDuration = 0;
    await message.save();

    await message.populate('readBy', 'name username avatar role');

    return NextResponse.json({
      message: 'Message deleted successfully',
      chatMessage: message,
    });
  } catch (err) {
    console.error('Delete chat message error:', err);
    return NextResponse.json({ message: err.message || 'Internal server error' }, { status: 500 });
  }
}
