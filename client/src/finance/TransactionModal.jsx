import React, { useState, useEffect } from 'react';
import Ic from '../components/Icons.jsx';

const EXPENSE_CATEGORIES = [
  { id: 'office_food', label: 'Office Food & Meals 🍔', emoji: '🍔' },
  { id: 'chai_refreshment', label: 'Chai & Refreshments ☕', emoji: '☕' },
  { id: 'bills_electricity', label: 'Electricity Bill (WAPDA) 💡', emoji: '💡' },
  { id: 'bills_internet', label: 'Office Internet / Fiber 🌐', emoji: '🌐' },
  { id: 'office_rent', label: 'Office Rent & Property 🏢', emoji: '🏢' },
  { id: 'office_supplies', label: 'Supplies, Table & Furniture 🪑', emoji: '🪑' },
  { id: 'staff_salary', label: 'Staff Salaries & Stipends 👥', emoji: '👥' },
  { id: 'marketing', label: 'Marketing & Ads 📣', emoji: '📣' },
  { id: 'logistics', label: 'Logistics & Courier 🚚', emoji: '🚚' },
  { id: 'misc_expense', label: 'Miscellaneous Expenditure 📦', emoji: '📦' },
];

const INCOME_CATEGORIES = [
  { id: 'seller_deposit', label: 'Seller Deposit (USDT) 💰', emoji: '💰' },
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
  const [type, setType] = useState('expense'); // 'expense' | 'income' | 'drawing'
  const [category, setCategory] = useState('office_food');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('PKR');
  const [exchangeRate, setExchangeRate] = useState(currentRate);
  const [partnerName, setPartnerName] = useState(partnerNames.p1 || 'Aizaz');
  const [paidBy, setPaidBy] = useState('both_50_50'); // 'both_50_50' | 'Aizaz' | 'Abdullah'
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isEditing = Boolean(initialData && initialData._id);

  useEffect(() => {
    if (initialData) {
      const t = initialData.type || 'expense';
      setType(t);
      setCategory(initialData.category || (t === 'income' ? 'seller_deposit' : 'office_food'));
      setAmount(initialData.amount ? String(initialData.amount) : '');
      setCurrency(t === 'income' || t === 'drawing' ? 'USDT' : 'PKR');
      setExchangeRate(initialData.exchangeRate || currentRate);
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
      // Clean defaults
      setType('expense');
      setCategory('office_food');
      setAmount('');
      setCurrency('PKR');
      setExchangeRate(currentRate);
      setPartnerName(partnerNames.p1 || 'Aizaz');
      setPaidBy('both_50_50');
      setDescription('');
      setDate(new Date().toISOString().slice(0, 10));
      setNotes('');
    }
    setError('');
  }, [initialData, currentRate, isOpen, partnerNames.p1]);

  // Adjust defaults when type switches
  const handleTypeChange = (newType) => {
    setType(newType);
    if (newType === 'expense') {
      setCurrency('PKR');
      setCategory('office_food');
      setDescription('');
    } else if (newType === 'income') {
      setCurrency('USDT');
      setCategory('seller_deposit');
      setDescription('Seller Deposit (USDT)');
    } else if (newType === 'drawing') {
      setCurrency('USDT');
      setCategory('partner_drawing');
      setDescription(`Withdrawal: ${partnerName}`);
    }
  };

  if (!isOpen) return null;

  // Live calculations for preview
  const numAmt = Number(amount) || 0;
  const isUsdt = currency === 'USDT';
  const equivalentPKR = isUsdt ? Math.round(numAmt * exchangeRate) : numAmt;
  const equivalentUSDT = isUsdt ? numAmt : Number((numAmt / exchangeRate).toFixed(2));
  const halfPKR = Math.round(equivalentPKR * 0.5);

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

    // Automatic wallet mappings: NO confusing dropdowns!
    const walletSource = type === 'income' ? 'binance_usdt' : type === 'drawing' ? 'binance_usdt' : 'pkr_cash';
    const walletDestination = type === 'income' ? 'binance_usdt' : 'external';

    const payload = {
      type,
      category,
      amount: numAmt,
      currency,
      exchangeRate: Number(exchangeRate) || currentRate,
      walletSource,
      walletDestination,
      partnerName: type === 'drawing' ? partnerName : '',
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
            <span style={{ fontSize: 20 }}>
              {type === 'expense' ? '🍔' : type === 'income' ? '💰' : '💸'}
            </span>
            <span>
              {isEditing
                ? 'Edit Record'
                : type === 'expense'
                ? 'Office Expenditure (Split 50/50)'
                : type === 'income'
                ? '+ Add Profit (Binance USDT)'
                : '💸 Withdraw Partner Share'}
            </span>
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

          {/* Simple 3-Tab Type Switcher */}
          {!isEditing && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 6, marginBottom: 16, background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 10 }}>
              <button
                type="button"
                onClick={() => handleTypeChange('expense')}
                style={{
                  padding: '9px 8px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  background: type === 'expense' ? 'rgba(244, 63, 94, 0.25)' : 'transparent',
                  color: type === 'expense' ? '#fda4af' : 'var(--bf-text-muted)',
                  transition: 'all 0.15s',
                }}
              >
                🍔 Office Expenditure
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('income')}
                style={{
                  padding: '9px 8px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  background: type === 'income' ? 'rgba(16, 185, 129, 0.25)' : 'transparent',
                  color: type === 'income' ? '#6ee7b7' : 'var(--bf-text-muted)',
                  transition: 'all 0.15s',
                }}
              >
                💰 + Add Profit
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('drawing')}
                style={{
                  padding: '9px 8px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  background: type === 'drawing' ? 'rgba(245, 158, 11, 0.25)' : 'transparent',
                  color: type === 'drawing' ? '#fcd34d' : 'var(--bf-text-muted)',
                  transition: 'all 0.15s',
                }}
              >
                💸 Withdraw
              </button>
            </div>
          )}

          {/* Amount Field */}
          <div className="bf-form-group">
            <label className="bf-form-label">
              {type === 'expense' ? 'Expenditure Amount (PKR ₨)' : 'Amount (USDT $)'}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                step="any"
                min="0.01"
                required
                className="bf-input"
                placeholder={type === 'expense' ? 'e.g. 5000' : 'e.g. 1200'}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ fontSize: 20, fontWeight: 800, paddingRight: 80 }}
              />
              <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: type === 'expense' ? '#fb7185' : 'var(--bf-gold)' }}>
                {currency}
              </span>
            </div>

            {/* Live Equivalent Preview */}
            {numAmt > 0 && (
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--bf-gold)', display: 'flex', justifyContent: 'space-between' }}>
                <span>
                  ≈ {isUsdt ? `₨ ${equivalentPKR.toLocaleString('en-US')} PKR` : `$ ${equivalentUSDT.toFixed(2)} USDT`}
                </span>
                <span style={{ color: 'var(--bf-text-dim)', fontSize: 11 }}>
                  Rate: 1 USDT = ₨ {exchangeRate}
                </span>
              </div>
            )}
          </div>

          {/* ────────────────── EXPENSE SPECIFIC SECTION ────────────────── */}
          {type === 'expense' && (
            <div>
              {/* Category */}
              <div className="bf-form-group">
                <label className="bf-form-label">Expenditure Category</label>
                <select
                  className="bf-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 50/50 Cash Paid By Selector */}
              <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 14, padding: 14, border: '1px solid var(--bf-border)', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>
                    🤝 Kisne Cash Diya? (Who Paid Cash?)
                  </span>
                  {numAmt > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--bf-gold)', fontWeight: 700 }}>
                      Share: ₨ {halfPKR.toLocaleString('en-US')} each
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
                  <button
                    type="button"
                    onClick={() => setPaidBy('both_50_50')}
                    style={{
                      padding: '10px 6px',
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor: paidBy === 'both_50_50' ? 'var(--bf-gold)' : 'var(--bf-border)',
                      background: paidBy === 'both_50_50' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.03)',
                      color: paidBy === 'both_50_50' ? '#fcd34d' : 'var(--bf-text-muted)',
                      textAlign: 'center',
                    }}
                  >
                    🤝 Dono 50-50 Cash
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaidBy(partnerNames.p1 || 'Aizaz')}
                    style={{
                      padding: '10px 6px',
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor: paidBy === (partnerNames.p1 || 'Aizaz') ? '#3b82f6' : 'var(--bf-border)',
                      background: paidBy === (partnerNames.p1 || 'Aizaz') ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.03)',
                      color: paidBy === (partnerNames.p1 || 'Aizaz') ? '#93c5fd' : 'var(--bf-text-muted)',
                      textAlign: 'center',
                    }}
                  >
                    👤 {partnerNames.p1 || 'Aizaz'} Paid
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaidBy(partnerNames.p2 || 'Abdullah')}
                    style={{
                      padding: '10px 6px',
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor: paidBy === (partnerNames.p2 || 'Abdullah') ? '#a855f7' : 'var(--bf-border)',
                      background: paidBy === (partnerNames.p2 || 'Abdullah') ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255,255,255,0.03)',
                      color: paidBy === (partnerNames.p2 || 'Abdullah') ? '#c084fc' : 'var(--bf-text-muted)',
                      textAlign: 'center',
                    }}
                  >
                    👤 {partnerNames.p2 || 'Abdullah'} Paid
                  </button>
                </div>

                {/* Instant Settlement Explainer */}
                <div style={{ fontSize: 11, color: 'var(--bf-text-dim)', lineHeight: 1.4, background: 'rgba(255,255,255,0.02)', padding: '8px 10px', borderRadius: 8 }}>
                  {paidBy === 'both_50_50' && (
                    <span>✅ Dono ne usi time adhe adhe cash de diye hain (Hisaab barabar).</span>
                  )}
                  {paidBy === (partnerNames.p1 || 'Aizaz') && (
                    <span>💡 Poore cash <b>{partnerNames.p1 || 'Aizaz'}</b> ne diye hain. Isliye <b>{partnerNames.p2 || 'Abdullah'}</b> ke zimmay {partnerNames.p1 || 'Aizaz'} ko <b>₨ {halfPKR.toLocaleString('en-US')}</b> dena banta hai.</span>
                  )}
                  {paidBy === (partnerNames.p2 || 'Abdullah') && (
                    <span>💡 Poore cash <b>{partnerNames.p2 || 'Abdullah'}</b> ne diye hain. Isliye <b>{partnerNames.p1 || 'Aizaz'}</b> ke zimmay {partnerNames.p2 || 'Abdullah'} ko <b>₨ {halfPKR.toLocaleString('en-US')}</b> dena banta hai.</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ────────────────── INCOME SPECIFIC SECTION ────────────────── */}
          {type === 'income' && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid var(--bf-border)', padding: '10px 14px', borderRadius: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--bf-text-muted)' }}>Category:</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#fcd34d' }}>💰 Seller Deposit (USDT)</span>
              </div>

              {/* Destination info pill */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '10px 14px', borderRadius: 10 }}>
                <span style={{ fontSize: 16 }}>💎</span>
                <span style={{ fontSize: 12, color: '#a7f3d0', fontWeight: 600 }}>
                  Directly credited into <b>Binance Main Wallet (USDT)</b>.
                </span>
              </div>
            </div>
          )}

          {/* ────────────────── WITHDRAWAL SPECIFIC SECTION ────────────── */}
          {type === 'drawing' && (
            <div>
              <div className="bf-form-group">
                <label className="bf-form-label">Who is Withdrawing?</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setPartnerName(partnerNames.p1 || 'Aizaz');
                      setDescription(`Withdrawal: ${partnerNames.p1 || 'Aizaz'}`);
                    }}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      fontWeight: 800,
                      fontSize: 13,
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor: partnerName === (partnerNames.p1 || 'Aizaz') ? '#3b82f6' : 'var(--bf-border)',
                      background: partnerName === (partnerNames.p1 || 'Aizaz') ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255,255,255,0.03)',
                      color: partnerName === (partnerNames.p1 || 'Aizaz') ? '#93c5fd' : 'var(--bf-text-muted)',
                    }}
                  >
                    👤 {partnerNames.p1 || 'Aizaz'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPartnerName(partnerNames.p2 || 'Abdullah');
                      setDescription(`Withdrawal: ${partnerNames.p2 || 'Abdullah'}`);
                    }}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      fontWeight: 800,
                      fontSize: 13,
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor: partnerName === (partnerNames.p2 || 'Abdullah') ? '#a855f7' : 'var(--bf-border)',
                      background: partnerName === (partnerNames.p2 || 'Abdullah') ? 'rgba(168, 85, 247, 0.25)' : 'rgba(255,255,255,0.03)',
                      color: partnerName === (partnerNames.p2 || 'Abdullah') ? '#c084fc' : 'var(--bf-text-muted)',
                    }}
                  >
                    👤 {partnerNames.p2 || 'Abdullah'}
                  </button>
                </div>
              </div>

              {/* Source info pill */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '10px 14px', borderRadius: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 16 }}>💎</span>
                <span style={{ fontSize: 12, color: '#fcd34d', fontWeight: 600 }}>
                  Withdrawn from <b>Binance Main Wallet</b> (Profit Share).
                </span>
              </div>
            </div>
          )}

          {/* Description */}
          <div className="bf-form-group">
            <label className="bf-form-label">Description / Title</label>
            <input
              type="text"
              required
              className="bf-input"
              placeholder={
                type === 'expense'
                  ? 'e.g. Office Biryani / Lunch, Chai bill, WAPDA'
                  : type === 'income'
                  ? 'e.g. Seller Deposit, Platform margin'
                  : 'e.g. Personal Cashout'
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Date */}
          <div className="bf-form-group">
            <label className="bf-form-label">Date</label>
            <input
              type="date"
              required
              className="bf-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* Notes (Optional) */}
          <div className="bf-form-group">
            <label className="bf-form-label">Notes (Optional)</label>
            <input
              type="text"
              className="bf-input"
              placeholder="Any details or memo..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            {isEditing && (
              <button
                type="button"
                className="bf-btn-sm"
                style={{ background: 'rgba(244, 63, 94, 0.15)', borderColor: 'rgba(244, 63, 94, 0.3)', color: '#fda4af', flex: 1 }}
                onClick={() => {
                  if (window.confirm('Are you sure you want to delete this transaction?')) {
                    onDelete(initialData._id);
                    onClose();
                  }
                }}
              >
                Delete
              </button>
            )}

            <button
              type="submit"
              className="bf-btn-submit"
              disabled={submitting}
              style={{
                flex: 2,
                background:
                  type === 'expense'
                    ? 'linear-gradient(135deg, #f43f5e, #e11d48)'
                    : type === 'income'
                    ? 'linear-gradient(135deg, #10b981, #059669)'
                    : 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: type === 'income' || type === 'expense' ? '#fff' : '#000',
              }}
            >
              {submitting
                ? 'Saving...'
                : isEditing
                ? 'Save Changes'
                : type === 'expense'
                ? `Log Expenditure (₨ ${numAmt ? numAmt.toLocaleString('en-US') : 0})`
                : type === 'income'
                ? `Add Profit ($${numAmt ? numAmt.toFixed(2) : 0} USDT)`
                : `Confirm Withdrawal ($${numAmt ? numAmt.toFixed(2) : 0} USDT)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
