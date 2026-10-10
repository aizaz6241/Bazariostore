import webpush from 'web-push';
import connectDB from '@/lib/db';
import PushSubscription from '@/lib/models/PushSubscription';
import Member from '@/lib/models/Member';
import { recordNotifications } from '@/lib/utils/notifications';

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
async function sendToSubscription(subDoc, payloadObj, notificationIds) {
  // The id of this person's line in the notification list travels with the push, so a tap on
  // the phone notification can mark that exact line as read.
  const nid = notificationIds?.get(String(subDoc.memberId));
  if (nid) payloadObj = { ...payloadObj, data: { ...payloadObj.data, nid } };

  const pushSubscription = {
    endpoint: subDoc.endpoint,
    keys: {
      p256dh: subDoc.keys?.p256dh,
      auth: subDoc.keys?.auth,
    },
  };

  try {
    const stringPayload = JSON.stringify(payloadObj);
    // high urgency + 1 day TTL: delivered at once, also to a sleeping phone (iPhone)
    await webpush.sendNotification(pushSubscription, stringPayload, { TTL: 86400, urgency: 'high' });
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
async function sendPushToUserNow(userId, payload) {
  if (!userId) return [];
  await connectDB();

  const formatted = formatPayload(payload);
  // Also kept in the person's notification list (the bell), with or without a subscribed device
  const noted = await recordNotifications([userId], payload);
  const subs = await PushSubscription.find({ memberId: userId }).lean();
  if (!subs.length) return [];

  const results = await Promise.allSettled(
    subs.map((sub) => sendToSubscription(sub, formatted, noted))
  );
  return results;
}

/**
 * Send push notification to all users EXCEPT a specific user (e.g. sender of a group chat).
 */
async function sendPushToAllExceptNow(excludeUserId, payload) {
  await connectDB();

  const formatted = formatPayload(payload);
  let noted = new Map();
  try {
    const people = await Member.find(excludeUserId ? { active: true, _id: { $ne: excludeUserId } } : { active: true })
      .select('_id')
      .lean();
    noted = await recordNotifications(people.map((m) => m._id), payload);
  } catch (e) {
    console.error('Notification list error:', e.message);
  }
  const query = excludeUserId ? { memberId: { $ne: excludeUserId } } : {};
  const subs = await PushSubscription.find(query).lean();
  if (!subs.length) return [];

  const results = await Promise.allSettled(
    subs.map((sub) => sendToSubscription(sub, formatted, noted))
  );
  return results;
}

/**
 * Send push notification to all users having a specific role (e.g. 'admin').
 */
async function sendPushToRoleNow(role, payload) {
  await connectDB();

  const members = await Member.find({ role, active: true }).select('_id').lean();
  const memberIds = members.map((m) => m._id);
  if (!memberIds.length) return [];

  const formatted = formatPayload(payload);
  const noted = await recordNotifications(memberIds, payload);
  const subs = await PushSubscription.find({ memberId: { $in: memberIds } }).lean();
  if (!subs.length) return [];

  const results = await Promise.allSettled(
    subs.map((sub) => sendToSubscription(sub, formatted, noted))
  );
  return results;
}

export { VAPID_PUBLIC_KEY };


// ─── Keep the serverless function alive until the push is really sent ───
// On Vercel a promise that is not awaited is frozen as soon as the response goes out, so a push
// was sometimes sent only when the next request woke the function up (= "notification arrives
// when I open the portal"). waitUntil() keeps the function running until the push is delivered.
// (Same hook @vercel/functions uses; outside Vercel it is simply not there.)
function keepAlive(promise) {
  try {
    const ctx = globalThis[Symbol.for('@vercel/request-context')]?.get?.();
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(promise.catch(() => {}));
  } catch {}
  return promise;
}

export function sendPushToUser(userId, payload) {
  return keepAlive(sendPushToUserNow(userId, payload));
}
export function sendPushToAllExcept(excludeUserId, payload) {
  return keepAlive(sendPushToAllExceptNow(excludeUserId, payload));
}
export function sendPushToRole(role, payload) {
  return keepAlive(sendPushToRoleNow(role, payload));
}
