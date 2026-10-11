import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getAuthSession } from '@/lib/auth';
import ChatReport from '@/lib/models/ChatReport';
import ChatMessage from '@/lib/models/ChatMessage';
import Member from '@/lib/models/Member';
import { pairConversationId, pushSafely } from '@/lib/utils/chatAccess';
import { sendPushToRole } from '@/lib/utils/push';

export const dynamic = 'force-dynamic';

const MAX_MESSAGES = 30;

// POST /api/chat/reports { targetId, messageIds: [...], note } — a member reports messages of
// another member (from their 1-on-1 chat) to the partners. The messages are copied as they are now.
export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    if (session.role === 'admin') return NextResponse.json({ message: 'Admins can read every chat already.' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const targetId = String(body.targetId || '');
    if (!mongoose.Types.ObjectId.isValid(targetId)) return NextResponse.json({ message: 'Choose who you are reporting.' }, { status: 400 });
    const target = await Member.findById(targetId).select('name role').lean();
    if (!target || target.role === 'admin') return NextResponse.json({ message: 'Only messages of a member can be reported.' }, { status: 400 });

    const ids = [...new Set((Array.isArray(body.messageIds) ? body.messageIds : []).map(String))]
      .filter((x) => mongoose.Types.ObjectId.isValid(x))
      .slice(0, MAX_MESSAGES);
    if (ids.length === 0) return NextResponse.json({ message: 'Select at least one message to report.' }, { status: 400 });

    // the messages must really be from this chat
    const conversationId = pairConversationId(session._id, target._id);
    const docs = await ChatMessage.find({ _id: { $in: ids }, conversationId })
      .select('senderId senderName messageType text mediaLink audioDuration isDeleted createdAt')
      .sort({ createdAt: 1 })
      .lean();
    if (docs.length === 0) return NextResponse.json({ message: 'Those messages were not found in this chat.' }, { status: 400 });

    // the same person reporting again within a minute (double tap): one report
    const recent = await ChatReport.findOne({ reporterId: session._id, reportedId: target._id, createdAt: { $gt: new Date(Date.now() - 60000) } }).lean();
    if (recent) return NextResponse.json({ message: 'Report sent', reportId: recent._id });

    const report = await ChatReport.create({
      reporterId: session._id,
      reporterName: session.name,
      reportedId: target._id,
      reportedName: target.name,
      conversationId,
      note: String(body.note || '').trim().slice(0, 500),
      messages: docs.map((m) => ({
        messageId: m._id,
        senderId: m.senderId,
        senderName: m.senderName,
        messageType: m.messageType,
        text: m.isDeleted ? '(deleted)' : m.text || '',
        mediaLink: m.isDeleted ? '' : m.mediaLink || '',
        audioDuration: m.audioDuration || 0,
        sentAt: m.createdAt,
      })),
    });

    await pushSafely(
      sendPushToRole('admin', {
        title: '🚩 Chat report',
        body: `${session.name} reported ${docs.length} message${docs.length === 1 ? '' : 's'} from ${target.name}${report.note ? `: “${report.note.slice(0, 100)}”` : ''}`,
        url: '/chat?chatType=requests',
        type: 'chat_request',
        data: { chatType: 'requests' },
      })
    );
    return NextResponse.json({ message: 'Report sent', reportId: report._id }, { status: 201 });
  } catch (err) {
    console.error('Chat report error:', err);
    return NextResponse.json({ message: err.message || 'Could not send the report' }, { status: 500 });
  }
}
