/**
 * Database copy logic shared by the live mirror (server) and the command-line copy script.
 * Works on two MongoDB `Db` objects (official driver). No mongoose.
 */

import { BSON } from 'mongodb';

export const ARCHIVE = 'zz_mirror_archive'; // documents that were only in the copy, kept instead of deleted
export const STATE = 'zz_mirror_state'; // where the mirror remembers how far it got
const SKIP = (name) => name.startsWith('system.') || name === ARCHIVE || name === STATE;

const BATCH = 200;
// A batch is also cut by SIZE: some documents are big (KYC photos in a seller, a voice note in a
// chat message — several MB each). 200 of them in one batch used to mean hundreds of MB in memory
// at once, more than the 512 MB server has (it was restarted "out of memory").
const MAX_BATCH_BYTES = 4 * 1024 * 1024;
const sizeOf = (doc) => {
  try {
    return BSON.calculateObjectSize(doc);
  } catch {
    return 1024 * 1024;
  }
};

/**
 * Make one collection of `dst` EXACTLY like the one in `src`:
 *  1. documents that are in the copy but not in the source are moved to the archive collection
 *  2. every source document is written to the copy (same _id, same content)
 *  3. the source indexes are created on the copy
 * Returns { name, copied, archived }.
 */
export async function syncCollection(src, dst, name) {
  const s = src.collection(name);
  const d = dst.collection(name);

  // 1. ids in the source (ids only: small even for big collections)
  const srcIds = new Set();
  for await (const doc of s.find({}, { projection: { _id: 1 }, batchSize: 1000 })) srcIds.add(keyOf(doc._id));

  // documents only in the copy → archive, then remove (keeps nothing that the source does not have)
  let archived = 0;
  const extra = [];
  let extraBytes = 0;
  // ids first (small); a document of the copy is only loaded in full when it really has to move
  for await (const doc of d.find({}, { projection: { _id: 1 }, batchSize: 1000 })) {
    if (srcIds.has(keyOf(doc._id))) continue;
    const full = await d.findOne({ _id: doc._id });
    if (!full) continue;
    extra.push(full);
    extraBytes += sizeOf(full);
    if (extra.length >= BATCH || extraBytes >= MAX_BATCH_BYTES) {
      archived += await archiveAndRemove(dst, name, extra.splice(0));
      extraBytes = 0;
    }
  }
  if (extra.length) archived += await archiveAndRemove(dst, name, extra.splice(0));

  // 2. copy every source document (replace = identical content)
  let copied = 0;
  let ops = [];
  let opsBytes = 0;
  for await (const doc of s.find({}, { batchSize: 20 })) {
    ops.push({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } });
    opsBytes += sizeOf(doc);
    if (ops.length >= BATCH || opsBytes >= MAX_BATCH_BYTES) {
      await d.bulkWrite(ops, { ordered: false });
      copied += ops.length;
      ops = [];
      opsBytes = 0;
    }
  }
  if (ops.length) {
    await d.bulkWrite(ops, { ordered: false });
    copied += ops.length;
  }

  // 3. indexes (so the copy is fast and has the same unique rules if it ever goes live)
  try {
    for (const ix of await s.listIndexes().toArray()) {
      if (ix.name === '_id_') continue;
      const { key, v, ns, ...opts } = ix;
      await d.createIndex(key, opts).catch(() => {});
    }
  } catch {}

  return { name, copied, archived };
}

async function archiveAndRemove(dst, name, docs) {
  if (!docs.length) return 0;
  const at = new Date();
  await dst.collection(ARCHIVE).insertMany(docs.map((doc) => ({ collection: name, archivedAt: at, doc })), { ordered: false });
  await dst.collection(name).deleteMany({ _id: { $in: docs.map((x) => x._id) } });
  return docs.length;
}

const keyOf = (id) => (id && typeof id === 'object' && typeof id.toHexString === 'function' ? `o:${id.toHexString()}` : `j:${JSON.stringify(id)}`);

export async function sourceCollections(src) {
  return (await src.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !SKIP(n) && !n.startsWith('system.'));
}

/** Copy the whole database. Returns a per-collection report. */
export async function syncAll(src, dst, log = () => {}) {
  const report = [];
  for (const name of await sourceCollections(src)) {
    const r = await syncCollection(src, dst, name);
    report.push(r);
    log(`  ${name}: ${r.copied} copied${r.archived ? `, ${r.archived} extra moved to ${ARCHIVE}` : ''}`);
  }
  return report;
}

/** Same number of documents in every collection? Returns the collections that differ. */
export async function compareCounts(src, dst) {
  const diff = [];
  for (const name of await sourceCollections(src)) {
    const [a, b] = await Promise.all([src.collection(name).countDocuments({}), dst.collection(name).countDocuments({})]);
    if (a !== b) diff.push({ name, source: a, copy: b });
  }
  return diff;
}

/** Copy one document from the source as it is NOW (used when a change can't be applied as a delta). */
async function copyOneFromSource(src, d, name, id) {
  if (!src) return 'skipped';
  const full = await src.collection(name).findOne({ _id: id });
  // gone in the source: it was deleted right after; its delete event follows
  if (!full) return 'gone';
  await d.replaceOne({ _id: id }, full, { upsert: true });
  return 'copied';
}

/**
 * An update as ONLY the changed fields ($set / $unset), so a small change to a big document (a
 * seller with KYC photos, a chat message with a voice note) does not send the whole document
 * again: not from Atlas to the server, and not from the server to the mirror (Render bills that
 * outbound traffic). Returns null when the change cannot be expressed safely; the caller then
 * copies the whole document from the source.
 */
export function updateAsDelta(ev) {
  const u = ev.updateDescription;
  if (!u) return null;
  // array cut short by $push/$slice etc., or a field name with a dot / number that is ambiguous
  if (u.truncatedArrays?.length) return null;
  if (u.disambiguatedPaths && Object.keys(u.disambiguatedPaths).length) return null;
  const set = u.updatedFields || {};
  const unset = {};
  for (const f of u.removedFields || []) unset[f] = '';
  const op = {};
  if (Object.keys(set).length) op.$set = set;
  if (Object.keys(unset).length) op.$unset = unset;
  return op;
}

/**
 * Apply one change-stream event to the copy. Idempotent: applying the same event twice, or an
 * older event after a newer full copy, still ends with the source's content (all later events are
 * replayed too).
 *
 * opts.src    – the source database: needed for updates that come without the full document
 * opts.delta  – the stream gives exact field paths (MongoDB 6.1+, showExpandedEvents): updates are
 *               applied as $set / $unset. Without it every update copies the whole document.
 */
export async function applyChange(dst, ev, opts = {}) {
  const name = ev.ns?.coll;
  if (!name || SKIP(name)) return;
  const d = dst.collection(name);
  switch (ev.operationType) {
    case 'insert':
    case 'replace':
      if (ev.fullDocument) await d.replaceOne({ _id: ev.documentKey._id }, ev.fullDocument, { upsert: true });
      // no fullDocument: the document was deleted right after; its delete event follows
      break;
    case 'update': {
      if (ev.fullDocument) {
        await d.replaceOne({ _id: ev.documentKey._id }, ev.fullDocument, { upsert: true });
        break;
      }
      const op = opts.delta ? updateAsDelta(ev) : null;
      if (op && !op.$set && !op.$unset) break; // nothing changed
      if (op) {
        try {
          const r = await d.updateOne({ _id: ev.documentKey._id }, op);
          if (r.matchedCount === 1) break;
          // not in the copy (should not happen): fall through to a full copy of the document
        } catch {
          // e.g. a path that does not fit the copy's shape: copy the whole document instead
        }
      }
      await copyOneFromSource(opts.src, d, name, ev.documentKey._id);
      break;
    }
    case 'delete':
      await d.deleteOne({ _id: ev.documentKey._id });
      break;
    case 'drop':
      await d.drop().catch(() => {});
      break;
    case 'rename':
      if (ev.to?.coll) await d.rename(ev.to.coll, { dropTarget: true }).catch(() => {});
      break;
    default:
      break;
  }
}
