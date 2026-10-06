import crypto from 'crypto';
import mongoose from 'mongoose';

/**
 * TEAM PORTAL — REALTIME CHANNEL
 *
 * The team portal runs on Vercel, which cannot keep a connection open to a browser. This server
 * can. So every open portal page connects here (socket namespace `/portal`) and this module
 * pushes to it the moment something happens:
 *
 *   chat:message   a new chat message, complete (text, and the picture / voice note itself when
 *                  it is small enough), so it is on screen without asking the portal for it
 *   chat:changed   a conversation changed in another way (read, edited, deleted, cleared):
 *                  the page asks the portal for the small update
 *   live:changed   a number on the money screens may have changed: the page re-checks
 *   rt:status      what this channel is able to deliver right now, so the page knows how much
 *                  it still has to check by itself
 *
 * FOR ADMINS ONLY (sent to nobody else, whatever a page asks for):
 *   presence:state / presence:update   who has the portal open right now, and when each
 *                                      person was last seen
 *   typing                             someone is typing, in the team group or in their
 *                                      1-on-1 chat with that admin
 *
 * How this server learns that something happened: it watches the shared database.
 *   1. "watch" mode — the database tells us (change stream). Instant.
 *   2. "tail" mode  — if the database refuses or the stream stalls, one small query every
 *                     second finds new and changed chat messages. Still far lighter than every
 *                     open page asking on its own.
 * A slow tail keeps running next to the stream as a safety net, and takes over by itself when
 * the stream misses something.
 *
 * Nothing here changes any chat or money data (it only reads). The two things it writes are a
 * small index, so its own check is cheap, and each person's "last seen" time. And nothing here is needed for the portal to work: when this channel is
 * not reachable the pages go back to checking on their own.
 *
 * Who may connect: the portal gives its signed-in user a short-lived ticket (collection
 * `portalrealtimetickets`, stored as a hash). No secret has to be shared between the two apps.
 */

const CHAT = 'portalchatmessages';
const MEMBERS = 'portalmembers';
const TICKETS = 'portalrealtimetickets';

// Collections the money screens are built from (see team-portal/lib/utils/liveVersion.js)
const LIVE_COLLECTIONS = [
  'withdrawals',
  'sellers',
  'portalfinancesplits',
  'portalwallettransactions',
  'portalrewardclaims',
  'portalsellerassignments',
  'portalfinanceapprovals',
  'portalfinancelogs',
  MEMBERS,
];

// A picture / voice note up to this size travels inside the push itself (base64 characters).
// Bigger ones are fetched by the page from the portal, as before.
const INLINE_MEDIA_MAX = 1_200_000;

const TAIL_FAST_MS = 700; // tail mode: how often the chat collection is checked
const TAIL_SAFETY_MS = 2000; // watch mode: the safety-net check
// How long one "anything new?" question may wait inside the database before it is asked again.
// Kept short on purpose: if the database is late waking a waiting question, the next one finds it.
const STREAM_AWAIT_MS = 1000;
const TAIL_OVERLAP_MS = 4000; // re-read this far back (clocks of the writers are not identical)
const STREAM_RETRY_MS = 60000; // after a stream failure, try the stream again this much later
const IDLE_STOP_MS = 60000; // nobody connected for this long: stop watching
const CHANGED_DEBOUNCE_MS = 150;
const LIVE_DEBOUNCE_MS = 700;
const MEMBER_CACHE_MS = 60000;
const OFFLINE_GRACE_MS = 5000; // a page reload or a quick tab switch is not "went offline"
const TYPING_MIN_GAP_MS = 400;

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const sid = (v) => (v === null || v === undefined ? '' : String(v));
const ms = (d) => (d ? new Date(d).getTime() || 0 : 0);

/** Small "have I seen this" memory with a size limit. */
function makeLru(max) {
  const map = new Map();
  return {
    has: (k) => map.has(k),
    get: (k) => map.get(k),
    delete: (k) => map.delete(k),
    set(k, v = true) {
      if (map.has(k)) map.delete(k);
      map.set(k, v);
      if (map.size > max) map.delete(map.keys().next().value);
    },
    entries: () => [...map.entries()],
    get size() {
      return map.size;
    },
  };
}

/** Which rooms hear about a conversation: everyone for the groups, the two people for a 1-on-1. */
export function roomsOf(conversationId) {
  const id = sid(conversationId);
  if (id.startsWith('personal_')) {
    return id
      .slice('personal_'.length)
      .split('_')
      .filter((x) => /^[a-f0-9]{24}$/i.test(x))
      .map((x) => `m:${x}`);
  }
  return ['all'];
}

/** Does this change of a watched collection matter to the money screens? */
export function liveEventMatters(coll, ev) {
  const op = ev?.operationType;
  if (op === 'insert' || op === 'delete' || op === 'replace') return true;
  if (op !== 'update') return false;
  const keys = [
    ...Object.keys(ev?.updateDescription?.updatedFields || {}),
    ...(ev?.updateDescription?.removedFields || []),
  ];
  if (coll === 'sellers') {
    // store wallets and "is this a real client store"; not orders, visits, KYC uploads...
    return keys.some((k) => k === 'wallet' || k.startsWith('wallet.') || ['isTestAccount', 'accountType', 'isPreviousStoreSeller', 'storeName'].includes(k));
  }
  if (coll === MEMBERS) {
    // not the wallet numbers the ledger itself writes, not "last login"
    return keys.some((k) => ['name', 'role', 'active', 'commissionLabel'].includes(k));
  }
  return true;
}

export function attachPortalRealtime(io, { log = console } = {}) {
  const nsp = io.of('/portal');

  const state = {
    running: false,
    mode: 'off', // 'off' | 'watch' | 'tail'
    scope: '', // 'db' (chat + money collections) | 'chat' (chat only)
    stream: null,
    tailTimer: null,
    tailBusy: false,
    cursor: 0, // newest `updatedAt` of a chat message already handled (ms)
    startedAt: 0,
    retryTimer: null,
    stopTimer: null,
    liveTimer: null,
    changedTimer: null,
    changedIds: new Set(), // message ids whose conversation still has to be looked up
    changedConvs: new Set(),
    sentIds: makeLru(4000), // messages already pushed as `chat:message`
    seen: makeLru(8000), // `${id}:${updatedAt}` already handled
    convOf: makeLru(8000), // message id -> conversation id
    unconfirmed: makeLru(500), // found by the safety tail first: the stream should report it too
    members: { at: 0, map: new Map(), loading: null },
    streamStrikes: 0,
    streamOpenedAt: 0,
    noWideStream: false, // the database refused the whole-database stream: do not ask again
    noStreamUntil: 0, // streams keep failing: stay on our own checks until this time
  };

  const db = () => mongoose.connection.db;
  const dbReady = () => mongoose.connection.readyState === 1 && !!db();

  const status = () => ({
    chat: state.running && state.mode !== 'off',
    // money screens are pushed only when the database stream covers their collections
    live: state.running && state.mode === 'watch' && state.scope === 'db',
    mode: state.mode,
  });
  const announceStatus = () => nsp.emit('rt:status', status());

  // ───────────────────────── who is who (for "seen by" bubbles) ─────────────────────────
  async function memberMap() {
    const m = state.members;
    if (Date.now() - m.at < MEMBER_CACHE_MS && m.map.size > 0) return m.map;
    if (m.loading) return m.loading;
    m.loading = db()
      .collection(MEMBERS)
      .find({}, { projection: { name: 1, username: 1, avatar: 1, role: 1 } })
      .toArray()
      .then((rows) => {
        m.map = new Map(rows.map((r) => [sid(r._id), { _id: sid(r._id), name: r.name, username: r.username, avatar: r.avatar, role: r.role }]));
        m.at = Date.now();
        return m.map;
      })
      .catch(() => m.map)
      .finally(() => {
        m.loading = null;
      });
    return m.loading;
  }

  /** The message exactly as the portal's own API sends it (ids and dates as text). */
  async function shapeMessage(doc, mediaUrl) {
    const people = await memberMap();
    const { mediaUrl: _drop, mediaKey: _key, ...rest } = doc;
    const out = JSON.parse(JSON.stringify(rest));
    out.readBy = (doc.readBy || []).map((id) => people.get(sid(id))).filter(Boolean);
    if (mediaUrl) out.mediaUrl = mediaUrl;
    return out;
  }

  // ───────────────────────── sending ─────────────────────────
  function emitTo(conversationId, event, payload) {
    const rooms = roomsOf(conversationId);
    if (rooms.length === 0) return;
    let target = nsp;
    for (const r of rooms) target = target.to(r);
    target.emit(event, payload);
  }

  async function pushNewMessage(doc, { via }) {
    const id = sid(doc._id);
    if (!id || state.sentIds.has(id)) return;
    state.sentIds.set(id);
    state.convOf.set(id, sid(doc.conversationId));
    if (via === 'tail' && state.mode === 'watch') state.unconfirmed.set(id, Date.now());

    try {
      let media = '';
      const isMedia = doc.messageType === 'image' || doc.messageType === 'voice';
      // (a picture stored outside the database travels as its link, in `mediaLink`)
      if (isMedia && !doc.isDeleted && !doc.mediaLink) {
        media = typeof doc.mediaUrl === 'string' ? doc.mediaUrl : '';
        if (!media && doc.mediaUrl === undefined) {
          // the tail reads messages without their media: get this one's now
          const full = await db().collection(CHAT).findOne({ _id: doc._id }, { projection: { mediaUrl: 1 } });
          media = full?.mediaUrl || '';
        }
        if (media.length > INLINE_MEDIA_MAX) media = '';
      }
      const message = await shapeMessage(doc, media);
      emitTo(doc.conversationId, 'chat:message', { conversationId: sid(doc.conversationId), message });
    } catch (e) {
      log.error?.('[portal-rt] push message failed:', e.message);
      // the page still gets it: tell it to ask the portal
      emitTo(doc.conversationId, 'chat:changed', { conversationId: sid(doc.conversationId) });
    }
  }

  function queueChanged(conversationId, messageId) {
    if (conversationId) state.changedConvs.add(sid(conversationId));
    else if (messageId) state.changedIds.add(sid(messageId));
    else state.changedConvs.add('*');
    if (state.changedTimer) return;
    state.changedTimer = setTimeout(flushChanged, CHANGED_DEBOUNCE_MS);
  }

  async function flushChanged() {
    state.changedTimer = null;
    const convs = new Set(state.changedConvs);
    const ids = [...state.changedIds];
    state.changedConvs.clear();
    state.changedIds.clear();

    const unknown = [];
    for (const id of ids) {
      const conv = state.convOf.get(id);
      if (conv) convs.add(conv);
      else unknown.push(id);
    }
    if (unknown.length > 0) {
      try {
        const oids = unknown.filter((x) => mongoose.Types.ObjectId.isValid(x)).map((x) => new mongoose.Types.ObjectId(x));
        const rows = await db().collection(CHAT).find({ _id: { $in: oids } }, { projection: { conversationId: 1 } }).toArray();
        for (const r of rows) {
          state.convOf.set(sid(r._id), sid(r.conversationId));
          convs.add(sid(r.conversationId));
        }
        // a message that is gone now (deleted between the event and the lookup)
        if (rows.length < unknown.length) convs.add('*');
      } catch (e) {
        convs.add('*');
      }
    }

    if (convs.has('*')) {
      // we do not know which conversation: everyone re-checks the one they have open
      nsp.emit('chat:changed', { conversationId: '' });
      return;
    }
    for (const conv of convs) emitTo(conv, 'chat:changed', { conversationId: conv });
  }

  function queueLive() {
    if (state.liveTimer) return;
    state.liveTimer = setTimeout(() => {
      state.liveTimer = null;
      nsp.emit('live:changed', { at: Date.now() });
    }, LIVE_DEBOUNCE_MS);
  }

  // ───────────────────────── 1. the database tells us (change stream) ─────────────────────────
  function onStreamEvent(ev) {
    try {
      const coll = ev?.ns?.coll;
      const op = ev?.operationType;
      if (coll === CHAT) {
        const id = sid(ev.documentKey?._id);
        if (op === 'insert' && ev.fullDocument) {
          const doc = ev.fullDocument;
          state.seen.set(`${id}:${ms(doc.updatedAt)}`);
          state.unconfirmed.delete(id);
          if (ms(doc.updatedAt) > state.cursor) state.cursor = ms(doc.updatedAt);
          pushNewMessage(doc, { via: 'watch' });
        } else if (op === 'update' || op === 'replace') {
          const at = ms(ev.updateDescription?.updatedFields?.updatedAt || ev.fullDocument?.updatedAt);
          if (at) {
            state.seen.set(`${id}:${at}`);
            if (at > state.cursor) state.cursor = at;
          }
          queueChanged(state.convOf.get(id) || '', id);
        } else if (op === 'delete') {
          // a cleared chat: the event no longer says which conversation it was
          queueChanged(state.convOf.get(id) || '', state.convOf.get(id) ? '' : null);
        }
        return;
      }
      if (LIVE_COLLECTIONS.includes(coll) && liveEventMatters(coll, ev)) queueLive();
    } catch (e) {
      log.error?.('[portal-rt] stream event failed:', e.message);
    }
  }

  function closeStream() {
    const s = state.stream;
    state.stream = null;
    if (s) {
      try {
        s.removeAllListeners();
        s.on('error', () => {});
        s.close().catch(() => {});
      } catch (e) {}
    }
  }

  function streamFailed(why) {
    if (!state.running) return;
    log.warn?.(`[portal-rt] database stream stopped (${why}); checking by itself for now`);
    // A stream that fails right after opening is one the database does not really support.
    const diedYoung = Date.now() - state.streamOpenedAt < 30000;
    const wasWide = state.scope === 'db';
    closeStream();
    setMode('tail', '');
    let retryIn = STREAM_RETRY_MS;
    if (diedYoung && wasWide && !state.noWideStream) {
      state.noWideStream = true; // try again with chat only, soon
      retryIn = 2000;
    } else if (diedYoung) {
      state.noStreamUntil = Date.now() + STREAM_RETRY_MS * 10;
      retryIn = STREAM_RETRY_MS * 10;
    }
    clearTimeout(state.retryTimer);
    state.retryTimer = setTimeout(() => {
      if (state.running && state.mode === 'tail') openStream();
    }, retryIn);
  }

  function openStreamWith(target, scope, pipeline) {
    return new Promise((resolve) => {
      let settled = false;
      let stream;
      const done = (ok, why) => {
        if (settled) return;
        settled = true;
        resolve({ ok, stream, why });
      };
      try {
        stream = target.watch(pipeline, { maxAwaitTimeMS: STREAM_AWAIT_MS });
      } catch (e) {
        return done(false, e.message);
      }
      // The stream is opened lazily: an "unsupported" answer comes as an error event. Give it a
      // moment; no error within that time means the database accepted it.
      const timer = setTimeout(() => done(true), 2500);
      stream.on('error', (e) => {
        clearTimeout(timer);
        if (!settled) return done(false, e.message);
        if (state.stream === stream) streamFailed(e.message);
      });
      stream.on('close', () => {
        if (settled && state.stream === stream) streamFailed('closed');
      });
      stream.on('change', (ev) => onStreamEvent(ev));
    });
  }

  async function openStream() {
    if (!state.running || !dbReady()) return;
    closeStream();

    // Whole database, only the collections we care about; heavy fields are left out.
    const wide = [
      { $match: { 'ns.coll': { $in: [CHAT, ...LIVE_COLLECTIONS] } } },
      { $project: { 'fullDocument.kycDocuments': 0, 'updateDescription.updatedFields.kycDocuments': 0 } },
    ];
    if (Date.now() < state.noStreamUntil) return;
    let res = state.noWideStream ? { ok: false, why: 'not supported' } : await openStreamWith(db(), 'db', wide);
    let scope = 'db';
    if (!res.ok) {
      state.noWideStream = true;
      try {
        res.stream?.removeAllListeners();
        res.stream?.on('error', () => {});
        res.stream?.close().catch(() => {});
      } catch (e) {}
      const firstWhy = res.why;
      // Chat only (the money screens then keep checking on their own)
      res = await openStreamWith(db().collection(CHAT), 'chat', []);
      scope = 'chat';
      if (!res.ok) {
        try {
          res.stream?.removeAllListeners();
          res.stream?.on('error', () => {});
          res.stream?.close().catch(() => {});
        } catch (e) {}
        log.warn?.(`[portal-rt] database stream not available (${firstWhy} / ${res.why}); checking by itself`);
        setMode('tail', '');
        clearTimeout(state.retryTimer);
        state.retryTimer = setTimeout(() => {
          if (state.running && state.mode === 'tail') openStream();
        }, STREAM_RETRY_MS * 5);
        return;
      }
    }
    if (!state.running) {
      try {
        res.stream.close().catch(() => {});
      } catch (e) {}
      return;
    }
    state.stream = res.stream;
    state.streamOpenedAt = Date.now();
    state.streamStrikes = 0;
    setMode('watch', scope);
    log.log?.(`[portal-rt] live: database stream (${scope === 'db' ? 'chat + money screens' : 'chat only'})`);
  }

  // ───────────────────────── 2. we look ourselves (tail) ─────────────────────────
  async function tailOnce() {
    if (!state.running || state.tailBusy || !dbReady()) return;
    state.tailBusy = true;
    try {
      const since = new Date(Math.max(state.cursor - TAIL_OVERLAP_MS, 0));
      const rows = await db()
        .collection(CHAT)
        .find({ updatedAt: { $gt: since } }, { projection: { mediaUrl: 0 } })
        .sort({ updatedAt: 1 })
        .limit(200)
        .toArray();

      for (const doc of rows) {
        const id = sid(doc._id);
        const at = ms(doc.updatedAt);
        const key = `${id}:${at}`;
        if (at > state.cursor) state.cursor = at;
        if (state.seen.has(key)) continue;
        state.seen.set(key);
        state.convOf.set(id, sid(doc.conversationId));

        const isNew = !state.sentIds.has(id) && ms(doc.createdAt) >= state.startedAt - TAIL_OVERLAP_MS;
        if (isNew) {
          await pushNewMessage(doc, { via: 'tail' });
          // already read / edited by the time we saw it: the page picks that up too
          if (Math.abs(at - ms(doc.createdAt)) > 5) queueChanged(doc.conversationId);
        } else {
          queueChanged(doc.conversationId);
        }
      }

      // Safety net: a message the tail found that the stream never reported means the stream
      // is not delivering. Stop trusting it.
      if (state.mode === 'watch') {
        const now = Date.now();
        for (const [id, foundAt] of state.unconfirmed.entries()) {
          if (now - foundAt < 3000) continue;
          state.unconfirmed.delete(id);
          state.streamStrikes += 1;
        }
        if (state.streamStrikes >= 2) streamFailed('missed messages');
      }
    } catch (e) {
      log.error?.('[portal-rt] tail check failed:', e.message);
    } finally {
      state.tailBusy = false;
    }
  }

  function scheduleTail() {
    clearTimeout(state.tailTimer);
    if (!state.running) return;
    const wait = state.mode === 'watch' ? TAIL_SAFETY_MS : TAIL_FAST_MS;
    state.tailTimer = setTimeout(async () => {
      await tailOnce();
      scheduleTail();
    }, wait);
  }

  function setMode(mode, scope) {
    const before = JSON.stringify(status());
    state.mode = mode;
    state.scope = scope;
    if (state.running) scheduleTail();
    if (JSON.stringify(status()) !== before) announceStatus();
  }

  // ───────────────────────── start / stop with the audience ─────────────────────────
  async function start() {
    clearTimeout(state.stopTimer);
    state.stopTimer = null;
    if (state.running) return;
    if (!dbReady()) return;
    state.running = true;
    state.startedAt = Date.now();
    // The check below asks "what changed since a moment ago". With this index the database
    // answers from a short list instead of reading every message (and its picture).
    db()
      .collection(CHAT)
      .createIndex({ updatedAt: -1 })
      .catch((e) => log.warn?.('[portal-rt] could not add the chat index:', e.message));
    try {
      // start from "now": what is already in the database is not news
      const newest = await db().collection(CHAT).find({}, { projection: { updatedAt: 1 } }).sort({ updatedAt: -1 }).limit(1).toArray();
      state.cursor = Math.max(ms(newest[0]?.updatedAt), state.startedAt - TAIL_OVERLAP_MS);
      const recent = await db()
        .collection(CHAT)
        .find({ updatedAt: { $gt: new Date(state.cursor - TAIL_OVERLAP_MS) } }, { projection: { updatedAt: 1, conversationId: 1 } })
        .toArray();
      for (const r of recent) {
        state.seen.set(`${sid(r._id)}:${ms(r.updatedAt)}`);
        state.sentIds.set(sid(r._id));
        state.convOf.set(sid(r._id), sid(r.conversationId));
      }
    } catch (e) {
      state.cursor = state.startedAt;
    }
    setMode('tail', ''); // delivering from the first second; the stream takes over when it opens
    openStream().catch((e) => log.error?.('[portal-rt] open stream failed:', e.message));
  }

  function stop() {
    state.running = false;
    clearTimeout(state.tailTimer);
    clearTimeout(state.retryTimer);
    clearTimeout(state.liveTimer);
    clearTimeout(state.changedTimer);
    state.liveTimer = null;
    state.changedTimer = null;
    closeStream();
    state.mode = 'off';
    state.scope = '';
  }

  function audienceChanged() {
    if (nsp.sockets.size > 0) {
      start().catch((e) => log.error?.('[portal-rt] start failed:', e.message));
    } else if (state.running && !state.stopTimer) {
      state.stopTimer = setTimeout(() => {
        state.stopTimer = null;
        if (nsp.sockets.size === 0) stop();
      }, IDLE_STOP_MS);
    }
  }

  // the database connection came back: begin again from a clean state
  mongoose.connection.on('connected', () => {
    if (nsp.sockets.size > 0 && !state.running) audienceChanged();
  });
  mongoose.connection.on('disconnected', () => {
    if (state.running) {
      stop();
      announceStatus();
    }
  });

  // ───────────────────────── who is here (admins only) ─────────────────────────
  // "Online" = has a portal page open and in front of them. Told to admin pages only.
  const presence = { online: new Set(), lastSeen: new Map(), offTimers: new Map() };

  const isHere = (memberId) => {
    for (const s of nsp.sockets.values()) {
      if (s.data.memberId === memberId && s.data.visible !== false) return true;
    }
    return false;
  };

  function presenceChanged(memberId) {
    if (!memberId) return;
    if (isHere(memberId)) {
      clearTimeout(presence.offTimers.get(memberId));
      presence.offTimers.delete(memberId);
      if (!presence.online.has(memberId)) {
        presence.online.add(memberId);
        nsp.to('admins').emit('presence:update', { memberId, online: true, lastSeenAt: presence.lastSeen.get(memberId) || 0 });
      }
      return;
    }
    if (!presence.online.has(memberId) || presence.offTimers.has(memberId)) return;
    presence.offTimers.set(
      memberId,
      setTimeout(() => {
        presence.offTimers.delete(memberId);
        if (isHere(memberId)) return;
        presence.online.delete(memberId);
        const at = Date.now();
        presence.lastSeen.set(memberId, at);
        nsp.to('admins').emit('presence:update', { memberId, online: false, lastSeenAt: at });
        // remembered in the account, so it is still known after this server restarts
        if (dbReady() && mongoose.Types.ObjectId.isValid(memberId)) {
          db()
            .collection(MEMBERS)
            .updateOne({ _id: new mongoose.Types.ObjectId(memberId) }, { $set: { lastSeenAt: new Date(at) } })
            .catch(() => {});
        }
      }, OFFLINE_GRACE_MS)
    );
  }

  async function sendPresenceState(socket) {
    const lastSeen = {};
    try {
      const rows = await db().collection(MEMBERS).find({}, { projection: { lastSeenAt: 1 } }).toArray();
      for (const r of rows) {
        const at = Math.max(ms(r.lastSeenAt), presence.lastSeen.get(sid(r._id)) || 0);
        if (at) lastSeen[sid(r._id)] = at;
      }
    } catch (e) {
      for (const [id, at] of presence.lastSeen) lastSeen[id] = at;
    }
    socket.emit('presence:state', { online: [...presence.online], lastSeen });
  }

  // "X is typing": passed on to admins only.
  //   team group      -> every admin
  //   1-on-1          -> the other person of that chat, and only if that person is an admin
  function relayTyping(socket, payload) {
    const me = socket.data.memberId;
    const conversationId = sid(payload?.conversationId);
    const typing = payload?.typing !== false;
    const now = Date.now();
    if (typing) {
      if (now - (socket.data.typingAt || 0) < TYPING_MIN_GAP_MS) return;
      socket.data.typingAt = now;
    }
    const out = { conversationId, memberId: me, name: socket.data.name || '', typing };
    if (conversationId === 'main_group') {
      socket.to('admins').emit('typing', out);
      return;
    }
    if (!conversationId.startsWith('personal_')) return;
    const ids = conversationId.slice('personal_'.length).split('_');
    if (ids.length !== 2 || !ids.includes(me)) return; // not this person's conversation
    const other = ids.find((x) => x !== me);
    if (!other) return;
    for (const s of nsp.sockets.values()) {
      if (s.data.memberId === other && s.data.role === 'admin') s.emit('typing', out);
    }
  }

  // ───────────────────────── who may connect ─────────────────────────
  nsp.use(async (socket, next) => {
    try {
      const ticket = socket.handshake?.auth?.ticket;
      if (typeof ticket !== 'string' || !/^[a-f0-9]{32,128}$/.test(ticket)) return next(new Error('unauthorized'));
      if (!dbReady()) return next(new Error('unavailable'));

      const row = await db().collection(TICKETS).findOne({ _id: sha256(ticket) });
      if (!row || !row.memberId || ms(row.expiresAt) < Date.now()) return next(new Error('unauthorized'));

      const member = await db()
        .collection(MEMBERS)
        .findOne({ _id: row.memberId, active: { $ne: false } }, { projection: { role: 1, name: 1 } });
      if (!member) return next(new Error('unauthorized'));

      socket.data.memberId = sid(member._id);
      socket.data.role = member.role === 'admin' ? 'admin' : 'member';
      socket.data.name = String(member.name || '').slice(0, 80);
      socket.data.visible = true;
      next();
    } catch (e) {
      next(new Error('unavailable'));
    }
  });

  nsp.on('connection', (socket) => {
    socket.join('all');
    socket.join(`m:${socket.data.memberId}`);
    audienceChanged();
    socket.emit('rt:status', status());

    const memberId = socket.data.memberId;
    if (socket.data.role === 'admin') {
      socket.join('admins');
      sendPresenceState(socket);
    }
    presenceChanged(memberId);
    // the page tells us when it goes to the background / comes back
    socket.on('rt:visible', (visible) => {
      socket.data.visible = visible !== false;
      presenceChanged(memberId);
    });
    socket.on('typing', (payload) => {
      try {
        relayTyping(socket, payload);
      } catch (e) {}
    });

    socket.on('disconnect', () =>
      setTimeout(() => {
        audienceChanged();
        presenceChanged(memberId);
      }, 0)
    );
    // The page may ask where things stand (after its phone woke up, for example)
    socket.on('rt:hello', (cb) => {
      if (typeof cb === 'function') cb(status());
    });
  });

  return { namespace: nsp, status, stop, _state: state, _tailOnce: tailOnce, _presence: presence };
}

export default attachPortalRealtime;
