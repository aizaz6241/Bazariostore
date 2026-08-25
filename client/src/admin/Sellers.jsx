import { useEffect, useState } from 'react';
import { api, money, fmtDate } from '../api.js';
import Ic from '../components/Icons.jsx';

export default function Sellers() {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  // Create Seller Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    storeName: '',
    ownerName: '',
    email: '',
    password: '',
    phone: '',
    commissionRate: 10,
    city: 'New York',
  });
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState('');

  // Inspect Seller Modal (View as Seller Dashboard)
  const [inspectSeller, setInspectSeller] = useState(null);
  const [inspectData, setInspectData] = useState(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  // Admin Reset Seller Password Modal
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetSeller, setResetSeller] = useState(null);
  const [newSellerPassword, setNewSellerPassword] = useState('');
  const [confirmSellerPassword, setConfirmSellerPassword] = useState('');
  const [resettingPw, setResettingPw] = useState(false);
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetError, setResetError] = useState('');
  const [showAdminSellerPw, setShowAdminSellerPw] = useState(false);

  // Delete Seller Modal
  const [deleteModalSeller, setDeleteModalSeller] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadSellers = () => {
    setLoading(true);
    api('/sellers')
      .then((data) => {
        const list = Array.isArray(data) ? data : data.sellers || [];
        setSellers(list);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSellers();
  }, []);

  const handleOpenResetPassword = (seller) => {
    setResetSeller(seller);
    setNewSellerPassword('');
    setConfirmSellerPassword('');
    setResetSuccess('');
    setResetError('');
    setShowAdminSellerPw(false);
    setResetModalOpen(true);
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let res = '';
    for (let i = 0; i < 10; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewSellerPassword(res);
    setConfirmSellerPassword(res);
    setShowAdminSellerPw(true);
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!resetSeller) return;
    if (newSellerPassword !== confirmSellerPassword) {
      setResetError('Passwords do not match. Please recheck.');
      return;
    }
    if (newSellerPassword.length < 6) {
      setResetError('Password must be at least 6 characters long.');
      return;
    }
    setResettingPw(true);
    setResetError('');
    setResetSuccess('');
    try {
      const res = await api(`/sellers/${resetSeller._id}/reset-password`, {
        method: 'POST',
        body: { newPassword: newSellerPassword },
      });
      setResetSuccess(res.message || 'Password reset successfully! ✅');
      setTimeout(() => {
        setResetModalOpen(false);
      }, 1600);
    } catch (err) {
      setResetError(err.message || 'Failed to reset seller password.');
    } finally {
      setResettingPw(false);
    }
  };

  const handleInspect = (seller) => {
    setInspectSeller(seller);
    setInspectLoading(true);
    api(`/sellers/${seller._id}`)
      .then(setInspectData)
      .catch((err) => alert(err.message))
      .finally(() => setInspectLoading(false));
  };

  const handleDeleteSeller = async () => {
    if (!deleteModalSeller) return;
    setDeleting(true);
    try {
      await api(`/sellers/${deleteModalSeller._id}`, {
        method: 'DELETE',
      });
      alert(`✅ Store "${deleteModalSeller.storeName}" has been successfully deleted.`);
      setDeleteModalSeller(null);
      loadSellers();
    } catch (err) {
      alert('Error deleting seller: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateSeller = async (e) => {
    e.preventDefault();
    setCreating(true);
    setCreateErr('');
    try {
      await api('/sellers', {
        method: 'POST',
        body: createForm,
      });
      alert(`🎉 Store "${createForm.storeName}" created successfully!`);
      setCreateOpen(false);
      setCreateForm({
        storeName: '',
        ownerName: '',
        email: '',
        password: '',
        phone: '',
        commissionRate: 10,
        city: 'New York',
      });
      loadSellers();
    } catch (err) {
      setCreateErr(err.message);
    } finally {
      setCreating(false);
    }
  };

  const activeSellers = sellers.filter((s) => s.status !== 'pending_approval');

  const filtered = activeSellers.filter((s) => {
    if (!q) return true;
    const match =
      s.storeName?.toLowerCase().includes(q.toLowerCase()) ||
      s.ownerName?.toLowerCase().includes(q.toLowerCase()) ||
      s.email?.toLowerCase().includes(q.toLowerCase()) ||
      s.phone?.toLowerCase().includes(q.toLowerCase());
    return match;
  });

  const healthyCount = activeSellers.filter((s) => s.status === 'active' && (s.accountHealth?.score ?? 100) >= 80).length;
  const totalProducts = activeSellers.reduce((a, b) => a + (b.productCount || 0), 0);
  const totalGMV = activeSellers.reduce((a, b) => a + (b.lifetimeSales || 0), 0);

  return (
    <div className="admin-sellers-page">
      <div className="admin-header-row">
        <div>
          <h2>🏬 Multi-Vendor Sellers &amp; Merchants Directory</h2>
          <p className="muted">
            Manage merchant accounts, inspect seller performance dashboards, reset credentials, and onboard new merchants.
          </p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary">
          <Ic name="plus" size={16} /> + Onboard New Seller
        </button>
      </div>

      {/* Summary KPI Stats Bar */}
      <div className="admin-sellers-stats-bar" style={{ marginBottom: 20 }}>
        <div className="stat-box" style={{ borderLeft: '4px solid #2563eb' }}>
          <span className="lbl">Total Active Sellers</span>
          <b className="val" style={{ color: '#2563eb' }}>{activeSellers.length}</b>
        </div>
        <div className="stat-box" style={{ borderLeft: '4px solid #16a34a' }}>
          <span className="lbl">Healthy Accounts (80+)</span>
          <b className="val" style={{ color: '#16a34a' }}>{healthyCount}</b>
        </div>
        <div className="stat-box" style={{ borderLeft: '4px solid #d97706' }}>
          <span className="lbl">Total Listed Products</span>
          <b className="val" style={{ color: '#d97706' }}>{totalProducts} Items</b>
        </div>
        <div className="stat-box" style={{ borderLeft: '4px solid #0f172a' }}>
          <span className="lbl">Total Merchant Sales (GMV)</span>
          <b className="val">{money(totalGMV)}</b>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="table-search-row" style={{ marginBottom: 16 }}>
        <div className="search-field">
          <Ic name="search" size={16} />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search sellers by store name, owner name, login email, phone..."
          />
        </div>
      </div>

      {/* Sellers Table */}
      <div className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Store &amp; Owner</th>
                <th>Login Email &amp; Phone</th>
                <th>Commission</th>
                <th>Catalog Products</th>
                <th>Lifetime Sales</th>
                <th>Wallet Ledger</th>
                <th>Account Health</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="9" className="text-center py-8 muted">Loading sellers directory...</td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan="9" className="text-center py-8 muted">
                    No merchants found matching your search.
                  </td>
                </tr>
              )}
              {filtered.map((s) => {
                const score = s.accountHealth?.score !== undefined ? s.accountHealth.score : 100;
                const tierBg = score >= 80 ? '#dcfce7' : score >= 31 ? '#fef9c3' : score > 20 ? '#ffedd5' : '#fee2e2';
                const tierColor = score >= 80 ? '#15803d' : score >= 31 ? '#854d0e' : score > 20 ? '#c2410c' : '#b91c1c';
                const fillBg = score >= 80 ? '#16a34a' : score >= 31 ? '#eab308' : score > 20 ? '#ea580c' : '#dc2626';

                return (
                  <tr key={s._id}>
                    <td>
                      <div className="seller-name-cell">
                        <div className="avatar-chip">{s.storeName?.[0] || 'S'}</div>
                        <div>
                          <b style={{ fontSize: 14 }}>{s.storeName}</b>
                          <small className="muted block">Owner: {s.ownerName}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span>{s.email}</span>
                      <small className="muted block">📞 {s.phone || 'N/A'}</small>
                    </td>
                    <td>
                      <span className="fee-badge">{s.commissionRate || 10}%</span>
                    </td>
                    <td>
                      <b>{s.productCount || 0}</b> items
                    </td>
                    <td>
                      <b style={{ color: '#0f172a', fontSize: 13.5 }}>{money(s.lifetimeSales)}</b>
                    </td>
                    <td>
                      <div style={{ fontSize: 11.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div><span className="muted">Avail:</span> <b style={{ color: '#0f172a' }}>{money(s.wallet?.balance || 0)}</b></div>
                        {s.wallet?.processingFund > 0 && (
                          <div><span className="muted">Locked:</span> <b style={{ color: '#d97706' }}>{money(s.wallet?.processingFund)}</b></div>
                        )}
                        {s.wallet?.totalProfitEarned > 0 && (
                          <div><span className="muted">Profit:</span> <b style={{ color: '#16a34a' }}>+{money(s.wallet?.totalProfitEarned)}</b></div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="admin-health-cell" title={`Health: ${score}/100`}>
                        <span
                          className="admin-health-badge"
                          style={{ background: tierBg, color: tierColor, border: `1px solid ${tierColor}40` }}
                        >
                          {score >= 80 ? '🟢' : score >= 31 ? '🟡' : score > 20 ? '🟠' : '🔴'} {score}/100
                        </span>
                        <div className="admin-health-bar-wrap">
                          <div
                            className="admin-health-bar-fill"
                            style={{ width: `${Math.max(4, score)}%`, background: fillBg }}
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                        <span
                          style={{
                            background: s.status === 'active' ? '#ecfdf5' : s.status === 'frozen' ? '#eff6ff' : '#fef2f2',
                            color: s.status === 'active' ? '#059669' : s.status === 'frozen' ? '#2563eb' : '#dc2626',
                            border: `1px solid ${s.status === 'active' ? '#a7f3d0' : s.status === 'frozen' ? '#bfdbfe' : '#fecaca'}`,
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 12,
                            fontSize: 11,
                          }}
                        >
                          {s.status === 'active' ? '● Active' : s.status === 'frozen' ? '❄️ Frozen' : '⛔ Suspended'}
                        </span>
                        {s.warning?.active && (
                          <span style={{ fontSize: 10, background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: 8, fontWeight: 700 }}>
                            ⚠️ Warned
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="action-buttons-group" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {/* 1. View Dashboard Action */}
                        <button
                          type="button"
                          onClick={() => handleInspect(s)}
                          className="btn-action-view"
                          title="Inspect Live Seller Dashboard"
                          style={{
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            border: '1px solid #bfdbfe',
                            fontWeight: 700,
                            fontSize: 12,
                            padding: '5px 10px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                        >
                          <Ic name="eye" size={14} /> View Dashboard
                        </button>

                        {/* 2. Reset Password Action */}
                        <button
                          type="button"
                          onClick={() => handleOpenResetPassword(s)}
                          className="btn-action-warn"
                          title="Change or reset seller login password"
                          style={{
                            background: '#f8fafc',
                            color: '#0f172a',
                            border: '1px solid #cbd5e1',
                            fontWeight: 600,
                            fontSize: 12,
                            padding: '5px 10px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                        >
                          <Ic name="lock" size={13} /> Reset Password
                        </button>

                        {/* 3. Delete Seller Action */}
                        <button
                          type="button"
                          onClick={() => setDeleteModalSeller(s)}
                          className="btn-danger"
                          title="Permanently remove seller"
                          style={{
                            background: '#fee2e2',
                            color: '#dc2626',
                            border: '1px solid #fca5a5',
                            fontWeight: 700,
                            fontSize: 12,
                            padding: '5px 10px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                        >
                          <Ic name="x" size={13} /> Delete Seller
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Modal 1: Onboard New Seller ─── */}
      {createOpen && (
        <div className="admin-modal-overlay" onClick={() => setCreateOpen(false)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>➕</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Create New Seller Account</h3>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>Enter credentials for merchant login</p>
                </div>
              </div>
              <button onClick={() => setCreateOpen(false)} className="btn-close-modal">✕</button>
            </div>

            {createErr && <div className="modal-err-banner">{createErr}</div>}

            <form onSubmit={handleCreateSeller} className="admin-modal-form" style={{ padding: '18px 22px' }}>
              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Store Name *</label>
                  <input
                    type="text"
                    value={createForm.storeName}
                    onChange={(e) => setCreateForm({ ...createForm, storeName: e.target.value })}
                    placeholder="e.g. Apex Tech Store"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Owner Full Name *</label>
                  <input
                    type="text"
                    value={createForm.ownerName}
                    onChange={(e) => setCreateForm({ ...createForm, ownerName: e.target.value })}
                    placeholder="e.g. Ali Raza"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Seller Login Email *</label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    placeholder="seller@brand.com"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Password *</label>
                  <input
                    type="password"
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    placeholder="••••••••"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Contact Phone</label>
                  <input
                    type="text"
                    value={createForm.phone}
                    onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                    placeholder="+92 300 1234567"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Commission Rate (%)</label>
                  <input
                    type="number"
                    value={createForm.commissionRate}
                    onChange={(e) => setCreateForm({ ...createForm, commissionRate: e.target.value })}
                    placeholder="10"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                    required
                  />
                </div>
              </div>

              <div className="modal-bottom-actions">
                <button type="button" onClick={() => setCreateOpen(false)} className="btn-cancel">Cancel</button>
                <button type="submit" className="btn-primary" disabled={creating}>
                  {creating ? 'Creating...' : '➕ Create Seller Credentials'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal 2: Inspect Seller Live Dashboard ─── */}
      {inspectSeller && (
        <div className="admin-modal-overlay" onClick={() => setInspectSeller(null)}>
          <div className="admin-modal-box large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <div className="inspect-head-title">
                <h3>📊 Live Dashboard View: <b>{inspectSeller.storeName}</b></h3>
                <span className="status-chip chip-active">Vendor Perspective</span>
              </div>
              <button onClick={() => setInspectSeller(null)} className="btn-close-modal">✕</button>
            </div>

            {inspectLoading && <div className="text-center py-10 muted">Loading seller metrics...</div>}

            {!inspectLoading && inspectData && (
              <div className="inspect-body">
                {/* KPI stats */}
                <div className="inspect-kpi-row">
                  <div className="inspect-kpi">
                    <span>Gross Sales</span>
                    <b>{money(inspectData.stats?.grossRevenue)}</b>
                  </div>
                  <div className="inspect-kpi">
                    <span>Estimated Net Profit</span>
                    <b className="text-green">{money(inspectData.stats?.netProfit)}</b>
                  </div>
                  <div className="inspect-kpi">
                    <span>Commission Paid ({inspectSeller.commissionRate}%)</span>
                    <b className="text-blue">{money(inspectData.stats?.platformCommission)}</b>
                  </div>
                  <div className="inspect-kpi">
                    <span>Total Orders Dispatched</span>
                    <b>{inspectData.stats?.totalOrders || 0}</b>
                  </div>
                </div>

                {/* Seller Products Tab */}
                <div className="inspect-section">
                  <h4>📦 Listed Products ({inspectData.products?.length || 0})</h4>
                  <div className="inspect-prods-grid">
                    {inspectData.products?.map((p) => (
                      <div key={p._id} className="inspect-prod-item">
                        <img src={p.image || '/img/products/serum.svg'} alt="" />
                        <div>
                          <b>{p.name}</b>
                          <div className="flex gap-2">
                            <span>Price: {money(p.price)}</span>
                            <span className="text-muted">Stock: {p.stock}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Seller Orders Tab */}
                <div className="inspect-section">
                  <h4>🛒 Recent Dispatched Orders ({inspectData.orders?.length || 0})</h4>
                  <div className="inspect-orders-list">
                    {inspectData.orders?.slice(0, 5).map((o) => (
                      <div key={o._id} className="inspect-order-row">
                        <span><b>{o.orderNumber}</b> • {fmtDate(o.createdAt)}</span>
                        <span>{o.shippingAddress?.fullName} ({o.shippingAddress?.city})</span>
                        <b>{money(o.total)}</b>
                        <span className={`status-tag status-${o.status}`}>{o.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Modal 3: Reset Seller Password ─── */}
      {resetModalOpen && resetSeller && (
        <div className="admin-modal-overlay" onClick={() => setResetModalOpen(false)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>🔑</span>
                <h3 style={{ margin: 0, fontSize: 16 }}>Reset Password: <b>{resetSeller.storeName}</b></h3>
              </div>
              <button onClick={() => setResetModalOpen(false)} className="btn-close-modal">✕</button>
            </div>

            {resetError && <div className="modal-err-banner">{resetError}</div>}
            {resetSuccess && (
              <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, margin: '14px 20px 0' }}>
                {resetSuccess}
              </div>
            )}

            <form onSubmit={handleResetPasswordSubmit} className="admin-modal-form" style={{ padding: '18px 22px' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
                <small className="muted" style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
                  Seller Account Details
                </small>
                <div style={{ fontSize: 13, color: '#0f172a', marginTop: 4 }}>
                  <b>Owner:</b> {resetSeller.ownerName} &bull; <b>Email:</b> <code>{resetSeller.email}</code>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>
                  New Password *
                </label>
                <button
                  type="button"
                  onClick={generateRandomPassword}
                  style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                >
                  ⚡ Generate Random Password
                </button>
              </div>

              <div style={{ marginBottom: 14 }}>
                <input
                  type={showAdminSellerPw ? 'text' : 'password'}
                  value={newSellerPassword}
                  onChange={(e) => setNewSellerPassword(e.target.value)}
                  placeholder="Enter new password (min 6 characters)"
                  required
                  minLength={6}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6, color: '#1e293b' }}>
                  Confirm New Password *
                </label>
                <input
                  type={showAdminSellerPw ? 'text' : 'password'}
                  value={confirmSellerPassword}
                  onChange={(e) => setConfirmSellerPassword(e.target.value)}
                  placeholder="Confirm new password"
                  required
                  minLength={6}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                <input
                  type="checkbox"
                  id="showAdminSellerPw"
                  checked={showAdminSellerPw}
                  onChange={(e) => setShowAdminSellerPw(e.target.checked)}
                />
                <label htmlFor="showAdminSellerPw" style={{ fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
                  Show password in plain text
                </label>
              </div>

              <div className="modal-bottom-actions">
                <button type="button" onClick={() => setResetModalOpen(false)} className="btn-cancel">Cancel</button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={resettingPw}
                  style={{ background: '#0f172a', borderColor: '#0f172a' }}
                >
                  {resettingPw ? 'Updating...' : '🔒 Reset Seller Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal 4: Delete Seller Confirmation ─── */}
      {deleteModalSeller && (
        <div className="admin-modal-overlay" onClick={() => setDeleteModalSeller(null)}>
          <div className="admin-modal-box" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>🗑️</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, color: '#dc2626' }}>Delete Merchant Account</h3>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>Permanent action</p>
                </div>
              </div>
              <button onClick={() => setDeleteModalSeller(null)} className="btn-close-modal">✕</button>
            </div>

            <div style={{ padding: '18px 22px' }}>
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                <p style={{ margin: 0, fontSize: 13, color: '#991b1b', lineHeight: 1.5 }}>
                  Are you sure you want to permanently delete store <b>"{deleteModalSeller.storeName}"</b> ({deleteModalSeller.email})?
                  This will remove the seller credentials and their catalog products.
                </p>
              </div>

              <div className="modal-bottom-actions">
                <button type="button" onClick={() => setDeleteModalSeller(null)} className="btn-cancel">Cancel</button>
                <button
                  type="button"
                  onClick={handleDeleteSeller}
                  className="btn-danger"
                  disabled={deleting}
                  style={{ background: '#dc2626', borderColor: '#dc2626' }}
                >
                  {deleting ? 'Deleting...' : '🗑️ Yes, Delete Seller'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
