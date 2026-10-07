import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getAuthSession } from '@/lib/auth';
import ChatMessage from '@/lib/models/ChatMessage';
import { readVoiceRange, readVoicePiece, PIECE_BYTES } from '@/lib/utils/chatAudio';

export const dynamic = 'force-dynamic';

// GET /api/chat/audio/[id] — plays a long voice note that is kept in the database.
// The player asks for the recording a slice at a time ("Range"), so no answer is ever large.
export async function GET(req, { params }) {
  try {
    const session = await getAuthSession(req);
    if (!session) return new NextResponse('Unauthorized', { status: 401 });
    if (!mongoose.Types.ObjectId.isValid(params.id)) return new NextResponse('Not found', { status: 404 });

    const msg = await ChatMessage.findById(params.id).select('conversationId messageType mediaSize mediaMime isDeleted').lean();
    const myId = session._id.toString();
    // same rule as pictures: the two groups, and the person's own 1-on-1 chats
    const allowed =
      msg &&
      (msg.conversationId === 'main_group' ||
        msg.conversationId === 'materials_group' ||
        (msg.conversationId || '').replace(/^personal_/, '').split('_').includes(myId));
    if (!allowed || msg.isDeleted || msg.messageType !== 'voice' || !(msg.mediaSize > 0)) {
      return new NextResponse('Not found', { status: 404 });
    }

    const total = msg.mediaSize;
    const base = {
      'Content-Type': msg.mediaMime || 'audio/webm',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    };

    const range = req.headers.get('range');
    if (range) {
      const m = range.match(/^bytes=(\d*)-(\d*)$/);
      if (!m || (m[1] === '' && m[2] === '')) return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
      let start;
      let end;
      if (m[1] === '') {
        // "the last N bytes"
        start = Math.max(0, total - Number(m[2]));
        end = total - 1;
      } else {
        start = Number(m[1]);
        end = m[2] === '' ? total - 1 : Math.min(Number(m[2]), total - 1);
      }
      if (start >= total || start > end) return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });

      const slice = await readVoiceRange(msg._id, start, end);
      if (!slice || slice.length === 0) return new NextResponse('Not found', { status: 404 });
      return new NextResponse(slice, {
        status: 206,
        headers: { ...base, 'Content-Range': `bytes ${start}-${start + slice.length - 1}/${total}`, 'Content-Length': String(slice.length) },
      });
    }

    // No range asked (a download): the pieces are sent one after the other
    const pieces = Math.ceil(total / PIECE_BYTES);
    let i = 0;
    const stream = new ReadableStream({
      async pull(controller) {
        if (i >= pieces) return controller.close();
        const data = await readVoicePiece(msg._id, i++);
        if (!data) return controller.error(new Error('A part of the voice note is missing'));
        controller.enqueue(new Uint8Array(data));
      },
    });
    return new NextResponse(stream, { status: 200, headers: { ...base, 'Content-Length': String(total) } });
  } catch (err) {
    console.error('Voice note play error:', err);
    return new NextResponse('Error', { status: 500 });
  }
}
