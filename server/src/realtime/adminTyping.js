// Admin-to-admin "is typing" signal for seller / guest support chats.
//
// Only admins who can read chats (the adminRoom('chat') room) ever receive these events, and the
// typer's own devices never get their own signal. Nothing is sent to seller, guest, customer or
// conversation rooms, so a seller can never see that an admin is typing. Nothing is stored in the
// database: it is all in memory and clears itself (stop, send, disconnect, or 8 s of silence).
import { adminRoom } from '../utils/permissions.js';

const STALE_MS = 8000; // a typer that has not refreshed for this long is dropped
const REBROADCAST_MS = 2500; // a "still typing" refresh is passed on at most this often

let ioRef = null;
// conversationId -> Map(socketId -> { adminId, name, at, sentAt })
const typing = new Map();

const isConvId = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);
const cleanName = (v) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) : '';

function emitToAdmins(conversationId, adminId, name, isTyping) {
  if (!ioRef) return;
  ioRef
    .to(adminRoom('chat'))
    .except(`admin:${adminId}`) // none of the typer's own phones / laptops / tabs
    .emit('admin:typing', { conversationId, adminId, name: name || 'Admin', typing: isTyping });
}

// Is this admin still typing in this conversation from any other device?
function adminStillTyping(conversationId, adminId) {
  const m = typing.get(conversationId);
  if (!m) return false;
  for (const e of m.values()) if (e.adminId === adminId) return true;
  return false;
}

function removeEntry(conversationId, socketId) {
  const m = typing.get(conversationId);
  if (!m) return;
  const e = m.get(socketId);
  if (!e) return;
  m.delete(socketId);
  if (!m.size) typing.delete(conversationId);
  if (!adminStillTyping(conversationId, e.adminId)) emitToAdmins(conversationId, e.adminId, e.name, false);
}

// Drop everything one socket was typing (it disconnected, logged out, or moved to another chat)
function clearSocket(socketId, exceptConversationId = null) {
  for (const cid of [...typing.keys()]) {
    if (cid !== exceptConversationId) removeEntry(cid, socketId);
  }
}

// Called when an admin's reply is saved: that admin is no longer typing in that chat, on any device.
export function clearAdminTyping(adminId, conversationId) {
  const aid = String(adminId || '');
  const cid = String(conversationId || '');
  const m = typing.get(cid);
  if (!aid || !m) return;
  let name = '';
  let had = false;
  for (const [sid, e] of [...m.entries()]) {
    if (e.adminId === aid) {
      name = e.name;
      had = true;
      m.delete(sid);
    }
  }
  if (!m.size) typing.delete(cid);
  if (had) emitToAdmins(cid, aid, name, false);
}

function sweep() {
  const now = Date.now();
  for (const [cid, m] of [...typing.entries()]) {
    for (const [sid, e] of [...m.entries()]) {
      if (now - e.at > STALE_MS) removeEntry(cid, sid);
    }
  }
}

export function attachAdminTyping(io) {
  ioRef = io;
  const t = setInterval(sweep, 3000);
  if (t.unref) t.unref();
}

// Wire the events for one connection (called inside io.on('connection')).
export function registerAdminTyping(socket) {
  // Only a signed-in admin who is allowed to work on chats (never a seller session)
  const allowed = () =>
    Boolean(socket.data?.isAdmin && socket.data?.adminId && !socket.data?.isSeller && socket.rooms.has(adminRoom('chat')));

  // at most 20 typing events per 10 s from one connection; extra ones are ignored
  const hits = [];
  const tooMany = () => {
    const now = Date.now();
    while (hits.length && now - hits[0] > 10000) hits.shift();
    if (hits.length >= 20) return true;
    hits.push(now);
    return false;
  };

  socket.on('admin:typing', (body) => {
    try {
      const { conversationId, typing: isTyping, name } = body || {};
      if (!allowed() || !isConvId(conversationId)) return;
      const stop = isTyping === false;
      if (!stop && tooMany()) return;
      const adminId = String(socket.data.adminId);

      if (stop) {
        removeEntry(conversationId, socket.id);
        return;
      }

      // typing in one chat means this device is not typing anywhere else
      clearSocket(socket.id, conversationId);

      const now = Date.now();
      let m = typing.get(conversationId);
      if (!m) {
        m = new Map();
        typing.set(conversationId, m);
      }
      const prev = m.get(socket.id);
      const shown = socket.data.adminName || cleanName(name) || 'Admin';
      if (prev) {
        prev.at = now;
        if (now - prev.sentAt < REBROADCAST_MS) return;
        prev.sentAt = now;
      } else {
        m.set(socket.id, { adminId, name: shown, at: now, sentAt: now });
      }
      emitToAdmins(conversationId, adminId, shown, true);
    } catch {
      /* never let a typing signal break the socket */
    }
  });

  // Who is typing right now (asked when the chat screen opens or the connection comes back)
  socket.on('admin:typing_sync', (_body, cb) => {
    try {
      if (typeof cb !== 'function') return;
      if (!allowed()) return cb([]);
      const me = String(socket.data.adminId);
      const now = Date.now();
      const out = [];
      for (const [cid, m] of typing.entries()) {
        const seen = new Set();
        for (const e of m.values()) {
          if (e.adminId === me || seen.has(e.adminId) || now - e.at > STALE_MS) continue;
          seen.add(e.adminId);
          out.push({ conversationId: cid, adminId: e.adminId, name: e.name });
        }
      }
      cb(out);
    } catch {
      try { cb([]); } catch { /* ignore */ }
    }
  });

  socket.on('disconnect', () => clearSocket(socket.id));
}

// The socket stopped being an admin (a seller signed in on the same tab): drop its typing.
export function forgetSocketTyping(socketId) {
  clearSocket(socketId);
}
