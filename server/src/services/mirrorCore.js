/**
 * Database copy logic shared by the live mirror (server) and the command-line copy script.
 * Works on two MongoDB `Db` objects (official driver). No mongoose.
 */

export const ARCHIVE = 'zz_mirror_archive'; // documents that were only in the copy, kept instead of deleted
export const STATE = 'zz_mirror_state'; // where the mirror remembers how far it got
const SKIP = (name) => name.startsWith('system.') || name === ARCHIVE || name === STATE;

const BATCH = 200;

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
  for await (const doc of d.find({}, { batchSize: 500 })) {
    if (srcIds.has(keyOf(doc._id))) continue;
    extra.push(doc);
    if (extra.length >= BATCH) archived += await archiveAndRemove(dst, name, extra.splice(0));
  }
  if (extra.length) archived += await archiveAndRemove(dst, name, extra.splice(0));

  // 2. copy every source document (replace = identical content)
  let copied = 0;
  let ops = [];
  for await (const doc of s.find({}, { batchSize: BATCH })) {
    ops.push({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } });
    if (ops.length >= BATCH) {
      await d.bulkWrite(ops, { ordered: false });
      copied += ops.length;
      ops = [];
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

/**
 * Apply one change-stream event to the copy. Idempotent: applying the same event twice, or an
 * older event after a newer full copy, still ends with the source's content.
 */
export async function applyChange(dst, ev) {
  const name = ev.ns?.coll;
  if (!name || SKIP(name)) return;
  const d = dst.collection(name);
  switch (ev.operationType) {
    case 'insert':
    case 'replace':
    case 'update':
      if (ev.fullDocument) await d.replaceOne({ _id: ev.documentKey._id }, ev.fullDocument, { upsert: true });
      // no fullDocument: the document was deleted right after; its delete event follows
      break;
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
