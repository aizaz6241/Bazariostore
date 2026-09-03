import { useEffect, useState, useRef } from 'react';
import { api, downloadFile, fmtDate } from '../api.js';
import Ic from '../components/Icons.jsx';
import { Modal, Toggle, ErrorBox, OkBox } from './ui.jsx';

export default function Backup() {
  const [stats, setStats] = useState(null);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  // Creation & Restore states
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState(null); // backup item to restore
  const [deleteTarget, setDeleteTarget] = useState(null); // backup item to delete

  // Upload restore modal
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Settings state
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [retention, setRetention] = useState(48);
  const [savingSettings, setSavingSettings] = useState(false);

  const loadData = async () => {
    try {
      setError('');
      const [sData, lData] = await Promise.all([
        api('/backup/stats'),
        api('/backup/list'),
      ]);
      setStats(sData);
      setBackups(lData.backups || []);
      if (sData?.settings) {
        setAutoEnabled(!!sData.settings.autoBackupEnabled);
        setRetention(sData.settings.hourlyRetention || 48);
      }
    } catch (err) {
      setError(err.message || 'Failed to load backup data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateBackup = async () => {
    setCreating(true);
    setError('');
    setOk('');
    try {
      const res = await api('/backup/create', { method: 'POST' });
      setOk(`Snapshot created successfully: ${res.backup?.filename || 'Backup ready'}`);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to create backup');
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (filename) => {
    try {
      setOk(`Downloading ${filename}...`);
      await downloadFile(`/backup/download/${encodeURIComponent(filename)}`, filename);
      setTimeout(() => setOk(''), 3000);
    } catch (err) {
      setError(err.message || 'Download failed');
    }
  };

  const handleConfirmRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    setError('');
    setOk('');
    try {
      const res = await api(`/backup/restore/${encodeURIComponent(restoreTarget.filename)}`, {
        method: 'POST',
      });
      setOk(
        `Database successfully restored from ${restoreTarget.filename}! (${res.result?.collectionsRestored || 0} collections, ${res.result?.documentsRestored || 0} records restored)`
      );
      setRestoreTarget(null);
      await loadData();
    } catch (err) {
      setError(err.message || 'Restore failed');
    } finally {
      setRestoring(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setError('');
    setOk('');
    try {
      await api(`/backup/${encodeURIComponent(deleteTarget.filename)}`, {
        method: 'DELETE',
      });
      setOk(`Backup '${deleteTarget.filename}' deleted successfully.`);
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setError(err.message || 'Delete failed');
    }
  };

  const handleUploadRestore = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      setError('Please select a .json backup file first.');
      return;
    }
    setUploading(true);
    setError('');
    setOk('');
    try {
      const formData = new FormData();
      formData.append('backupFile', uploadFile);

      const res = await api('/backup/upload-restore', {
        method: 'POST',
        body: formData,
      });

      setOk(
        `Database successfully restored from uploaded file! (${res.result?.collectionsRestored || 0} collections, ${res.result?.documentsRestored || 0} records)`
      );
      setUploadModalOpen(false);
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadData();
    } catch (err) {
      setError(err.message || 'Upload & restore failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setError('');
    setOk('');
    try {
      await api('/backup/settings', {
        method: 'PUT',
        body: {
          autoBackupEnabled: autoEnabled,
          hourlyRetention: Number(retention),
        },
      });
      setOk('Auto-backup schedule and retention settings saved successfully!');
      setTimeout(() => setOk(''), 3500);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getTypeBadge = (type) => {
    if (type === 'hourly') {
      return (
        <span
          style={{
            background: '#e0e7ff',
            color: '#4338ca',
            padding: '3px 9px',
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Ic name="clock" size={13} /> Hourly Auto
        </span>
      );
    }
    if (type === 'prerestore') {
      return (
        <span
          style={{
            background: '#fef3c7',
            color: '#b45309',
            padding: '3px 9px',
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Ic name="shield" size={13} /> Pre-Restore Snapshot
        </span>
      );
    }
    return (
      <span
        style={{
          background: '#dcfce7',
          color: '#15803d',
          padding: '3px 9px',
          borderRadius: 12,
          fontSize: 12,
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <Ic name="checkCircle" size={13} /> Manual Backup
      </span>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <p className="muted">Loading database backup control center...</p>
      </div>
    );
  }

  return (
    <div className="admin-page-container">
      {/* Page Title & Actions */}
      <div className="admin-h1-row" style={{ flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 className="admin-h1" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Ic name="database" size={26} /> Database Backup & Disaster Recovery
          </h1>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
            Complete database protection, automated hourly snapshots, and single-click disaster recovery
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="btn-primary"
            onClick={handleCreateBackup}
            disabled={creating}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <Ic name="refresh" size={16} className={creating ? 'spin' : ''} />
            {creating ? 'Creating Snapshot…' : 'Create Backup Now'}
          </button>

          <button
            className="btn"
            style={{
              background: '#334155',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
            onClick={() => setUploadModalOpen(true)}
          >
            <Ic name="download" size={16} style={{ transform: 'rotate(180deg)' }} />
            Upload & Restore File
          </button>
        </div>
      </div>

      <ErrorBox error={error} />
      <OkBox msg={ok} />

      {/* Top Overview Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #10b981' }}>
          <small className="muted" style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: 11 }}>
            Database Status
          </small>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: stats?.connected ? '#10b981' : '#ef4444',
                display: 'inline-block',
              }}
            />
            <b style={{ fontSize: 18, color: '#0f172a' }}>{stats?.connected ? 'Online & Active' : 'Disconnected'}</b>
          </div>
          <small className="muted" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
            Cluster: <code>{stats?.databaseName || 'bazario'}</code>
          </small>
        </div>

        <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #3b82f6' }}>
          <small className="muted" style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: 11 }}>
            Total Collections
          </small>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#0f172a' }}>
            {stats?.collectionsCount || 0}
          </div>
          <small className="muted" style={{ fontSize: 12 }}>
            MongoDB collections in schema
          </small>
        </div>

        <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #8b5cf6' }}>
          <small className="muted" style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: 11 }}>
            Total Database Records
          </small>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#0f172a' }}>
            {(stats?.documentsCount || 0).toLocaleString()}
          </div>
          <small className="muted" style={{ fontSize: 12 }}>
            Users, Products, Orders, Messages etc.
          </small>
        </div>

        <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #f59e0b' }}>
          <small className="muted" style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: 11 }}>
            Snapshots On Disk
          </small>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#0f172a' }}>
            {backups.length} <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>({formatBytes(stats?.totalDiskBytes)})</span>
          </div>
          <small className="muted" style={{ fontSize: 12 }}>
            Physical directory: <code>server/backups/</code>
          </small>
        </div>
      </div>

      {/* Hourly Auto-Backup Configuration Box */}
      <div className="card form-card" style={{ marginBottom: 24, padding: '20px 24px', background: '#f8fafc' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Ic name="clock" size={18} /> Automated Hourly Backup & Retention Schedule
            </h3>
            <p className="muted-sm" style={{ margin: '4px 0 0', fontSize: 13 }}>
              The system automatically captures a full snapshot of the entire database every 60 minutes in the background.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Hourly Scheduler:</span>
              <Toggle on={autoEnabled} onChange={() => setAutoEnabled(!autoEnabled)} />
              <b style={{ color: autoEnabled ? '#15803d' : '#94a3b8', fontSize: 13 }}>
                {autoEnabled ? 'ENABLED' : 'PAUSED'}
              </b>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#475569' }}>Keep Latest:</span>
              <select
                value={retention}
                onChange={(e) => setRetention(Number(e.target.value))}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <option value={24}>24 Hours (1 Day)</option>
                <option value={48}>48 Hours (2 Days)</option>
                <option value={72}>72 Hours (3 Days)</option>
                <option value={168}>168 Hours (7 Days)</option>
                <option value={720}>720 Hours (30 Days)</option>
              </select>
            </div>

            <button
              className="btn-primary"
              style={{ padding: '6px 14px', fontSize: 13 }}
              onClick={handleSaveSettings}
              disabled={savingSettings}
            >
              {savingSettings ? 'Saving…' : 'Save Schedule'}
            </button>
          </div>
        </div>

        {stats?.settings?.lastHourlyBackupAt && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e2e8f0', fontSize: 12, color: '#64748b' }}>
            <span>🕒 Last automated hourly backup taken: <b>{fmtDate(stats.settings.lastHourlyBackupAt)}</b></span>
          </div>
        )}
      </div>

      {/* Backups List Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 28 }}>
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#fff',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16 }}>Available Backup Snapshots ({backups.length})</h3>
          <button
            onClick={loadData}
            className="btn"
            style={{
              padding: '6px 12px',
              fontSize: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
            }}
          >
            <Ic name="refresh" size={14} /> Refresh List
          </button>
        </div>

        {backups.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <div style={{ width: 50, height: 50, margin: '0 auto 12px', color: '#94a3b8' }}>
              <Ic name="database" size={48} />
            </div>
            <h4 style={{ margin: '0 0 6px', color: '#334155' }}>No backup snapshots found</h4>
            <p className="muted-sm" style={{ maxWidth: 450, margin: '0 auto 16px' }}>
              You haven't created any database backups yet. Click the button below to take your first immediate snapshot!
            </p>
            <button className="btn-primary" onClick={handleCreateBackup} disabled={creating}>
              Create First Backup Now
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>DATE & TIME</th>
                  <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>BACKUP FILE NAME</th>
                  <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>TYPE</th>
                  <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>SIZE</th>
                  <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569' }}>RECORDS</th>
                  <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569', textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.filename} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <b style={{ color: '#0f172a', fontSize: 13 }}>{fmtDate(b.createdAt)}</b>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <code style={{ fontSize: 12, color: '#1e293b', background: '#f1f5f9', padding: '3px 6px', borderRadius: 4 }}>
                        {b.filename}
                      </code>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {getTypeBadge(b.type)}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#334155' }}>
                      {formatBytes(b.sizeBytes)}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>
                      <b>{b.collectionsCount}</b> collections • <b>{(b.documentsCount || 0).toLocaleString()}</b> docs
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <button
                          className="btn"
                          title="Download backup file to PC"
                          style={{
                            padding: '6px 10px',
                            fontSize: 12,
                            background: '#f1f5f9',
                            color: '#0f172a',
                            border: '1px solid #cbd5e1',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          onClick={() => handleDownload(b.filename)}
                        >
                          <Ic name="download" size={14} /> Download
                        </button>

                        <button
                          className="btn"
                          title="Restore entire database to this snapshot"
                          style={{
                            padding: '6px 10px',
                            fontSize: 12,
                            background: '#fee2e2',
                            color: '#991b1b',
                            border: '1px solid #fecaca',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontWeight: 600,
                          }}
                          onClick={() => setRestoreTarget(b)}
                        >
                          <Ic name="refresh" size={14} /> Restore
                        </button>

                        <button
                          className="btn"
                          title="Delete this backup file"
                          style={{
                            padding: '6px 8px',
                            background: 'transparent',
                            color: '#94a3b8',
                            border: 'none',
                          }}
                          onClick={() => setDeleteTarget(b)}
                        >
                          <Ic name="x" size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Safety & Educational Architecture Guide Card */}
      <div
        className="card"
        style={{
          background: '#0f172a',
          color: '#f8fafc',
          padding: '24px 28px',
          borderRadius: 14,
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ background: '#3b82f6', color: '#fff', borderRadius: '50%', padding: 6, display: 'inline-flex' }}>
            <Ic name="shield" size={20} />
          </span>
          <h3 style={{ margin: 0, color: '#fff', fontSize: 18 }}>
            Database Backup & Disaster Recovery Guide
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginTop: 16 }}>
          <div style={{ background: '#1e293b', padding: '16px 20px', borderRadius: 10, border: '1px solid #334155' }}>
            <b style={{ color: '#38bdf8', fontSize: 15, display: 'block', marginBottom: 8 }}>
              1. Where are backup files stored?
            </b>
            <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
              Backup files are stored directly on the web server's physical drive (<code>server/backups/</code>), completely isolated from MongoDB. Even if your cloud or production database cluster is deleted or corrupted, all snapshots on disk remain 100% safe.
            </p>
          </div>

          <div style={{ background: '#1e293b', padding: '16px 20px', borderRadius: 10, border: '1px solid #334155' }}>
            <b style={{ color: '#a78bfa', fontSize: 15, display: 'block', marginBottom: 8 }}>
              2. Automated Hourly Snapshots
            </b>
            <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
              The background scheduler takes a full database snapshot every 60 minutes, naming each file with the exact date and timestamp. Older snapshots are automatically pruned according to your retention policy to keep server storage clean.
            </p>
          </div>

          <div style={{ background: '#1e293b', padding: '16px 20px', borderRadius: 10, border: '1px solid #334155' }}>
            <b style={{ color: '#34d399', fontSize: 15, display: 'block', marginBottom: 8 }}>
              3. 1-Click Disaster Recovery
            </b>
            <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
              If data is ever lost or altered, click <b>"Restore"</b> next to any snapshot to recover the entire database in seconds, or upload a downloaded <code>.json</code> file. Using <code>BSON.EJSON</code>, all IDs, timestamps, and relations are restored with 100% precision.
            </p>
          </div>
        </div>
      </div>

      {/* Confirmation Modal: Restore Snapshot */}
      {restoreTarget && (
        <Modal title="Confirm Database Restoration" onClose={() => !restoring && setRestoreTarget(null)}>
          <div style={{ padding: '6px 0 16px' }}>
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #f87171',
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: 16,
                color: '#991b1b',
              }}
            >
              <b style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                <Ic name="alert" size={18} /> WARNING: This will overwrite current database records!
              </b>
              <p style={{ margin: '6px 0 0', fontSize: 13 }}>
                You are about to restore the database to the snapshot from <code>{restoreTarget.filename}</code>.
                Current database records will be replaced with the data in this backup file.
              </p>
            </div>

            <p style={{ fontSize: 13, color: '#475569', margin: '0 0 16px' }}>
              🛡️ <b>Safety Protection:</b> The system will automatically capture a pre-restore backup snapshot before applying changes so you can revert if needed.
            </p>

            <div
              style={{
                background: '#f8fafc',
                padding: '12px 16px',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                fontSize: 13,
                marginBottom: 20,
              }}
            >
              <div><b>Backup Date:</b> {fmtDate(restoreTarget.createdAt)}</div>
              <div><b>Type:</b> {restoreTarget.type}</div>
              <div><b>File Size:</b> {formatBytes(restoreTarget.sizeBytes)}</div>
              <div><b>Collections & Records:</b> {restoreTarget.collectionsCount} collections, {(restoreTarget.documentsCount || 0).toLocaleString()} documents</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                className="btn"
                onClick={() => setRestoreTarget(null)}
                disabled={restoring}
                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1' }}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={handleConfirmRestore}
                disabled={restoring}
                style={{
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 18px',
                  borderRadius: 6,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {restoring ? 'Restoring Database…' : 'Yes, Restore Database Now'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation Modal: Delete Snapshot */}
      {deleteTarget && (
        <Modal title="Delete Backup File" onClose={() => setDeleteTarget(null)}>
          <div style={{ padding: '8px 0 16px' }}>
            <p style={{ margin: '0 0 16px', fontSize: 14 }}>
              Are you sure you want to permanently delete <code>{deleteTarget.filename}</code> from the server's disk?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button
                className="btn-danger"
                style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6 }}
                onClick={handleConfirmDelete}
              >
                Delete File
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Upload & Restore from PC */}
      {uploadModalOpen && (
        <Modal title="Upload Backup File & Restore" onClose={() => !uploading && setUploadModalOpen(false)}>
          <form onSubmit={handleUploadRestore} style={{ padding: '8px 0 16px' }}>
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fca5a5',
                borderRadius: 8,
                padding: '12px 14px',
                marginBottom: 16,
                color: '#991b1b',
                fontSize: 13,
              }}
            >
              <b>⚠️ CAUTION:</b> Select a valid <code>.json</code> database backup file from your computer. Once uploaded, the database will be restored to the contents of this file.
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                Select .json Backup File from your Computer:
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: 6,
                  border: '1px dashed #94a3b8',
                  background: '#f8fafc',
                }}
              />
              {uploadFile && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#15803d', fontWeight: 600 }}>
                  Selected: {uploadFile.name} ({formatBytes(uploadFile.size)})
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn"
                onClick={() => setUploadModalOpen(false)}
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={!uploadFile || uploading}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                {uploading ? 'Restoring Database…' : 'Upload & Restore Now'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
