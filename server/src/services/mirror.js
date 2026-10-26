import mongoose from 'mongoose';
import { syncAll, syncCollection, compareCounts, applyChange, STATE, ARCHIVE } from './mirrorCore.js';

/**
 * LIVE MIRROR DATABASE
 *
 * Everything written to the main database (MONGO_URI) is copied, within seconds, to a second
 * database on another Atlas account (MIRROR_MONGO_URI). If the main database ever fails, point
 * MONGO_URI at the mirror and the sites run on it.
 *
 *  1. First start: full copy (the mirror is made identical; documents that were only in the
 *     mirror are kept in `zz_mirror_archive`, never thrown away).
 *  2. Then: MongoDB change stream → every insert / edit / delete applied to the mirror.
 *  3. Restart: continues from the saved position; if that position is too old, full copy again.
 *  4. Every 6 hours: every collection's count is compared; any collection that differs is copied
 *     again, so the mirror heals itself.
 *
 * The mirror only follows the main database (one way). It is NOT protection against mistakes:
 * a wrong delete is mirrored too — that is what the encrypted cloud backups are for.
 */

const { MongoClient } = mongoose.mongo;
const CHECK_MS = 6 * 60 * 60 * 1000;

/**
 * Bandwidth: with `fullDocument: 'updateLookup'` EVERY update made Atlas send the whole document
 * to the server, and the server then sent the whole document again to the mirror (Render bills
 * that as outbound bandwidth). A big document (a seller with KYC photos, a message with a voice
 * note) changed a little = megabytes each time. On MongoDB 6.1+ the stream is now opened with
 * `showExpandedEvents`, which gives exact field paths, and updates are copied as only the changed
 * fields. Older servers (or if that option is refused) keep the old full-document way.
 */
let deltaMode = null; // null = not decided yet
async function decideDeltaMode() {
  if (deltaMode !== null) return deltaMode;
  try {
    const info = await src.admin().command({ buildInfo: 1 });
    const [maj, min] = String(info.version || '0.0').split('.').map(Number);
    deltaMode = maj > 6 || (maj === 6 && min >= 1);
  } catch {
    deltaMode = false;
  }
  console.log(`🪞 [Mirror] updates copied as ${deltaMode ? 'changed fields only' : 'whole documents'}`);
  return deltaMode;
}
const streamOptions = () => (deltaMode ? { showExpandedEvents: true } : { fullDocument: 'updateLookup' });
const optionRefused = (e) => e?.code === 40415 || /showExpandedEvents/i.test(String(e?.message || ''));

const status = {
  enabled: false,
  state: 'off', // off | starting | full-copy | live | error
  error: '',
  lastEventAt: null,
  eventsApplied: 0,
  lastFullCopyAt: null,
  lastFullCopy: null,
  lastCheckAt: null,
  lastCheckDiffs: [],
  mirrorHost: '',
};
export const mirrorStatus = () => ({ ...status });

const hostOf = (uri) => {
  try {
    return new URL(String(uri).replace(/^mongodb(\+srv)?:\/\//, 'http://')).host;
  } catch {
    return '';
  }
};
const dbNameOf = (uri, fallback) => {
  try {
    const p = new URL(String(uri).replace(/^mongodb(\+srv)?:\/\//, 'http://')).pathname.replace(/^\//, '');
    return p || fallback;
  } catch {
    return fallback;
  }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let client = null;
let src = null;
let dst = null;

async function saveState(set) {
  await dst.collection(STATE).updateOne({ _id: 'mirror' }, { $set: { ...set, updatedAt: new Date() } }, { upsert: true });
}

/** Full copy. Takes the change-stream position FIRST, so nothing written during the copy is missed. */
async function fullCopy(reason) {
  status.state = 'full-copy';
  console.log(`🪞 [Mirror] full copy started (${reason})`);
  const probe = src.watch([], { fullDocument: 'updateLookup' });
  await probe.tryNext(); // opens the stream; any event it returns is replayed later anyway
  const token = probe.resumeToken;
  await probe.close();
  await saveState({ token, fullCopyRunning: true, sourceHost: status.sourceHost });

  const report = await syncAll(src, dst, (l) => console.log(`🪞 [Mirror]${l}`));
  status.lastFullCopyAt = new Date();
  status.lastFullCopy = {
    collections: report.length,
    documents: report.reduce((t, r) => t + r.copied, 0),
    archived: report.reduce((t, r) => t + r.archived, 0),
  };
  await saveState({ fullCopyRunning: false, lastFullCopyAt: status.lastFullCopyAt, lastFullCopy: status.lastFullCopy });
  console.log(`🪞 [Mirror] full copy done: ${status.lastFullCopy.documents} documents in ${report.length} collections`);
  return token;
}

async function follow(token) {
  await decideDeltaMode();
  const stream = src.watch([], { ...streamOptions(), ...(token ? { resumeAfter: token } : {}) });
  status.state = 'live';
  status.error = '';
  let lastSave = Date.now();
  let unsaved = 0;
  try {
    for await (const ev of stream) {
      await applyChange(dst, ev, { src, delta: deltaMode });
      status.lastEventAt = new Date();
      status.eventsApplied += 1;
      unsaved += 1;
      if (unsaved >= 25 || Date.now() - lastSave > 5000) {
        await saveState({ token: stream.resumeToken });
        unsaved = 0;
        lastSave = Date.now();
      }
      if (ev.operationType === 'invalidate' || ev.operationType === 'dropDatabase') throw Object.assign(new Error('stream invalidated'), { code: 260 });
    }
  } finally {
    if (unsaved) await saveState({ token: stream.resumeToken }).catch(() => {});
    await stream.close().catch(() => {});
  }
}

const historyLost = (e) => [286, 280, 260, 136].includes(e?.code) || /resume|history|oplog/i.test(String(e?.message || ''));

async function loop() {
  for (;;) {
    try {
      const saved = await dst.collection(STATE).findOne({ _id: 'mirror' });
      let token = saved?.token || null;
      if (!saved || saved.fullCopyRunning || !saved.lastFullCopyAt || saved.sourceHost !== status.sourceHost) {
        token = await fullCopy(!saved ? 'first start' : saved.sourceHost !== status.sourceHost ? 'main database changed' : 'previous copy was interrupted');
      } else {
        status.lastFullCopyAt = saved.lastFullCopyAt;
        status.lastFullCopy = saved.lastFullCopy || null;
      }
      await follow(token);
    } catch (e) {
      status.state = 'error';
      status.error = e.message;
      console.error('🪞 [Mirror] error:', e.message);
      if (deltaMode && optionRefused(e)) {
        // this database does not accept the option: back to whole documents (nothing is lost —
        // the stream continues from the same saved position)
        deltaMode = false;
        console.warn('🪞 [Mirror] changed-fields mode not supported here: copying whole documents');
      } else if (historyLost(e)) {
        // the saved position is too old for the main database's change history: copy everything again
        await saveState({ fullCopyRunning: true }).catch(() => {});
      }
      await wait(15000);
    }
  }
}

/** Every 6 hours: counts per collection; a collection that differs is copied again. */
async function checkLoop() {
  for (;;) {
    await wait(CHECK_MS);
    if (status.state !== 'live') continue;
    try {
      const diffs = await compareCounts(src, dst);
      status.lastCheckAt = new Date();
      status.lastCheckDiffs = diffs;
      for (const d of diffs) {
        // a second look (a write may simply have been on its way), then heal
        const again = (await compareCounts(src, dst)).find((x) => x.name === d.name);
        if (again) {
          console.warn(`🪞 [Mirror] ${d.name} differs (${again.source} vs ${again.copy}): copying it again`);
          await syncCollection(src, dst, d.name);
        }
      }
      if (diffs.length) status.lastCheckDiffs = await compareCounts(src, dst);
    } catch (e) {
      console.error('🪞 [Mirror] check failed:', e.message);
    }
  }
}

export async function startMirror() {
  const uri = String(process.env.MIRROR_MONGO_URI || '').trim();
  const mainUri = String(process.env.MONGO_URI || process.env.MONGODB_URI || '').trim();
  if (!uri) return;
  status.enabled = true;
  status.state = 'starting';
  status.mirrorHost = hostOf(uri);
  status.sourceHost = hostOf(mainUri);
  if (!status.mirrorHost || status.mirrorHost === status.sourceHost) {
    status.state = 'error';
    status.error = 'MIRROR_MONGO_URI must be a DIFFERENT database than MONGO_URI';
    console.error('🪞 [Mirror] not started:', status.error);
    return;
  }
  // wait for the main connection
  while (mongoose.connection.readyState !== 1) await wait(2000);
  src = mongoose.connection.db;
  client = new MongoClient(uri, { maxPoolSize: 3, serverSelectionTimeoutMS: 20000 });
  for (;;) {
    try {
      await client.connect();
      break;
    } catch (e) {
      status.state = 'error';
      status.error = `cannot reach the mirror database: ${e.message}`;
      console.error('🪞 [Mirror]', status.error);
      await wait(30000);
    }
  }
  dst = client.db(dbNameOf(uri, src.databaseName));
  console.log(`🪞 [Mirror] main → ${status.mirrorHost}/${dst.databaseName}`);
  loop();
  checkLoop();
}

export { ARCHIVE };
