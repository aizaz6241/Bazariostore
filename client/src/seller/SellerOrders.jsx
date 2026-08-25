import { useEffect, useState } from 'react';
import { sapi, fmtDate, money } from '../api.js';
import Ic from '../components/Icons.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';
import { getSocket } from '../socket.js';

const STATUS_TABS = [
  { key: 'all', label: 'All Orders', icon: 'package' },
  { key: 'pending', label: 'Pending Confirmation', icon: 'clock' },
  { key: 'confirmed', label: 'Confirmed (Locked)', icon: 'checkCircle' },
  { key: 'processing', label: 'Operations Processing', icon: 'box' },
  { key: 'shipped', label: 'Shipped / In Transit', icon: 'truck' },
  { key: 'delivered', label: 'Delivered (+20% Settled)', icon: 'sparkle' },
  { key: 'cancelled', label: 'Cancelled / Refunded', icon: 'x' },
];

const ORDER_STEPS = [
  { key: 'pending', label: 'Order Placed', desc: 'Customer checkout completed' },
  { key: 'confirmed', label: 'Confirmed', desc: 'Funds locked in processing' },
  { key: 'processing', label: 'Processing', desc: 'Platform warehouse packing' },
  { key: 'shipped', label: 'Shipped', desc: 'Courier transit to customer' },
  { key: 'delivered', label: 'Delivered', desc: 'Settled + 20% profit paid' },
];

function getStepIndex(status) {
  switch (status) {
    case 'pending': return 0;
    case 'confirmed': return 1;
    case 'processing':
    case 'packed': return 2;
    case 'shipped':
    case 'out_for_delivery': return 3;
    case 'delivered': return 4;
    default: return 0;
  }
}

export default function SellerOrders() {
  const { formatMoney } = useCurrency();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [selectedOrd, setSelectedOrd] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [actionMsg, setActionMsg] = useState('');

  const loadOrders = () => {
    sapi('/sellers/orders')
      .then((data) => {
        setOrders(data || []);
        // Update selected order in view if modal is open
        if (selectedOrd) {
          const updated = (data || []).find((o) => o._id === selectedOrd._id);
          if (updated) setSelectedOrd(updated);
        }
      })
      .catch((e) => console.error('Error fetching seller orders:', e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadOrders();

    const socket = getSocket();
    const onOrderUpdate = () => loadOrders();
    socket.on('order:new', onOrderUpdate);
    socket.on('order:update', onOrderUpdate);
    socket.on('seller:status_update', onOrderUpdate);

    return () => {
      socket.off('order:new', onOrderUpdate);
      socket.off('order:update', onOrderUpdate);
      socket.off('seller:status_update', onOrderUpdate);
    };
  }, []);

  const handleQuickConfirm = async (ord) => {
    setConfirmingId(ord._id);
    setActionMsg('');
    try {
      const res = await sapi(`/sellers/orders/${ord._id}/confirm`, { method: 'POST' });
      const lockedAmt = Number(res?.lockedAmount ?? ord.sellerTotal ?? 0);
      setActionMsg(`✅ Order #${ord.orderNumber} confirmed! ${formatMoney(lockedAmt)} locked in processing funds.`);
      loadOrders();
      if (selectedOrd && selectedOrd._id === ord._id) {
        setSelectedOrd(res.order || { ...selectedOrd, status: 'confirmed' });
      }
    } catch (err) {
      alert('⚠️ Order Confirmation Failed:\n' + err.message);
    } finally {
      setConfirmingId(null);
    }
  };

  const openDetails = (ord) => {
    setSelectedOrd(ord);
  };

  const filtered = orders.filter((o) => {
    if (tab === 'all') return true;
    const status = o.sellerItems?.[0]?.itemStatus || o.status;
    if (tab === 'processing') {
      return ['processing', 'packed'].includes(status);
    }
    if (tab === 'shipped') {
      return ['shipped', 'out_for_delivery'].includes(status);
    }
    return status === tab;
  });

  return (
    <div className="seller-orders-page">
      <div className="seller-page-header">
        <div>
          <h2>📦 Merchant Orders &amp; Live Tracking</h2>
          <p>Confirm incoming customer orders to lock processing funds. Downstream fulfillment &amp; dispatch are managed centrally by Operations.</p>
        </div>
      </div>

      {actionMsg && (
        <div className="seller-action-alert">
          <span>{actionMsg}</span>
          <button onClick={() => setActionMsg('')} className="alert-close-btn">✕</button>
        </div>
      )}

      {/* Interactive Status Filter Pills */}
      <div className="seller-status-pills-scroll">
        <div className="seller-status-pills-bar">
          {STATUS_TABS.map((t) => {
            const count = t.key === 'all'
              ? orders.length
              : orders.filter((o) => {
                  const s = o.sellerItems?.[0]?.itemStatus || o.status;
                  if (t.key === 'processing') return ['processing', 'packed'].includes(s);
                  if (t.key === 'shipped') return ['shipped', 'out_for_delivery'].includes(s);
                  return s === t.key;
                }).length;
            const isActive = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                className={`order-status-pill-btn ${isActive ? 'active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                <Ic name={t.icon} size={15} />
                <span className="osp-text">{t.label}</span>
                <span className="osp-count">{count}</span>
              </button>
            );
          })}
        </div>
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
                <th>Live Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="8" className="text-center py-8 muted">Loading orders stream...</td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan="8">
                    <div className="table-empty-box">
                      <div className="empty-icon-circle">📦</div>
                      <h4>No orders in this view</h4>
                      <p>There are currently no customer orders matching the <b>"{tab.replace(/_/g, ' ')}"</b> filter.</p>
                    </div>
                  </td>
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
                      <b style={{ color: '#0f172a' }}>{ord.orderNumber}</b>
                    </td>
                    <td>{fmtDate(ord.createdAt)}</td>
                    <td>
                      <div className="order-items-stack">
                        {items.map((it, idx) => (
                          <div key={idx} className="seller-order-item">
                            <img src={it.image || '/img/products/serum.svg'} alt="" className="thumb-xs" />
                            <div>
                              <b>{it.name}</b>
                              <small className="muted block">Qty: {it.qty} × {formatMoney(it.price)}</small>
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
                      <div className="order-actions-cell">
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
                        <button
                          type="button"
                          onClick={() => openDetails(ord)}
                          className="btn-sm-action"
                        >
                          <Ic name="eye" size={13} /> View Details
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

      {/* Read-Only Order Details & Live Status Tracker Modal */}
      {selectedOrd && (
        <div className="seller-modal-overlay" onClick={() => setSelectedOrd(null)}>
          <div className="seller-modal-content" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>📦</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Order Details: <b>#{selectedOrd.orderNumber}</b></h3>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                    Placed on {fmtDate(selectedOrd.createdAt)} &bull; Payment: {(selectedOrd.paymentMethod || 'COD').toUpperCase()}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedOrd(null)} className="close-btn"><Ic name="x" size={20} /></button>
            </div>

            <div className="modal-body-scrollable" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Order Status Stepper Tracker */}
              {selectedOrd.status === 'cancelled' ? (
                <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', padding: '14px 16px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 24 }}>❌</span>
                  <div>
                    <b style={{ color: '#991b1b', fontSize: 14 }}>This order has been cancelled</b>
                    <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#b91c1c' }}>
                      Any locked processing funds have been returned directly to your available wallet balance.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="order-stepper-box">
                  <span className="stepper-title">Fulfillment Progress Tracker</span>
                  <div className="order-stepper-track">
                    {ORDER_STEPS.map((st, idx) => {
                      const currentIdx = getStepIndex(selectedOrd.status);
                      const isCompleted = currentIdx >= idx;
                      const isCurrent = currentIdx === idx;

                      return (
                        <div key={st.key} className={`stepper-node ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}`}>
                          <div className="stepper-dot">
                            {isCompleted && currentIdx > idx ? '✓' : idx + 1}
                          </div>
                          <span className="stepper-label">{st.label}</span>
                          <small className="stepper-desc">{st.desc}</small>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Status Explanation Callout */}
              <div className="status-explanation-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className={`status-tag status-${selectedOrd.status}`} style={{ margin: 0 }}>
                    {selectedOrd.status.toUpperCase().replace(/_/g, ' ')}
                  </span>
                  {['confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery'].includes(selectedOrd.status) && (
                    <span className="processing-fund-tag">🔒 Processing Fund Locked</span>
                  )}
                  {selectedOrd.status === 'delivered' && (
                    <span className="settled-fund-tag">🎉 20% Profit Settled</span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: 12.5, color: '#475569', lineHeight: 1.45 }}>
                  {selectedOrd.status === 'pending' && '⏳ Awaiting Merchant Confirmation. Please confirm this order to move funds to Processing and begin operations.'}
                  {selectedOrd.status === 'confirmed' && '🔒 Order confirmed by your store! Operations has received the order and is preparing warehouse packing.'}
                  {['processing', 'packed'].includes(selectedOrd.status) && '📦 Platform Operations is packaging your items and preparing the courier shipping label.'}
                  {['shipped', 'out_for_delivery'].includes(selectedOrd.status) && '🚚 Your order is currently in transit with the courier service out for customer delivery.'}
                  {selectedOrd.status === 'delivered' && '🎉 Order successfully delivered! Total payout (Principal + 20% profit) has been credited to your wallet.'}
                  {selectedOrd.status === 'cancelled' && '❌ Order cancelled. Locked funds returned to available balance.'}
                </p>
              </div>

              {/* Courier Tracking Info (If assigned by Admin) */}
              {selectedOrd.sellerItems?.[0]?.trackingNumber && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#64748b' }}>Courier Tracking Number</span>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                      🚚 {selectedOrd.sellerItems[0].trackingNumber}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, background: '#e0e7ff', color: '#3730a3', padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}>
                    In Transit
                  </span>
                </div>
              )}

              {/* Ordered Items List */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                <span style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: 10 }}>
                  Ordered Items ({selectedOrd.sellerItems?.length || 0})
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {selectedOrd.sellerItems?.map((it, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: '#f8fafc', borderRadius: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <img src={it.image || '/img/products/serum.svg'} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', background: '#fff', border: '1px solid #e2e8f0' }} />
                        <div>
                          <b style={{ fontSize: 13, color: '#0f172a' }}>{it.name}</b>
                          <small className="muted block">Qty: {it.qty} &bull; Price: {formatMoney(it.price)}</small>
                        </div>
                      </div>
                      <b style={{ fontSize: 13.5, color: '#0f172a' }}>
                        {formatMoney((it.price || 0) * (it.qty || 1))}
                      </b>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Settlement Breakdown (20% Profit) */}
              <div className="order-settlement-preview-box">
                <div className="osp-head">
                  <span>💰 Financial Settlement Summary (20% Profit Margin)</span>
                </div>
                <div className="osp-grid">
                  <div className="osp-item">
                    <small>Order Amount</small>
                    <b>{formatMoney(selectedOrd.sellerTotal)}</b>
                  </div>
                  <div className="osp-item">
                    <small>20% Profit Margin</small>
                    <b style={{ color: '#16a34a' }}>+{formatMoney(selectedOrd.sellerProfit || ((selectedOrd.sellerTotal || 0) * 0.20))}</b>
                  </div>
                  <div className="osp-item highlight">
                    <small>Payout on Delivery</small>
                    <b style={{ color: '#2563eb' }}>{formatMoney(selectedOrd.sellerReturn || ((selectedOrd.sellerTotal || 0) * 1.20))}</b>
                  </div>
                </div>
                <p className="osp-note">
                  💡 When Platform Operations marks this order as <b>Delivered</b>, your locked fund ({formatMoney(selectedOrd.sellerTotal)}) + 20% profit ({formatMoney(selectedOrd.sellerProfit || (selectedOrd.sellerTotal * 0.2))}) is released to your merchant wallet.
                </p>
              </div>

              {/* Customer Delivery Details */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                <span style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: 6 }}>
                  Customer Delivery Destination
                </span>
                <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                  {selectedOrd.shippingAddress?.fullName || 'Customer'}
                </p>
                <p style={{ margin: '0 0 4px', fontSize: 12.5, color: '#475569' }}>
                  {selectedOrd.shippingAddress?.street}, {selectedOrd.shippingAddress?.city}, {selectedOrd.shippingAddress?.state}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                  📞 {selectedOrd.contact?.phone || selectedOrd.shippingAddress?.phone || 'No phone'}
                </p>
              </div>

              {/* Status History Timeline */}
              {selectedOrd.statusHistory && selectedOrd.statusHistory.length > 0 && (
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: 8 }}>
                    📜 Activity &amp; Status Timeline
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[...selectedOrd.statusHistory].reverse().map((h, i) => (
                      <div key={i} style={{ fontSize: 12, padding: '6px 8px', background: '#f8fafc', borderRadius: 6, borderLeft: '3px solid #2563eb' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <b style={{ color: '#0f172a', textTransform: 'uppercase' }}>{h.status}</b>
                          <small className="muted">{fmtDate(h.at)} {h.by ? `• ${h.by}` : ''}</small>
                        </div>
                        {h.note && <div style={{ fontSize: 11.5, color: '#475569', marginTop: 2 }}>{h.note}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Operations Notice Banner */}
              <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#0369a1', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>ℹ️</span>
                <span>
                  Order dispatch, courier tracking, and delivery confirmations are handled exclusively by <b>Platform Operations</b>. Your status updates in real time.
                </span>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: 16 }}>
              {selectedOrd.status === 'pending' && (
                <button
                  type="button"
                  onClick={() => handleQuickConfirm(selectedOrd)}
                  className="btn-quick-confirm"
                  disabled={confirmingId === selectedOrd._id}
                  style={{ padding: '9px 18px', fontSize: 13 }}
                >
                  <Ic name="checkCircle" size={15} />
                  {confirmingId === selectedOrd._id ? 'Locking Fund...' : '⚡ Confirm Order Now'}
                </button>
              )}
              <button type="button" onClick={() => setSelectedOrd(null)} className="btn-cancel">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

