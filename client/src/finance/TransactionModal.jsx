import React, { useState, useEffect } from 'react';
import Ic from '../components/Icons.jsx';

const EXPENSE_CATEGORIES = [
  { id: 'office_food', label: 'Office Food & Meals 🍔', emoji: '🍔' },
  { id: 'chai_refreshment', label: 'Chai & Refreshments ☕', emoji: '☕' },
  { id: 'bills_electricity', label: 'Electricity Bill (WAPDA) 💡', emoji: '💡' },
  { id: 'bills_internet', label: 'Office Internet / Fiber 🌐', emoji: '🌐' },
  { id: 'office_rent', label: 'Office Rent & Property 🏢', emoji: '🏢' },
  { id: 'staff_salary', label: 'Staff Salaries & Stipends 👥', emoji: '👥' },
  { id: 'office_supplies', label: 'Supplies, Hardware & Furniture 🪑', emoji: '🪑' },
  { id: 'marketing', label: 'Marketing & Ads 📣', emoji: '📣' },
  { id: 'logistics', label: 'Logistics & Shipping 🚚', emoji: '🚚' },
  { id: 'seller_withdrawal', label: 'Seller Payout Withdrawal 💸', emoji: '💸' },
  { id: 'reinvestment', label: 'Product Inventory Reinvestment 🔄', emoji: '🔄' },
  { id: 'misc_expense', label: 'Miscellaneous Expense 📦', emoji: '📦' },
];

const INCOME_CATEGORIES = [
  { id: 'seller_deposit', label: 'Seller Deposit (USDT) 💰', emoji: '💰' },
  { id: 'platform_profit', label: 'Direct Marketplace Sale Margin 🛍️', emoji: '🛍️' },
  { id: 'commission_income', label: 'Vendor Commission Payout 🏷️', emoji: '🏷️' },
  { id: 'trading_profit', label: 'Binance / Trading Gain 📈', emoji: '📈' },
  { id: 'misc_income', label: 'Other Business Income 💵', emoji: '💵' },
];

export default function TransactionModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialData = null,
  currentRate = 278.5,
  partnerNames = { p1: 'Aizaz', p2: 'Abdullah' },
}) {
  const [type, setType] = useState('expense');
  const [category, setCategory] = useState('office_food');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('PKR');
  const [exchangeRate, setExchangeRate] = useState(currentRate);
  const [walletSource, setWalletSource] = useState('pkr_cash');
  const [walletDestination, setWalletDestination] = useState('external');
  const [partnerName, setPartnerName] = useState(partnerNames.p1 || 'Aizaz');
  const [paidBy, setPaidBy] = useState('both_50_50');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isEditing = Boolean(initialData && initialData._id);

  useEffect(() => {
    if (initialData) {
      setType(initialData.type || 'expense');
      setCategory(initialData.category || 'office_food');
      setAmount(initialData.amount ? String(initialData.amount) : '');
      setCurrency(initialData.currency === 'USDT' || initialData.currency === 'USD' ? 'USDT' : 'PKR');
      setExchangeRate(initialData.exchangeRate || currentRate);
      setWalletSource(initialData.walletSource || 'pkr_cash');
      setWalletDestination(initialData.walletDestination || 'external');
      setPartnerName(initialData.partnerName || partnerNames.p1 || 'Aizaz');
      setPaidBy(initialData.paidBy || 'both_50_50');
      setDescription(initialData.description || '');
      setDate(
        initialData.date
          ? new Date(initialData.date).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10)
      );
      setNotes(initialData.notes || '');
    } else {
      // Defaults for brand new entry
      setType('expense');
      setCategory('office_food');
      setAmount('');
      setCurrency('PKR');
      setExchangeRate(currentRate);
      setWalletSource('pkr_cash');
      setWalletDestination('external');
      setPartnerName(partnerNames.p1 || 'Aizaz');
      setDescription('');
      setDate(new Date().toISOString().slice(0, 10));
      setNotes('');
    }
    setError('');
  }, [initialData, currentRate, isOpen]);

  // Adjust defaults when type switches
  const handleTypeChange = (newType) => {
    setType(newType);
    if (newType === 'expense') {
      setCurrency('PKR');
      setCategory('office_food');
      setWalletSource('pkr_cash');
    } else if (newType === 'income') {
      setCurrency('USDT');
      setCategory('seller_deposit');
      setWalletSource('binance_usdt');
    } else if (newType === 'investment') {
      setCategory('partner_capital');
      setWalletSource(currency === 'USDT' ? 'binance_usdt' : 'pkr_bank');
    } else if (newType === 'drawing') {
      setCategory('partner_drawing');
      setWalletSource('pkr_cash');
    } else if (newType === 'conversion') {
      setCategory('binance_p2p_cashout');
      setCurrency('USDT');
      setWalletSource('binance_usdt');
      setWalletDestination('pkr_cash');
    }
  };

  if (!isOpen) return null;

  // Live conversions for preview
  const numAmt = Number(amount) || 0;
  const isUsdt = currency === 'USDT';
  const equivalentPKR = isUsdt ? Math.round(numAmt * exchangeRate) : numAmt;
  const equivalentUSDT = isUsdt ? numAmt : Number((numAmt / exchangeRate).toFixed(2));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!numAmt || numAmt <= 0) {
      setError('Please enter a valid positive amount.');
      return;
    }
    if (!description.trim()) {
      setError('Please provide a description.');
      return;
    }

    setSubmitting(true);
    setError('');

    const payload = {
      type,
      category,
      amount: numAmt,
      currency,
      exchangeRate: Number(exchangeRate) || currentRate,
      walletSource,
      walletDestination,
      partnerName: ['investment', 'drawing'].includes(type) ? partnerName : partnerName || '',
      paidBy: type === 'expense' ? paidBy : 'both_50_50',
      description: description.trim(),
      date,
      notes,
    };

    try {
      await onSave(payload, initialData?._id);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save transaction');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bf-modal-backdrop" onClick={onClose}>
      <div className="bf-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bf-modal-header">
          <h2 className="bf-modal-title">
            <Ic
              name={
                type === 'expense'
                  ? 'minus'
                  : type === 'income'
                  ? 'plus'
                  : type === 'investment'
                  ? 'sparkle'
                  : 'wallet'
              }
              size={20}
            />
            <span>{isEditing ? 'Edit Transaction' : 'Record Transaction'}</span>
          </h2>
          <button type="button" className="bf-icon-btn" onClick={onClose}>
            <Ic name="x" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="bf-modal-body">
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fca5a5', fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          {/* Transaction Type Selector */}
          <div className="bf-form-group">
            <label className="bf-form-label">Transaction Nature</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {[
                { id: 'expense', label: 'Expense 🍔' },
                { id: 'income', label: 'Profit/Income 💰' },
                { id: 'investment', label: 'Investment 💼' },
                { id: 'drawing', label: 'Drawing 💸' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleTypeChange(t.id)}
                  style={{
                    padding: '8px 4px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: '1px solid',
                    borderColor: type === t.id ? 'var(--bf-gold)' : 'var(--bf-border)',
                    background: type === t.id ? 'var(--bf-gold)' : 'rgba(255,255,255,0.04)',
                    color: type === t.id ? '#000' : 'var(--bf-text-muted)',
                    transition: 'all 0.15s',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Amount & Currency */}
          <div className="bf-form-group">
            <label className="bf-form-label">Amount & Currency</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number"
                step="any"
                min="0"
                required
                className="bf-input"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ fontSize: 18, fontWeight: 700, flex: 2 }}
              />
              <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--bf-border)' }}>
                <button
                  type="button"
                  onClick={() => setCurrency('PKR')}
                  style={{
                    padding: '0 14px',
                    fontWeight: 700,
                    fontSize: 13,
                    border: 'none',
                    cursor: 'pointer',
                    background: currency === 'PKR' ? '#10b981' : 'rgba(255,255,255,0.05)',
                    color: currency === 'PKR' ? '#000' : '#94a3b8',
                  }}
                >
                  PKR (₨)
                </button>
                <button
                  type="button"
                  onClick={() => setCurrency('USDT')}
                  style={{
                    padding: '0 14px',
                    fontWeight: 700,
                    fontSize: 13,
                    border: 'none',
                    cursor: 'pointer',
                    background: currency === 'USDT' ? '#f59e0b' : 'rgba(255,255,255,0.05)',
                    color: currency === 'USDT' ? '#000' : '#94a3b8',
                  }}
                >
                  USDT ($)
                </button>
              </div>
            </div>

            {/* Equivalent live calculation hint */}
            {numAmt > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--bf-gold)', display: 'flex', justifyContent: 'space-between' }}>
                <span>
                  ≈ {isUsdt ? `₨ ${equivalentPKR.toLocaleString('en-US')}` : `$ ${equivalentUSDT.toLocaleString('en-US')} USDT`}
                </span>
                <span style={{ color: 'var(--bf-text-dim)' }}>
                  Rate: 1 USDT = ₨ {exchangeRate}
                </span>
              </div>
            )}
          </div>

          {/* Category Selector */}
          <div className="bf-form-group">
            <label className="bf-form-label">Category</label>
            <select
              className="bf-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {type === 'expense' &&
                EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              {type === 'income' &&
                INCOME_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              {type === 'investment' && (
                <option value="partner_capital">Partner Fresh Capital Injection 💼</option>
              )}
              {type === 'drawing' && (
                <option value="partner_drawing">Partner Personal Profit Drawing 💸</option>
              )}
              {type === 'conversion' && (
                <option value="binance_p2p_cashout">Binance USDT P2P Cashout 🔄</option>
              )}
            </select>
          </div>

          {/* 50/50 Split Preview & Who Paid (for Expenses) */}
          {type === 'expense' && (
            <div style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: 12, padding: 12, border: '1px solid var(--bf-border)', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--bf-green)' }}>
                  🤝 50/50 Split (Office Expense)
                </span>
                <span style={{ fontSize: 11, color: 'var(--bf-text-dim)' }}>
                  Total: ₨ {equivalentPKR.toLocaleString('en-US')}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                  <div style={{ fontSize: 11, color: '#93c5fd', fontWeight: 600 }}>{partnerNames.p1 || 'Aizaz'} (50%)</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>₨ {Math.round(equivalentPKR * 0.5).toLocaleString('en-US')}</div>
                </div>
                <div style={{ background: 'rgba(168, 85, 247, 0.1)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(168, 85, 247, 0.2)' }}>
                  <div style={{ fontSize: 11, color: '#c084fc', fontWeight: 600 }}>{partnerNames.p2 || 'Abdullah'} (50%)</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>₨ {Math.round(equivalentPKR * 0.5).toLocaleString('en-US')}</div>
                </div>
              </div>

              <label className="bf-form-label" style={{ marginBottom: 6 }}>Who Paid Cash For This Expense?</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {[
                  { id: 'both_50_50', label: 'Both 50/50 Cash' },
                  { id: partnerNames.p1 || 'Aizaz', label: `Paid by ${partnerNames.p1 || 'Aizaz'}` },
                  { id: partnerNames.p2 || 'Abdullah', label: `Paid by ${partnerNames.p2 || 'Abdullah'}` },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPaidBy(opt.id)}
                    style={{
                      padding: '8px 4px',
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor: paidBy === opt.id ? 'var(--bf-gold)' : 'var(--bf-border)',
                      background: paidBy === opt.id ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.02)',
                      color: paidBy === opt.id ? '#fcd34d' : 'var(--bf-text-muted)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Partner Selector (if investment or drawing) */}
          {(['investment', 'drawing'].includes(type) || walletSource === 'partner_pocket') && (
            <div className="bf-form-group">
              <label className="bf-form-label">Associated Partner</label>
              <select
                className="bf-select"
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
              >
                <option value={partnerNames.p1 || 'Aizaz'}>{partnerNames.p1 || 'Aizaz (You)'}</option>
                <option value={partnerNames.p2 || 'Partner'}>{partnerNames.p2 || 'Partner 2'}</option>
              </select>
            </div>
          )}

          {/* Wallet Source */}
          <div className="bf-form-group">
            <label className="bf-form-label">
              {type === 'expense' || type === 'drawing' ? 'Paid From' : 'Deposited / Credited Into'}
            </label>
            <select
              className="bf-select"
              value={walletSource}
              onChange={(e) => setWalletSource(e.target.value)}
            >
              <option value="pkr_cash">💵 Office Cash Drawer (PKR)</option>
              <option value="pkr_bank">🏦 Business Bank Account (PKR)</option>
              <option value="binance_usdt">💎 Binance Main Wallet (USDT)</option>
              <option value="binance_reserve">🛡️ Binance Reinvestment Reserve Pool (USDT)</option>
              {type === 'expense' && (
                <option value="partner_pocket">👤 Paid Out of Partner Personal Pocket</option>
              )}
            </select>
          </div>

          {/* Description */}
          <div className="bf-form-group">
            <label className="bf-form-label">Description / Title</label>
            <input
              type="text"
              required
              className="bf-input"
              placeholder={
                type === 'expense'
                  ? 'e.g. Biryani for office team lunch'
                  : type === 'income'
                  ? 'e.g. Deposit from seller or store profit'
                  : type === 'investment'
                  ? 'e.g. Added capital for marketing campaign'
                  : 'e.g. Weekly personal withdrawal'
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Date & Exchange Rate */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="bf-form-group">
              <label className="bf-form-label">Date</label>
              <input
                type="date"
                className="bf-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="bf-form-group">
              <label className="bf-form-label">Exchange Rate (PKR/USDT)</label>
              <input
                type="number"
                step="0.1"
                className="bf-input"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="bf-form-group">
            <label className="bf-form-label">Internal Notes / Memo (Optional)</label>
            <input
              type="text"
              className="bf-input"
              placeholder="e.g. Paid via Sadapay / UTR receipt / Binance order"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            {isEditing && (
              <button
                type="button"
                className="bf-icon-btn danger"
                style={{ width: 44, height: 44 }}
                title="Delete this transaction"
                onClick={() => {
                  if (window.confirm('Are you sure you want to permanently delete this transaction?')) {
                    onDelete(initialData._id);
                    onClose();
                  }
                }}
              >
                <Ic name="alert" size={18} />
              </button>
            )}
            <button
              type="submit"
              className="bf-btn-submit"
              disabled={submitting}
            >
              {submitting ? 'Saving...' : isEditing ? 'Update Transaction' : 'Save Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
