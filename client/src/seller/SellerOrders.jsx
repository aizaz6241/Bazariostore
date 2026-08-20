import { useEffect, useState } from 'react';
import { sapi, fmtDate } from '../api.js';
import Ic from '../components/Icons.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';

const STATUS_TABS = ['all', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

export default function SellerOrders() {
  const { formatMoney } = useCurrency();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [selectedOrd, setSelectedOrd] = useState(null);
  const [trackingNum, setTrackingNum] = useState('');
  const [newStatus, setNewStatus] = useState('shipped');
  const [updating, setUpdating] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const [actionMsg, setActionMsg] = useState('');

  const loadOrders = () => {
    setLoading(true);
    sapi('/sellers/orders')
      .then(setOrders)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleQuickConfirm = async (ord) => {
    setConfirmingId(ord._id);
    setActionMsg('');
    try {
      await sapi(`/sellers/orders/${ord._id}/confirm`, { method: 'POST' });
      setActionMsg(`✅ Order #${ord.orderNumber} confirmed! $${(ord.sellerTotal || 0).toFixed(2)} moved to Processing Fund.`);
      loadOrders();
    } catch (err) {
      alert('Confirmation failed: ' + err.message);
    } finally {
      setConfirmingId(null);
    }
  };

  const openFulfill = (ord) => {
    setSelectedOrd(ord);
    const item = ord.sellerItems?.[0];
    setTrackingNum(item?.trackingNumber || `TRK-${Math.floor(10000 + Math.random() * 90000)}`);
    setNewStatus(
      item?.itemStatus === 'pending'
        ? 'confirmed'
        : item?.itemStatus === 'confirmed'
        ? 'processing'
        : item?.itemStatus === 'processing'
        ? 'shipped'
        : 'delivered'
    );
  };

  const handleUpdateStatus = async (e) => {
    e.preventDefault();
    if (!selectedOrd) return;
    setUpdating(true);
    try {
      await sapi(`/sellers/orders/${selectedOrd._id}/status`, {
        method: 'PUT',
        body: {
          status: newStatus,
          trackingNumber: trackingNum,
        },
      });
      setSelectedOrd(null);
      loadOrders();
    } catch (err) {
      alert('Error updating status: ' + err.message);
    } finally {
      setUpdating(false);
    }
  };

  const filtered = orders.filter((o) => {
    if (tab === 'all') return true;
    const status = o.sellerItems?.[0]?.itemStatus || o.status;
    return status === tab;
  });

  return (
    <div className="seller-orders-page">
      <div className="seller-page-header">
        <div>
          <h2>📦 Order Fulfillment &amp; Dispatch</h2>
          <p>Review customer orders, lock processing funds on confirmation, and earn 20% profit on delivery.</p>
        </div>
      </div>

      {actionMsg && (
        <div className="seller-action-alert" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '12px 16px', borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13.5 }}>
          <span>{actionMsg}</span>
          <button onClick={() => setActionMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', fontWeight: 800 }}>✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="seller-tabs-bar">
        {STATUS_TABS.map((t) => (
          <button
            key={t}
            className={`seller-tab-btn ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'all' ? 'All Orders' : t.replace(/_/g, ' ')}
            {t !== 'all' && (
              <span className="tab-count">
                {orders.filter((o) => (o.sellerItems?.[0]?.itemStatus || o.status) === t).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Orders Table */}
      <div className="seller-card">
        <div className="seller-table-wrap">
          <table className="seller-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Order Date</th>
                <th>Items Ordered</th>
                <th>Customer &amp; Address</th>
                <th>Financial Settlement (20% Profit)</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="8" className="text-center py-8 muted">Loading orders...</td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan="8" className="text-center py-8 muted">No orders found in this status.</td>
                </tr>
              )}
              {filtered.map((ord) => {
                const items = ord.sellerItems || [];
                const currentStatus = items[0]?.itemStatus || ord.status;
                const tracking = items[0]?.trackingNumber;
                const total = ord.sellerTotal || 0;
                const profit = ord.sellerProfit || Number((total * 0.20).toFixed(2));
                const totalReturn = ord.sellerReturn || Number((total * 1.20).toFixed(2));
                const isPending = currentStatus === 'pending';
                const isDelivered = currentStatus === 'delivered';
                const isProcessing = ['confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery'].includes(currentStatus);

                return (
                  <tr key={ord._id}>
                    <td>
                      <b>{ord.orderNumber}</b>
                    </td>
                    <td>{fmtDate(ord.createdAt)}</td>
                    <td>
                      <div className="order-items-stack">
                        {items.map((it, idx) => (
                          <div key={idx} className="seller-order-item">
                            <img src={it.image || '/img/products/serum.svg'} alt="" className="thumb-xs" />
                            <div>
                              <b>{it.name}</b>
                              <small className="muted block">Qty: {it.qty} × {money(it.price)}</small>
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td>
                      <b>{ord.shippingAddress?.fullName || 'Customer'}</b>
                      <div className="address-snippet">
                        {ord.shippingAddress?.street}, {ord.shippingAddress?.city}
                        <br />
                        <small className="muted">📞 {ord.contact?.phone || 'No phone'}</small>
                      </div>
                    </td>
                    <td>
                      <div className="seller-order-financial-pill">
                        <div className="sof-row">
                          <span className="sof-lbl">Order Value:</span>
                          <b>{formatMoney(total)}</b>
                        </div>
                        <div className="sof-row text-profit">
                          <span className="sof-lbl">+20% Profit:</span>
                          <b>+{formatMoney(profit)}</b>
                        </div>
                        <div className="sof-row text-return">
                          <span className="sof-lbl">Payout Return:</span>
                          <b>{formatMoney(totalReturn)}</b>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`payment-pill payment-${ord.paymentStatus}`}>
                        {ord.paymentMethod?.toUpperCase()} ({ord.paymentStatus})
                      </span>
                    </td>
                    <td>
                      <span className={`status-tag status-${currentStatus}`}>
                        {currentStatus.replace(/_/g, ' ')}
                      </span>
                      {isProcessing && (
                        <span className="processing-fund-tag">🔒 Fund Locked</span>
                      )}
                      {isDelivered && (
                        <span className="settled-fund-tag">🎉 Settled</span>
                      )}
                      {tracking && <small className="tracking-text block">TRK: {tracking}</small>}
                    </td>
                    <td>
                      <div className="order-actions-cell" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {isPending && (
                          <button
                            type="button"
                            onClick={() => handleQuickConfirm(ord)}
                            className="btn-quick-confirm"
                            disabled={confirmingId === ord._id}
                          >
                            <Ic name="checkCircle" size={14} />
                            {confirmingId === ord._id ? 'Locking Fund...' : '⚡ Confirm Order'}
                          </button>
                        )}
                        <button onClick={() => openFulfill(ord)} className="btn-sm-action">
                          Update Status →
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

      {/* Fulfillment Status Modal */}
      {selectedOrd && (
        <div className="seller-modal-overlay" onClick={() => setSelectedOrd(null)}>
          <div className="seller-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>📦 Update Order Fulfillment: {selectedOrd.orderNumber}</h3>
              <button onClick={() => setSelectedOrd(null)} className="close-btn"><Ic name="x" size={20} /></button>
            </div>

            <form onSubmit={handleUpdateStatus} className="modal-form">
              <div className="fulfillment-summary-card">
                <p><b>Customer:</b> {selectedOrd.shippingAddress?.fullName} ({selectedOrd.shippingAddress?.city})</p>
                <p><b>Shipping Address:</b> {selectedOrd.shippingAddress?.street}, {selectedOrd.shippingAddress?.city}, {selectedOrd.shippingAddress?.state}</p>
                <p><b>Items:</b> {selectedOrd.sellerItems?.map((i) => `${i.qty}x ${i.name}`).join(', ')}</p>
              </div>

              {/* Financial Settlement Breakdown Box */}
              <div className="order-settlement-preview-box">
                <div className="osp-head">
                  <span>💰 Financial Settlement Details (20% Profit Rate)</span>
                </div>
                <div className="osp-grid">
                  <div className="osp-item">
                    <small>Order Amount</small>
                    <b>{formatMoney(selectedOrd.sellerTotal)}</b>
                  </div>
                  <div className="osp-item">
                    <small>20% Profit Margin</small>
                    <b style={{ color: '#16a34a' }}>+{formatMoney(selectedOrd.sellerProfit || (selectedOrd.sellerTotal * 0.20))}</b>
                  </div>
                  <div className="osp-item highlight">
                    <small>Total Credited on Delivery</small>
                    <b style={{ color: '#2563eb' }}>{formatMoney(selectedOrd.sellerReturn || (selectedOrd.sellerTotal * 1.20))}</b>
                  </div>
                </div>
                <p className="osp-note">
                  💡 When marked <b>Delivered</b>, {formatMoney((selectedOrd.sellerTotal || 0) * 1.20)} (Principal + 20% Profit) will be automatically credited to your available balance.
                </p>
              </div>

              <label>
                <span>Fulfillment Status *</span>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  required
                >
                  <option value="confirmed">Confirmed (Move to Processing Fund)</option>
                  <option value="processing">Processing &amp; Packing</option>
                  <option value="packed">Packed (Ready for Courier Pickup)</option>
                  <option value="shipped">Shipped / In Transit</option>
                  <option value="delivered">Delivered to Customer (Release $ + 20% Profit 🎉)</option>
                  <option value="cancelled">Cancelled (Return Locked Fund)</option>
                </select>
              </label>

              <label>
                <span>Courier Tracking Number</span>
                <input
                  type="text"
                  value={trackingNum}
                  onChange={(e) => setTrackingNum(e.target.value)}
                  placeholder="e.g. TRK-98214-US, FEDEX-88123"
                />
              </label>

              <div className="modal-actions">
                <button type="button" onClick={() => setSelectedOrd(null)} className="btn-cancel">Cancel</button>
                <button type="submit" className="seller-btn-pri" disabled={updating}>
                  {updating ? 'Saving...' : 'Update & Process Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
