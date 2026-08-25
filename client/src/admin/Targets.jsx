import { useEffect, useState } from 'react';
import { api, money, fmtDate } from '../api.js';
import Ic from '../components/Icons.jsx';

export default function Targets() {
  const [allTargets, setAllTargets] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'active' | 'completed'
  const [q, setQ] = useState('');

  // Target modal state
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [targetForm, setTargetForm] = useState({
    sellerId: '',
    title: 'Process 10 Orders Milestone',
    targetOrderCount: 10,
    bonusAmount: 50,
    durationDays: '',
    description: 'Complete 10 delivered orders to receive $50 bonus credited directly to your wallet.',
  });
  const [creatingTarget, setCreatingTarget] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api('/sellers/targets/all').catch(() => ({ targets: [] })),
      api('/sellers').catch(() => []),
    ])
      .then(([tgtRes, sellersRes]) => {
        const list = Array.isArray(tgtRes)
          ? tgtRes
          : Array.isArray(tgtRes?.targets)
          ? tgtRes.targets
          : Array.isArray(tgtRes?.allTargets)
          ? tgtRes.allTargets
          : [];
        setAllTargets(list);

        const sList = Array.isArray(sellersRes) ? sellersRes : sellersRes.sellers || [];
        setSellers(sList.filter((s) => s.status !== 'pending_approval'));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateTargetSubmit = async (e) => {
    e.preventDefault();
    if (!targetForm.sellerId) return alert('Please select a seller.');
    setCreatingTarget(true);
    try {
      await api(`/sellers/${targetForm.sellerId}/targets`, {
        method: 'POST',
        body: {
          title: targetForm.title.trim(),
          targetOrderCount: Number(targetForm.targetOrderCount),
          targetOrders: Number(targetForm.targetOrderCount),
          bonusAmount: Number(targetForm.bonusAmount),
          durationDays: targetForm.durationDays ? Number(targetForm.durationDays) : null,
          description: targetForm.description.trim(),
          adminNote: targetForm.description.trim(),
        },
      });
      alert('🎯 Milestone Target assigned to seller successfully! Notification sent.');
      setTargetModalOpen(false);
      setTargetForm({
        sellerId: '',
        title: 'Process 10 Orders Milestone',
        targetOrderCount: 10,
        bonusAmount: 50,
        durationDays: '',
        description: 'Complete 10 delivered orders to receive $50 bonus credited directly to your wallet.',
      });
      loadData();
    } catch (err) {
      alert('Error assigning target: ' + err.message);
    } finally {
      setCreatingTarget(false);
    }
  };

  const handleDeleteTarget = async (sellerId, targetId) => {
    if (!window.confirm('Are you sure you want to remove this performance target?')) return;
    try {
      await api(`/sellers/${sellerId}/targets/${targetId}`, {
        method: 'DELETE',
      });
      alert('Target removed successfully.');
      loadData();
    } catch (err) {
      alert('Error deleting target: ' + err.message);
    }
  };

  const totalBonusAllocated = allTargets.reduce((acc, t) => acc + (t.bonusAmount || 0), 0);
  const completedTargetsCount = allTargets.filter((t) => t.status === 'completed' || (t.currentOrders >= (t.targetOrders || 1))).length;
  const activeTargetsCount = allTargets.length - completedTargetsCount;

  const filtered = allTargets.filter((t) => {
    const isCompleted = t.status === 'completed' || (t.currentOrders >= (t.targetOrders || 1));
    if (filterStatus === 'active' && isCompleted) return false;
    if (filterStatus === 'completed' && !isCompleted) return false;

    if (!q) return true;
    const match =
      t.storeName?.toLowerCase().includes(q.toLowerCase()) ||
      t.ownerName?.toLowerCase().includes(q.toLowerCase()) ||
      t.title?.toLowerCase().includes(q.toLowerCase());
    return match;
  });

  return (
    <div className="admin-sellers-page">
      <div className="admin-header-row">
        <div>
          <h2>🎯 Merchant Targets &amp; Cash Bonus Rewards</h2>
          <p className="muted">
            Configure order volume milestones and sales incentives. Cash bonuses are automatically credited into merchant wallets upon successful delivery.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTargetModalOpen(true)}
          className="btn-primary"
        >
          <Ic name="plus" size={16} /> + Assign New Target Milestone
        </button>
      </div>

      {/* Summary KPI Bar */}
      <div className="admin-sellers-stats-bar" style={{ marginBottom: 18 }}>
        <div className="stat-box" style={{ borderLeft: '4px solid #2563eb' }}>
          <span className="lbl">Active Milestone Targets</span>
          <b className="val" style={{ color: '#2563eb' }}>{activeTargetsCount}</b>
        </div>
        <div className="stat-box" style={{ borderLeft: '4px solid #16a34a' }}>
          <span className="lbl">Total Bonus Rewards Allocated</span>
          <b className="val" style={{ color: '#16a34a' }}>{money(totalBonusAllocated)}</b>
        </div>
        <div className="stat-box" style={{ borderLeft: '4px solid #d97706' }}>
          <span className="lbl">Completed Milestones</span>
          <b className="val" style={{ color: '#d97706' }}>{completedTargetsCount}</b>
        </div>
        <div className="stat-box" style={{ borderLeft: '4px solid #0f172a' }}>
          <span className="lbl">Enrolled Merchants</span>
          <b className="val">{new Set(allTargets.map((t) => t.sellerId)).size}</b>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="wallet-action-tabs" style={{ marginBottom: 14 }}>
        <button
          type="button"
          className={`wallet-action-tab ${filterStatus === 'all' ? 'active' : ''}`}
          onClick={() => setFilterStatus('all')}
        >
          🎯 All Milestones ({allTargets.length})
        </button>
        <button
          type="button"
          className={`wallet-action-tab ${filterStatus === 'active' ? 'active' : ''}`}
          onClick={() => setFilterStatus('active')}
        >
          ⚡ In Progress ({activeTargetsCount})
        </button>
        <button
          type="button"
          className={`wallet-action-tab ${filterStatus === 'completed' ? 'active' : ''}`}
          onClick={() => setFilterStatus('completed')}
        >
          🏆 Completed ({completedTargetsCount})
        </button>
      </div>

      <div className="table-search-row">
        <div className="search-field">
          <Ic name="search" size={16} />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search targets by store name, owner, or title..."
          />
        </div>
      </div>

      {/* Targets Table */}
      <div className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Merchant Store</th>
                <th>Milestone Title &amp; Details</th>
                <th>Target Deliveries</th>
                <th>Live Fulfillment Progress</th>
                <th>Cash Bonus</th>
                <th>Status</th>
                <th>Expiry Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="8" className="text-center py-8 muted">Loading performance targets...</td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan="8" className="text-center py-8 muted">
                    No milestone targets found. Click "+ Assign New Target Milestone" above.
                  </td>
                </tr>
              )}
              {filtered.map((tgt, idx) => {
                const current = tgt.currentOrders || tgt.currentOrderCount || 0;
                const target = tgt.targetOrders || tgt.targetOrderCount || 1;
                const pct = Math.min(100, Math.round((current / target) * 100));
                const isCompleted = tgt.status === 'completed' || current >= target;
                const targetKey = tgt._id || tgt.targetId || `target-${idx}`;

                return (
                  <tr key={targetKey}>
                    <td>
                      <div className="seller-name-cell">
                        <div className="avatar-chip">{tgt.storeName?.[0] || 'M'}</div>
                        <div>
                          <b>{tgt.storeName || 'Merchant'}</b>
                          <small className="muted block">{tgt.ownerName || '—'}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <b>{tgt.title}</b>
                      {(tgt.description || tgt.adminNote) && (
                        <small className="muted block" style={{ maxWidth: 220, fontSize: 11 }}>
                          {tgt.description || tgt.adminNote}
                        </small>
                      )}
                    </td>
                    <td>
                      <b>{target} Delivered Orders</b>
                    </td>
                    <td>
                      <div style={{ minWidth: 130 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 3 }}>
                          <span>{current} / {target} orders</span>
                          <b style={{ color: isCompleted ? '#16a34a' : '#2563eb' }}>{pct}%</b>
                        </div>
                        <div style={{ height: 7, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${pct}%`,
                              background: isCompleted ? '#16a34a' : pct > 50 ? '#2563eb' : '#f59e0b',
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      <b style={{ color: '#16a34a', fontSize: 14 }}>+{money(tgt.bonusAmount || 0)}</b>
                    </td>
                    <td>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 800,
                          background: isCompleted ? '#dcfce7' : '#fef3c7',
                          color: isCompleted ? '#166534' : '#92400e',
                          border: `1px solid ${isCompleted ? '#86efac' : '#fde68a'}`,
                        }}
                      >
                        {isCompleted ? '🏆 COMPLETED' : '⚡ IN PROGRESS'}
                      </span>
                    </td>
                    <td>
                      <small className="muted">{tgt.expiresAt ? fmtDate(tgt.expiresAt) : 'No Expiry'}</small>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handleDeleteTarget(tgt.sellerId, tgt.targetId || tgt._id)}
                        style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                        title="Remove Target"
                      >
                        🗑️ Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assign Target Modal */}
      {targetModalOpen && (
        <div className="admin-modal-overlay" onClick={() => setTargetModalOpen(false)}>
          <div className="admin-modal-box" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>🎯</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Assign Milestone Target &amp; Bonus</h3>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>Reward sellers upon reaching order delivery targets</p>
                </div>
              </div>
              <button onClick={() => setTargetModalOpen(false)} className="btn-close-modal">✕</button>
            </div>

            <form onSubmit={handleCreateTargetSubmit} style={{ padding: '18px 22px' }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                  Select Target Merchant *:
                </label>
                <select
                  value={targetForm.sellerId}
                  onChange={(e) => setTargetForm({ ...targetForm, sellerId: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                  required
                >
                  <option value="">-- Choose an active seller --</option>
                  {sellers.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.storeName} ({s.ownerName})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                  Milestone Title *:
                </label>
                <input
                  type="text"
                  value={targetForm.title}
                  onChange={(e) => setTargetForm({ ...targetForm, title: e.target.value })}
                  placeholder="e.g. Process 10 Orders Milestone"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                    Target Deliveries (Count) *:
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={targetForm.targetOrderCount}
                    onChange={(e) => setTargetForm({ ...targetForm, targetOrderCount: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                    Cash Bonus Reward ($ USD) *:
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={targetForm.bonusAmount}
                    onChange={(e) => setTargetForm({ ...targetForm, bonusAmount: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                    required
                  />
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                  Valid Duration (Days - Optional):
                </label>
                <input
                  type="number"
                  min="1"
                  value={targetForm.durationDays}
                  onChange={(e) => setTargetForm({ ...targetForm, durationDays: e.target.value })}
                  placeholder="e.g. 30 (Leave blank for no expiration)"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                  Description / Terms:
                </label>
                <textarea
                  rows={2}
                  value={targetForm.description}
                  onChange={(e) => setTargetForm({ ...targetForm, description: e.target.value })}
                  placeholder="e.g. Complete 10 delivered orders to receive $50 bonus credited directly to your wallet balance."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontFamily: 'inherit' }}
                />
              </div>

              <div className="modal-bottom-actions">
                <button type="button" onClick={() => setTargetModalOpen(false)} className="btn-cancel">Cancel</button>
                <button type="submit" className="btn-primary" disabled={creatingTarget}>
                  {creatingTarget ? 'Assigning...' : '🎯 Assign Milestone Target'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
