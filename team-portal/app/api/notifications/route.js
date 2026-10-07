import mongoose from 'mongoose';
import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import Notification from '@/lib/models/Notification';

export const dynamic = 'force-dynamic';

const LIST_SIZE = 30;

async function snapshot(memberId) {
  const [items, unread] = await Promise.all([
    Notification.find({ memberId }).sort({ lastAt: -1 }).limit(LIST_SIZE).select('type title body url groupKey count readAt lastAt').lean(),
    Notification.countDocuments({ memberId, readAt: null }),
  ]);
  return { items, unread };
}

// GET /api/notifications — this person's recent notifications (newest first) and how many are unread
export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    return NextResponse.json(await snapshot(session._id));
  } catch (err) {
    console.error('Notifications list error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}

// POST /api/notifications — mark as read: { action: 'read', ids: [...] } or { action: 'read_all' }
export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const read = { $set: { readAt: new Date(), count: 0 } };

    if (body.action === 'read_all') {
      await Notification.updateMany({ memberId: session._id, readAt: null }, read);
    } else if (body.action === 'read') {
      const ids = (Array.isArray(body.ids) ? body.ids : [body.id])
        .filter((x) => typeof x === 'string' && mongoose.Types.ObjectId.isValid(x))
        .slice(0, 100);
      // only this person's own lines
      if (ids.length) await Notification.updateMany({ _id: { $in: ids }, memberId: session._id, readAt: null }, read);
    } else {
      return NextResponse.json({ message: 'Unknown action' }, { status: 400 });
    }

    return NextResponse.json(await snapshot(session._id));
  } catch (err) {
    console.error('Notifications update error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
