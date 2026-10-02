import { useEffect, useState } from 'react';
import { api, money, fmtDate } from '../api.js';
import Ic from '../components/Icons.jsx';
import VerifiedStoreBadge from '../components/VerifiedStoreBadge.jsx';

export default function Sellers() {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'frozen' | 'suspended' | 'warned' | 'at_risk'
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'

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
    isTestAccount: false,
  });
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState('');

  // ─── MASTER SELLER PROFILE MODAL ───
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileSeller, setProfileSeller] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileTab, setProfileTab] = useState('account'); // 'account' | 'documents' | 'dashboard' | 'upgrades'
  const [profileUpgradeSubTab, setProfileUpgradeSubTab] = useState('compliance'); // 'compliance' | 'warning' | 'health' | 'limits'
  const [dashboardSubTab, setDashboardSubTab] = useState('products'); // 'products' | 'orders'

  // Section 1: Account Form
  const [accForm, setAccForm] = useState({
    storeName: '',
    ownerName: '',
    email: '',
    phone: '',
    commissionRate: 10,
    plainPassword: '',
    city: '',
    street: '',
    isTestAccount: false,
  });
  const [showAccPassword, setShowAccPassword] = useState(true);
  const [savingAccount, setSavingAccount] = useState(false);
  const [accSuccess, setAccSuccess] = useState('');
  const [accError, setAccError] = useState('');
  const [copiedPw, setCopiedPw] = useState(false);

  // Section 2: Documents Full-Screen Viewer Modal
  const [docPreviewModal, setDocPreviewModal] = useState(null); // { url, title, type }

  // Section 3: Order Detail Modal
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState(null);

  // Section 4: Upgrades Form States (Transferred from Complaints)
  // 4a Compliance
  const [freezeStatus, setFreezeStatus] = useState('frozen');
  const [freezeReason, setFreezeReason] = useState('');
  const [submittingFreeze, setSubmittingFreeze] = useState(false);
  // 4b Warning
  const [warnActive, setWarnActive] = useState(true);
  const [warnLevel, setWarnLevel] = useState('warning');
  const [warnMessage, setWarnMessage] = useState('');
  const [submittingWarn, setSubmittingWarn] = useState(false);
  // 4c Health
  const [healthScore, setHealthScore] = useState(100);
  const [healthReason, setHealthReason] = useState('');
  const [submittingHealth, setSubmittingHealth] = useState(false);
  // 4d Limits
  const [limitMaxAmount, setLimitMaxAmount] = useState('500');
  const [limitMinAmount, setLimitMinAmount] = useState('10');
  const [limitRequiredCount, setLimitRequiredCount] = useState('10');
  const [limitSuccessCount, setLimitSuccessCount] = useState('0');
  const [limitUpgradeFee, setLimitUpgradeFee] = useState('50');
  const [limitTierName, setLimitTierName] = useState('');
  const [submittingLimits, setSubmittingLimits] = useState(false);

  // Quick Standalone Reset Password Modal
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetSeller, setResetSeller] = useState(null);
  const [newSellerPassword, setNewSellerPassword] = useState('');
  const [confirmSellerPassword, setConfirmSellerPassword] = useState('');
  const [resettingPw, setResettingPw] = useState(false);
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetError, setResetError] = useState('');
  const [showAdminSellerPw, setShowAdminSellerPw] = useState(true);
  const [toggleToast, setToggleToast] = useState('');

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

  // ─── OPEN PROFILE HANDLER ───
  const handleOpenProfile = (seller, initialTab = 'account', initialSubTab = 'compliance') => {
    setProfileSeller(seller);
    setProfileTab(initialTab);
    setProfileUpgradeSubTab(initialSubTab);
    setDashboardSubTab('products');
    setAccSuccess('');
    setAccError('');
    setShowAccPassword(true);
    setCopiedPw(false);

    // Initialize Account Form
    setAccForm({
      storeName: seller.storeName || '',
      ownerName: seller.ownerName || '',
      email: seller.email || '',
      phone: seller.phone || '',
      commissionRate: seller.commissionRate !== undefined ? seller.commissionRate : 10,
      plainPassword: seller.plainPassword || '',
      city: seller.address?.city || '',
      street: seller.address?.street || '',
      isTestAccount: Boolean(seller.isTestAccount),
    });

    // Initialize Upgrades Form fields
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

    setProfileModalOpen(true);
    setProfileLoading(true);

    // Load full seller metrics, listed items & orders
    api(`/sellers/${seller._id}`)
      .then((data) => {
        setProfileData(data);
        const liveSeller = data.seller || data;
        if (liveSeller) {
          setProfileSeller((prev) => ({ ...prev, ...liveSeller }));
          setSellers((prev) =>
            prev.map((item) =>
              item._id === seller._id
                ? {
                    ...item,
                    ...liveSeller,
                    pendingOrders: data.stats?.pendingOrders !== undefined ? data.stats.pendingOrders : item.pendingOrders,
                    productCount: data.stats?.totalProducts !== undefined ? data.stats.totalProducts : item.productCount,
                  }
                : item
            )
          );
          setAccForm((prev) => ({
            ...prev,
            storeName: liveSeller.storeName || prev.storeName,
            ownerName: liveSeller.ownerName || prev.ownerName,
            email: liveSeller.email || prev.email,
            phone: liveSeller.phone || prev.phone,
            commissionRate: liveSeller.commissionRate !== undefined ? liveSeller.commissionRate : prev.commissionRate,
            plainPassword: liveSeller.plainPassword !== undefined ? (liveSeller.plainPassword || '') : (prev.plainPassword || ''),
            city: liveSeller.address?.city || prev.city,
            street: liveSeller.address?.street || prev.street,
          }));

          setFreezeStatus(liveSeller.status || 'active');
          setFreezeReason(liveSeller.freezeReason || '');
          setWarnActive(Boolean(liveSeller.warning?.active));
          setWarnLevel(liveSeller.warning?.level || 'warning');
          setWarnMessage(liveSeller.warning?.message || '');
          if (liveSeller.accountHealth?.score !== undefined) setHealthScore(liveSeller.accountHealth.score);

          const liveWl = liveSeller.withdrawalLimit || {};
          if (liveWl.maxAmount !== undefined) setLimitMaxAmount(String(liveWl.maxAmount));
          if (liveWl.minAmount !== undefined) setLimitMinAmount(String(liveWl.minAmount));
          if (liveWl.requiredWithdrawalsForIncrease !== undefined) setLimitRequiredCount(String(liveWl.requiredWithdrawalsForIncrease));
          if (liveWl.successfulWithdrawalCount !== undefined) setLimitSuccessCount(String(liveWl.successfulWithdrawalCount));
          if (liveWl.upgradeFee !== undefined) setLimitUpgradeFee(String(liveWl.upgradeFee));
          if (liveWl.currentTierName) setLimitTierName(liveWl.currentTierName);
        }
      })
      .catch((err) => {
        console.error('Error loading live seller profile:', err);
      })
      .finally(() => setProfileLoading(false));
  };

  // ─── SECTION 1: SAVE ACCOUNT DETAILS ───
  const handleSaveAccount = async (e) => {
    e.preventDefault();
    if (!profileSeller) return;
    setSavingAccount(true);
    setAccSuccess('');
    setAccError('');

    try {
      const payload = {
        storeName: accForm.storeName,
        ownerName: accForm.ownerName,
        email: accForm.email,
        phone: accForm.phone,
        commissionRate: Number(accForm.commissionRate),
        address: {
          city: accForm.city,
          street: accForm.street,
        },
        isTestAccount: Boolean(accForm.isTestAccount),
        accountType: accForm.isTestAccount ? 'test' : 'client',
      };

      if (accForm.plainPassword) {
        payload.password = accForm.plainPassword;
      }

      const updated = await api(`/sellers/${profileSeller._id}`, {
        method: 'PUT',
        body: payload,
      });

      setAccSuccess('✅ Merchant account details updated successfully!');
      setProfileSeller((prev) => ({ ...prev, ...updated, plainPassword: accForm.plainPassword }));
      loadSellers();
      setTimeout(() => setAccSuccess(''), 3000);
    } catch (err) {
      setAccError(err.message || 'Failed to update account details');
    } finally {
      setSavingAccount(false);
    }
  };

  const handleGenerateAccPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let res = '';
    for (let i = 0; i < 10; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setAccForm((prev) => ({ ...prev, plainPassword: res }));
    setShowAccPassword(true);
  };

  const handleCopyPassword = () => {
    if (!accForm.plainPassword) return;
    navigator.clipboard.writeText(accForm.plainPassword);
    setCopiedPw(true);
    setTimeout(() => setCopiedPw(false), 2000);
  };

  // ─── SECTION 4a: COMPLIANCE STATUS SUBMIT ───
  const handleFreezeSubmit = async (e) => {
    e.preventDefault();
    if (!profileSeller) return;
    if (freezeStatus !== 'active' && !freezeReason.trim()) {
      return alert('Please enter a reason for freezing or suspending this account.');
    }
    setSubmittingFreeze(true);
    try {
      const res = await api(`/sellers/${profileSeller._id}/freeze`, {
        method: 'POST',
        body: { status: freezeStatus, reason: freezeReason.trim() },
      });
      alert(`Seller status updated to ${freezeStatus.toUpperCase()}! ✅`);
      if (res.seller) {
        setProfileSeller((prev) => ({ ...prev, ...res.seller }));
      }
      loadSellers();
    } catch (err) {
      alert('Error updating compliance status: ' + err.message);
    } finally {
      setSubmittingFreeze(false);
    }
  };

  // ─── SECTION 4b: WARNING SUBMIT ───
  const handleWarnSubmit = async (e) => {
    e.preventDefault();
    if (!profileSeller) return;
    if (warnActive && !warnMessage.trim()) {
      return alert('Please enter a warning message to display in the header announcement bar.');
    }
    setSubmittingWarn(true);
    try {
      const res = await api(`/sellers/${profileSeller._id}/warn`, {
        method: 'POST',
        body: { active: warnActive, level: warnLevel, message: warnMessage.trim() },
      });
      alert(warnActive ? 'Official warning broadcasted to seller portal! ⚠️' : 'Warning cleared! ✅');
      if (res.seller) {
        setProfileSeller((prev) => ({ ...prev, ...res.seller }));
      }
      loadSellers();
    } catch (err) {
      alert('Error saving warning: ' + err.message);
    } finally {
      setSubmittingWarn(false);
    }
  };

  // ─── SECTION 4c: HEALTH SUBMIT ───
  const handleHealthSubmit = async (e) => {
    e.preventDefault();
    if (!profileSeller) return;
    setSubmittingHealth(true);
    try {
      const res = await api(`/sellers/${profileSeller._id}/health`, {
        method: 'POST',
        body: {
          score: Number(healthScore),
          reason: healthReason.trim() || 'Health score evaluated by Platform Compliance Desk',
        },
      });
      alert(`Seller Account Health updated to ${healthScore}/100! ✅`);
      if (res.seller) {
        setProfileSeller((prev) => ({ ...prev, ...res.seller }));
      }
      loadSellers();
    } catch (err) {
      alert('Error updating health: ' + err.message);
    } finally {
      setSubmittingHealth(false);
    }
  };

  // ─── SECTION 4d: WITHDRAWAL LIMITS SUBMIT ───
  const handleLimitEditSubmit = async (e) => {
    e.preventDefault();
    if (!profileSeller) return;
    setSubmittingLimits(true);
    try {
      const res = await api(`/sellers/${profileSeller._id}/withdrawal-limit`, {
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
      alert(`Withdrawal limit settings updated for ${profileSeller.storeName}! ✅`);
      if (res.seller) {
        setProfileSeller((prev) => ({ ...prev, ...res.seller }));
      }
      loadSellers();
    } catch (err) {
      alert('Error updating limits: ' + err.message);
    } finally {
      setSubmittingLimits(false);
    }
  };

  // ─── STANDALONE RESET PASSWORD SUBMIT ───
  const handleOpenResetPassword = (seller) => {
    setResetSeller(seller);
    setNewSellerPassword(seller.plainPassword || '');
    setConfirmSellerPassword(seller.plainPassword || '');
    setResetSuccess('');
    setResetError('');
    setShowAdminSellerPw(true);
    setResetModalOpen(true);
  };

  const generateStandaloneRandomPw = () => {
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
      loadSellers();
      setTimeout(() => {
        setResetModalOpen(false);
      }, 1500);
    } catch (err) {
      setResetError(err.message || 'Failed to reset seller password.');
    } finally {
      setResettingPw(false);
    }
  };

  // ─── DELETE SELLER HANDLER ───
  const handleDeleteSeller = async () => {
    if (!deleteModalSeller) return;
    setDeleting(true);
    try {
      await api(`/sellers/${deleteModalSeller._id}`, {
        method: 'DELETE',
      });
      alert(`✅ Store "${deleteModalSeller.storeName}" has been successfully deleted.`);
      setDeleteModalSeller(null);
      if (profileModalOpen && profileSeller?._id === deleteModalSeller._id) {
        setProfileModalOpen(false);
      }
      loadSellers();
    } catch (err) {
      alert('Error deleting seller: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  // ─── CREATE SELLER HANDLER ───
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
        isTestAccount: false,
      });
      loadSellers();
    } catch (err) {
      setCreateErr(err.message);
    } finally {
      setCreating(false);
    }
  };

  // ─── TOGGLE TEST / CLIENT ACCOUNT HANDLER ───
  const handleToggleTest = async (sellerId) => {
    try {
      const res = await api(`/sellers/${sellerId}/toggle-test`, { method: 'PATCH' });
      setSellers((prev) =>
        prev.map((s) => (s._id === sellerId ? { ...s, isTestAccount: res.seller?.isTestAccount, accountType: res.seller?.accountType } : s))
      );
      if (profileSeller?._id === sellerId) {
        setProfileSeller((prev) => ({ ...prev, isTestAccount: res.seller?.isTestAccount, accountType: res.seller?.accountType }));
      }
      const isNowTest = res.seller?.isTestAccount;
      setToggleToast(`Store "${res.seller?.storeName || 'Merchant'}" switched to ${isNowTest ? '🧪 TEST ACCOUNT' : '👤 CLIENT ACCOUNT'}!`);
      setTimeout(() => setToggleToast(''), 3500);
    } catch (err) {
      alert('Error updating account type: ' + err.message);
    }
  };

  const activeSellers = sellers.filter((s) => s.status !== 'pending_approval');

  // Filtered list
  const filtered = activeSellers.filter((s) => {
    const score = s.accountHealth?.score !== undefined ? s.accountHealth.score : 100;
    if (statusFilter === 'active' && s.status !== 'active') return false;
    if (statusFilter === 'client' && s.isTestAccount) return false;
    if (statusFilter === 'test' && !s.isTestAccount) return false;
    if (statusFilter === 'frozen' && s.status !== 'frozen') return false;
    if (statusFilter === 'suspended' && s.status !== 'suspended') return false;
    if (statusFilter === 'warned' && !s.warning?.active) return false;
    if (statusFilter === 'at_risk' && score > 30) return false;

    if (!q) return true;
    const match =
      s.storeName?.toLowerCase().includes(q.toLowerCase()) ||
      s.ownerName?.toLowerCase().includes(q.toLowerCase()) ||
      s.email?.toLowerCase().includes(q.toLowerCase()) ||
      s.phone?.toLowerCase().includes(q.toLowerCase());
    return match;
  });

  const clientCount = activeSellers.filter((s) => !s.isTestAccount).length;
  const testCount = activeSellers.filter((s) => s.isTestAccount).length;
  const healthyCount = activeSellers.filter((s) => s.status === 'active' && (s.accountHealth?.score ?? 100) >= 80).length;
  const warnedCount = activeSellers.filter((s) => s.warning?.active).length;
  const frozenCount = activeSellers.filter((s) => s.status === 'frozen' || s.status === 'suspended').length;
  const totalProducts = activeSellers.reduce((a, b) => a + (b.productCount || 0), 0);
  const totalGMV = activeSellers.reduce((a, b) => a + (b.lifetimeSales || 0), 0);

  return (
    <div className="admin-sellers-page">
      {/* Top Header */}
      <div className="admin-header-row">
        <div>
          <h2>🏬 Multi-Vendor Sellers &amp; Merchants Directory</h2>
          <p className="muted">
            Manage merchant cards, open full profiles (Account, Documents, Dashboard &amp; Upgrades), and onboard new vendors.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => setCreateOpen(true)} className="btn-primary">
            <Ic name="plus" size={16} /> + Onboard New Seller
          </button>
        </div>
      </div>

      {/* Summary KPI Stats Bar */}
      <div className="admin-sellers-stats-bar">
        <div className="stat-box" style={{ borderLeft: '4px solid #2563eb' }}>
          <span className="lbl">Total Active Sellers</span>
          <b className="val" style={{ color: '#2563eb' }}>{activeSellers.length}</b>
        </div>
        <div className="stat-box" style={{ borderLeft: '4px solid #16a34a' }}>
          <span className="lbl">Healthy Accounts (80+)</span>
          <b className="val" style={{ color: '#16a34a' }}>{healthyCount}</b>
        </div>
        <div className="stat-box" style={{ borderLeft: '4px solid #d97706' }}>
          <span className="lbl">Active Warnings</span>
          <b className="val" style={{ color: '#d97706' }}>{warnedCount}</b>
        </div>
        <div className="stat-box" style={{ borderLeft: '4px solid #dc2626' }}>
          <span className="lbl">Frozen / Suspended</span>
          <b className="val" style={{ color: '#dc2626' }}>{frozenCount}</b>
        </div>
        <div className="stat-box" style={{ borderLeft: '4px solid #0f172a' }}>
          <span className="lbl">Total Merchant Sales (GMV)</span>
          <b className="val">{money(totalGMV)}</b>
        </div>
      </div>

      {/* Filter Tabs & Search Toolbar */}
      <div className="admin-sellers-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
          <div className="search-field" style={{ minWidth: 260, maxWidth: 380 }}>
            <Ic name="search" size={16} />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by store name, owner, email, phone..."
            />
          </div>

          {/* Quick Filter Pills */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              style={{
                padding: '6px 12px',
                borderRadius: 20,
                border: statusFilter === 'all' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                background: statusFilter === 'all' ? '#eff6ff' : '#ffffff',
                color: statusFilter === 'all' ? '#1d4ed8' : '#64748b',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              All ({activeSellers.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              style={{
                padding: '6px 12px',
                borderRadius: 20,
                border: statusFilter === 'active' ? '1.5px solid #16a34a' : '1px solid #cbd5e1',
                background: statusFilter === 'active' ? '#ecfdf5' : '#ffffff',
                color: statusFilter === 'active' ? '#047857' : '#64748b',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              🟢 Active
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('client')}
              style={{
                padding: '6px 12px',
                borderRadius: 20,
                border: statusFilter === 'client' ? '1.5px solid #059669' : '1px solid #cbd5e1',
                background: statusFilter === 'client' ? '#ecfdf5' : '#ffffff',
                color: statusFilter === 'client' ? '#047857' : '#64748b',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              👤 Client ({clientCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('test')}
              style={{
                padding: '6px 12px',
                borderRadius: 20,
                border: statusFilter === 'test' ? '1.5px solid #7c3aed' : '1px solid #cbd5e1',
                background: statusFilter === 'test' ? '#faf5ff' : '#ffffff',
                color: statusFilter === 'test' ? '#6b21a8' : '#64748b',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              🧪 Test ({testCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('warned')}
              style={{
                padding: '6px 12px',
                borderRadius: 20,
                border: statusFilter === 'warned' ? '1.5px solid #d97706' : '1px solid #cbd5e1',
                background: statusFilter === 'warned' ? '#fffbeb' : '#ffffff',
                color: statusFilter === 'warned' ? '#b45309' : '#64748b',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              ⚠️ Warned ({warnedCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('frozen')}
              style={{
                padding: '6px 12px',
                borderRadius: 20,
                border: statusFilter === 'frozen' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                background: statusFilter === 'frozen' ? '#eff6ff' : '#ffffff',
                color: statusFilter === 'frozen' ? '#1e40af' : '#64748b',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              ❄️ Frozen
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('suspended')}
              style={{
                padding: '6px 12px',
                borderRadius: 20,
                border: statusFilter === 'suspended' ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                background: statusFilter === 'suspended' ? '#fef2f2' : '#ffffff',
                color: statusFilter === 'suspended' ? '#b91c1c' : '#64748b',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              ⛔ Suspended
            </button>
          </div>
        </div>

        {/* View Mode Switcher: Cards View vs Table View */}
        <div className="admin-view-toggle">
          <button
            type="button"
            className={`admin-view-toggle-btn ${viewMode === 'cards' ? 'active' : ''}`}
            onClick={() => setViewMode('cards')}
            title="Display sellers as Cards"
          >
            🎴 Cards View
          </button>
          <button
            type="button"
            className={`admin-view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
            title="Display sellers as Table"
          >
            📄 Table View
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="admin-card" style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
          Loading merchants directory...
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="admin-card" style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
          No merchants found matching your search or active filter.
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════ */}
      {/* ─── PRIMARY VIEW: SELLERS CARDS GRID ─── */}
      {/* ═════════════════════════════════════════════════════════════ */}
      {!loading && viewMode === 'cards' && (
        <div className="admin-sellers-cards-grid">
          {filtered.map((s) => {
            const score = s.accountHealth?.score !== undefined ? s.accountHealth.score : 100;
            const tierColor = score >= 80 ? '#15803d' : score >= 31 ? '#854d0e' : score > 20 ? '#c2410c' : '#b91c1c';
            const tierBg = score >= 80 ? '#dcfce7' : score >= 31 ? '#fef9c3' : score > 20 ? '#ffedd5' : '#fee2e2';
            const fillBg = score >= 80 ? '#16a34a' : score >= 31 ? '#eab308' : score > 20 ? '#ea580c' : '#dc2626';

            return (
              <div key={s._id} className="seller-card">
                {/* Top Status Strip */}
                <div
                  className={`seller-card-top-bar ${
                    s.status === 'active'
                      ? 'status-active'
                      : s.status === 'frozen'
                      ? 'status-frozen'
                      : 'status-suspended'
                  }`}
                />

                {/* Card Header */}
                <div className="seller-card-header">
                  <div className="seller-card-identity">
                    <div className="seller-card-avatar">
                      {s.storeName?.[0]?.toUpperCase() || 'S'}
                    </div>
                    <div className="seller-card-meta">
                      <div className="seller-card-store-title" title={s.storeName}>
                        <span>{s.storeName}</span>
                        {(s.verified || s.status === 'active') && (
                          <VerifiedStoreBadge variant="icon" size={15} title="Verified Merchant Store" />
                        )}
                      </div>
                      <span className="seller-card-owner" title={s.ownerName}>
                        👤 {s.ownerName}
                      </span>
                    </div>
                  </div>

                  {/* Status Badges */}
                  <div className="seller-card-badges">
                    <button
                      type="button"
                      onClick={() => handleToggleTest(s._id)}
                      title="Click to toggle Test Account / Client Account"
                      style={{
                        background: s.isTestAccount ? '#f3e8ff' : '#ecfdf5',
                        color: s.isTestAccount ? '#7e22ce' : '#047857',
                        border: `1px solid ${s.isTestAccount ? '#d8b4fe' : '#a7f3d0'}`,
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: 12,
                        fontSize: 10.5,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {s.isTestAccount ? '🧪 Test' : '👤 Client'}
                      <span style={{ fontSize: 9, opacity: 0.7 }}>⇄</span>
                    </button>
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
                      <span
                        style={{
                          fontSize: 10.5,
                          background: '#fef3c7',
                          color: '#b45309',
                          border: '1px solid #fde68a',
                          padding: '2px 6px',
                          borderRadius: 8,
                          fontWeight: 700,
                        }}
                      >
                        ⚠️ Warned
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Body */}
                <div className="seller-card-body">
                  {/* Contact Info */}
                  <div className="seller-card-info-row">
                    <div className="seller-card-info-item" title={s.email}>
                      <span className="muted">✉️</span>
                      <span style={{ fontWeight: 600 }}>{s.email}</span>
                    </div>
                    <div className="seller-card-info-item">
                      <span className="muted">📞</span>
                      <span>{s.phone || 'No phone provided'}</span>
                    </div>
                  </div>

                  {/* Account Health Meter */}
                  <div className="seller-card-health-section">
                    <div className="seller-card-health-header">
                      <span className="lbl">Account Health</span>
                      <span
                        style={{
                          background: tierBg,
                          color: tierColor,
                          fontWeight: 800,
                          fontSize: 11,
                          padding: '2px 6px',
                          borderRadius: 6,
                        }}
                      >
                        {score >= 80 ? '🟢' : score >= 31 ? '🟡' : score > 20 ? '🟠' : '🔴'} {score}/100
                      </span>
                    </div>
                    <div className="admin-health-bar-wrap" style={{ height: 6 }}>
                      <div
                        className="admin-health-bar-fill"
                        style={{ width: `${Math.max(4, score)}%`, background: fillBg }}
                      />
                    </div>
                  </div>

                  {/* Key Metrics Grid */}
                  <div className="seller-card-stats-grid">
                    <div className="seller-card-stat-pill">
                      <span className="lbl">Commission</span>
                      <span className="val" style={{ color: '#2563eb' }}>{s.commissionRate || 10}%</span>
                    </div>
                    <div className="seller-card-stat-pill">
                      <span className="lbl">Listed Items</span>
                      <span className="val">{s.productCount || 0} Products</span>
                    </div>
                    <div className="seller-card-stat-pill">
                      <span className="lbl">Pending Orders</span>
                      <span
                        className="val"
                        style={{
                          color: (s.pendingOrders || 0) > 0 ? '#ea580c' : '#0f172a',
                          fontWeight: (s.pendingOrders || 0) > 0 ? 800 : 700,
                        }}
                      >
                        {s.pendingOrders || 0} Orders
                      </span>
                    </div>
                    <div className="seller-card-stat-pill">
                      <span className="lbl">Avail Wallet</span>
                      <span className="val" style={{ color: '#16a34a' }}>{money(s.wallet?.balance || 0)}</span>
                    </div>
                  </div>

                  {s.wallet?.processingFund > 0 && (
                    <div
                      style={{
                        background: '#fffbeb',
                        border: '1px solid #fef3c7',
                        borderRadius: 6,
                        padding: '4px 8px',
                        fontSize: 11,
                        color: '#92400e',
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>🔒 Locked In-Flight:</span>
                      <b>{money(s.wallet?.processingFund)}</b>
                    </div>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div className="seller-card-footer">
                  {/* Primary Profile Action Button */}
                  <button
                    type="button"
                    onClick={() => handleOpenProfile(s, 'account')}
                    className="btn-card-profile"
                    title="Open Complete Seller Profile"
                  >
                    👤 Profile
                  </button>

                  <div className="seller-card-footer-subactions">
                    {/* Quick Password Reset */}
                    <button
                      type="button"
                      onClick={() => handleOpenResetPassword(s)}
                      className="btn-card-icon-action"
                      title="Reset Seller Password"
                    >
                      <Ic name="lock" size={13} />
                    </button>

                    {/* Delete Seller */}
                    <button
                      type="button"
                      onClick={() => setDeleteModalSeller(s)}
                      className="btn-card-icon-action danger"
                      title="Delete Seller Account"
                    >
                      <Ic name="x" size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════ */}
      {/* ─── SECONDARY VIEW: TABLE VIEW ─── */}
      {/* ═════════════════════════════════════════════════════════════ */}
      {!loading && viewMode === 'table' && (
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <b style={{ fontSize: 14 }}>{s.storeName}</b>
                              {(s.verified || s.status === 'active') && (
                                <VerifiedStoreBadge variant="icon" size={14} title="Verified Merchant Store" />
                              )}
                            </div>
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
                          <button
                            type="button"
                            onClick={() => handleToggleTest(s._id)}
                            title="Click to toggle Test Account / Client Account"
                            style={{
                              background: s.isTestAccount ? '#f3e8ff' : '#ecfdf5',
                              color: s.isTestAccount ? '#7e22ce' : '#047857',
                              border: `1px solid ${s.isTestAccount ? '#d8b4fe' : '#a7f3d0'}`,
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 10,
                              fontSize: 10.5,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            {s.isTestAccount ? '🧪 Test Account' : '👤 Client Account'}
                            <span style={{ fontSize: 9, opacity: 0.7 }}>⇄</span>
                          </button>
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
                          <button
                            type="button"
                            onClick={() => handleOpenProfile(s, 'account')}
                            className="btn-action-view"
                            title="Open Seller Profile"
                            style={{
                              background: '#2563eb',
                              color: '#ffffff',
                              border: '1px solid #1d4ed8',
                              fontWeight: 700,
                              fontSize: 12,
                              padding: '5px 11px',
                              borderRadius: 6,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                            }}
                          >
                            👤 Profile
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenResetPassword(s)}
                            className="btn-action-warn"
                            title="Reset seller password"
                            style={{
                              background: '#f8fafc',
                              color: '#0f172a',
                              border: '1px solid #cbd5e1',
                              fontWeight: 600,
                              fontSize: 12,
                              padding: '5px 9px',
                              borderRadius: 6,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Ic name="lock" size={13} /> Reset
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteModalSeller(s)}
                            className="btn-danger"
                            title="Delete seller"
                            style={{
                              background: '#fee2e2',
                              color: '#dc2626',
                              border: '1px solid #fca5a5',
                              fontWeight: 700,
                              fontSize: 12,
                              padding: '5px 9px',
                              borderRadius: 6,
                              cursor: 'pointer',
                            }}
                          >
                            <Ic name="x" size={13} />
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
      )}

      {/* ═════════════════════════════════════════════════════════════ */}
      {/* ─── MASTER MODAL: SELLER PROFILE (4 SECTIONS) ─── */}
      {/* ═════════════════════════════════════════════════════════════ */}
      {profileModalOpen && profileSeller && (
        <div className="admin-modal-overlay" onClick={() => setProfileModalOpen(false)}>
          <div className="seller-profile-modal-box" onClick={(e) => e.stopPropagation()}>
            {/* Modal Top Header */}
            <div className="seller-profile-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: '#ffffff',
                    color: '#0f172a',
                    fontWeight: 900,
                    fontSize: 18,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  }}
                >
                  {profileSeller.storeName?.[0]?.toUpperCase() || 'S'}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 style={{ margin: 0, fontSize: 17, color: '#ffffff', fontWeight: 800 }}>
                      {profileSeller.storeName}
                    </h3>
                    {(profileSeller.verified || profileSeller.status === 'active') && (
                      <VerifiedStoreBadge variant="icon" size={16} title="Verified Merchant Store" />
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                    <span>Owner: <b>{profileSeller.ownerName}</b></span> &bull; <span>Email: {profileSeller.email}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    background: profileSeller.status === 'active' ? '#ecfdf5' : profileSeller.status === 'frozen' ? '#eff6ff' : '#fef2f2',
                    color: profileSeller.status === 'active' ? '#059669' : profileSeller.status === 'frozen' ? '#2563eb' : '#dc2626',
                    fontWeight: 800,
                    fontSize: 12,
                    padding: '4px 10px',
                    borderRadius: 20,
                  }}
                >
                  {profileSeller.status === 'active' ? '● Active' : profileSeller.status === 'frozen' ? '❄️ Frozen' : '⛔ Suspended'}
                </span>
                <button
                  type="button"
                  onClick={() => setProfileModalOpen(false)}
                  className="btn-close-modal"
                  style={{ background: 'rgba(255,255,255,0.1)', color: '#ffffff', borderColor: 'transparent' }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Profile 4 Main Tabs Nav */}
            <div className="seller-profile-tabs-nav">
              <button
                type="button"
                className={`seller-profile-tab-btn ${profileTab === 'account' ? 'active' : ''}`}
                onClick={() => setProfileTab('account')}
              >
                👤 1. Account
              </button>
              <button
                type="button"
                className={`seller-profile-tab-btn ${profileTab === 'documents' ? 'active' : ''}`}
                onClick={() => setProfileTab('documents')}
              >
                📄 2. Documents
              </button>
              <button
                type="button"
                className={`seller-profile-tab-btn ${profileTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setProfileTab('dashboard')}
              >
                📊 3. Dashboard
              </button>
              <button
                type="button"
                className={`seller-profile-tab-btn ${profileTab === 'upgrades' ? 'active' : ''}`}
                onClick={() => setProfileTab('upgrades')}
              >
                ⚡ 4. Upgrades (Compliance, Warn, Health, Limits)
              </button>
            </div>

            {/* Profile Modal Body */}
            <div className="seller-profile-content-wrap">
              {profileLoading && (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                  Loading live seller profile details...
                </div>
              )}

              {/* ───────────────────────────────────────────────────────────── */}
              {/* SECTION 1: ACCOUNT (Name, Email, Number, Visible Password, etc.) */}
              {/* ───────────────────────────────────────────────────────────── */}
              {profileTab === 'account' && (
                <div>
                  <div style={{ marginBottom: 18, borderBottom: '1px solid #e2e8f0', paddingBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                        👤 Merchant Account Profile &amp; Login Credentials
                      </h4>
                      <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                        View and update seller credentials, direct password visibility, and business info.
                      </p>
                    </div>
                    <span style={{ fontSize: 11, background: '#eff6ff', color: '#1d4ed8', padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}>
                      ID: {profileSeller._id}
                    </span>
                  </div>

                  {accError && <div className="modal-err-banner" style={{ margin: '0 0 16px 0' }}>{accError}</div>}
                  {accSuccess && (
                    <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, marginBottom: 16 }}>
                      {accSuccess}
                    </div>
                  )}

                  <form onSubmit={handleSaveAccount}>
                    {/* Account Classification Toggle (Client Account vs Test Account) */}
                    <div
                      style={{
                        marginBottom: 16,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: accForm.isTestAccount ? '#faf5ff' : '#eff6ff',
                        border: `1.5px solid ${accForm.isTestAccount ? '#d8b4fe' : '#bfdbfe'}`,
                        padding: '12px 16px',
                        borderRadius: 10,
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 16 }}>{accForm.isTestAccount ? '🧪' : '👤'}</span>
                          <b style={{ color: accForm.isTestAccount ? '#6b21a8' : '#1d4ed8', fontSize: 13.5 }}>
                            {accForm.isTestAccount ? 'Test Seller Account' : 'Client Account (Live Merchant)'}
                          </b>
                        </div>
                        <small style={{ color: accForm.isTestAccount ? '#7c3aed' : '#2563eb', fontSize: 11.5, display: 'block', marginTop: 2 }}>
                          {accForm.isTestAccount
                            ? 'Marked for internal QA & software feature testing (will not be mixed with live clients)'
                            : 'Real merchant store selling live products to customers'}
                        </small>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAccForm({ ...accForm, isTestAccount: !accForm.isTestAccount })}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 20,
                          border: 'none',
                          cursor: 'pointer',
                          fontWeight: 800,
                          fontSize: 12,
                          background: accForm.isTestAccount ? '#7c3aed' : '#2563eb',
                          color: '#fff',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
                        }}
                      >
                        {accForm.isTestAccount ? '🧪 Switch to Client' : '👤 Switch to Test'}
                      </button>
                    </div>

                    <div className="seller-form-grid-2">
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: 4 }}>
                          Store Name *
                        </label>
                        <input
                          type="text"
                          value={accForm.storeName}
                          onChange={(e) => setAccForm({ ...accForm, storeName: e.target.value })}
                          required
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: 4 }}>
                          Owner Full Name *
                        </label>
                        <input
                          type="text"
                          value={accForm.ownerName}
                          onChange={(e) => setAccForm({ ...accForm, ownerName: e.target.value })}
                          required
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: 4 }}>
                          Login Email Address *
                        </label>
                        <input
                          type="email"
                          value={accForm.email}
                          onChange={(e) => setAccForm({ ...accForm, email: e.target.value })}
                          required
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: 4 }}>
                          Phone Number
                        </label>
                        <input
                          type="text"
                          value={accForm.phone}
                          onChange={(e) => setAccForm({ ...accForm, phone: e.target.value })}
                          placeholder="+92 300 1234567"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                        />
                      </div>
                    </div>

                    {/* PASSWORD FIELD WITH VISIBILITY & GENERATOR (USER SPECIFICATION 1) */}
                    <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '16px', marginBottom: 18 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                        <div>
                          <label style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', display: 'block' }}>
                            🔑 Seller Login Password (Visible)
                          </label>
                          <small className="muted" style={{ fontSize: 11 }}>
                            Password is visible in plain text. You can edit directly or generate a new random password.
                          </small>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            onClick={handleGenerateAccPassword}
                            style={{
                              background: '#eff6ff',
                              border: '1px solid #bfdbfe',
                              color: '#2563eb',
                              padding: '4px 10px',
                              borderRadius: 6,
                              fontSize: 11.5,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            ⚡ Generate Password
                          </button>
                        </div>
                      </div>

                      <div className="visible-password-box">
                        <input
                          type={showAccPassword ? 'text' : 'password'}
                          value={accForm.plainPassword}
                          onChange={(e) => setAccForm({ ...accForm, plainPassword: e.target.value })}
                          placeholder={accForm.plainPassword ? 'Enter password...' : '🔒 Encrypted with Bcrypt (will reveal on next login, or enter new password)'}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => setShowAccPassword(!showAccPassword)}
                            style={{
                              background: '#ffffff',
                              border: '1px solid #cbd5e1',
                              borderRadius: 6,
                              padding: '5px 9px',
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 600,
                              color: '#334155',
                            }}
                            title={showAccPassword ? 'Hide Password' : 'Show Password'}
                          >
                            {showAccPassword ? '👁️ Hide' : '👁️ Show'}
                          </button>
                          <button
                            type="button"
                            onClick={handleCopyPassword}
                            disabled={!accForm.plainPassword}
                            style={{
                              background: !accForm.plainPassword ? '#f1f5f9' : copiedPw ? '#dcfce7' : '#ffffff',
                              border: `1px solid ${copiedPw ? '#86efac' : '#cbd5e1'}`,
                              borderRadius: 6,
                              padding: '5px 9px',
                              cursor: !accForm.plainPassword ? 'not-allowed' : 'pointer',
                              fontSize: 12,
                              fontWeight: 700,
                              color: !accForm.plainPassword ? '#94a3b8' : copiedPw ? '#15803d' : '#334155',
                            }}
                            title={accForm.plainPassword ? 'Copy Password to Clipboard' : 'No plain text password to copy'}
                          >
                            {copiedPw ? '✅ Copied!' : '📋 Copy'}
                          </button>
                        </div>
                      </div>
                      {!accForm.plainPassword && (
                        <div style={{ marginTop: 6, fontSize: 11.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                          <span>🔒</span>
                          <span>
                            Current password is encrypted with Bcrypt. It will be recorded and displayed here automatically when the vendor logs into their account, or you can enter/generate a new password above and click <b>Save Account Changes</b>.
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="seller-form-grid-3">
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: 4 }}>
                          Commission Rate (%)
                        </label>
                        <input
                          type="number"
                          value={accForm.commissionRate}
                          onChange={(e) => setAccForm({ ...accForm, commissionRate: e.target.value })}
                          min="0"
                          max="100"
                          required
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: 4 }}>
                          City / Location
                        </label>
                        <input
                          type="text"
                          value={accForm.city}
                          onChange={(e) => setAccForm({ ...accForm, city: e.target.value })}
                          placeholder="e.g. New York / Lahore"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: 4 }}>
                          Street Address
                        </label>
                        <input
                          type="text"
                          value={accForm.street}
                          onChange={(e) => setAccForm({ ...accForm, street: e.target.value })}
                          placeholder="e.g. Commercial Market Plaza"
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                      <button
                        type="submit"
                        className="btn-primary"
                        disabled={savingAccount}
                        style={{ padding: '10px 22px', fontSize: 13.5 }}
                      >
                        {savingAccount ? 'Saving...' : '💾 Save Account Changes'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* ───────────────────────────────────────────────────────────── */}
              {/* SECTION 2: DOCUMENTS (Uploaded during registration) */}
              {/* ───────────────────────────────────────────────────────────── */}
              {profileTab === 'documents' && (
                <div>
                  <div style={{ marginBottom: 18, borderBottom: '1px solid #e2e8f0', paddingBottom: 10 }}>
                    <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                      📄 Registration &amp; KYC Verification Documents
                    </h4>
                    <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                      Identification documents uploaded by this merchant during self-registration.
                    </p>
                  </div>

                  {(() => {
                    const kyc = profileSeller.kycDocuments || {};
                    const idDoc = kyc.idCard || kyc.idDocumentUrl || '';
                    const passportDoc = kyc.passport || kyc.passportDocumentUrl || '';
                    const bankDoc = kyc.bankStatement || kyc.bankStatementUrl || '';
                    const hasAny = Boolean(idDoc || passportDoc || bankDoc);

                    if (!hasAny) {
                      return (
                        <div style={{ background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: 12, padding: '36px 20px', textAlign: 'center' }}>
                          <span style={{ fontSize: 36, display: 'block', marginBottom: 10 }}>📭</span>
                          <h4 style={{ margin: 0, fontSize: 15, color: '#334155' }}>No Documents Uploaded During Registration</h4>
                          <p className="muted" style={{ margin: '6px auto 0', maxWidth: 440, fontSize: 12.5 }}>
                            This merchant account was created directly by administrator or registered without mandatory KYC file uploads.
                          </p>
                        </div>
                      );
                    }

                    const docList = [
                      { title: 'National ID / Aadhaar / DL', url: idDoc, type: 'idCard' },
                      { title: 'Passport / Proof of Address', url: passportDoc, type: 'passport' },
                      { title: 'Bank Statement / Passbook', url: bankDoc, type: 'bankStatement' },
                    ].filter((d) => Boolean(d.url));

                    return (
                      <div className="seller-docs-grid">
                        {docList.map((doc, idx) => {
                          const isPdf = doc.url.toLowerCase().endsWith('.pdf');
                          return (
                            <div key={idx} className="seller-doc-card">
                              <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <b style={{ fontSize: 13, color: '#0f172a' }}>{doc.title}</b>
                                <span style={{ fontSize: 10.5, background: '#ecfdf5', color: '#059669', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                                  Uploaded
                                </span>
                              </div>

                              <div
                                className="seller-doc-preview-area"
                                onClick={() => setDocPreviewModal({ url: doc.url, title: doc.title, isPdf })}
                                title="Click to view full preview"
                              >
                                {isPdf ? (
                                  <div style={{ textAlign: 'center', padding: 20 }}>
                                    <span style={{ fontSize: 38 }}>📑</span>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', marginTop: 6 }}>
                                      PDF Document
                                    </div>
                                    <span style={{ fontSize: 11, color: '#64748b' }}>Click to open</span>
                                  </div>
                                ) : (
                                  <img src={doc.url} alt={doc.title} className="seller-doc-preview-img" />
                                )}
                              </div>

                              <div style={{ padding: '10px 14px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => setDocPreviewModal({ url: doc.url, title: doc.title, isPdf })}
                                  style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: 0 }}
                                >
                                  🔍 Full Preview
                                </button>
                                <a
                                  href={doc.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ color: '#64748b', fontSize: 12, textDecoration: 'none', fontWeight: 600 }}
                                >
                                  Open in Tab ↗
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ───────────────────────────────────────────────────────────── */}
              {/* SECTION 3: DASHBOARD (Overview, Listed Items, Pending Orders, Wallet) */}
              {/* ───────────────────────────────────────────────────────────── */}
              {profileTab === 'dashboard' && (
                <div>
                  <div style={{ marginBottom: 18, borderBottom: '1px solid #e2e8f0', paddingBottom: 10 }}>
                    <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                      📊 Seller Account Metrics &amp; Operational Overview
                    </h4>
                    <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                      Inspect listed catalog products, pending fulfillment orders, wallet balances, and withdrawal history.
                    </p>
                  </div>

                  {/* Financial & Operational KPI Grid */}
                  {(() => {
                    const stats = profileData?.stats || {};
                    const wallet = profileSeller.wallet || {};
                    const orders = profileData?.orders || [];
                    const pendingOrders =
                      stats.pendingOrders !== undefined
                        ? stats.pendingOrders
                        : orders.filter((o) =>
                            ['pending', 'processing', 'unfulfilled', 'paid', 'confirmed', 'placed'].includes(
                              (o.status || '').toLowerCase()
                            )
                          ).length;

                    return (
                      <>
                        <div className="seller-profile-kpi-grid">
                          <div className="stat-box" style={{ padding: '12px 16px', borderLeft: '4px solid #16a34a' }}>
                            <span className="lbl" style={{ fontSize: 11 }}>Available Balance</span>
                            <b className="val" style={{ color: '#16a34a', fontSize: 19 }}>
                              {money(wallet.balance || 0)}
                            </b>
                          </div>

                          <div className="stat-box" style={{ padding: '12px 16px', borderLeft: '4px solid #d97706' }}>
                            <span className="lbl" style={{ fontSize: 11 }}>Locked In-Flight Funds</span>
                            <b className="val" style={{ color: '#d97706', fontSize: 19 }}>
                              {money(wallet.processingFund || 0)}
                            </b>
                          </div>

                          <div className="stat-box" style={{ padding: '12px 16px', borderLeft: '4px solid #2563eb' }}>
                            <span className="lbl" style={{ fontSize: 11 }}>Total Withdrawn</span>
                            <b className="val" style={{ color: '#2563eb', fontSize: 19 }}>
                              {money(wallet.totalWithdrawn || 0)}
                            </b>
                          </div>

                          <div className="stat-box" style={{ padding: '12px 16px', borderLeft: '4px solid #7c3aed' }}>
                            <span className="lbl" style={{ fontSize: 11 }}>Net Profit Released</span>
                            <b className="val" style={{ color: '#7c3aed', fontSize: 19 }}>
                              {money(wallet.totalProfitEarned || stats.netProfit || 0)}
                            </b>
                          </div>

                          <div className="stat-box" style={{ padding: '12px 16px', borderLeft: '4px solid #ea580c' }}>
                            <span className="lbl" style={{ fontSize: 11 }}>Pending Orders</span>
                            <b className="val" style={{ color: pendingOrders > 0 ? '#ea580c' : '#0f172a', fontSize: 19 }}>
                              {pendingOrders} Orders
                            </b>
                          </div>

                          <div className="stat-box" style={{ padding: '12px 16px', borderLeft: '4px solid #0f172a' }}>
                            <span className="lbl" style={{ fontSize: 11 }}>Total Listed Items</span>
                            <b className="val" style={{ color: '#0f172a', fontSize: 19 }}>
                              {profileData?.products?.length || profileSeller.productCount || 0} Items
                            </b>
                          </div>
                        </div>

                        {/* Subtabs for Products vs Orders */}
                        <div style={{ display: 'flex', gap: 10, borderBottom: '1.5px solid #e2e8f0', marginBottom: 14 }}>
                          <button
                            type="button"
                            onClick={() => setDashboardSubTab('products')}
                            style={{
                              padding: '8px 14px',
                              background: 'none',
                              border: 'none',
                              borderBottom: dashboardSubTab === 'products' ? '2.5px solid #2563eb' : '2.5px solid transparent',
                              color: dashboardSubTab === 'products' ? '#2563eb' : '#64748b',
                              fontWeight: dashboardSubTab === 'products' ? 700 : 500,
                              cursor: 'pointer',
                              fontSize: 13,
                            }}
                          >
                            📦 Listed Products ({profileData?.products?.length || 0})
                          </button>
                          <button
                            type="button"
                            onClick={() => setDashboardSubTab('orders')}
                            style={{
                              padding: '8px 14px',
                              background: 'none',
                              border: 'none',
                              borderBottom: dashboardSubTab === 'orders' ? '2.5px solid #2563eb' : '2.5px solid transparent',
                              color: dashboardSubTab === 'orders' ? '#2563eb' : '#64748b',
                              fontWeight: dashboardSubTab === 'orders' ? 700 : 500,
                              cursor: 'pointer',
                              fontSize: 13,
                            }}
                          >
                            🛒 Orders ({profileData?.orders?.length || 0})
                            {pendingOrders > 0 && (
                              <span style={{ marginLeft: 6, background: '#ea580c', color: '#fff', fontSize: 10, padding: '1px 6px', borderRadius: 10 }}>
                                {pendingOrders} pending
                              </span>
                            )}
                          </button>
                        </div>

                        {/* LISTED PRODUCTS VIEW */}
                        {dashboardSubTab === 'products' && (
                          <div>
                            {(!profileData?.products || profileData.products.length === 0) ? (
                              <div style={{ padding: 24, textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: 8 }}>
                                No products listed by this seller yet.
                              </div>
                            ) : (
                              <div className="inspect-prods-grid" style={{ maxHeight: 340 }}>
                                {profileData.products.map((p) => (
                                  <div key={p._id} className="inspect-prod-item">
                                    <img
                                      src={p.image || p.images?.[0] || '/img/products/serum.svg'}
                                      alt={p.name}
                                    />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <b style={{ display: 'block', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {p.name}
                                      </b>
                                      <div style={{ display: 'flex', gap: 8, fontSize: 12, marginTop: 2 }}>
                                        <span style={{ color: '#16a34a', fontWeight: 700 }}>{money(p.price)}</span>
                                        <span className="muted">Stock: <b>{p.stock}</b></span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* ORDERS VIEW */}
                        {dashboardSubTab === 'orders' && (
                          <div>
                            {(!profileData?.orders || profileData.orders.length === 0) ? (
                              <div style={{ padding: 24, textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: 8 }}>
                                No orders associated with this seller yet.
                              </div>
                            ) : (
                              <div className="inspect-orders-list" style={{ maxHeight: 380 }}>
                                {profileData.orders.map((o) => {
                                  const isPending = ['pending', 'processing', 'unfulfilled', 'paid', 'confirmed', 'placed'].includes(
                                    (o.status || '').toLowerCase()
                                  );

                                  return (
                                    <div
                                      key={o._id}
                                      className="inspect-order-row"
                                      style={{
                                        borderLeft: isPending ? '4px solid #ea580c' : '1px solid #e2e8f0',
                                        background: isPending ? '#fff7ed' : '#ffffff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 12,
                                        padding: '10px 14px',
                                        borderRadius: 8,
                                        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
                                      }}
                                    >
                                      <div style={{ flex: 1, minWidth: 150 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                          <b style={{ fontSize: 13, color: '#0f172a' }}>{o.orderNumber || o._id?.slice(-8)}</b>
                                          <span
                                            style={{
                                              fontSize: 10.5,
                                              fontWeight: 700,
                                              padding: '2px 7px',
                                              borderRadius: 4,
                                              background: isPending ? '#ffedd5' : o.status === 'delivered' ? '#dcfce7' : o.status === 'cancelled' ? '#fee2e2' : '#f1f5f9',
                                              color: isPending ? '#c2410c' : o.status === 'delivered' ? '#15803d' : o.status === 'cancelled' ? '#b91c1c' : '#475569',
                                              textTransform: 'capitalize',
                                            }}
                                          >
                                            {o.status}
                                          </span>
                                        </div>
                                        <span className="muted block" style={{ fontSize: 11.5, marginTop: 2 }}>
                                          {fmtDate(o.createdAt)} &bull; {o.shippingAddress?.fullName || 'Customer'}
                                        </span>
                                      </div>

                                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                                        <div style={{ textAlign: 'right' }}>
                                          <b style={{ color: '#0f172a', fontSize: 13.5, display: 'block' }}>{money(o.total)}</b>
                                          <span className="muted block" style={{ fontSize: 10.5 }}>
                                            {o.items?.length || 1} item{(o.items?.length || 1) > 1 ? 's' : ''}
                                          </span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => setSelectedOrderForDetail(o)}
                                          className="btn-order-detail"
                                          title="View Order Details"
                                        >
                                          👁️ Detail
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* ───────────────────────────────────────────────────────────── */}
              {/* SECTION 4: UPGRADES (Transferred from Complaints Section)    */}
              {/* 4a Compliance, 4b Warning, 4c Health, 4d Limits              */}
              {/* ───────────────────────────────────────────────────────────── */}
              {profileTab === 'upgrades' && (
                <div>
                  <div style={{ marginBottom: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 10 }}>
                    <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                      ⚡ Merchant Governance, Upgrades &amp; Enforcement
                    </h4>
                    <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                      Manage account status compliance, broadcast portal warnings, evaluate health score (0-100), and configure banking withdrawal limit tiers.
                    </p>
                  </div>

                  {/* 4 Upgrades Subtabs */}
                  <div className="upgrades-subtabs-nav">
                    <button
                      type="button"
                      className={`upgrades-subtab-btn ${profileUpgradeSubTab === 'compliance' ? 'active' : ''}`}
                      onClick={() => setProfileUpgradeSubTab('compliance')}
                    >
                      ❄️ 4a Compliance (Status)
                    </button>
                    <button
                      type="button"
                      className={`upgrades-subtab-btn ${profileUpgradeSubTab === 'warning' ? 'active' : ''}`}
                      onClick={() => setProfileUpgradeSubTab('warning')}
                    >
                      ⚠️ 4b Warning
                    </button>
                    <button
                      type="button"
                      className={`upgrades-subtab-btn ${profileUpgradeSubTab === 'health' ? 'active' : ''}`}
                      onClick={() => setProfileUpgradeSubTab('health')}
                    >
                      🛡️ 4c Health (0-100)
                    </button>
                    <button
                      type="button"
                      className={`upgrades-subtab-btn ${profileUpgradeSubTab === 'limits' ? 'active' : ''}`}
                      onClick={() => setProfileUpgradeSubTab('limits')}
                    >
                      💳 4d Limits (Tiers)
                    </button>
                  </div>

                  {/* ───────────────────────────────────────────────────────── */}
                  {/* SUBTAB 4a: COMPLIANCE (Active, Frozen, Suspended with reason) */}
                  {/* ───────────────────────────────────────────────────────── */}
                  {profileUpgradeSubTab === 'compliance' && (
                    <form onSubmit={handleFreezeSubmit} style={{ background: '#f8fafc', padding: 18, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                      <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6, color: '#1e293b' }}>
                          Account Access Status *
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', background: freezeStatus === 'active' ? '#ecfdf5' : '#fff' }}>
                            <input
                              type="radio"
                              name="freezeStatus"
                              value="active"
                              checked={freezeStatus === 'active'}
                              onChange={(e) => setFreezeStatus(e.target.value)}
                            />
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>🟢 Active</span>
                          </label>

                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', background: freezeStatus === 'frozen' ? '#eff6ff' : '#fff' }}>
                            <input
                              type="radio"
                              name="freezeStatus"
                              value="frozen"
                              checked={freezeStatus === 'frozen'}
                              onChange={(e) => setFreezeStatus(e.target.value)}
                            />
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#2563eb' }}>❄️ Frozen</span>
                          </label>

                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', background: freezeStatus === 'suspended' ? '#fef2f2' : '#fff' }}>
                            <input
                              type="radio"
                              name="freezeStatus"
                              value="suspended"
                              checked={freezeStatus === 'suspended'}
                              onChange={(e) => setFreezeStatus(e.target.value)}
                            />
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>⛔ Suspended</span>
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
                          placeholder="e.g. Account frozen due to repeated unfulfilled orders or compliance audit."
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontFamily: 'inherit' }}
                          required={freezeStatus !== 'active'}
                        />
                        <small className="muted" style={{ fontSize: 11 }}>
                          This reason will display directly in the seller portal header and live chat notification.
                        </small>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                        <button
                          type="submit"
                          className={freezeStatus === 'active' ? 'btn-primary' : 'btn-danger'}
                          disabled={submittingFreeze}
                          style={{ padding: '8px 20px', fontSize: 13 }}
                        >
                          {submittingFreeze ? 'Updating...' : freezeStatus === 'active' ? '✅ Unfreeze & Restore Full Access' : `⛔ Set Account to ${freezeStatus.toUpperCase()}`}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* ───────────────────────────────────────────────────────── */}
                  {/* SUBTAB 4b: WARNING ANNOUNCEMENT                           */}
                  {/* ───────────────────────────────────────────────────────── */}
                  {profileUpgradeSubTab === 'warning' && (
                    <form onSubmit={handleWarnSubmit} style={{ background: '#f8fafc', padding: 18, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                      <div style={{ marginBottom: 14, background: '#fffbeb', padding: '10px 12px', border: '1px solid #fef3c7', borderRadius: 6 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#92400e' }}>
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
                              <option value="critical">🚨 Critical Warning (High Alert Red Bar)</option>
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
                              placeholder="e.g. Warning 1/3: High order cancellation rate. Please fulfill shipments within 24 hours."
                              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontFamily: 'inherit' }}
                              required={warnActive}
                            />
                            <small className="muted" style={{ fontSize: 11 }}>
                              This warning will broadcast live on top of the merchant's portal.
                            </small>
                          </div>
                        </>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                        <button
                          type="submit"
                          className="btn-primary"
                          disabled={submittingWarn}
                          style={{
                            background: warnActive ? '#d97706' : '#059669',
                            borderColor: warnActive ? '#b45309' : '#047857',
                            padding: '8px 20px',
                            fontSize: 13,
                          }}
                        >
                          {submittingWarn ? 'Saving...' : warnActive ? '⚠️ Broadcast Warning Announcement' : '✅ Clear Warning Banner'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* ───────────────────────────────────────────────────────── */}
                  {/* SUBTAB 4c: HEALTH SCORE (0-100)                           */}
                  {/* ───────────────────────────────────────────────────────── */}
                  {profileUpgradeSubTab === 'health' && (
                    <form onSubmit={handleHealthSubmit} style={{ background: '#f8fafc', padding: 18, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16 }}>
                        <div>
                          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Current Rating</span>
                          <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>
                            {profileSeller.accountHealth?.score !== undefined ? profileSeller.accountHealth.score : 100}/100
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b' }}>Target Tier</span>
                          <div>
                            <span
                              style={{
                                background: Number(healthScore) >= 80 ? '#dcfce7' : Number(healthScore) >= 31 ? '#fef9c3' : Number(healthScore) > 20 ? '#ffedd5' : '#fee2e2',
                                color: Number(healthScore) >= 80 ? '#15803d' : Number(healthScore) >= 31 ? '#854d0e' : Number(healthScore) > 20 ? '#c2410c' : '#b91c1c',
                                fontWeight: 800,
                                fontSize: 12,
                                padding: '3px 8px',
                                borderRadius: 6,
                              }}
                            >
                              {Number(healthScore) >= 80 ? 'Healthy (80-100)' : Number(healthScore) >= 31 ? 'At Risk (31-79)' : Number(healthScore) > 20 ? 'Freeze Alert (21-30)' : 'Suspension Alert (0-20)'}
                            </span>
                          </div>
                        </div>
                      </div>

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
                              setHealthReason('Customer complaints of defective or counterfeit items.');
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
                              setHealthReason('Customer dispute satisfactorily resolved with prompt refund.');
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

                      <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6, color: '#1e293b' }}>
                          Reason / Notes *
                        </label>
                        <textarea
                          rows="2"
                          value={healthReason}
                          onChange={(e) => setHealthReason(e.target.value)}
                          placeholder="Enter reason for health score adjustment..."
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontFamily: 'inherit' }}
                          required
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                        <button
                          type="submit"
                          className="btn-primary"
                          disabled={submittingHealth}
                          style={{ padding: '8px 20px', fontSize: 13 }}
                        >
                          {submittingHealth ? 'Saving...' : `💾 Save Account Health (${healthScore}/100)`}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* ───────────────────────────────────────────────────────── */}
                  {/* SUBTAB 4d: WITHDRAWAL LIMITS & TIER CONTROLS              */}
                  {/* ───────────────────────────────────────────────────────── */}
                  {profileUpgradeSubTab === 'limits' && (
                    <form onSubmit={handleLimitEditSubmit} style={{ background: '#f8fafc', padding: 18, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>Active Banking Tier:</span>
                          <div style={{ fontSize: 14, fontWeight: 900, color: '#14532d', marginTop: 1 }}>
                            {limitTierName || 'Tier 1 - Standard ($500 Max)'}
                          </div>
                        </div>
                        <span style={{ background: '#22c55e', color: '#ffffff', fontWeight: 800, fontSize: 11, padding: '3px 8px', borderRadius: 6 }}>
                          Max: ${Number(limitMaxAmount || 500).toLocaleString('en-US')} USD
                        </span>
                      </div>

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

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
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

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                            Required Withdrawals for Next Tier
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

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
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

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                        <button
                          type="submit"
                          className="btn-primary"
                          disabled={submittingLimits}
                          style={{ padding: '8px 20px', fontSize: 13 }}
                        >
                          {submittingLimits ? 'Saving...' : '💾 Save Withdrawal Limit Settings'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── FULL-SCREEN KYC DOCUMENT PREVIEW MODAL ─── */}
      {docPreviewModal && (
        <div className="admin-modal-overlay" style={{ zIndex: 1100 }} onClick={() => setDocPreviewModal(null)}>
          <div className="admin-modal-box" style={{ maxWidth: 740 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <div>
                <h3 style={{ margin: 0, fontSize: 16 }}>📄 Document: {docPreviewModal.title}</h3>
                <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>Merchant: {profileSeller?.storeName}</p>
              </div>
              <button onClick={() => setDocPreviewModal(null)} className="btn-close-modal">✕</button>
            </div>
            <div style={{ padding: 20, textAlign: 'center', background: '#0f172a', borderRadius: '0 0 12px 12px' }}>
              {docPreviewModal.isPdf ? (
                <div style={{ padding: '40px 20px', color: '#fff' }}>
                  <p style={{ fontSize: 15, marginBottom: 16 }}>📑 PDF Document File</p>
                  <a
                    href={docPreviewModal.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-block',
                      padding: '10px 20px',
                      background: '#3b82f6',
                      color: '#fff',
                      borderRadius: 8,
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    Open PDF in New Browser Tab ↗
                  </a>
                </div>
              ) : (
                <img
                  src={docPreviewModal.url}
                  alt={docPreviewModal.title}
                  style={{ maxWidth: '100%', maxHeight: 520, objectFit: 'contain', borderRadius: 8 }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: ORDER DETAIL (ACCESSED FROM SELLER DASHBOARD) ─── */}
      {selectedOrderForDetail && (
        <div
          className="admin-modal-overlay"
          style={{ zIndex: 1200 }}
          onClick={() => setSelectedOrderForDetail(null)}
        >
          <div
            className="admin-modal-box"
            style={{ maxWidth: 820, maxHeight: '92vh', display: 'flex', flexDirection: 'column', borderRadius: 14 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              className="modal-top"
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                background: '#f8fafc',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24 }}>📦</span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                      Order #{selectedOrderForDetail.orderNumber || selectedOrderForDetail._id?.slice(-8)}
                    </h3>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        padding: '3px 8px',
                        borderRadius: 6,
                        textTransform: 'uppercase',
                        background:
                          selectedOrderForDetail.status === 'delivered'
                            ? '#dcfce7'
                            : selectedOrderForDetail.status === 'cancelled'
                            ? '#fee2e2'
                            : '#ffedd5',
                        color:
                          selectedOrderForDetail.status === 'delivered'
                            ? '#15803d'
                            : selectedOrderForDetail.status === 'cancelled'
                            ? '#b91c1c'
                            : '#c2410c',
                      }}
                    >
                      {selectedOrderForDetail.status}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: selectedOrderForDetail.paymentStatus === 'paid' ? '#dcfce7' : '#f1f5f9',
                        color: selectedOrderForDetail.paymentStatus === 'paid' ? '#15803d' : '#475569',
                        textTransform: 'uppercase',
                      }}
                    >
                      {(selectedOrderForDetail.paymentMethod || 'COD').toUpperCase()} &bull; {selectedOrderForDetail.paymentStatus || 'pending'}
                    </span>
                  </div>
                  <p className="muted" style={{ margin: '3px 0 0', fontSize: 12 }}>
                    Placed on {fmtDate(selectedOrderForDetail.createdAt)} &bull; Vendor: <b>{profileSeller?.storeName || 'Merchant'}</b>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderForDetail(null)}
                className="btn-close-modal"
                style={{
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#475569',
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Order Items Section */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
                <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🛒</span> Ordered Items ({selectedOrderForDetail.items?.length || 0})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(selectedOrderForDetail.items || []).map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        background: '#f8fafc',
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 200, flex: 1 }}>
                        <img
                          src={item.image || 'https://via.placeholder.com/60?text=Item'}
                          alt={item.name}
                          style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover', background: '#fff', border: '1px solid #cbd5e1' }}
                          onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/60?text=Item'; }}
                        />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{item.name}</div>
                          <div style={{ fontSize: 11.5, color: '#64748b' }}>
                            {item.size ? `Size: ${item.size}` : ''}
                            {item.size && item.variant ? ' | ' : ''}
                            {item.variant ? `Variant: ${item.variant}` : ''}
                          </div>
                          {item.trackingNumber && (
                            <div style={{ fontSize: 11, color: '#2563eb', marginTop: 2 }}>
                              🚚 Tracking: <b>{item.trackingNumber}</b>
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right', minWidth: 100 }}>
                        <div style={{ fontSize: 12, color: '#64748b' }}>
                          {money(item.price)} × {item.qty}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                          {money((item.price || 0) * (item.qty || 1))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2-Column Responsive Layout for Customer/Shipping and Financials */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                {/* Customer & Shipping Information */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>📍</span> Customer & Delivery
                  </h4>
                  <div style={{ fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 8, color: '#334155' }}>
                    <div>
                      <span className="muted" style={{ fontSize: 11, display: 'block', fontWeight: 600 }}>RECIPIENT</span>
                      <b style={{ color: '#0f172a', fontSize: 13.5 }}>{selectedOrderForDetail.shippingAddress?.fullName || 'Not specified'}</b>
                    </div>
                    <div>
                      <span className="muted" style={{ fontSize: 11, display: 'block', fontWeight: 600 }}>PHONE NUMBER</span>
                      <span>{selectedOrderForDetail.contact?.phone || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="muted" style={{ fontSize: 11, display: 'block', fontWeight: 600 }}>EMAIL ADDRESS</span>
                      <span>{selectedOrderForDetail.contact?.email || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="muted" style={{ fontSize: 11, display: 'block', fontWeight: 600 }}>DESTINATION ADDRESS</span>
                      <div style={{ lineHeight: 1.4 }}>
                        {selectedOrderForDetail.shippingAddress?.street}
                        {selectedOrderForDetail.shippingAddress?.apartment ? `, ${selectedOrderForDetail.shippingAddress.apartment}` : ''}
                        <br />
                        {selectedOrderForDetail.shippingAddress?.city}{selectedOrderForDetail.shippingAddress?.city && selectedOrderForDetail.shippingAddress?.state ? ', ' : ''}
                        {selectedOrderForDetail.shippingAddress?.state} {selectedOrderForDetail.shippingAddress?.postalCode}
                        <br />
                        <b>{selectedOrderForDetail.shippingAddress?.country || 'United States'}</b>
                      </div>
                    </div>
                    {selectedOrderForDetail.shipping?.name && (
                      <div>
                        <span className="muted" style={{ fontSize: 11, display: 'block', fontWeight: 600 }}>SHIPPING METHOD</span>
                        <span>{selectedOrderForDetail.shipping.name} {selectedOrderForDetail.shipping.eta ? `(${selectedOrderForDetail.shipping.eta})` : ''}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Financial Summary & Payment */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>💳</span> Payment & Financials
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                      <span>Subtotal:</span>
                      <b style={{ color: '#0f172a' }}>{money(selectedOrderForDetail.subtotal || 0)}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                      <span>Shipping:</span>
                      <b style={{ color: '#0f172a' }}>{selectedOrderForDetail.shipping?.cost ? money(selectedOrderForDetail.shipping.cost) : 'FREE'}</b>
                    </div>
                    {(selectedOrderForDetail.discount > 0 || (selectedOrderForDetail.discounts && selectedOrderForDetail.discounts.length > 0)) && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
                        <span>Discount:</span>
                        <b>- {money(selectedOrderForDetail.discount || 0)}</b>
                      </div>
                    )}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        paddingTop: 8,
                        marginTop: 4,
                        borderTop: '1px dashed #cbd5e1',
                        fontSize: 14,
                        fontWeight: 900,
                        color: '#0f172a',
                      }}
                    >
                      <span>Grand Total:</span>
                      <span style={{ color: '#2563eb' }}>{money(selectedOrderForDetail.total || 0)}</span>
                    </div>

                    <div style={{ marginTop: 12, padding: 10, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span className="muted">Payment Method:</span>
                        <b style={{ textTransform: 'uppercase' }}>{selectedOrderForDetail.paymentMethod || 'COD'}</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span className="muted">Payment Status:</span>
                        <b style={{ textTransform: 'capitalize', color: selectedOrderForDetail.paymentStatus === 'paid' ? '#16a34a' : '#ea580c' }}>
                          {selectedOrderForDetail.paymentStatus || 'pending'}
                        </b>
                      </div>
                      {selectedOrderForDetail.payment?.reference && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span className="muted">Transaction Ref:</span>
                          <b>{selectedOrderForDetail.payment.reference}</b>
                        </div>
                      )}
                      {selectedOrderForDetail.payment?.walletNumber && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span className="muted">Account/Wallet #:</span>
                          <b>{selectedOrderForDetail.payment.walletNumber}</b>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Status History (if present) */}
              {selectedOrderForDetail.statusHistory && selectedOrderForDetail.statusHistory.length > 0 && (
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
                  <h4 style={{ margin: '0 0 10px', fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>
                    🕒 Timeline & Status Updates
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selectedOrderForDetail.statusHistory.map((h, idx) => (
                      <div key={idx} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, color: '#475569' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
                        <b style={{ textTransform: 'capitalize', color: '#0f172a' }}>{h.status}</b>
                        <span>&bull;</span>
                        <span className="muted">{fmtDate(h.at)}</span>
                        {h.by && <span className="muted">({h.by})</span>}
                        {h.note && <span style={{ color: '#64748b', fontStyle: 'italic' }}>— {h.note}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid #e2e8f0',
                background: '#f8fafc',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 10,
                flexShrink: 0,
              }}
            >
              <a
                href={`/admin/orders/${selectedOrderForDetail._id}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: '#2563eb',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                Open in Full Order Management ↗
              </a>
              <button
                type="button"
                onClick={() => setSelectedOrderForDetail(null)}
                className="btn-primary"
                style={{ padding: '8px 18px', fontSize: 13 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: ONBOARD NEW SELLER ─── */}
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

              {/* Account Type Toggle (Client Account vs Test Account) */}
              <div
                style={{
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: createForm.isTestAccount ? '#faf5ff' : '#eff6ff',
                  border: `1.5px solid ${createForm.isTestAccount ? '#d8b4fe' : '#bfdbfe'}`,
                  padding: '12px 16px',
                  borderRadius: 8,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 16 }}>{createForm.isTestAccount ? '🧪' : '👤'}</span>
                    <b style={{ color: createForm.isTestAccount ? '#6b21a8' : '#1d4ed8', fontSize: 13.5 }}>
                      {createForm.isTestAccount ? 'Test Seller Account' : 'Client Account (Live Merchant)'}
                    </b>
                  </div>
                  <small style={{ color: createForm.isTestAccount ? '#7c3aed' : '#2563eb', fontSize: 11.5, display: 'block', marginTop: 2 }}>
                    {createForm.isTestAccount
                      ? 'Marked for internal QA & software feature testing (will not be mixed with live clients)'
                      : 'Live merchant store for real customer transactions'}
                  </small>
                </div>
                <button
                  type="button"
                  onClick={() => setCreateForm({ ...createForm, isTestAccount: !createForm.isTestAccount })}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 20,
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 800,
                    fontSize: 12,
                    background: createForm.isTestAccount ? '#7c3aed' : '#2563eb',
                    color: '#fff',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
                  }}
                >
                  {createForm.isTestAccount ? '🧪 Switch to Client' : '👤 Switch to Test'}
                </button>
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

      {/* ─── MODAL: RESET SELLER PASSWORD ─── */}
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
                  onClick={generateStandaloneRandomPw}
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

      {/* ─── MODAL: DELETE SELLER CONFIRMATION ─── */}
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

      {toggleToast && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          background: '#0f172a',
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: 10,
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
          zIndex: 99999,
          fontWeight: 700,
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span style={{ fontSize: 16 }}>⚡</span>
          <span>{toggleToast}</span>
          <button
            type="button"
            onClick={() => setToggleToast('')}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              marginLeft: 8,
              fontSize: 14,
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
