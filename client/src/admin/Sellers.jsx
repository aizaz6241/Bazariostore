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

  // Compliance / Freeze & Warning & Health Modal
  const [compModalOpen, setCompModalOpen] = useState(false);
  const [compSeller, setCompSeller] = useState(null);
  const [compTab, setCompTab] = useState('freeze'); // 'freeze' | 'warn' | 'health'
  const [freezeStatus, setFreezeStatus] = useState('frozen');
  const [freezeReason, setFreezeReason] = useState('');
  const [warnActive, setWarnActive] = useState(true);
  const [warnLevel, setWarnLevel] = useState('warning');
  const [warnMessage, setWarnMessage] = useState('');
  const [healthScore, setHealthScore] = useState(100);
  const [healthReason, setHealthReason] = useState('');
  const [submittingComp, setSubmittingComp] = useState(false);
  const [submittingHealth, setSubmittingHealth] = useState(false);

  // Admin Direct Withdrawal Limit Settings
  const [limitMaxAmount, setLimitMaxAmount] = useState('500');
  const [limitMinAmount, setLimitMinAmount] = useState('10');
  const [limitRequiredCount, setLimitRequiredCount] = useState('10');
  const [limitSuccessCount, setLimitSuccessCount] = useState('0');
  const [limitUpgradeFee, setLimitUpgradeFee] = useState('50');
  const [limitTierName, setLimitTierName] = useState('');
  const [submittingLimitEdit, setSubmittingLimitEdit] = useState(false);

  // Admin Reset Seller Password Modal
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetSeller, setResetSeller] = useState(null);
  const [newSellerPassword, setNewSellerPassword] = useState('');
  const [confirmSellerPassword, setConfirmSellerPassword] = useState('');
  const [resettingPw, setResettingPw] = useState(false);
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetError, setResetError] = useState('');
  const [showAdminSellerPw, setShowAdminSellerPw] = useState(false);

  // Top Action Navigation Tabs
  const [adminTab, setAdminTab] = useState('sellers'); // 'sellers' | 'pending' | 'targets' | 'referral'

  // Pending Approvals & KYC Modal
  const [pendingApproveModal, setPendingApproveModal] = useState(null);
  const [pendingRejectModal, setPendingRejectModal] = useState(null);
  const [kycDocModal, setKycDocModal] = useState(null);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  // Master Referral Code State
  const [masterRefCode, setMasterRefCode] = useState('');
  const [savingMasterRef, setSavingMasterRef] = useState(false);

  // Targets State
  const [allTargets, setAllTargets] = useState([]);
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [targetForm, setTargetForm] = useState({
    sellerId: '',
    title: 'Process 10 Orders Milestone',
    targetOrderCount: 10,
    bonusAmount: 50,
    description: 'Complete 10 delivered orders to receive $50 bonus.',
  });
  const [creatingTarget, setCreatingTarget] = useState(false);

  const loadSellers = () => {
    setLoading(true);
    api('/sellers')
      .then(setSellers)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };

  const loadMasterReferral = () => {
    api('/sellers/master-referral')
      .then((res) => {
        if (res?.masterReferralCode) setMasterRefCode(res.masterReferralCode);
      })
      .catch(() => {});
  };

  const loadTargets = () => {
    api('/sellers/targets/all')
      .then((res) => {
        const list = Array.isArray(res)
          ? res
          : Array.isArray(res?.targets)
          ? res.targets
          : Array.isArray(res?.allTargets)
          ? res.allTargets
          : [];
        setAllTargets(list);
      })
      .catch((e) => {
        console.error('Error loading targets:', e);
        setAllTargets([]);
      });
  };

  useEffect(() => {
    loadSellers();
    loadMasterReferral();
    loadTargets();
  }, []);

  const handleOpenCompliance = (seller, tab = 'freeze') => {
    setCompSeller(seller);
    setFreezeStatus(seller.status || 'active');
    setFreezeReason(seller.freezeReason || '');
    setWarnActive(Boolean(seller.warning?.active));
    setWarnLevel(seller.warning?.level || 'warning');
    setWarnMessage(seller.warning?.message || '');
    setHealthScore(seller.accountHealth?.score !== undefined ? seller.accountHealth.score : 100);
    setHealthReason('');

    const wl = seller.withdrawalLimit || {};
    setLimitMaxAmount(wl.maxAmount !== undefined ? String(wl.maxAmount) : '500');
    setLimitMinAmount(wl.minAmount !== undefined ? String(wl.minAmount) : '10');
    setLimitRequiredCount(wl.requiredWithdrawalsForIncrease !== undefined ? String(wl.requiredWithdrawalsForIncrease) : '10');
    setLimitSuccessCount(wl.successfulWithdrawalCount !== undefined ? String(wl.successfulWithdrawalCount) : '0');
    setLimitUpgradeFee(wl.upgradeFee !== undefined ? String(wl.upgradeFee) : '50');
    setLimitTierName(wl.currentTierName || 'Tier 1 - Standard ($500 Max)');
    setCompTab(tab || (seller.status !== 'active' ? 'freeze' : seller.warning?.active ? 'warn' : 'freeze'));
    setCompModalOpen(true);

    // Fetch live fresh seller data from backend to ensure 100% sync
    api(`/sellers/${seller._id}`)
      .then((data) => {
        const liveSeller = data.seller || data;
        if (liveSeller) {
          setCompSeller(liveSeller);
          const liveWl = liveSeller.withdrawalLimit || {};
          setLimitMaxAmount(liveWl.maxAmount !== undefined ? String(liveWl.maxAmount) : '500');
          setLimitMinAmount(liveWl.minAmount !== undefined ? String(liveWl.minAmount) : '10');
          setLimitRequiredCount(liveWl.requiredWithdrawalsForIncrease !== undefined ? String(liveWl.requiredWithdrawalsForIncrease) : '10');
          setLimitSuccessCount(liveWl.successfulWithdrawalCount !== undefined ? String(liveWl.successfulWithdrawalCount) : '0');
          setLimitUpgradeFee(liveWl.upgradeFee !== undefined ? String(liveWl.upgradeFee) : '50');
          setLimitTierName(liveWl.currentTierName || 'Tier 1 - Standard ($500 Max)');
          if (liveSeller.accountHealth?.score !== undefined) setHealthScore(liveSeller.accountHealth.score);
        }
      })
      .catch(() => {});
  };

  const handleHealthSubmit = async (e) => {
    e.preventDefault();
    if (!compSeller) return;
    setSubmittingHealth(true);
    try {
      await api(`/sellers/${compSeller._id}/health`, {
        method: 'POST',
        body: {
          score: Number(healthScore),
          reason: healthReason.trim() || 'Health score evaluated by Platform Compliance Desk',
        },
      });
      alert(`Seller Account Health updated to ${healthScore}/100! ✅`);
      setCompModalOpen(false);
      loadSellers();
    } catch (err) {
      alert('Error updating health: ' + err.message);
    } finally {
      setSubmittingHealth(false);
    }
  };

  const handleLimitEditSubmit = async (e) => {
    e.preventDefault();
    if (!compSeller) return;
    setSubmittingLimitEdit(true);
    try {
      const res = await api(`/sellers/${compSeller._id}/withdrawal-limit`, {
        method: 'POST',
        body: {
          maxAmount: Number(limitMaxAmount),
          minAmount: Number(limitMinAmount),
          requiredWithdrawalsForIncrease: Number(limitRequiredCount),
          successfulWithdrawalCount: Number(limitSuccessCount),
          upgradeFee: Number(limitUpgradeFee),
          currentTierName: limitTierName.trim(),
        },
      });
      alert(`Withdrawal limit settings updated for ${compSeller.storeName}! ✅`);
      setCompModalOpen(false);
      const updatedLimit = res.withdrawalLimit || res.seller?.withdrawalLimit || {
        maxAmount: Number(limitMaxAmount),
        minAmount: Number(limitMinAmount),
        requiredWithdrawalsForIncrease: Number(limitRequiredCount),
        successfulWithdrawalCount: Number(limitSuccessCount),
        upgradeFee: Number(limitUpgradeFee),
        currentTierName: limitTierName.trim(),
      };
      setSellers((prev) =>
        prev.map((s) => (s._id === compSeller._id ? { ...s, withdrawalLimit: updatedLimit } : s))
      );
      loadSellers();
    } catch (err) {
      alert('Error updating limits: ' + err.message);
    } finally {
      setSubmittingLimitEdit(false);
    }
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

  const handleApproveSubmit = async (e) => {
    e.preventDefault();
    if (!pendingApproveModal?.seller) return;
    setApproving(true);
    try {
      await api(`/sellers/${pendingApproveModal.seller._id}/approve`, {
        method: 'POST',
        body: {
          securityDepositAmount: Number(pendingApproveModal.securityDepositAmount || 0),
          securityDepositPaid: Boolean(pendingApproveModal.securityDepositPaid),
          assignedReferralCode: pendingApproveModal.referralCode?.trim() || '',
        },
      });
      alert(`🎉 Store "${pendingApproveModal.seller.storeName}" has been successfully approved! Notification sent.`);
      setPendingApproveModal(null);
      loadSellers();
    } catch (err) {
      alert('Error approving seller: ' + err.message);
    } finally {
      setApproving(false);
    }
  };

  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!pendingRejectModal?.seller) return;
    setRejecting(true);
    try {
      await api(`/sellers/${pendingRejectModal.seller._id}/reject`, {
        method: 'POST',
        body: {
          reason: pendingRejectModal.reason?.trim() || 'Application does not meet platform merchant criteria.',
        },
      });
      alert(`Seller application for "${pendingRejectModal.seller.storeName}" has been rejected.`);
      setPendingRejectModal(null);
      loadSellers();
    } catch (err) {
      alert('Error rejecting seller: ' + err.message);
    } finally {
      setRejecting(false);
    }
  };

  const handleSaveMasterReferral = async (e) => {
    e.preventDefault();
    setSavingMasterRef(true);
    try {
      const res = await api('/sellers/master-referral', {
        method: 'POST',
        body: { referralCode: masterRefCode.trim().toUpperCase() },
      });
      setMasterRefCode(res.masterReferralCode);
      alert('✅ Master Referral Code updated successfully!');
    } catch (err) {
      alert('Error updating referral code: ' + err.message);
    } finally {
      setSavingMasterRef(false);
    }
  };

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
          description: targetForm.description.trim(),
          adminNote: targetForm.description.trim(),
        },
      });
      alert('🎯 Milestone Target assigned to seller successfully!');
      setTargetModalOpen(false);
      loadTargets();
      loadSellers();
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
      loadTargets();
      loadSellers();
    } catch (err) {
      alert('Error deleting target: ' + err.message);
    }
  };

  const filtered = sellers.filter((s) => {
    if (s.status === 'pending_approval') return false; // Shown in Pending tab
    if (!q) return true;
    const match =
      s.storeName?.toLowerCase().includes(q.toLowerCase()) ||
      s.ownerName?.toLowerCase().includes(q.toLowerCase()) ||
      s.email?.toLowerCase().includes(q.toLowerCase());
    return match;
  });

  const pendingList = sellers.filter((s) => s.status === 'pending_approval');

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

      {/* Action Navigation Tabs */}
      <div className="wallet-action-tabs" style={{ marginBottom: 18 }}>
        <button
          type="button"
          className={`wallet-action-tab ${adminTab === 'sellers' ? 'active' : ''}`}
          onClick={() => setAdminTab('sellers')}
        >
          🏢 All Registered Merchants ({sellers.filter((s) => s.status !== 'pending_approval').length})
        </button>
        <button
          type="button"
          className={`wallet-action-tab ${adminTab === 'pending' ? 'active' : ''}`}
          onClick={() => setAdminTab('pending')}
        >
          ⏳ Pending Applications ({pendingList.length})
        </button>
        <button
          type="button"
          className={`wallet-action-tab ${adminTab === 'targets' ? 'active' : ''}`}
          onClick={() => { setAdminTab('targets'); loadTargets(); }}
        >
          🎯 Targets &amp; Cash Bonuses ({(Array.isArray(allTargets) ? allTargets : []).length})
        </button>
        <button
          type="button"
          className={`wallet-action-tab ${adminTab === 'referral' ? 'active' : ''}`}
          onClick={() => { setAdminTab('referral'); loadMasterReferral(); }}
        >
          🔑 Master Referral Code
        </button>
      </div>

      {/* ─── TAB 1: ACTIVE & REGISTERED MERCHANTS ─── */}
      {adminTab === 'sellers' && (
        <>
          {/* Search Bar & Summary Stats */}
          <div className="admin-sellers-stats-bar">
            <div className="stat-box">
              <span className="lbl">Total Active Sellers</span>
              <b className="val">{sellers.filter((s) => s.status !== 'pending_approval').length}</b>
            </div>
            <div className="stat-box">
              <span className="lbl">Healthy Accounts</span>
              <b className="val text-green">{sellers.filter((s) => s.status === 'active' && (s.accountHealth?.score ?? 100) >= 80).length}</b>
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

          {/* ─── AT-RISK ACCOUNT HEALTH ALERT PANEL (SCORE <= 30) ─── */}
          {(() => {
            const atRiskSellers = sellers.filter((s) => s.status !== 'pending_approval' && (s.accountHealth?.score !== undefined ? s.accountHealth.score : 100) <= 30);
            if (atRiskSellers.length === 0) return null;
            return (
              <div className="admin-health-alert-box">
                <div className="ahab-head">
                  <span className="ahab-title">
                    ⚠️ URGENT: {atRiskSellers.length} Merchant Account(s) in Critical Health Zone (&le; 30% Score)
                  </span>
                  <small className="muted" style={{ fontSize: 11 }}>Review policy performance and take restriction actions</small>
                </div>
                <div className="ahab-list">
                  {atRiskSellers.map((s) => {
                    const score = s.accountHealth?.score || 0;
                    const isSuspendTier = score <= 20;
                    return (
                      <div key={s._id} className="ahab-item">
                        <div>
                          <b className="ahab-store-name">{s.storeName}</b>
                          <div className="ahab-store-score" style={{ color: isSuspendTier ? '#dc2626' : '#ea580c' }}>
                            {isSuspendTier ? `⛔ ${score}/100 (Suspension Alert)` : `❄️ ${score}/100 (Freeze Alert)`}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenCompliance(s, 'freeze')}
                            className="ahab-btn-action"
                          >
                            {isSuspendTier ? '⛔ Suspend' : '❄️ Freeze'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenCompliance(s, 'health')}
                            className="ahab-btn-action"
                            style={{ background: '#0f172a' }}
                          >
                            🛡️ Score
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

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
            <div className="admin-table-wrap">
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
                <th>Account Health</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="10" className="text-center py-8 muted">Loading sellers directory...</td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan="10" className="text-center py-8 muted">No sellers found.</td>
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
                    {(() => {
                      const score = s.accountHealth?.score !== undefined ? s.accountHealth.score : 100;
                      const tier = score >= 80 ? 'healthy' : score >= 31 ? 'warning' : score > 20 ? 'freeze' : 'suspended';
                      const tierBg = score >= 80 ? '#dcfce7' : score >= 31 ? '#fef9c3' : score > 20 ? '#ffedd5' : '#fee2e2';
                      const tierColor = score >= 80 ? '#15803d' : score >= 31 ? '#854d0e' : score > 20 ? '#c2410c' : '#b91c1c';
                      const fillBg = score >= 80 ? '#16a34a' : score >= 31 ? '#eab308' : score > 20 ? '#ea580c' : '#dc2626';

                      return (
                        <div
                          className="admin-health-cell"
                          onClick={() => handleOpenCompliance(s, 'health')}
                          title="Click to adjust Account Health score"
                        >
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
                      );
                    })()}
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
      </div>
    </>
  )}

  {/* ─── TAB 2: PENDING MERCHANT APPLICATIONS ─── */}
  {adminTab === 'pending' && (
    <div className="admin-card">
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>⏳ Pending Merchant Self-Registrations</h3>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#64748b' }}>
            Review merchant credential submissions, KYC documents (National ID / Passport), and configure security deposits upon approval.
          </p>
        </div>
        <span className="badge-pill" style={{ background: '#fef3c7', color: '#92400e' }}>
          {pendingList.length} Awaiting Decision
        </span>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Applicant Store</th>
              <th>Owner &amp; Contacts</th>
              <th>Referral Code</th>
              <th>KYC Documents</th>
              <th>Submitted Date</th>
              <th>Decision Actions</th>
            </tr>
          </thead>
          <tbody>
            {pendingList.length === 0 && (
              <tr>
                <td colSpan="6" className="text-center py-8 muted">
                  🎉 No pending merchant registrations awaiting approval.
                </td>
              </tr>
            )}
            {pendingList.map((s) => (
              <tr key={s._id}>
                <td>
                  <b>{s.storeName}</b>
                  <small className="muted block">{s.description || 'New Merchant Store'}</small>
                </td>
                <td>
                  <b>{s.ownerName}</b>
                  <small className="muted block">✉️ {s.email}</small>
                  <small className="muted block">📞 {s.phone || 'N/A'}</small>
                </td>
                <td>
                  {s.referralCode ? (
                    <span style={{ fontSize: 11, fontWeight: 800, background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: 4 }}>
                      🔑 {s.referralCode}
                    </span>
                  ) : (
                    <span className="muted-sm">Direct / None</span>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {s.kycDocuments?.idCard || s.kycDocuments?.idDocumentUrl ? (
                      <button
                        type="button"
                        onClick={() => setKycDocModal({ seller: s, docType: 'idCard', docUrl: s.kycDocuments.idCard || s.kycDocuments.idDocumentUrl })}
                        style={{ padding: '3px 8px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                      >
                        🪪 View ID
                      </button>
                    ) : (
                      <small className="muted-sm">No ID</small>
                    )}
                    {s.kycDocuments?.passport || s.kycDocuments?.passportDocumentUrl ? (
                      <button
                        type="button"
                        onClick={() => setKycDocModal({ seller: s, docType: 'passport', docUrl: s.kycDocuments.passport || s.kycDocuments.passportDocumentUrl })}
                        style={{ padding: '3px 8px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                      >
                        🛂 View Passport
                      </button>
                    ) : (
                      <small className="muted-sm">No Passport</small>
                    )}
                    {s.kycDocuments?.bankStatement || s.kycDocuments?.bankStatementUrl ? (
                      <button
                        type="button"
                        onClick={() => setKycDocModal({ seller: s, docType: 'bankStatement', docUrl: s.kycDocuments.bankStatement || s.kycDocuments.bankStatementUrl })}
                        style={{ padding: '3px 8px', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 4, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', color: '#1d4ed8' }}
                      >
                        🏦 Bank Statement
                      </button>
                    ) : (
                      <small className="muted-sm">No Statement</small>
                    )}
                  </div>
                </td>
                <td>
                  <small>{fmtDate(s.createdAt)}</small>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setPendingApproveModal({ seller: s, securityDepositAmount: 500, securityDepositPaid: true, referralCode: s.referralCode || '' })}
                      style={{ padding: '6px 12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                    >
                      ✅ Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingRejectModal({ seller: s, reason: '' })}
                      style={{ padding: '6px 12px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      ❌ Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )}

  {/* ─── TAB 3: TARGETS & MILESTONE BONUSES ─── */}
  {adminTab === 'targets' && (
    <div className="admin-card">
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>🎯 Merchant Target &amp; Bonus Milestone Manager</h3>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#64748b' }}>
            Assign delivery volume performance milestones. Bonuses are automatically released to merchant wallets upon delivery completion.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTargetModalOpen(true)}
          className="btn-primary"
        >
          <Ic name="plus" size={15} /> + Assign New Target Milestone
        </button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Store Name</th>
              <th>Milestone Title</th>
              <th>Target Deliveries</th>
              <th>Progress</th>
              <th>Bonus ($)</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(Array.isArray(allTargets) ? allTargets : []).length === 0 && (
              <tr>
                <td colSpan="7" className="text-center py-8 muted">
                  No performance targets assigned yet. Click "+ Assign New Target Milestone" above.
                </td>
              </tr>
            )}
            {(Array.isArray(allTargets) ? allTargets : []).map((tgt, idx) => {
              const current = tgt.currentOrders || tgt.currentOrderCount || 0;
              const target = tgt.targetOrders || tgt.targetOrderCount || 1;
              const pct = Math.min(100, Math.round((current / target) * 100));
              const isCompleted = tgt.status === 'completed' || current >= target;
              const targetKey = tgt._id || tgt.targetId || `target-${idx}`;

              return (
                <tr key={targetKey}>
                  <td>
                    <b>{tgt.storeName || 'Merchant'}</b>
                    <small className="muted block">Owner: {tgt.ownerName || '—'}</small>
                  </td>
                  <td>
                    <b>{tgt.title}</b>
                    {(tgt.description || tgt.adminNote) && <small className="muted block">{tgt.description || tgt.adminNote}</small>}
                  </td>
                  <td><b>{target} Delivered Orders</b></td>
                  <td>
                    <div style={{ minWidth: 120 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                        <span>{current}/{target}</span>
                        <b>{pct}%</b>
                      </div>
                      <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: isCompleted ? '#16a34a' : '#f59e0b' }} />
                      </div>
                    </div>
                  </td>
                  <td>
                    <b style={{ color: '#16a34a', fontSize: 13 }}>+{money(tgt.bonusAmount || 0)}</b>
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
                      }}
                    >
                      {isCompleted ? '🎉 COMPLETED' : 'IN PROGRESS'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleDeleteTarget(tgt.sellerId, tgt.targetId || tgt._id)}
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                      title="Remove Target"
                    >
                      🗑️ Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  )}

  {/* ─── TAB 4: MASTER REFERRAL CODE PROGRAM ─── */}
  {adminTab === 'referral' && (
    <div className="admin-card" style={{ maxWidth: 640 }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>🔑 Platform Master Referral Code Program</h3>
        <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#64748b' }}>
          Configure the global Master Referral Code used during merchant self-onboarding.
        </p>
      </div>

      <form onSubmit={handleSaveMasterReferral} style={{ padding: '20px 24px' }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 6, color: '#1e293b' }}>
            Current Master Referral Code:
          </label>
          <input
            type="text"
            value={masterRefCode}
            onChange={(e) => setMasterRefCode(e.target.value.toUpperCase())}
            placeholder="e.g. BAZARIO2026"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 16, fontWeight: 800, letterSpacing: 1 }}
            required
          />
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
          <b style={{ color: '#166534', fontSize: 13 }}>💡 Referral Link for Applicants:</b>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: '#15803d', wordBreak: 'break-all' }}>
            {typeof window !== 'undefined' ? `${window.location.origin}/seller/login?ref=${masterRefCode || 'BAZARIO'}` : `https://bazario.com/seller/login?ref=${masterRefCode}`}
          </p>
        </div>

        <button
          type="submit"
          className="btn-primary"
          disabled={savingMasterRef}
        >
          {savingMasterRef ? 'Saving...' : '💾 Save Master Referral Code'}
        </button>
      </form>
    </div>
  )}

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
              <button
                type="button"
                onClick={() => setCompTab('health')}
                style={{
                  padding: '10px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: compTab === 'health' ? '2px solid #16a34a' : '2px solid transparent',
                  fontWeight: compTab === 'health' ? 700 : 500,
                  color: compTab === 'health' ? '#16a34a' : '#64748b',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                🛡️ Adjust Health (0-100)
              </button>
              <button
                type="button"
                onClick={() => setCompTab('limits')}
                style={{
                  padding: '10px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: compTab === 'limits' ? '2px solid #2563eb' : '2px solid transparent',
                  fontWeight: compTab === 'limits' ? 700 : 500,
                  color: compTab === 'limits' ? '#2563eb' : '#64748b',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                💳 Withdrawal Limits
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

              {/* TAB 3: ACCOUNT HEALTH RATING (0-100) */}
              {compTab === 'health' && (
                <form onSubmit={handleHealthSubmit}>
                  {/* Current Rating Hero Box */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16 }}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Current Rating</span>
                      <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>
                        {compSeller.accountHealth?.score !== undefined ? compSeller.accountHealth.score : 100}/100
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Target Tier</span>
                      <div>
                        <span className={`sthp-tag health-tag-${Number(healthScore) >= 80 ? 'healthy' : Number(healthScore) >= 31 ? 'warning' : Number(healthScore) > 20 ? 'freeze' : 'suspended'}`}>
                          {Number(healthScore) >= 80 ? 'Healthy (80-100)' : Number(healthScore) >= 31 ? 'At Risk (31-79)' : Number(healthScore) > 20 ? 'Freeze Alert (21-30)' : 'Suspension Alert (0-20)'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Slider and Number Input */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>
                        Adjust Health Score (0 to 100) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={healthScore}
                        onChange={(e) => setHealthScore(Math.max(0, Math.min(100, Number(e.target.value))))}
                        style={{ width: 70, padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontWeight: 800, textAlign: 'center' }}
                      />
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={healthScore}
                      onChange={(e) => setHealthScore(Number(e.target.value))}
                      style={{ width: '100%', accentColor: Number(healthScore) >= 80 ? '#16a34a' : Number(healthScore) >= 31 ? '#eab308' : Number(healthScore) > 20 ? '#ea580c' : '#dc2626' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#94a3b8', fontWeight: 700, marginTop: 4 }}>
                      <span style={{ color: '#dc2626' }}>0 (Suspension)</span>
                      <span style={{ color: '#ea580c' }}>20-30 (Freeze)</span>
                      <span style={{ color: '#ca8a04' }}>31-79 (At Risk)</span>
                      <span style={{ color: '#16a34a' }}>80-100 (Healthy)</span>
                    </div>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>
                      Quick Reason Presets:
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setHealthScore((prev) => Math.max(0, prev - 15));
                          setHealthReason('Late order dispatch exceeds platform 48h fulfillment policy.');
                        }}
                        style={{ fontSize: 11.5, padding: '4px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer' }}
                      >
                        ⏱️ Late Dispatch (-15)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHealthScore((prev) => Math.max(0, prev - 20));
                          setHealthReason('Customer complaints of counterfeit / defective items received.');
                        }}
                        style={{ fontSize: 11.5, padding: '4px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer' }}
                      >
                        ⚠️ Defective Item (-20)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHealthScore((prev) => Math.max(0, prev - 30));
                          setHealthReason('Serious copyright or policy compliance violation.');
                        }}
                        style={{ fontSize: 11.5, padding: '4px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer' }}
                      >
                        ⛔ Policy Violation (-30)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHealthScore((prev) => Math.min(100, prev + 15));
                          setHealthReason('Customer dispute satisfactorily resolved with refund.');
                        }}
                        style={{ fontSize: 11.5, padding: '4px 8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer' }}
                      >
                        ✅ Dispute Resolved (+15)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHealthScore(100);
                          setHealthReason('Clean compliance slate restored by Platform Admin.');
                        }}
                        style={{ fontSize: 11.5, padding: '4px 8px', background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}
                      >
                        🌟 Reset to 100
                      </button>
                    </div>
                  </div>

                  {/* Reason Input */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6, color: '#1e293b' }}>
                      Reason / Notes *
                    </label>
                    <textarea
                      rows="2"
                      value={healthReason}
                      onChange={(e) => setHealthReason(e.target.value)}
                      placeholder="Enter policy reason for health score adjustment..."
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontFamily: 'inherit' }}
                      required
                    />
                  </div>

                  <div className="modal-bottom-actions" style={{ marginTop: 20 }}>
                    <button type="button" onClick={() => setCompModalOpen(false)} className="btn-cancel">Cancel</button>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={submittingHealth}
                    >
                      {submittingHealth ? 'Saving...' : `💾 Save Account Health (${healthScore}/100)`}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 4: WITHDRAWAL LIMITS & TIER CONTROLS */}
              {compTab === 'limits' && (
                <form onSubmit={handleLimitEditSubmit}>
                  {/* Current Active Status Notice */}
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>Current Active Tier for {compSeller.storeName}:</span>
                      <div style={{ fontSize: 14, fontWeight: 900, color: '#14532d', marginTop: 1 }}>
                        {limitTierName || 'Tier 1 - Standard ($500 Max)'}
                      </div>
                    </div>
                    <span style={{ background: '#22c55e', color: '#ffffff', fontWeight: 800, fontSize: 11, padding: '3px 8px', borderRadius: 6 }}>
                      Max: ${Number(limitMaxAmount || 500).toLocaleString('en-US')} USD
                    </span>
                  </div>

                  {/* 1-Click Tier Presets */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 6, color: '#64748b', textTransform: 'uppercase' }}>
                      ⚡ 1-Click Banking Tier Presets:
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setLimitMaxAmount('500');
                          setLimitMinAmount('10');
                          setLimitRequiredCount('10');
                          setLimitSuccessCount('0');
                          setLimitUpgradeFee('50');
                          setLimitTierName('Tier 1 - Standard ($500 Max)');
                        }}
                        style={{ padding: '6px 8px', fontSize: 11.5, fontWeight: 700, borderRadius: 6, border: limitMaxAmount == '500' ? '2px solid #2563eb' : '1px solid #cbd5e1', background: limitMaxAmount == '500' ? '#eff6ff' : '#ffffff', color: limitMaxAmount == '500' ? '#1d4ed8' : '#334155', cursor: 'pointer', textAlign: 'center' }}
                      >
                        🥉 Tier 1 ($500 Max)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLimitMaxAmount('1000');
                          setLimitMinAmount('10');
                          setLimitRequiredCount('10');
                          setLimitSuccessCount('0');
                          setLimitUpgradeFee('75');
                          setLimitTierName('Tier 2 - Silver Merchant ($1,000 Max)');
                        }}
                        style={{ padding: '6px 8px', fontSize: 11.5, fontWeight: 700, borderRadius: 6, border: limitMaxAmount == '1000' ? '2px solid #2563eb' : '1px solid #cbd5e1', background: limitMaxAmount == '1000' ? '#eff6ff' : '#ffffff', color: limitMaxAmount == '1000' ? '#1d4ed8' : '#334155', cursor: 'pointer', textAlign: 'center' }}
                      >
                        🥈 Tier 2 ($1,000 Max)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLimitMaxAmount('2500');
                          setLimitMinAmount('10');
                          setLimitRequiredCount('15');
                          setLimitSuccessCount('0');
                          setLimitUpgradeFee('100');
                          setLimitTierName('Tier 3 - Gold Partner ($2,500 Max)');
                        }}
                        style={{ padding: '6px 8px', fontSize: 11.5, fontWeight: 700, borderRadius: 6, border: limitMaxAmount == '2500' ? '2px solid #2563eb' : '1px solid #cbd5e1', background: limitMaxAmount == '2500' ? '#eff6ff' : '#ffffff', color: limitMaxAmount == '2500' ? '#1d4ed8' : '#334155', cursor: 'pointer', textAlign: 'center' }}
                      >
                        🥇 Tier 3 ($2,500 Max)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLimitMaxAmount('5000');
                          setLimitMinAmount('10');
                          setLimitRequiredCount('20');
                          setLimitSuccessCount('0');
                          setLimitUpgradeFee('150');
                          setLimitTierName('Tier 4 - Diamond VIP ($5,000 Max)');
                        }}
                        style={{ padding: '6px 8px', fontSize: 11.5, fontWeight: 700, borderRadius: 6, border: limitMaxAmount == '5000' ? '2px solid #2563eb' : '1px solid #cbd5e1', background: limitMaxAmount == '5000' ? '#eff6ff' : '#ffffff', color: limitMaxAmount == '5000' ? '#1d4ed8' : '#334155', cursor: 'pointer', textAlign: 'center' }}
                      >
                        💎 Tier 4 ($5,000 Max)
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                        Single Max Withdrawal Limit ($ USD) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={limitMaxAmount}
                        onChange={(e) => {
                          const val = e.target.value;
                          setLimitMaxAmount(val);
                          if (val === '500') setLimitTierName('Tier 1 - Standard ($500 Max)');
                          else if (val === '1000') setLimitTierName('Tier 2 - Silver Merchant ($1,000 Max)');
                          else if (val === '2500') setLimitTierName('Tier 3 - Gold Partner ($2,500 Max)');
                          else if (val === '5000') setLimitTierName('Tier 4 - Diamond VIP ($5,000 Max)');
                        }}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14, fontWeight: 800, color: '#2563eb' }}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                        Minimum Allowed Payout ($ USD)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={limitMinAmount}
                        onChange={(e) => setLimitMinAmount(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                        Required Withdrawals for Next Tier *
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={limitRequiredCount}
                        onChange={(e) => setLimitRequiredCount(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                        Completed Withdrawals (Current Tier)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={limitSuccessCount}
                        onChange={(e) => setLimitSuccessCount(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontWeight: 800, color: '#16a34a' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                        Upgrade Processing Fee ($ USD)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={limitUpgradeFee}
                        onChange={(e) => setLimitUpgradeFee(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14, fontWeight: 800, color: '#d97706' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                        Tier Name Label
                      </label>
                      <input
                        type="text"
                        value={limitTierName}
                        onChange={(e) => setLimitTierName(e.target.value)}
                        placeholder="e.g. Tier 1 - Standard ($500 Max)"
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                      />
                    </div>
                  </div>

                  <div className="modal-bottom-actions" style={{ marginTop: 20 }}>
                    <button type="button" onClick={() => setCompModalOpen(false)} className="btn-cancel">Cancel</button>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={submittingLimitEdit}
                    >
                      {submittingLimitEdit ? 'Saving...' : '💾 Save Withdrawal Limit Settings'}
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

      {/* ─── Modal 1: Approve Seller Application ─── */}
      {pendingApproveModal && (
        <div className="admin-modal-overlay" onClick={() => setPendingApproveModal(null)}>
          <div className="admin-modal-box" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>✅</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Approve Merchant: <b>{pendingApproveModal.seller.storeName}</b></h3>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>Configure security deposit collateral &amp; activate account</p>
                </div>
              </div>
              <button onClick={() => setPendingApproveModal(null)} className="btn-close-modal">✕</button>
            </div>

            <form onSubmit={handleApproveSubmit} style={{ padding: '18px 22px' }}>
              <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: '#1e293b' }}>
                  <b>Applicant:</b> {pendingApproveModal.seller.ownerName} &bull; <b>Email:</b> {pendingApproveModal.seller.email}
                </div>
              </div>

              <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 16px', borderRadius: 8 }}>
                <div>
                  <b style={{ color: '#166534', fontSize: 13.5, display: 'block' }}>Security Deposit Paid by Merchant</b>
                  <small style={{ color: '#15803d', fontSize: 12 }}>Lock collateral in seller wallet ledger</small>
                </div>
                <input
                  type="checkbox"
                  checked={pendingApproveModal.securityDepositPaid}
                  onChange={(e) => setPendingApproveModal({ ...pendingApproveModal, securityDepositPaid: e.target.checked })}
                  style={{ width: 20, height: 20, cursor: 'pointer' }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                  Security Deposit Collateral ($ USD):
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={pendingApproveModal.securityDepositAmount}
                  onChange={(e) => setPendingApproveModal({ ...pendingApproveModal, securityDepositAmount: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14 }}
                  required
                />
                <small className="muted-sm">This amount will show in the seller's wallet as Security Deposit.</small>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                  Affiliate / Referral Code (Optional):
                </label>
                <input
                  type="text"
                  value={pendingApproveModal.referralCode}
                  onChange={(e) => setPendingApproveModal({ ...pendingApproveModal, referralCode: e.target.value.toUpperCase() })}
                  placeholder="e.g. BAZARIO"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </div>

              <div className="modal-bottom-actions">
                <button type="button" onClick={() => setPendingApproveModal(null)} className="btn-cancel">Cancel</button>
                <button type="submit" className="btn-primary" disabled={approving} style={{ background: '#16a34a', borderColor: '#16a34a' }}>
                  {approving ? 'Approving...' : '🎉 Approve Merchant & Send Welcome Notice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal 2: Reject Seller Application ─── */}
      {pendingRejectModal && (
        <div className="admin-modal-overlay" onClick={() => setPendingRejectModal(null)}>
          <div className="admin-modal-box" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>❌</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Reject Application: <b>{pendingRejectModal.seller.storeName}</b></h3>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>Provide a reason for rejection</p>
                </div>
              </div>
              <button onClick={() => setPendingRejectModal(null)} className="btn-close-modal">✕</button>
            </div>

            <form onSubmit={handleRejectSubmit} style={{ padding: '18px 22px' }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 6 }}>
                  Rejection Reason:
                </label>
                <textarea
                  rows={4}
                  value={pendingRejectModal.reason}
                  onChange={(e) => setPendingRejectModal({ ...pendingRejectModal, reason: e.target.value })}
                  placeholder="e.g. Submitted ID documents are blurry or invalid. Please re-apply with a clear passport copy."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontFamily: 'inherit' }}
                  required
                />
              </div>

              <div className="modal-bottom-actions">
                <button type="button" onClick={() => setPendingRejectModal(null)} className="btn-cancel">Cancel</button>
                <button type="submit" className="btn-primary" disabled={rejecting} style={{ background: '#dc2626', borderColor: '#dc2626' }}>
                  {rejecting ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal 3: View KYC Documents ─── */}
      {kycDocModal && (
        <div className="admin-modal-overlay" onClick={() => setKycDocModal(null)}>
          <div className="admin-modal-box" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>📄</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>
                    KYC Document: <b>
                      {kycDocModal.docType === 'idCard'
                        ? 'National ID / Aadhaar / DL'
                        : kycDocModal.docType === 'bankStatement'
                        ? 'Bank Account Statement / Passbook'
                        : 'Passport / Proof of Address'}
                    </b>
                  </h3>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>Merchant: {kycDocModal.seller.storeName} ({kycDocModal.seller.ownerName})</p>
                </div>
              </div>
              <button onClick={() => setKycDocModal(null)} className="btn-close-modal">✕</button>
            </div>

            <div style={{ padding: '20px', textAlign: 'center', background: '#0f172a', borderRadius: '0 0 8px 8px' }}>
              {kycDocModal.docUrl?.toLowerCase().endsWith('.pdf') ? (
                <div style={{ padding: '30px 20px', color: '#fff' }}>
                  <p style={{ fontSize: 15, marginBottom: 14 }}>📄 PDF Document Uploaded</p>
                  <a
                    href={kycDocModal.docUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-block', padding: '10px 18px', background: '#3b82f6', color: '#fff', borderRadius: 6, fontWeight: 700, textDecoration: 'none' }}
                  >
                    Open PDF in New Window ↗
                  </a>
                </div>
              ) : (
                <img
                  src={kycDocModal.docUrl}
                  alt="KYC Document Preview"
                  style={{ maxWidth: '100%', maxHeight: 480, objectFit: 'contain', borderRadius: 6 }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal 4: Assign New Milestone Target ─── */}
      {targetModalOpen && (
        <div className="admin-modal-overlay" onClick={() => setTargetModalOpen(false)}>
          <div className="admin-modal-box" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>🎯</span>
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
                  {sellers.filter((s) => s.status !== 'pending_approval').map((s) => (
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
                  placeholder="e.g. Spring Rush: Deliver 10 Orders"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                  required
                />
              </div>

              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
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
                    Cash Bonus Amount ($ USD) *:
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

              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                  Description / Terms:
                </label>
                <textarea
                  rows={2}
                  value={targetForm.description}
                  onChange={(e) => setTargetForm({ ...targetForm, description: e.target.value })}
                  placeholder="e.g. Complete 10 delivered orders to receive $50 bonus credited to your wallet."
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
