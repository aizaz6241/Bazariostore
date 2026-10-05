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

    const { subscription, userAgent } = await req.json();
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return NextResponse.json({ message: 'Invalid subscription object' }, { status: 400 });
    }

    await connectDB();

    // Upsert subscription for this device endpoint
    const updated = await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        $set: {
          memberId: session._id,
          keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
          },
          userAgent: userAgent || '',
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({
      success: true,
      message: 'Push subscription registered successfully',
      id: updated._id,
    });
  } catch (err) {
    console.error('Push subscribe error:', err);
    return NextResponse.json({ message: err.message || 'Failed to save subscription' }, { status: 500 });
  }
}
