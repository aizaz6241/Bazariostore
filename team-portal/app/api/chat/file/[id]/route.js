import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getAuthSession } from '@/lib/auth';
import ChatMessage from '@/lib/models/ChatMessage';
import { readVoicePiece, PIECE_BYTES } from '@/lib/utils/chatAudio';

export const dynamic = 'force-dynamic';

/**
 * GET /api/chat/file/[id]?piece=N — a PDF that is kept in the database (only when the file
 * storage was not available when it was sent). The hosting cannot answer more than a few MB at
 * once, so the browser fetches it piece by piece and puts it back together on the device.
 * Without `piece`: how many pieces there are.
 */
export async function GET(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    if (!mongoose.Types.ObjectId.isValid(params.id)) return NextResponse.json({ message: 'Not found' }, { status: 404 });

    const msg = await ChatMessage.findById(params.id).select('conversationId messageType mediaSize mediaMime fileName isDeleted').lean();
    const myId = session._id.toString();
    // same rule as pictures and voice notes: the two groups, and the person's own 1-on-1 chats
    const allowed =
      msg &&
      (msg.conversationId === 'main_group' ||
        msg.conversationId === 'materials_group' ||
        (msg.conversationId || '').replace(/^personal_/, '').split('_').includes(myId) ||
        (session.role === 'admin' && /^personal_/.test(msg.conversationId || '')));
    if (!allowed || msg.isDeleted || msg.messageType !== 'file' || !(msg.mediaSize > 0)) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    const pieces = Math.ceil(msg.mediaSize / PIECE_BYTES);
    const p = new URL(req.url).searchParams.get('piece');
    if (p === null) {
      return NextResponse.json({ pieces, size: msg.mediaSize, name: msg.fileName || 'document.pdf', mime: 'application/pdf' });
    }
    const index = Number(p);
    if (!Number.isInteger(index) || index < 0 || index >= pieces) return NextResponse.json({ message: 'Not found' }, { status: 404 });
    const data = await readVoicePiece(msg._id, index);
    if (!data) return NextResponse.json({ message: 'Not found' }, { status: 404 });
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(data.length),
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('Chat file error:', err.message);
    return NextResponse.json({ message: 'Could not read the file' }, { status: 500 });
  }
}
