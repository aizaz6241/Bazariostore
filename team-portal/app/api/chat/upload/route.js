import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { saveVoicePiece, PIECE_BYTES } from '@/lib/utils/chatAudio';

export const dynamic = 'force-dynamic';

// POST /api/chat/upload?uploadId=...&index=N — one piece of a long voice note (raw bytes).
// The message itself is sent afterwards through POST /api/chat with the same uploadId.
export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const uploadId = searchParams.get('uploadId') || '';
    const index = Number(searchParams.get('index'));

    const declared = Number(req.headers.get('content-length') || 0);
    if (declared > PIECE_BYTES + 1024) return NextResponse.json({ message: 'Piece is too large' }, { status: 413 });
    const bytes = Buffer.from(await req.arrayBuffer());

    await saveVoicePiece({ userId: session._id, uploadId, index, bytes });
    return NextResponse.json({ ok: true, index });
  } catch (err) {
    console.error('Voice note piece error:', err.message);
    return NextResponse.json({ message: err.message || 'Could not upload the voice note' }, { status: 400 });
  }
}
