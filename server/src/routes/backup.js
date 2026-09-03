import { Router } from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import { authAdmin } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import {
  createBackup,
  listBackups,
  getSafeBackupPath,
  deleteBackupFile,
  restoreFromLocalFile,
  restoreDatabaseFromData,
  getBackupSettings,
  updateBackupSettings,
} from '../services/backup.service.js';

const router = Router();

// Memory upload handler for restore file upload (up to 100MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

// All backup operations require admin 'settings' or 'backup' permission
const checkBackupAuth = authAdmin('backup');

/**
 * GET /stats - Returns database health & backup overview
 */
router.get('/stats', checkBackupAuth, async (req, res) => {
  try {
    const isConnected = mongoose.connection.readyState === 1;
    let collectionsCount = 0;
    let documentsCount = 0;
    let dbName = 'bazario';

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
        }
      }
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
router.get('/download/:filename', checkBackupAuth, (req, res) => {
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
router.delete('/:filename', checkBackupAuth, async (req, res) => {
  try {
    const filename = req.params.filename;
    await deleteBackupFile(filename);
    await audit(req, 'backup_deleted', 'system', filename);
    res.json({ ok: true, message: `Backup '${filename}' deleted.` });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/**
 * POST /restore/:filename - Restores database from a server-side backup snapshot
 */
router.post('/restore/:filename', checkBackupAuth, async (req, res) => {
  try {
    const filename = req.params.filename;
    const result = await restoreFromLocalFile(filename);
    await audit(req, 'database_restored', 'system', filename, {
      collectionsRestored: result.collectionsRestored,
      documentsRestored: result.documentsRestored,
    });
    res.json({ ok: true, message: 'Database restored successfully!', result });
  } catch (err) {
    res.status(500).json({ message: `Restore failed: ${err.message}` });
  }
});

/**
 * POST /upload-restore - Restores database from an uploaded JSON backup file
 */
router.post('/upload-restore', checkBackupAuth, upload.single('backupFile'), async (req, res) => {
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

    res.json({ ok: true, message: 'Database restored from uploaded file successfully!', result });
  } catch (err) {
    res.status(500).json({ message: `Restore failed: ${err.message}` });
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
