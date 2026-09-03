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

  const db = mongoose.connection.db;
  const dbName = db.databaseName || 'bazario';
  const collectionsList = await db.listCollections().toArray();

  const backupData = {
    version: '1.0',
    format: 'bazario-ejson-v1',
    type,
    createdAt: new Date().toISOString(),
    database: dbName,
    stats: {
      collectionsCount: 0,
      documentsCount: 0,
    },
    collections: {},
  };

  let totalDocs = 0;
  let totalCollections = 0;

  for (const item of collectionsList) {
    const colName = item.name;
    // Skip system internal collections
    if (colName.startsWith('system.')) continue;

    const col = db.collection(colName);
    const docs = await col.find({}).toArray();

    backupData.collections[colName] = docs;
    totalDocs += docs.length;
    totalCollections += 1;
  }

  backupData.stats.collectionsCount = totalCollections;
  backupData.stats.documentsCount = totalDocs;

  const timestamp = formatTimestamp(new Date());
  const filename = `backup-${type}-${timestamp}.json`;
  backupData.filename = filename;

  const filePath = path.join(BACKUPS_DIR, filename);

  // Serialize using MongoDB Extended JSON to preserve exact ObjectIds, Dates, and nested types
  const serialized = EJSON.stringify(backupData, { relaxed: false });
  fs.writeFileSync(filePath, serialized, 'utf-8');

  const fileStat = fs.statSync(filePath);

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
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = EJSON.parse(raw);
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
  return { ok: true, deleted: filename };
}

/**
 * Enforce retention policy: keeps latest N hourly backups, removes older ones.
 */
export async function enforceHourlyRetention() {
  const retentionCount = await getHourlyRetentionLimit();
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

  // 1. Safety First: Take an automatic pre-restore backup
  try {
    await createBackup('prerestore');
    console.log('✅ Safety pre-restore backup created successfully before database restoration.');
  } catch (snapErr) {
    console.warn('Warning: Could not create pre-restore backup snapshot:', snapErr.message);
  }

  const db = mongoose.connection.db;
  const collectionNames = Object.keys(parsedData.collections);

  let restoredCollections = 0;
  let restoredDocuments = 0;
  const collectionDetails = {};

  for (const colName of collectionNames) {
    if (colName.startsWith('system.')) continue;

    const rawDocs = parsedData.collections[colName];
    if (!Array.isArray(rawDocs)) continue;

    const col = db.collection(colName);

    // Delete existing documents in this collection
    await col.deleteMany({});

    if (rawDocs.length > 0) {
      // Use ordered: false so if one doc has minor constraint issues, others still insert
      const res = await col.insertMany(rawDocs, { ordered: false });
      const count = res.insertedCount || rawDocs.length;
      restoredDocuments += count;
      collectionDetails[colName] = count;
    } else {
      collectionDetails[colName] = 0;
    }

    restoredCollections += 1;
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
