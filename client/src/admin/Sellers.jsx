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

  // Inspect Seller Modal (View as Seller)
  const [inspectSeller, setInspectSeller] = useState(null);
  const [inspectData, setInspectData] = useState(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  // Manual Order Placement Modal on behalf of Seller
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderSeller, setOrderSeller] = useState(null);
  const [sellerProds, setSellerProds] = useState([]);
  const [orderForm, setOrderForm] = useState({
    productId: '',
    qty: 1,
    customerName: 'Alex Miller',
    customerPhone: '+1 (555) 234-5678',
    customerEmail: 'customer@gmail.com',
    street: '42 Main Street, Suite 500',
    city: 'New York',
    state: 'NY',
    paymentMethod: 'cod',
    shippingCost: 0,
    adminNotes: 'Manually placed by Admin',
  });
  const [placingOrder, setPlacingOrder] = useState(false);

  // Compliance / Freeze & Warning Modal
  const [compModalOpen, setCompModalOpen] = useState(false);
  const [compSeller, setCompSeller] = useState(null);
  const [compTab, setCompTab] = useState('freeze'); // 'freeze' | 'warn'
  const [freezeStatus, setFreezeStatus] = useState('frozen');
  const [freezeReason, setFreezeReason] = useState('');
  const [warnActive, setWarnActive] = useState(true);
  const [warnLevel, setWarnLevel] = useState('warning');
  const [warnMessage, setWarnMessage] = useState('');
  const [submittingComp, setSubmittingComp] = useState(false);

  // Admin Reset Seller Password Modal
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetSeller, setResetSeller] = useState(null);
  const [newSellerPassword, setNewSellerPassword] = useState('');
  const [confirmSellerPassword, setConfirmSellerPassword] = useState('');
  const [resettingPw, setResettingPw] = useState(false);
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetError, setResetError] = useState('');
  const [showAdminSellerPw, setShowAdminSellerPw] = useState(false);

  const loadSellers = () => {
    setLoading(true);
    api('/sellers')
      .then(setSellers)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSellers();
  }, []);

  const handleOpenCompliance = (seller) => {
    setCompSeller(seller);
    setFreezeStatus(seller.status || 'active');
    setFreezeReason(seller.freezeReason || '');
    setWarnActive(Boolean(seller.warning?.active));
    setWarnLevel(seller.warning?.level || 'warning');
    setWarnMessage(seller.warning?.message || '');
    setCompTab(seller.status !== 'active' ? 'freeze' : seller.warning?.active ? 'warn' : 'freeze');
    setCompModalOpen(true);
  };

  const handleFreezeSubmit = async (e) => {
    e.preventDefault();
    if (!compSeller) return;
    if (freezeStatus !== 'active' && !freezeReason.trim()) {
      return alert('Please enter a reason for freezing or suspending this account.');
    }
    setSubmittingComp(true);
    try {
      await api(`/sellers/${compSeller._id}/freeze`, {
        method: 'POST',
        body: {
          status: freezeStatus,
          reason: freezeReason.trim(),
        },
      });
      alert(`Seller status updated to ${freezeStatus.toUpperCase()}! ✅`);
      setCompModalOpen(false);
      loadSellers();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSubmittingComp(false);
    }
  };

  const handleWarnSubmit = async (e) => {
    e.preventDefault();
    if (!compSeller) return;
    if (warnActive && !warnMessage.trim()) {
      return alert('Please enter a warning message to display in the header announcement bar.');
    }
    setSubmittingComp(true);
    try {
      await api(`/sellers/${compSeller._id}/warn`, {
        method: 'POST',
        body: {
          active: warnActive,
          level: warnLevel,
          message: warnMessage.trim(),
        },
      });
      alert(warnActive ? 'Official warning broadcasted to seller portal! ⚠️' : 'Warning cleared! ✅');
      setCompModalOpen(false);
      loadSellers();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSubmittingComp(false);
    }
  };

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
      }, 1800);
    } catch (err) {
      setResetError(err.message || 'Failed to reset seller password.');
    } finally {
      setResettingPw(false);
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

  const handleInspect = (seller) => {
    setInspectSeller(seller);
    setInspectLoading(true);
    api(`/sellers/${seller._id}`)
      .then(setInspectData)
      .catch((err) => alert(err.message))
      .finally(() => setInspectLoading(false));
  };

  const handleOpenPlaceOrder = async (seller) => {
    setOrderSeller(seller);
    try {
      const data = await api(`/sellers/${seller._id}`);
      const prods = data.products || [];
      setSellerProds(prods);
      setOrderForm({
        productId: prods[0]?._id || '',
        qty: 1,
        customerName: 'Customer Name',
        customerPhone: '+1 (555) 234-5678',
        customerEmail: 'customer@gmail.com',
        street: 'Street Address',
        city: 'New York',
        state: 'NY',
        paymentMethod: 'cod',
        shippingCost: 0,
        adminNotes: `Order created by Admin for ${seller.storeName}`,
      });
      setOrderModalOpen(true);
    } catch (err) {
      alert('Failed to load seller catalog: ' + err.message);
    }
  };

  const handlePlaceOrderSubmit = async (e) => {
    e.preventDefault();
    if (!orderForm.productId) {
      alert('Please select a product from the seller’s catalog');
      return;
    }
    setPlacingOrder(true);
    try {
      const selProd = sellerProds.find((p) => p._id === orderForm.productId);
      await api('/sellers/place-order', {
        method: 'POST',
        body: {
          sellerId: orderSeller._id,
          items: [
            {
              productId: selProd._id,
              name: selProd.name,
              price: selProd.price,
              qty: Number(orderForm.qty),
              image: selProd.image || selProd.images?.[0]?.url,
            },
          ],
          customer: {
            name: orderForm.customerName,
            phone: orderForm.customerPhone,
            email: orderForm.customerEmail,
          },
          shippingAddress: {
            fullName: orderForm.customerName,
            street: orderForm.street,
            city: orderForm.city,
            state: orderForm.state,
            country: '',
          },
          paymentMethod: orderForm.paymentMethod,
          shippingCost: Number(orderForm.shippingCost),
          adminNotes: orderForm.adminNotes,
        },
      });
      alert(`Order placed successfully on behalf of ${orderSeller.storeName}! ✅`);
      setOrderModalOpen(false);
      loadSellers();
    } catch (err) {
      alert('Error placing order: ' + err.message);
    } finally {
      setPlacingOrder(false);
    }
  };

  const handleToggleStatus = async (seller) => {
    const nextStatus = seller.status === 'active' ? 'suspended' : 'active';
    if (!confirm(`Are you sure you want to change ${seller.storeName}'s status to "${nextStatus}"?`)) return;
    try {
      await api(`/sellers/${seller._id}`, {
        method: 'PUT',
        body: { status: nextStatus },
      });
      loadSellers();
    } catch (err) {
      alert(err.message);
    }
  };

  const filtered = sellers.filter((s) => {
    if (!q) return true;
    const match =
      s.storeName?.toLowerCase().includes(q.toLowerCase()) ||
      s.ownerName?.toLowerCase().includes(q.toLowerCase()) ||
      s.email?.toLowerCase().includes(q.toLowerCase());
    return match;
  });

  return (
    <div className="admin-sellers-page">
      <div className="admin-header-row">
        <div>
          <h2>🏬 Multi-Vendor Seller Management</h2>
          <p className="muted">Create seller credentials, inspect seller dashboards, adjust commissions, and place orders for sellers.</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary">
          <Ic name="plus" size={16} /> + Onboard New Seller
        </button>
      </div>

      {/* Search Bar & Summary Stats */}
      <div className="admin-sellers-stats-bar">
        <div className="stat-box">
          <span className="lbl">Total Registered Sellers</span>
          <b className="val">{sellers.length}</b>
        </div>
        <div className="stat-box">
          <span className="lbl">Active Sellers</span>
          <b className="val text-green">{sellers.filter((s) => s.status === 'active').length}</b>
        </div>
        <div className="stat-box">
          <span className="lbl">Total Vendor Products</span>
          <b className="val">{sellers.reduce((a, b) => a + (b.productCount || 0), 0)}</b>
        </div>
        <div className="stat-box">
          <span className="lbl">Total Vendor GMV</span>
          <b className="val text-blue">{money(sellers.reduce((a, b) => a + (b.lifetimeSales || 0), 0))}</b>
        </div>
      </div>

      <div className="table-search-row">
        <div className="search-field">
          <Ic name="search" size={16} />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search sellers by store name, owner, or email..."
          />
        </div>
      </div>

      {/* Sellers List Table */}
      <div className="admin-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Store &amp; Owner</th>
              <th>Login Email &amp; Phone</th>
              <th>Commission</th>
              <th>Products</th>
              <th>Total Sales</th>
              <th>Wallet &amp; Processing</th>
              <th>Rating</th>
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
                <td colSpan="9" className="text-center py-8 muted">No sellers found.</td>
              </tr>
            )}
            {filtered.map((s) => (
              <tr key={s._id}>
                <td>
                  <div className="seller-name-cell">
                    <div className="avatar-chip">{s.storeName[0]}</div>
                    <div>
                      <b>{s.storeName}</b>
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
                <td><b>{s.productCount || 0}</b> items</td>
                <td><b>{money(s.lifetimeSales)}</b></td>
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
                <td>⭐ {s.rating || '4.8'}</td>
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
                        ⚠️ Warned ({s.warning.level || 'warning'})
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  <div className="action-buttons-group">
                    <button
                      onClick={() => handleOpenCompliance(s)}
                      className="btn-action-warn"
                      title="Freeze/Suspend account or broadcast warning announcement"
                      style={{
                        background: s.status !== 'active' ? '#fee2e2' : s.warning?.active ? '#fef3c7' : '#f8fafc',
                        color: s.status !== 'active' ? '#991b1b' : s.warning?.active ? '#92400e' : '#334155',
                        border: '1px solid #cbd5e1',
                        fontWeight: 600,
                        fontSize: 12,
                        padding: '5px 9px',
                        borderRadius: 6,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        cursor: 'pointer',
                      }}
                    >
                      <Ic name="alert" size={13} />
                      {s.status !== 'active' ? 'Manage Freeze' : s.warning?.active ? 'Manage Warning' : 'Warn / Freeze'}
                    </button>
                    <button
                      onClick={() => handleInspect(s)}
                      className="btn-action-view"
                      title="Inspect Seller Dashboard"
                    >
                      <Ic name="eye" size={14} /> View Dashboard
                    </button>
                    <button
                      onClick={() => handleOpenResetPassword(s)}
                      className="btn-action-warn"
                      title="Change or reset seller login password"
                      style={{
                        background: '#f8fafc',
                        color: '#0f172a',
                        border: '1px solid #cbd5e1',
                        fontWeight: 600,
                        fontSize: 12,
                        padding: '5px 9px',
                        borderRadius: 6,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        cursor: 'pointer',
                      }}
                    >
                      <Ic name="shield" size={13} /> Reset Password
                    </button>
                    <button
                      onClick={() => handleOpenPlaceOrder(s)}
                      className="btn-action-order"
                      title="Place an order for this seller"
                    >
                      <Ic name="package" size={14} /> Place Order
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Onboard New Seller Modal */}
      {createOpen && (
        <div className="admin-modal-overlay" onClick={() => setCreateOpen(false)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>➕ Create New Seller Account</h3>
              <button onClick={() => setCreateOpen(false)} className="close-btn"><Ic name="x" size={20} /></button>
            </div>

            {createErr && <div className="modal-err-banner">{createErr}</div>}

            <form onSubmit={handleCreateSeller} className="admin-modal-form">
              <p className="modal-desc-sub">
                Enter credentials for the seller. They will use this Email and Password to log into <b>Amazon Seller Central</b>.
              </p>

              <div className="form-grid-2">
                <label>
                  <span>Store Name *</span>
                  <input
                    type="text"
                    value={createForm.storeName}
                    onChange={(e) => setCreateForm({ ...createForm, storeName: e.target.value })}
                    placeholder="e.g. Apex Tech Store"
                    required
                  />
                </label>

                <label>
                  <span>Owner Full Name *</span>
                  <input
                    type="text"
                    value={createForm.ownerName}
                    onChange={(e) => setCreateForm({ ...createForm, ownerName: e.target.value })}
                    placeholder="e.g. Ali Raza"
                    required
                  />
                </label>

                <label>
                  <span>Seller Login Email *</span>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    placeholder="e.g. seller@brand.com"
                    required
                  />
                </label>

                <label>
                  <span>Password *</span>
                  <input
                    type="password"
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    placeholder="••••••••"
                    required
                  />
                </label>

                <label>
                  <span>Contact Phone</span>
                  <input
                    type="text"
                    value={createForm.phone}
                    onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                    placeholder="+92 300 1234567"
                  />
                </label>

                <label>
                  <span>Platform Commission Rate (%)</span>
                  <input
                    type="number"
                    value={createForm.commissionRate}
                    onChange={(e) => setCreateForm({ ...createForm, commissionRate: e.target.value })}
                    placeholder="10"
                    required
                  />
                </label>

                <label className="full-col">
                  <span>City / Location</span>
                  <input
                    type="text"
                    value={createForm.city}
                    onChange={(e) => setCreateForm({ ...createForm, city: e.target.value })}
                    placeholder="New York, London, San Francisco"
                  />
                </label>
              </div>

              <div className="modal-bottom-actions">
                <button type="button" onClick={() => setCreateOpen(false)} className="btn-cancel">Cancel</button>
                <button type="submit" className="btn-primary" disabled={creating}>
                  {creating ? 'Creating...' : 'Create Seller Credentials'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Seller Dashboard Modal */}
      {inspectSeller && (
        <div className="admin-modal-overlay" onClick={() => setInspectSeller(null)}>
          <div className="admin-modal-box large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <div className="inspect-head-title">
                <h3>📊 Seller Live Dashboard: <b>{inspectSeller.storeName}</b></h3>
                <span className="status-chip chip-active">Vendor View</span>
              </div>
              <button onClick={() => setInspectSeller(null)} className="close-btn"><Ic name="x" size={20} /></button>
            </div>

            {inspectLoading && <div className="text-center py-10 muted">Loading seller data...</div>}

            {!inspectLoading && inspectData && (
              <div className="inspect-body">
                {/* Stats row */}
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
                    <span>Total Orders</span>
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
                  <h4>🛒 Orders Dispatched ({inspectData.orders?.length || 0})</h4>
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

      {/* Manual Order Placement Modal on behalf of Seller */}
      {orderModalOpen && orderSeller && (
        <div className="admin-modal-overlay" onClick={() => setOrderModalOpen(false)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>📦 Place Order for Seller: <b>{orderSeller.storeName}</b></h3>
              <button onClick={() => setOrderModalOpen(false)} className="close-btn"><Ic name="x" size={20} /></button>
            </div>

            <form onSubmit={handlePlaceOrderSubmit} className="admin-modal-form">
              <p className="modal-desc-sub">
                Select products from <b>{orderSeller.storeName}</b>'s inventory and enter customer delivery details.
              </p>

              <div className="form-grid-2">
                <label className="full-col">
                  <span>Select Product from {orderSeller.storeName} *</span>
                  <select
                    value={orderForm.productId}
                    onChange={(e) => setOrderForm({ ...orderForm, productId: e.target.value })}
                    required
                  >
                    {sellerProds.length === 0 && <option value="">No products found for this seller</option>}
                    {sellerProds.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name} — {money(p.price)} (Stock: {p.stock})
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Quantity *</span>
                  <input
                    type="number"
                    min="1"
                    value={orderForm.qty}
                    onChange={(e) => setOrderForm({ ...orderForm, qty: e.target.value })}
                    required
                  />
                </label>

                <label>
                  <span>Payment Method</span>
                  <select
                    value={orderForm.paymentMethod}
                    onChange={(e) => setOrderForm({ ...orderForm, paymentMethod: e.target.value })}
                  >
                    <option value="cod">Cash on Delivery (COD)</option>
                    <option value="credit_card">Paid via Card</option>
                    <option value="easypaisa">EasyPaisa / JazzCash</option>
                  </select>
                </label>

                <label>
                  <span>Customer Full Name *</span>
                  <input
                    type="text"
                    value={orderForm.customerName}
                    onChange={(e) => setOrderForm({ ...orderForm, customerName: e.target.value })}
                    required
                  />
                </label>

                <label>
                  <span>Customer Phone *</span>
                  <input
                    type="text"
                    value={orderForm.customerPhone}
                    onChange={(e) => setOrderForm({ ...orderForm, customerPhone: e.target.value })}
                    required
                  />
                </label>

                <label className="full-col">
                  <span>Street Address *</span>
                  <input
                    type="text"
                    value={orderForm.street}
                    onChange={(e) => setOrderForm({ ...orderForm, street: e.target.value })}
                    required
                  />
                </label>

                <label>
                  <span>City *</span>
                  <input
                    type="text"
                    value={orderForm.city}
                    onChange={(e) => setOrderForm({ ...orderForm, city: e.target.value })}
                    required
                  />
                </label>

                <label>
                  <span>Delivery Charge (PKR)</span>
                  <input
                    type="number"
                    value={orderForm.shippingCost}
                    onChange={(e) => setOrderForm({ ...orderForm, shippingCost: e.target.value })}
                  />
                </label>

                <label className="full-col">
                  <span>Admin Internal Notes</span>
                  <input
                    type="text"
                    value={orderForm.adminNotes}
                    onChange={(e) => setOrderForm({ ...orderForm, adminNotes: e.target.value })}
                  />
                </label>
              </div>

              <div className="modal-bottom-actions">
                <button type="button" onClick={() => setOrderModalOpen(false)} className="btn-cancel">Cancel</button>
                <button type="submit" className="btn-primary" disabled={placingOrder}>
                  {placingOrder ? 'Submitting Order...' : 'Confirm & Place Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Compliance / Freeze & Warning Modal */}
      {compModalOpen && compSeller && (
        <div className="admin-modal-overlay" onClick={() => setCompModalOpen(false)}>
          <div className="admin-modal-box" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <div>
                <h3>🛡️ Seller Compliance & Policy Controls</h3>
                <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
                  Target Store: <b>{compSeller.storeName}</b> ({compSeller.ownerName})
                </p>
              </div>
              <button onClick={() => setCompModalOpen(false)} className="btn-close-modal">✕</button>
            </div>

            {/* Modal Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', padding: '0 16px' }}>
              <button
                type="button"
                onClick={() => setCompTab('freeze')}
                style={{
                  padding: '10px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: compTab === 'freeze' ? '2px solid #dc2626' : '2px solid transparent',
                  fontWeight: compTab === 'freeze' ? 700 : 500,
                  color: compTab === 'freeze' ? '#dc2626' : '#64748b',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                ❄️ Freeze / Account Status
              </button>
              <button
                type="button"
                onClick={() => setCompTab('warn')}
                style={{
                  padding: '10px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: compTab === 'warn' ? '2px solid #d97706' : '2px solid transparent',
                  fontWeight: compTab === 'warn' ? 700 : 500,
                  color: compTab === 'warn' ? '#d97706' : '#64748b',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                ⚠️ Issue Warning Announcement
              </button>
            </div>

            <div style={{ padding: '18px 22px' }}>
              {/* TAB 1: FREEZE / ACCOUNT STATUS */}
              {compTab === 'freeze' && (
                <form onSubmit={handleFreezeSubmit}>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6, color: '#1e293b' }}>
                      Account Access Status *
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', background: freezeStatus === 'active' ? '#ecfdf5' : '#fff' }}>
                        <input
                          type="radio"
                          name="freezeStatus"
                          value="active"
                          checked={freezeStatus === 'active'}
                          onChange={(e) => setFreezeStatus(e.target.value)}
                        />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#059669' }}>🟢 Active</span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', background: freezeStatus === 'frozen' ? '#eff6ff' : '#fff' }}>
                        <input
                          type="radio"
                          name="freezeStatus"
                          value="frozen"
                          checked={freezeStatus === 'frozen'}
                          onChange={(e) => setFreezeStatus(e.target.value)}
                        />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#2563eb' }}>❄️ Frozen</span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', background: freezeStatus === 'suspended' ? '#fef2f2' : '#fff' }}>
                        <input
                          type="radio"
                          name="freezeStatus"
                          value="suspended"
                          checked={freezeStatus === 'suspended'}
                          onChange={(e) => setFreezeStatus(e.target.value)}
                        />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#dc2626' }}>⛔ Suspended</span>
                      </label>
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6, color: '#1e293b' }}>
                      Reason / Policy Violation Details {freezeStatus !== 'active' ? '*' : '(Optional)'}
                    </label>
                    <textarea
                      rows="3"
                      value={freezeReason}
                      onChange={(e) => setFreezeReason(e.target.value)}
                      placeholder="e.g. Account frozen due to repeated unfulfilled orders and counterfeit customer complaints."
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontFamily: 'inherit' }}
                      required={freezeStatus !== 'active'}
                    />
                    <small className="muted" style={{ fontSize: 11 }}>
                      Yeh reason seller ke dashboard ke top header banner aur official chat mein dikhega.
                    </small>
                  </div>

                  <div className="modal-bottom-actions" style={{ marginTop: 20 }}>
                    <button type="button" onClick={() => setCompModalOpen(false)} className="btn-cancel">Cancel</button>
                    <button
                      type="submit"
                      className={freezeStatus === 'active' ? 'btn-primary' : 'btn-danger'}
                      disabled={submittingComp}
                    >
                      {submittingComp ? 'Updating Status...' : freezeStatus === 'active' ? '✅ Unfreeze & Restore Full Access' : `⛔ Set Account to ${freezeStatus.toUpperCase()}`}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 2: ISSUE WARNING ANNOUNCEMENT */}
              {compTab === 'warn' && (
                <form onSubmit={handleWarnSubmit}>
                  <div style={{ marginBottom: 14, background: '#fffbeb', padding: '10px 12px', border: '1px solid #fef3c7', borderRadius: 6 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#92400e' }}>
                      <input
                        type="checkbox"
                        checked={warnActive}
                        onChange={(e) => setWarnActive(e.target.checked)}
                      />
                      <span>Display Top Warning Announcement Bar on Seller Portal</span>
                    </label>
                  </div>

                  {warnActive && (
                    <>
                      <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6, color: '#1e293b' }}>
                          Warning Severity Level
                        </label>
                        <select
                          value={warnLevel}
                          onChange={(e) => setWarnLevel(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                        >
                          <option value="warning">⚠️ Standard Warning (Amber Bar)</option>
                          <option value="critical">🚨 Critical Warning (High Alert)</option>
                          <option value="info">ℹ️ Compliance Notice (Info Bar)</option>
                        </select>
                      </div>

                      <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6, color: '#1e293b' }}>
                          Custom Warning Message *
                        </label>
                        <textarea
                          rows="3"
                          value={warnMessage}
                          onChange={(e) => setWarnMessage(e.target.value)}
                          placeholder="e.g. Warning 1/3: High cancellation rate. Please fulfill all pending shipments within 24 hours to avoid account suspension."
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontFamily: 'inherit' }}
                          required={warnActive}
                        />
                        <small className="muted" style={{ fontSize: 11 }}>
                          Yeh message seller portal ke top header announcement bar par live broadcast hoga.
                        </small>
                      </div>
                    </>
                  )}

                  <div className="modal-bottom-actions" style={{ marginTop: 20 }}>
                    <button type="button" onClick={() => setCompModalOpen(false)} className="btn-cancel">Cancel</button>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={submittingComp}
                      style={{ background: warnActive ? '#d97706' : '#059669', borderColor: warnActive ? '#b45309' : '#047857' }}
                    >
                      {submittingComp ? 'Saving...' : warnActive ? '⚠️ Broadcast Warning Announcement' : '✅ Clear Warning Banner'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Admin Reset Seller Password Modal ────────────────────── */}
      {resetModalOpen && resetSeller && (
        <div className="admin-modal-overlay" onClick={() => setResetModalOpen(false)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>🔑</span>
                <h3>Reset Password: <b>{resetSeller.storeName}</b></h3>
              </div>
              <button onClick={() => setResetModalOpen(false)} className="close-btn"><Ic name="x" size={20} /></button>
            </div>

            {resetError && <div className="modal-err-banner">{resetError}</div>}
            {resetSuccess && (
              <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
                {resetSuccess}
              </div>
            )}

            <form onSubmit={handleResetPasswordSubmit} className="admin-modal-form">
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
    </div>
  );
}
