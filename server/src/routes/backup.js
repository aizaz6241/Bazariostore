import { Router } from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import { authAdmin } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { finLog } from '../utils/financeLog.js';
import {
  createBackup,
  listBackups,
  getSafeBackupPath,
  deleteBackupFile,
  restoreFromLocalFile,
  restoreDatabaseFromData,
  getBackupSettings,
  updateBackupSettings,
  localEveryHours,
} from '../services/backup.service.js';
import { runCloudBackup, listCloudBackups, cloudBackupReady, cloudBackupInfo } from '../services/cloudBackup.js';
import { mirrorStatus } from '../services/mirror.js';

const router = Router();

// Memory upload handler for restore file upload (up to 100MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

// All backup operations require admin 'settings' or 'backup' permission
const checkBackupAuth = authAdmin('backup');

// Restoring replaces the whole database (accounts, finance log, everything) with an older copy,
// so only the Super Admin / Owner may do it.
const superAdminOnly = (req, res, next) => {
  if (req.admin?.role !== 'super_admin') {
    finLog(req, { action: 'backup.restore_blocked', summary: `Tried to ${req.method === 'GET' ? 'download a backup file' : req.method === 'DELETE' ? 'delete a backup file' : 'restore the database from a backup'}, refused (Super Admin only)`, entity: 'system' });
    return res.status(403).json({ message: 'Only the Super Admin can restore, download or delete database backups.' });
  }
  next();
};

/**
 * GET /stats - Returns database health & backup overview
 */
router.get('/stats', checkBackupAuth, async (req, res) => {
  try {
    const isConnected = mongoose.connection.readyState === 1;
    let collectionsCount = 0;
    let documentsCount = 0;
    let dbName = 'bazario';
    // Size as the free Atlas cluster counts it (data + indexes, limit 512 MB) and the biggest
    // collections — the ones that make every backup / copy heavy
    let dbSize = null;
    const biggest = [];

    if (isConnected) {
      const db = mongoose.connection.db;
      dbName = db.databaseName || 'bazario';
      const cols = await db.listCollections().toArray();
      collectionsCount = cols.filter((c) => !c.name.startsWith('system.')).length;

      for (const c of cols) {
        if (!c.name.startsWith('system.')) {
          try {
            documentsCount += await db.collection(c.name).countDocuments();
          } catch {}
          try {
            const [s] = await db.collection(c.name).aggregate([{ $collStats: { storageStats: {} } }]).toArray();
            if (s?.storageStats) biggest.push({ name: c.name, bytes: Number(s.storageStats.size || 0), count: Number(s.storageStats.count || 0) });
          } catch {}
        }
      }
      try {
        const st = await db.stats();
        dbSize = { dataBytes: Number(st.dataSize || 0), indexBytes: Number(st.indexSize || 0), limitBytes: 512 * 1024 * 1024 };
      } catch {}
      biggest.sort((a, b) => b.bytes - a.bytes);
    }

    const backups = await listBackups();
    const totalBytes = backups.reduce((sum, b) => sum + (b.sizeBytes || 0), 0);
    const settings = await getBackupSettings();

    res.json({
      connected: isConnected,
      databaseName: dbName,
      collectionsCount,
      documentsCount,
      backupsCount: backups.length,
      totalDiskBytes: totalBytes,
      latestBackup: backups[0] || null,
      settings,
      localEveryHours: localEveryHours(),
      dbSize,
      biggestCollections: biggest.slice(0, 6),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /list - Returns all available backups with timestamps & sizes
 */
router.get('/list', checkBackupAuth, async (req, res) => {
  try {
    const backups = await listBackups();
    res.json({ ok: true, backups });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /create - Triggers an immediate manual snapshot
 */
router.post('/create', checkBackupAuth, async (req, res) => {
  try {
    const backup = await createBackup('manual');
    await audit(req, 'backup_created', 'system', backup.filename, {
      type: 'manual',
      collectionsCount: backup.collectionsCount,
      documentsCount: backup.documentsCount,
      sizeBytes: backup.sizeBytes,
    });
    res.json({ ok: true, message: 'Backup created successfully', backup });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /download/:filename - Streams backup file directly to admin
 */
// A backup file holds the whole database (every account, every record): Super Admin only
router.get('/download/:filename', checkBackupAuth, superAdminOnly, (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = getSafeBackupPath(filename);
    res.download(filePath, filename);
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
});

/**
 * DELETE /:filename - Deletes an old backup file
 */
router.delete('/:filename', checkBackupAuth, superAdminOnly, async (req, res) => {
  try {
    const filename = req.params.filename;
    await deleteBackupFile(filename);
    await audit(req, 'backup_deleted', 'system', filename);
    await finLog(req, { action: 'backup.deleted', summary: `Deleted the backup file “${filename}”`, entity: 'system', before: { file: filename } });
    res.json({ ok: true, message: `Backup '${filename}' deleted.` });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/**
 * POST /restore/:filename - Restores database from a server-side backup snapshot
 */
router.post('/restore/:filename', checkBackupAuth, superAdminOnly, async (req, res) => {
  try {
    const filename = req.params.filename;
    const result = await restoreFromLocalFile(filename);
    await audit(req, 'database_restored', 'system', filename, {
      collectionsRestored: result.collectionsRestored,
      documentsRestored: result.documentsRestored,
    });
    await finLog(req, {
      action: 'backup.restored',
      summary: `Restored the whole database from the backup “${filename}” (${result.documentsRestored} records)`,
      entity: 'system',
      after: { file: filename, collections: result.collectionsRestored, documents: result.documentsRestored },
    });
    res.json({ ok: true, message: 'Database restored successfully!', result });
  } catch (err) {
    res.status(500).json({ message: `Restore failed: ${err.message}` });
  }
});

/**
 * POST /upload-restore - Restores database from an uploaded JSON backup file
 */
router.post('/upload-restore', checkBackupAuth, superAdminOnly, upload.single('backupFile'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: 'No backup file uploaded.' });
    }

    const text = req.file.buffer.toString('utf-8');
    let parsed;
    try {
      parsed = EJSON.parse(text);
    } catch (parseErr) {
      return res.status(400).json({ message: `Invalid JSON/EJSON file: ${parseErr.message}` });
    }

    const result = await restoreDatabaseFromData(parsed, req.file.originalname);
    await audit(req, 'database_restored_upload', 'system', req.file.originalname, {
      collectionsRestored: result.collectionsRestored,
      documentsRestored: result.documentsRestored,
    });
    await finLog(req, {
      action: 'backup.restored',
      summary: `Restored the whole database from an uploaded file “${req.file.originalname}” (${result.documentsRestored} records)`,
      entity: 'system',
      after: { file: req.file.originalname, collections: result.collectionsRestored, documents: result.documentsRestored },
    });

    res.json({ ok: true, message: 'Database restored from uploaded file successfully!', result });
  } catch (err) {
    res.status(500).json({ message: `Restore failed: ${err.message}` });
  }
});

// ─── Live mirror database status ───
router.get('/mirror', checkBackupAuth, (req, res) => res.json(mirrorStatus()));

// ─── Cloud backups (encrypted, kept on UploadThing — outside the Render server) ───
router.get('/cloud', checkBackupAuth, async (req, res) => {
  try {
    const list = await listCloudBackups();
    const info = await cloudBackupInfo(list).catch(() => ({}));
    res.json({
      ready: cloudBackupReady(),
      ...info,
      backups: list.map((b) => ({ id: String(b._id), name: b.name, size: b.size, rawSize: b.rawSize, documentsCount: b.documentsCount, createdAt: b.createdAt, reason: b.reason })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/cloud/run', checkBackupAuth, async (req, res) => {
  try {
    const doc = await runCloudBackup(`manual by ${req.admin?.name || 'admin'}`);
    await audit(req, 'cloud_backup', 'system', doc.name, { size: doc.size, documents: doc.documentsCount });
    res.json({ ok: true, message: `Cloud backup stored: ${doc.name}`, backup: { name: doc.name, size: doc.size } });
  } catch (err) {
    res.status(500).json({ message: `Cloud backup failed: ${err.message}` });
  }
});

// The file is encrypted: the link is only useful together with BACKUP_ENCRYPTION_KEY
router.get('/cloud/:id/link', checkBackupAuth, superAdminOnly, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) return res.status(404).json({ message: 'Not found' });
    const b = await mongoose.connection.db.collection('cloudbackups').findOne({ _id: new mongoose.Types.ObjectId(String(req.params.id)), status: 'stored' });
    if (!b) return res.status(404).json({ message: 'Not found' });
    res.json({ url: b.url, name: b.name });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /settings - Fetch auto-backup settings
 */
router.get('/settings', checkBackupAuth, async (req, res) => {
  try {
    const settings = await getBackupSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * PUT /settings - Update auto-backup settings
 */
router.put('/settings', checkBackupAuth, async (req, res) => {
  try {
    const { autoBackupEnabled, hourlyRetention } = req.body || {};
    const updated = await updateBackupSettings({
      ...(autoBackupEnabled !== undefined ? { autoBackupEnabled: !!autoBackupEnabled } : {}),
      ...(hourlyRetention ? { hourlyRetention: Math.max(6, Math.min(365 * 24, Number(hourlyRetention))) } : {}),
    });
    await audit(req, 'backup_settings_updated', 'system', '', updated);
    res.json({ ok: true, settings: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
