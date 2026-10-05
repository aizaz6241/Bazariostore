import webpush from 'web-push';
import connectDB from '@/lib/db';
import PushSubscription from '@/lib/models/PushSubscription';
import Member from '@/lib/models/Member';

const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  'BOjYR8QcpgCsb9JXFy8Co-6xLbOJrKmZ51sf-E4F2NlnbCZkg6KkperwMeIMAklYdgxrR4E_gFLcY-00sNemDMw';

const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY || 'Qir4j4jTDxap1IxONnfExW3_KqERktpnQFj3KMjLb1Q';

const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || 'mailto:support@bazariostore.com';

try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (e) {
  console.error('Failed to initialize web-push VAPID details:', e);
}

/**
 * Format standard payload with sound, vibration, icon, and actions.
 */
export function formatPayload({
  title = 'Bazario Team',
  body = 'New update available',
  icon = '/icons/icon-192.png',
  badge = '/icons/icon-192.png',
  url = '/dashboard',
  type = 'general',
  sound = '/sounds/notification.wav',
  vibrate = [200, 100, 200, 100, 200],
  tag = undefined,
  data = {},
}) {
  return {
    title,
    body,
    icon,
    badge,
    sound,
    vibrate,
    tag: tag || `${type}-${Date.now()}`,
    renotify: true,
    data: {
      url,
      type,
      timestamp: Date.now(),
      ...data,
    },
  };
}

/**
 * Send push to a single subscription document. If expired (404/410), deletes it.
 */
async function sendToSubscription(subDoc, payloadObj) {
  const pushSubscription = {
    endpoint: subDoc.endpoint,
    keys: {
      p256dh: subDoc.keys?.p256dh,
      auth: subDoc.keys?.auth,
    },
  };

  try {
    const stringPayload = JSON.stringify(payloadObj);
    await webpush.sendNotification(pushSubscription, stringPayload);
    return { success: true, id: subDoc._id };
  } catch (err) {
    // 410 Gone or 404 Not Found indicates subscription expired / revoked
    if (err.statusCode === 410 || err.statusCode === 404) {
      try {
        await PushSubscription.deleteOne({ _id: subDoc._id });
        console.log(`Cleaned up expired push subscription ${subDoc._id}`);
      } catch (delErr) {
        console.error('Error removing expired subscription:', delErr);
      }
    } else {
      console.error(`Push notification delivery error (${subDoc.endpoint}):`, err.message || err);
    }
    return { success: false, error: err.message, statusCode: err.statusCode };
  }
}

/**
 * Send push notification to a specific user (all their registered devices).
 */
export async function sendPushToUser(userId, payload) {
  if (!userId) return [];
  await connectDB();

  const formatted = formatPayload(payload);
  const subs = await PushSubscription.find({ memberId: userId }).lean();
  if (!subs.length) return [];

  const results = await Promise.allSettled(
    subs.map((sub) => sendToSubscription(sub, formatted))
  );
  return results;
}

/**
 * Send push notification to all users EXCEPT a specific user (e.g. sender of a group chat).
 */
export async function sendPushToAllExcept(excludeUserId, payload) {
  await connectDB();

  const formatted = formatPayload(payload);
  const query = excludeUserId ? { memberId: { $ne: excludeUserId } } : {};
  const subs = await PushSubscription.find(query).lean();
  if (!subs.length) return [];

  const results = await Promise.allSettled(
    subs.map((sub) => sendToSubscription(sub, formatted))
  );
  return results;
}

/**
 * Send push notification to all users having a specific role (e.g. 'admin').
 */
export async function sendPushToRole(role, payload) {
  await connectDB();

  const members = await Member.find({ role, active: true }).select('_id').lean();
  const memberIds = members.map((m) => m._id);
  if (!memberIds.length) return [];

  const formatted = formatPayload(payload);
  const subs = await PushSubscription.find({ memberId: { $in: memberIds } }).lean();
  if (!subs.length) return [];

  const results = await Promise.allSettled(
    subs.map((sub) => sendToSubscription(sub, formatted))
  );
  return results;
}

export { VAPID_PUBLIC_KEY };
