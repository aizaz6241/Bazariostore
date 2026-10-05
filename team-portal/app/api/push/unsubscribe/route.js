import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import connectDB from '@/lib/db';
import PushSubscription from '@/lib/models/PushSubscription';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { endpoint } = await req.json();
    if (!endpoint) {
      return NextResponse.json({ message: 'Endpoint is required' }, { status: 400 });
    }

    await connectDB();
    await PushSubscription.deleteOne({ endpoint, memberId: session._id });

    return NextResponse.json({ success: true, message: 'Unsubscribed successfully' });
  } catch (err) {
    console.error('Push unsubscribe error:', err);
    return NextResponse.json({ message: err.message || 'Failed to unsubscribe' }, { status: 500 });
  }
}
