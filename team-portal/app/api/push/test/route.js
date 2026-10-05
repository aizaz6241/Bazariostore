import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { sendPushToUser } from '@/lib/utils/push';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const testType = body.type || 'message'; // 'message' or 'money'

    let payload;
    if (testType === 'money') {
      payload = {
        title: '💰 Test Deposit Alert (Rs 50,000 PKR)',
        body: 'A deposit was recorded! Notifications with sound and vibration are working perfectly.',
        url: '/wallet',
        type: 'finance',
        sound: '/sounds/cash.wav',
        vibrate: [250, 100, 250, 100, 250],
      };
    } else {
      payload = {
        title: '💬 Test Chat Message',
        body: 'Hello! Push notification with sound is working properly on your phone.',
        url: '/chat',
        type: 'chat',
        sound: '/sounds/message.wav',
        vibrate: [200, 100, 200, 100, 200],
      };
    }

    const results = await sendPushToUser(session._id, payload);

    return NextResponse.json({
      success: true,
      deliveredDevices: results.filter((r) => r.status === 'fulfilled' && r.value?.success).length,
      totalDevices: results.length,
      message: results.length
        ? 'Test notification sent to your device(s)!'
        : 'No device subscriptions found. Please enable notifications on this device first.',
    });
  } catch (err) {
    console.error('Test push error:', err);
    return NextResponse.json({ message: err.message || 'Failed to send test push' }, { status: 500 });
  }
}
