import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getAuthSession } from '@/lib/auth';
import ChatMessage from '@/lib/models/ChatMessage';

export const dynamic = 'force-dynamic';

const MAX_IDS = 4;
const MAX_BYTES = 3_000_000; // stay well under the hosting limit for one response

// GET /api/chat/media?ids=a,b,c — the picture / voice note of the given messages.
// A chat opens with text only; the page calls this for the media of the messages on screen.
export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const ids = (searchParams.get('ids') || '')
      .split(',')
      .map((x) => x.trim())
      .filter((x) => mongoose.Types.ObjectId.isValid(x))
      .slice(0, MAX_IDS);

    if (ids.length === 0) {
      return NextResponse.json({ media: {}, missing: [] });
    }

    const myId = session._id.toString();
    const docs = await ChatMessage.find({ _id: { $in: ids } })
      .select('conversationId mediaUrl mediaLink isDeleted')
      .lean();

    const media = {};
    const missing = [];
    const byId = new Map(docs.map((d) => [d._id.toString(), d]));
    let bytes = 0;

    for (const id of ids) {
      const doc = byId.get(id);
      // Allow main group, materials group, and user's own 1-on-1 chats
      const allowed =
        doc &&
        (doc.conversationId === 'main_group' ||
          doc.conversationId === 'materials_group' ||
          (doc.conversationId || '').replace(/^personal_/, '').split('_').includes(myId));
      // a picture on the file storage is answered with its link
      const value = doc ? doc.mediaUrl || doc.mediaLink || '' : '';
      if (!allowed || doc.isDeleted || !value) {
        missing.push(id);
        continue;
      }
      // Too much for one answer: leave the rest for the next request (always send at least one)
      if (bytes > 0 && bytes + value.length > MAX_BYTES) continue;
      media[id] = value;
      bytes += value.length;
    }

    return NextResponse.json({ media, missing });
  } catch (err) {
    console.error('Fetch chat media error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
