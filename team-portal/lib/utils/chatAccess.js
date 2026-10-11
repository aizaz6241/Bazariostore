import mongoose from 'mongoose';
import ChatPermission from '@/lib/models/ChatPermission';
import ChatBlock from '@/lib/models/ChatBlock';
import ChatReport from '@/lib/models/ChatReport';
import ChatMessage from '@/lib/models/ChatMessage';
import Member from '@/lib/models/Member';
import { sendPushToUser, sendPushToRole } from '@/lib/utils/push';

/**
 * WHO MAY CHAT WITH WHOM (team portal 1-on-1 chats)
 *
 *   admin  <-> anyone : always open, nothing changes
 *   member <-> member : locked until a request is approved by a partner AND accepted by the
 *                       other member (see lib/models/ChatPermission.js). A request sent by a
 *                       member to the member HE referred skips the partners.
 *
 * Every rule is checked here, on the server, for every message (text, picture, voice note,
 * edit). The screen only shows what the server allows.
 */

export const ACTIVE = ['pending_admin', 'pending_member', 'open'];
export const PENDING = ['pending_admin', 'pending_member'];
export const MAX_PENDING_PER_MEMBER = 3;
export const COOLDOWN_MS = 24 * 3600 * 1000; // after a "no", the same person cannot ask again for 24 h
export const DURATIONS = [1, 3, 7, 0]; // days; 0 = until a partner closes it

const sid = (v) => (v === null || v === undefined ? '' : String(v));

export const pairConversationId = (a, b) => `personal_${[sid(a), sid(b)].sort().join('_')}`;

/** The two member ids of a 1-on-1 conversation id ('' when it is not one). */
export function idsOfConversation(conversationId) {
  const m = /^personal_([a-f0-9]{24})_([a-f0-9]{24})$/i.exec(sid(conversationId));
  return m ? [m[1], m[2]] : null;
}

/** Push without ever breaking the request that triggered it (waits a few seconds at most). */
export async function pushSafely(promise) {
  try {
    await Promise.race([Promise.resolve(promise).catch((e) => console.error('Chat access push error:', e?.message)), new Promise((r) => setTimeout(r, 4000))]);
  } catch (_) {}
}

/**
 * A line inside the conversation itself ("Chat opened", "Chat closed"...). It reaches both
 * members at once through the realtime channel and stays as a record in the chat.
 */
export async function postSystemLine(conversationId, actor, text) {
  try {
    return await ChatMessage.create({
      chatType: 'personal',
      conversationId,
      senderId: actor._id,
      senderName: actor.name || 'Bazario',
      senderRole: actor.role === 'admin' ? 'admin' : 'member',
      messageType: 'system_alert',
      text,
      readBy: [actor._id],
    });
  } catch (e) {
    console.error('Chat system line failed:', e.message);
    return null;
  }
}

const durationText = (days) => (days > 0 ? `for ${days} day${days === 1 ? '' : 's'}` : 'until an admin closes it');

/**
 * Open chats whose time ran out are closed now (a closing line is written into each).
 * Cheap: one indexed query, and nothing is written when nothing expired.
 */
export async function expireDue(extra = {}) {
  const now = new Date();
  const due = await ChatPermission.find({ status: 'open', expiresAt: { $ne: null, $lte: now }, ...extra })
    .select('_id conversationId requesterId requesterName')
    .lean();
  for (const p of due) {
    const done = await ChatPermission.findOneAndUpdate(
      { _id: p._id, status: 'open' },
      { $set: { status: 'expired', closedAt: now, closeReason: 'expired' } },
      { new: true }
    ).lean();
    if (done) {
      await postSystemLine(p.conversationId, { _id: p.requesterId, name: 'Bazario', role: 'member' }, '⏱ Chat time is over. Old messages stay here. To talk again, send a new chat request.');
    }
  }
  return due.length;
}

/** The request that is still in play for this pair (waiting or open), if any. */
export async function activePermission(conversationId) {
  await expireDue({ conversationId });
  return ChatPermission.findOne({ conversationId, status: { $in: ACTIVE } }).sort({ createdAt: -1 }).lean();
}

/** Has either of the two blocked the other? */
export async function blockBetween(a, b) {
  return ChatBlock.findOne({
    $or: [
      { blockerId: a, blockedId: b },
      { blockerId: b, blockedId: a },
    ],
  }).lean();
}

/**
 * May `session` send a message (or edit one) in the 1-on-1 chat with `target`?
 * @returns {{ ok: boolean, message?: string, permission?: object }}
 */
export async function canSendPersonal(session, target) {
  if (!target) return { ok: false, message: 'Recipient user not found' };
  // an admin on either side: always open
  if (session.role === 'admin' || target.role === 'admin') return { ok: true };
  const conversationId = pairConversationId(session._id, target._id);
  const permission = await activePermission(conversationId);
  if (permission && permission.status === 'open') return { ok: true, permission };
  return {
    ok: false,
    locked: true,
    message:
      permission && PENDING.includes(permission.status)
        ? 'This chat is not open yet. The chat request is still waiting for an answer.'
        : 'This chat is closed. Send a chat request to talk to this member.',
  };
}

/**
 * For a MEMBER looking at his chat list: what each other member's chat looks like to him.
 *   open            messages can be sent (until `expiresAt`, or until closed)
 *   waiting_admin   he asked, a partner has not answered yet
 *   waiting_member  approved; the other member has not answered yet
 *   incoming        the other member asks him: Accept / Decline
 *   blocked         he blocked this member
 *   locked          nothing in play: "Request to chat"
 * (A request that waits for the partners is NOT shown to the person it is about.)
 */
export async function chatStatesFor(viewer, contacts) {
  const out = new Map();
  if (viewer.role === 'admin') return out;
  const me = sid(viewer._id);
  const others = contacts.filter((c) => c.role !== 'admin').map((c) => sid(c._id));
  if (others.length === 0) return out;

  await expireDue({ $or: [{ requesterId: viewer._id }, { targetId: viewer._id }] });
  const [perms, blocks] = await Promise.all([
    ChatPermission.find({
      status: { $in: ACTIVE },
      $or: [{ requesterId: viewer._id }, { targetId: viewer._id }],
    })
      .sort({ createdAt: -1 })
      .lean(),
    ChatBlock.find({ blockerId: viewer._id }).select('blockedId').lean(),
  ]);
  const blockedByMe = new Set(blocks.map((b) => sid(b.blockedId)));
  const permOf = new Map();
  for (const p of perms) {
    const other = sid(p.requesterId) === me ? sid(p.targetId) : sid(p.requesterId);
    if (!permOf.has(other)) permOf.set(other, p);
  }

  for (const other of others) {
    if (blockedByMe.has(other)) {
      out.set(other, { state: 'blocked' });
      continue;
    }
    const p = permOf.get(other);
    if (!p) {
      out.set(other, { state: 'locked' });
      continue;
    }
    const mine = sid(p.requesterId) === me;
    if (p.status === 'open') {
      out.set(other, { state: 'open', permissionId: sid(p._id), expiresAt: p.expiresAt || null });
    } else if (p.status === 'pending_admin') {
      out.set(other, mine ? { state: 'waiting_admin', permissionId: sid(p._id), reason: p.reason } : { state: 'locked' });
    } else if (p.status === 'pending_member') {
      out.set(
        other,
        mine
          ? { state: 'waiting_member', permissionId: sid(p._id), reason: p.reason }
          : { state: 'incoming', permissionId: sid(p._id), reason: p.reason, fromName: p.requesterName }
      );
    }
  }
  return out;
}

/** Counts for the badges: partners -> requests waiting for them + open reports; member -> requests waiting for him. */
export async function requestCounts(viewer) {
  if (viewer.role === 'admin') {
    const [pending, reports] = await Promise.all([
      ChatPermission.countDocuments({ status: 'pending_admin' }),
      ChatReport.countDocuments({ status: 'open' }),
    ]);
    return { pending, reports };
  }
  const incoming = await ChatPermission.countDocuments({ targetId: viewer._id, status: 'pending_member' });
  return { incoming };
}

// ───────────────────────────── actions ─────────────────────────────

const fail = (status, message) => ({ ok: false, status, message });

/** A member asks to chat with another member. */
export async function createRequest(session, { targetId, reason }) {
  if (session.role === 'admin') return fail(400, 'Admins can chat with everyone without a request.');
  if (!mongoose.Types.ObjectId.isValid(sid(targetId))) return fail(400, 'Choose who you want to chat with.');
  if (sid(targetId) === sid(session._id)) return fail(400, 'You cannot send a request to yourself.');
  const why = String(reason || '').trim().replace(/\s+/g, ' ');
  if (why.length < 3) return fail(400, 'Please write what you want to talk about.');
  if (why.length > 300) return fail(400, 'Please keep the reason under 300 characters.');

  const target = await Member.findOne({ _id: targetId, active: true }).select('name role referredBy').lean();
  if (!target) return fail(404, 'This member was not found.');
  if (target.role === 'admin') return fail(400, 'Chats with admins are always open. Just send your message.');

  if (await blockBetween(session._id, target._id)) {
    return fail(403, 'You cannot send a chat request to this member.');
  }

  const conversationId = pairConversationId(session._id, target._id);
  const active = await activePermission(conversationId);
  if (active) {
    if (active.status === 'open') return fail(409, 'This chat is already open.');
    return fail(409, 'A chat request between you two is already waiting for an answer.');
  }

  const pendingMine = await ChatPermission.countDocuments({ requesterId: session._id, status: { $in: PENDING } });
  if (pendingMine >= MAX_PENDING_PER_MEMBER) {
    return fail(429, `You already have ${MAX_PENDING_PER_MEMBER} chat requests waiting. Wait for an answer, or cancel one.`);
  }

  // after a "no" the same person cannot be asked again for 24 hours
  const lastNo = await ChatPermission.findOne({
    requesterId: session._id,
    targetId: target._id,
    status: { $in: ['rejected', 'declined'] },
  })
    .sort({ updatedAt: -1 })
    .select('updatedAt')
    .lean();
  if (lastNo && Date.now() - new Date(lastNo.updatedAt).getTime() < COOLDOWN_MS) {
    const hours = Math.ceil((COOLDOWN_MS - (Date.now() - new Date(lastNo.updatedAt).getTime())) / 3600000);
    return fail(429, `Your last request to this member was not accepted. You can ask again in about ${hours} hour${hours === 1 ? '' : 's'}.`);
  }

  // The member's own referrer: the request goes straight to the member (no partner step)
  const viaReferral = !!target.referredBy && sid(target.referredBy) === sid(session._id);

  let permission;
  try {
    permission = await ChatPermission.create({
      conversationId,
      requesterId: session._id,
      requesterName: session.name,
      targetId: target._id,
      targetName: target.name,
      reason: why,
      status: viaReferral ? 'pending_member' : 'pending_admin',
      viaReferral,
      durationDays: 0,
    });
  } catch (e) {
    return fail(500, 'Could not send the request. Please try again.');
  }
  // two requests created at the very same moment: keep the first one only
  const twins = await ChatPermission.find({ conversationId, status: { $in: ACTIVE } }).sort({ createdAt: 1, _id: 1 }).select('_id').lean();
  if (twins.length > 1 && sid(twins[0]._id) !== sid(permission._id)) {
    await ChatPermission.deleteOne({ _id: permission._id });
    return fail(409, 'A chat request between you two is already waiting for an answer.');
  }

  if (viaReferral) {
    await askTheMember(permission.toObject(), session);
  } else {
    await pushSafely(
      sendPushToRole('admin', {
        title: '🔐 Chat request',
        body: `${session.name} wants to chat with ${target.name}: “${why.slice(0, 120)}”`,
        url: '/chat?chatType=requests',
        type: 'chat_request',
        data: { chatType: 'requests' },
      })
    );
  }
  return { ok: true, permission: permission.toObject() };
}

/** The request reaches the other member: a line in their chat + a notification to him. */
async function askTheMember(p, requester) {
  await postSystemLine(p.conversationId, { _id: p.requesterId, name: p.requesterName, role: 'member' }, `📩 Chat request from ${p.requesterName}\nAbout: “${p.reason}”`);
  await pushSafely(
    sendPushToUser(p.targetId, {
      title: '💬 Chat request',
      body: `${p.requesterName} wants to chat with you about: “${String(p.reason).slice(0, 120)}” — Accept or Decline`,
      url: `/chat?chatType=personal&contactId=${sid(p.requesterId)}`,
      type: 'chat_request',
      data: { chatType: 'personal', contactId: sid(p.requesterId) },
    })
  );
}

/**
 * approve / reject (partners) — accept / decline (the other member) — cancel (the requester)
 * — close (partners, an open or waiting chat).
 */
export async function actOnRequest(session, id, { action, durationDays, note }) {
  if (!mongoose.Types.ObjectId.isValid(sid(id))) return fail(404, 'Request not found.');
  await expireDue({ _id: id });
  const p = await ChatPermission.findById(id).lean();
  if (!p) return fail(404, 'Request not found.');
  const me = sid(session._id);
  const isAdmin = session.role === 'admin';
  const now = new Date();
  const move = (from, set) => ChatPermission.findOneAndUpdate({ _id: p._id, status: { $in: [].concat(from) } }, { $set: set }, { new: true }).lean();
  const gone = fail(409, 'This request was already answered. Refresh to see where it stands.');

  if (action === 'approve') {
    if (!isAdmin) return fail(403, 'Only admins can approve chat requests.');
    const days = Number(durationDays);
    if (!DURATIONS.includes(days)) return fail(400, 'Choose how long the chat may stay open.');
    const target = await Member.findOne({ _id: p.targetId, active: true }).select('_id').lean();
    if (!target) return fail(400, 'That member is no longer active.');
    const done = await move('pending_admin', { status: 'pending_member', adminBy: session._id, adminName: session.name, adminAt: now, durationDays: days, adminNote: String(note || '').slice(0, 300) });
    if (!done) return gone;
    await askTheMember(done, null);
    return { ok: true, permission: done };
  }

  if (action === 'reject') {
    if (!isAdmin) return fail(403, 'Only admins can reject chat requests.');
    const done = await move('pending_admin', { status: 'rejected', adminBy: session._id, adminName: session.name, adminAt: now, adminNote: String(note || '').slice(0, 300) });
    if (!done) return gone;
    // the other member never knew about it: only the requester is told
    await pushSafely(
      sendPushToUser(p.requesterId, {
        title: '🔐 Chat request',
        body: `Your request to chat with ${p.targetName} was not approved.${done.adminNote ? ` Note: ${done.adminNote}` : ''}`,
        url: `/chat?chatType=personal&contactId=${sid(p.targetId)}`,
        type: 'chat_request',
        data: { chatType: 'personal', contactId: sid(p.targetId) },
      })
    );
    return { ok: true, permission: done };
  }

  if (action === 'accept' || action === 'decline') {
    if (sid(p.targetId) !== me) return fail(403, 'Only the member who was asked can answer this request.');
    if (action === 'accept') {
      if (await blockBetween(p.requesterId, p.targetId)) return fail(403, 'This chat cannot be opened.');
      const expiresAt = p.durationDays > 0 ? new Date(now.getTime() + p.durationDays * 86400000) : null;
      const done = await move('pending_member', { status: 'open', memberAt: now, openedAt: now, expiresAt });
      if (!done) return gone;
      await postSystemLine(p.conversationId, session, `✅ ${session.name} accepted. Chat is open ${durationText(p.durationDays)}.`);
      await pushSafely(
        sendPushToUser(p.requesterId, {
          title: '💬 Chat opened',
          body: `${session.name} accepted your chat request. You can message now.`,
          url: `/chat?chatType=personal&contactId=${me}`,
          type: 'chat_request',
          data: { chatType: 'personal', contactId: me },
        })
      );
      return { ok: true, permission: done };
    }
    const done = await move('pending_member', { status: 'declined', memberAt: now });
    if (!done) return gone;
    await postSystemLine(p.conversationId, session, `🚫 ${session.name} did not accept the chat request.`);
    await pushSafely(
      sendPushToUser(p.requesterId, {
        title: '💬 Chat request',
        body: `${session.name} did not accept your chat request.`,
        url: `/chat?chatType=personal&contactId=${me}`,
        type: 'chat_request',
        data: { chatType: 'personal', contactId: me },
      })
    );
    // the partners are told as well
    await pushSafely(
      sendPushToRole('admin', {
        title: '🔐 Chat request declined',
        body: `${session.name} declined ${p.requesterName}'s chat request (“${String(p.reason).slice(0, 80)}”).`,
        url: '/chat?chatType=requests',
        type: 'chat_request',
        data: { chatType: 'requests' },
      })
    );
    return { ok: true, permission: done };
  }

  if (action === 'cancel') {
    if (sid(p.requesterId) !== me) return fail(403, 'Only the member who asked can cancel this request.');
    const done = await move(PENDING, { status: 'cancelled', closedAt: now, closedBy: session._id, closedByName: session.name, closeReason: 'cancelled' });
    if (!done) return gone;
    if (p.status === 'pending_member') await postSystemLine(p.conversationId, session, `↩️ ${session.name} cancelled the chat request.`);
    return { ok: true, permission: done };
  }

  if (action === 'close') {
    if (!isAdmin) return fail(403, 'Only admins can close a chat.');
    const done = await move(ACTIVE, { status: 'closed', closedAt: now, closedBy: session._id, closedByName: session.name, closeReason: 'admin' });
    if (!done) return gone;
    if (p.status !== 'pending_admin') {
      await postSystemLine(p.conversationId, session, '🔒 This chat was closed by the admins. Old messages stay here. To talk again, send a new chat request.');
    }
    const notice = {
      title: '🔒 Chat closed',
      body: p.status === 'open' ? 'An admin closed your chat. To talk again, send a new request.' : 'An admin closed the chat request.',
      type: 'chat_request',
    };
    await pushSafely(
      Promise.all(
        (p.status === 'pending_admin' ? [p.requesterId] : [p.requesterId, p.targetId]).map((who) => {
          const other = sid(who) === sid(p.requesterId) ? sid(p.targetId) : sid(p.requesterId);
          return sendPushToUser(who, { ...notice, url: `/chat?chatType=personal&contactId=${other}`, data: { chatType: 'personal', contactId: other } });
        })
      )
    );
    return { ok: true, permission: done };
  }

  return fail(400, 'Unknown action.');
}

/** A member blocks (or unblocks) another member. Blocking also closes their chat. */
export async function setBlock(session, { targetId, block }) {
  if (session.role === 'admin') return fail(400, 'Admins do not block members.');
  if (!mongoose.Types.ObjectId.isValid(sid(targetId)) || sid(targetId) === sid(session._id)) return fail(400, 'Choose a member.');
  const target = await Member.findById(targetId).select('name role').lean();
  if (!target) return fail(404, 'This member was not found.');
  if (target.role === 'admin') return fail(400, 'Admins cannot be blocked.');

  if (!block) {
    await ChatBlock.deleteOne({ blockerId: session._id, blockedId: target._id });
    return { ok: true, blocked: false };
  }
  await ChatBlock.updateOne(
    { blockerId: session._id, blockedId: target._id },
    { $setOnInsert: { blockerName: session.name, blockedName: target.name } },
    { upsert: true }
  );
  const conversationId = pairConversationId(session._id, target._id);
  const now = new Date();
  const active = await ChatPermission.find({ conversationId, status: { $in: ACTIVE } }).lean();
  for (const p of active) {
    const done = await ChatPermission.findOneAndUpdate(
      { _id: p._id, status: p.status },
      { $set: { status: 'closed', closedAt: now, closedBy: session._id, closedByName: session.name, closeReason: 'blocked' } },
      { new: true }
    ).lean();
    if (done && p.status !== 'pending_admin') await postSystemLine(conversationId, session, '🔒 This chat is closed.');
  }
  await pushSafely(
    sendPushToRole('admin', {
      title: '⛔ Member blocked',
      body: `${session.name} blocked ${target.name} in the chat.`,
      url: '/chat?chatType=requests',
      type: 'chat_request',
      data: { chatType: 'requests' },
    })
  );
  return { ok: true, blocked: true };
}
