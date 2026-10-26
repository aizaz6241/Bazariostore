import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import { getSetting, setSetting } from '../models/System.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Backups folder located outside MongoDB, directly on server physical disk
export const BACKUPS_DIR = path.resolve(__dirname, '../../backups');

/**
 * How often the automatic snapshot on the Render disk is made (it was every hour).
 * Every snapshot reads the WHOLE database from Atlas. The free Atlas cluster allows 10 GB out per
 * 7 days and is slowed down after that; 24 full reads a day of a ~60–100 MB database is ~10–17 GB
 * a week. Every 6 hours = 4 reads a day. Change on Render → Environment: LOCAL_BACKUP_EVERY_HOURS
 * (1–24). The files are still named "backup-hourly-…" so older files and restore keep working.
 * The Render disk is wiped on every deploy / restart: these are quick undo points, not the safe
 * copies (those are the cloud backups, the mirror and the PC copy).
 */
export function localEveryHours() {
  const n = Number(String(process.env.LOCAL_BACKUP_EVERY_HOURS ?? '').trim() || 6);
  return Number.isFinite(n) ? Math.min(24, Math.max(1, n)) : 6;
}

export function ensureBackupDir() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

// Format date for filename: YYYY-MM-DD_HH-mm-ss
function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}-${m}-${d}_${h}-${min}-${s}`;
}

/**
 * Creates a complete database snapshot and writes it to server disk.
 * @param {'manual' | 'hourly' | 'prerestore'} type
 */
export async function createBackup(type = 'manual') {
  if (mongoose.connection.readyState !== 1) {
    try {
      const { connectDB } = await import('../index.js');
      await connectDB();
    } catch (e) {
      throw new Error(`Database is not connected. Cannot create backup (${e.message}).`);
    }
  }

  ensureBackupDir();

  // MEMORY-SAFE: the snapshot is written to the file one document at a time (database cursor →
  // file stream). It used to load EVERY collection into memory and then turn the whole thing into
  // one giant string — with chat voice notes / pictures / KYC images in the database that is
  // hundreds of MB, which on the 512 MB Render server ended in "out of memory" restarts.
  // Same file format as before (bazario-ejson-v1), so restore and download work unchanged.
  const db = mongoose.connection.db;
  const dbName = db.databaseName || 'bazario';
  const collectionsList = await db.listCollections().toArray();

  const createdAt = new Date().toISOString();
  const timestamp = formatTimestamp(new Date());
  const filename = `backup-${type}-${timestamp}.json`;
  const filePath = path.join(BACKUPS_DIR, filename);
  const tmpPath = `${filePath}.part`;

  const out = fs.createWriteStream(tmpPath, { encoding: 'utf-8' });
  const write = (chunk) =>
    new Promise((resolve, reject) => {
      if (out.write(chunk)) return resolve();
      out.once('drain', resolve);
      out.once('error', reject);
    });

  let totalDocs = 0;
  let totalCollections = 0;
  try {
    await write(`{"version":"1.0","format":"bazario-ejson-v1","type":${JSON.stringify(type)},"createdAt":${JSON.stringify(createdAt)},"database":${JSON.stringify(dbName)},"filename":${JSON.stringify(filename)},"collections":{`);
    let firstCol = true;
    for (const item of collectionsList) {
      const colName = item.name;
      // Skip system internal collections
      if (colName.startsWith('system.')) continue;
      await write(`${firstCol ? '' : ','}${JSON.stringify(colName)}:[`);
      firstCol = false;
      let firstDoc = true;
      const cursor = db.collection(colName).find({}, { batchSize: 100 });
      for await (const doc of cursor) {
        await write(`${firstDoc ? '' : ','}${EJSON.stringify(doc, { relaxed: false })}`);
        firstDoc = false;
        totalDocs += 1;
      }
      await write(']');
      totalCollections += 1;
    }
    await write(`},"stats":{"collectionsCount":${totalCollections},"documentsCount":${totalDocs}}}`);
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    out.destroy();
    try { fs.unlinkSync(tmpPath); } catch {}
    throw err;
  }

  const fileStat = fs.statSync(filePath);
  // small side file so the backup list never has to open the big file
  try {
    fs.writeFileSync(`${filePath}.meta`, JSON.stringify({ type, createdAt, database: dbName, collectionsCount: totalCollections, documentsCount: totalDocs }));
  } catch {}
  const backupData = { createdAt };

  // If this was an hourly backup, perform auto-retention cleanup
  if (type === 'hourly') {
    try {
      await enforceHourlyRetention();
    } catch (cleanErr) {
      console.error('Hourly retention cleanup warning:', cleanErr.message);
    }
  }

  return {
    filename,
    filePath,
    type,
    createdAt: backupData.createdAt,
    sizeBytes: fileStat.size,
    collectionsCount: totalCollections,
    documentsCount: totalDocs,
    database: dbName,
  };
}

/**
 * List all backup files stored in the server/backups directory with metadata
 */
export async function listBackups() {
  ensureBackupDir();

  const files = fs.readdirSync(BACKUPS_DIR).filter((f) => f.endsWith('.json'));
  const list = [];

  for (const filename of files) {
    try {
      const filePath = path.join(BACKUPS_DIR, filename);
      const stat = fs.statSync(filePath);

      let type = 'manual';
      if (filename.includes('-hourly-')) type = 'hourly';
      else if (filename.includes('-prerestore-')) type = 'prerestore';

      // Read header metadata from file without loading entire file if large
      let collectionsCount = 0;
      let documentsCount = 0;
      let createdAt = stat.mtime.toISOString();
      let dbName = 'bazario';

      try {
        // Read the small side file; a big backup file is never loaded just to list it
        const metaPath = `${filePath}.meta`;
        if (!fs.existsSync(metaPath) && stat.size > 5 * 1024 * 1024) throw new Error('no meta');
        const raw = fs.readFileSync(fs.existsSync(metaPath) ? metaPath : filePath, 'utf-8');
        const parsedRaw = EJSON.parse(raw);
        const parsed = fs.existsSync(metaPath)
          ? { type: parsedRaw.type, createdAt: parsedRaw.createdAt, database: parsedRaw.database, stats: parsedRaw }
          : parsedRaw;
        if (parsed.type) type = parsed.type;
        if (parsed.createdAt) createdAt = parsed.createdAt;
        if (parsed.database) dbName = parsed.database;
        if (parsed.stats) {
          collectionsCount = parsed.stats.collectionsCount || 0;
          documentsCount = parsed.stats.documentsCount || 0;
        } else if (parsed.collections) {
          collectionsCount = Object.keys(parsed.collections).length;
          documentsCount = Object.values(parsed.collections).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
        }
      } catch (readErr) {
        // Fallback to filename/stat
      }

      list.push({
        filename,
        type,
        createdAt,
        sizeBytes: stat.size,
        collectionsCount,
        documentsCount,
        database: dbName,
      });
    } catch (e) {
      console.error(`Error reading backup file ${filename}:`, e.message);
    }
  }

  // Sort by newest first
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}

/**
 * Safely resolves a backup file path and prevents directory traversal.
 */
export function getSafeBackupPath(filename) {
  ensureBackupDir();
  const safeName = path.basename(filename);
  if (!safeName || !safeName.endsWith('.json')) {
    throw new Error('Invalid backup filename. Must be a .json file.');
  }
  const fullPath = path.join(BACKUPS_DIR, safeName);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Backup file '${safeName}' not found on server.`);
  }
  return fullPath;
}

/**
 * Deletes a backup file from disk.
 */
export async function deleteBackupFile(filename) {
  const filePath = getSafeBackupPath(filename);
  fs.unlinkSync(filePath);
  try { fs.unlinkSync(`${filePath}.meta`); } catch {}
  return { ok: true, deleted: filename };
}

/**
 * Enforce retention policy. The setting is in HOURS ("keep the latest 48 hours"); with a snapshot
 * every N hours that is ceil(hours / N) files (48 h at every 6 h = 8 files).
 */
export async function enforceHourlyRetention() {
  const retentionCount = Math.max(1, Math.ceil((await getHourlyRetentionLimit()) / localEveryHours()));
  ensureBackupDir();

  const hourlyFiles = fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.startsWith('backup-hourly-') && f.endsWith('.json'))
    .map((filename) => {
      const filePath = path.join(BACKUPS_DIR, filename);
      const stat = fs.statSync(filePath);
      return { filename, filePath, mtime: stat.mtime };
    })
    .sort((a, b) => b.mtime - a.mtime); // Newest first

  if (hourlyFiles.length > retentionCount) {
    const toRemove = hourlyFiles.slice(retentionCount);
    for (const item of toRemove) {
      try {
        fs.unlinkSync(item.filePath);
        try { fs.unlinkSync(`${item.filePath}.meta`); } catch {}
        console.log(`[Backup Retention] Deleted old hourly backup: ${item.filename}`);
      } catch (err) {
        console.error(`[Backup Retention] Failed to delete ${item.filename}:`, err.message);
      }
    }
  }
}

/**
 * Get the configured retention limit (default 48 hours)
 */
export async function getHourlyRetentionLimit() {
  const setting = await getSetting('backup_settings', { hourlyRetention: 48, autoBackupEnabled: true });
  return setting?.hourlyRetention || 48;
}

/**
 * Get auto-backup settings
 */
export async function getBackupSettings() {
  return (await getSetting('backup_settings', {
    autoBackupEnabled: true,
    hourlyRetention: 48,
    lastHourlyBackupAt: null,
  })) || { autoBackupEnabled: true, hourlyRetention: 48, lastHourlyBackupAt: null };
}

/**
 * Update auto-backup settings
 */
export async function updateBackupSettings(newSettings) {
  const current = await getBackupSettings();
  const updated = {
    ...current,
    ...newSettings,
  };
  await setSetting('backup_settings', updated);
  return updated;
}

/**
 * Restores the entire database from parsed backup payload.
 * Takes a safety pre-restore backup first.
 */
export async function restoreDatabaseFromData(parsedData, sourceName = 'unnamed') {
  if (mongoose.connection.readyState !== 1) {
    try {
      const { connectDB } = await import('../index.js');
      await connectDB();
    } catch (e) {
      throw new Error(`Database is not connected. Cannot restore (${e.message}).`);
    }
  }

  if (!parsedData || !parsedData.collections || typeof parsedData.collections !== 'object') {
    throw new Error('Invalid backup file format: missing collections data.');
  }

  // 1. Safety First: Take an automatic pre-restore backup.
  //    If that copy cannot be made, the restore does not start at all.
  try {
    await createBackup('prerestore');
    console.log('✅ Safety pre-restore backup created successfully before database restoration.');
  } catch (snapErr) {
    throw new Error(`Restore was not started: the safety copy of the current data could not be made (${snapErr.message}). Nothing was changed.`);
  }

  const db = mongoose.connection.db;
  const collectionNames = Object.keys(parsedData.collections).filter((colName) => {
    if (colName.startsWith('system.')) return false;
    // The finance activity log is append-only: a restore never rewinds or erases it.
    if (colName === 'portalfinancelogs') return false;
    return Array.isArray(parsedData.collections[colName]);
  });

  let restoredCollections = 0;
  let restoredDocuments = 0;
  const collectionDetails = {};

  // 2. All or nothing. Before a collection is replaced, its current records are kept in memory.
  //    If anything fails part-way, every collection already replaced is put back exactly as it
  //    was, so the database is never left half old / half new.
  const undo = []; // [{ colName, previous }]
  const putBack = async () => {
    for (const { colName, previous } of undo.reverse()) {
      try {
        const col = db.collection(colName);
        await col.deleteMany({});
        if (previous.length > 0) await col.insertMany(previous, { ordered: false });
      } catch (undoErr) {
        console.error(`❌ Restore roll-back failed for "${colName}":`, undoErr.message, '— use the "prerestore" backup file to recover it.');
      }
    }
  };

  try {
    for (const colName of collectionNames) {
      const rawDocs = parsedData.collections[colName];
      const col = db.collection(colName);

      const previous = await col.find({}).toArray();
      undo.push({ colName, previous });

      // Replace the records of this collection
      await col.deleteMany({});

      if (rawDocs.length > 0) {
        const res = await col.insertMany(rawDocs, { ordered: true });
        const count = res.insertedCount ?? rawDocs.length;
        if (count !== rawDocs.length) throw new Error(`"${colName}": only ${count} of ${rawDocs.length} records could be written`);
        restoredDocuments += count;
        collectionDetails[colName] = count;
      } else {
        collectionDetails[colName] = 0;
      }

      restoredCollections += 1;
    }
  } catch (restoreErr) {
    await putBack();
    throw new Error(`Restore failed and was rolled back: the data is as it was before (${restoreErr.message}).`);
  }

  return {
    ok: true,
    source: sourceName,
    restoredAt: new Date().toISOString(),
    collectionsRestored: restoredCollections,
    documentsRestored: restoredDocuments,
    details: collectionDetails,
  };
}

/**
 * Restores the database from a backup file stored in server/backups.
 */
export async function restoreFromLocalFile(filename) {
  const filePath = getSafeBackupPath(filename);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = EJSON.parse(raw);
  return await restoreDatabaseFromData(parsed, filename);
}
