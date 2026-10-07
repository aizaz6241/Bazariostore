import mongoose from 'mongoose';
import Notification from '@/lib/models/Notification';

/**
 * The notification list behind the bell (see lib/models/Notification.js).
 * Nothing here may ever stop a push or a page from working: every function swallows its errors.
 */

const KEEP_DAYS = 30;
const sid = (v) => (v ? String(v) : '');

// One line per chat instead of one per message
export function groupKeyOf(payload) {
  if (payload?.groupKey) return String(payload.groupKey);
  const d = payload?.data || {};
  if ((payload?.type || d.type) !== 'chat') return '';
  if (d.chatType === 'personal' && d.contactId) return `chat:personal:${d.contactId}`;
  if (d.chatType === 'materials') return 'chat:materials';
  if (d.chatType === 'group') return 'chat:group';
  return '';
}

// The key of the chat line that belongs to a conversation, seen from one person's side
export function chatGroupKey(conversationId, myId) {
  if (conversationId === 'main_group') return 'chat:group';
  if (conversationId === 'materials_group') return 'chat:materials';
  const m = /^personal_(.+)_(.+)$/.exec(conversationId || '');
  if (!m) return '';
  const other = m[1] === sid(myId) ? m[2] : m[1];
  return `chat:personal:${other}`;
}

/**
 * Write the line(s) for a push that is about to be sent.
 * @returns {Promise<Map<string, string>>} memberId -> notification id (sent along with the push,
 *          so a tap on the phone notification can mark exactly that line as read)
 */
export async function recordNotifications(memberIds, payload) {
  const out = new Map();
  try {
    const ids = [...new Set((memberIds || []).map(sid).filter((x) => mongoose.Types.ObjectId.isValid(x)))];
    if (!ids.length || payload?.record === false) return out;

    const now = new Date();
    const base = {
      type: payload.type || payload.data?.type || 'general',
      title: String(payload.title || 'Bazario Team').slice(0, 160),
      body: String(payload.body || '').slice(0, 400),
      url: String(payload.url || payload.data?.url || '/dashboard').slice(0, 400),
      readAt: null,
      lastAt: now,
      expiresAt: new Date(now.getTime() + KEEP_DAYS * 86400000),
    };
    const groupKey = groupKeyOf(payload);

    if (groupKey) {
      const docs = await Promise.all(
        ids.map((memberId) =>
          Notification.findOneAndUpdate(
            { memberId, groupKey },
            { $set: base, $inc: { count: 1 } },
            { upsert: true, new: true, setDefaultsOnInsert: false }
          )
            .lean()
            .catch((e) => {
              console.error('[notifications] could not record a chat line:', e.message);
              return null;
            })
        )
      );
      docs.filter(Boolean).forEach((d) => out.set(sid(d.memberId), sid(d._id)));
    } else {
      const docs = await Notification.insertMany(
        ids.map((memberId) => ({ ...base, memberId, groupKey: '', count: 1 })),
        { ordered: false }
      );
      docs.forEach((d) => out.set(sid(d.memberId), sid(d._id)));
    }
  } catch (e) {
    console.error('[notifications] could not record:', e.message);
  }
  return out;
}

/** The person opened a chat: its line in the list is read now. */
export async function markChatNotificationRead(memberId, conversationId) {
  try {
    const groupKey = chatGroupKey(conversationId, memberId);
    if (!groupKey) return;
    await Notification.updateMany({ memberId, groupKey, readAt: null }, { $set: { readAt: new Date(), count: 0 } });
  } catch (e) {
    console.error('[notifications] could not mark chat as read:', e.message);
  }
}
