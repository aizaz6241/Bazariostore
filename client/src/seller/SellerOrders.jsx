import { useEffect, useState } from 'react';
import { sapi, money, fmtDate } from '../api.js';
import Ic from '../components/Icons.jsx';

const STATUS_TABS = ['all', 'pending', 'processing', 'packed', 'shipped', 'delivered', 'cancelled'];

export default function SellerOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [selectedOrd, setSelectedOrd] = useState(null);
  const [trackingNum, setTrackingNum] = useState('');
  const [newStatus, setNewStatus] = useState('shipped');
  const [updating, setUpdating] = useState(false);

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

  const openFulfill = (ord) => {
    setSelectedOrd(ord);
    const item = ord.sellerItems?.[0];
    setTrackingNum(item?.trackingNumber || `TRK-${Math.floor(10000 + Math.random() * 90000)}-IN`);
    setNewStatus(item?.itemStatus === 'pending' ? 'processing' : item?.itemStatus === 'processing' ? 'shipped' : 'delivered');
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
          <h2>📦 Order Fulfillment & Dispatch</h2>
          <p>Review customer orders for your store, print packing slips, and update courier tracking.</p>
        </div>
      </div>

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
                <th>Customer Details & Shipping Address</th>
                <th>Your Payout Total</th>
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
                      <b className="text-lg">{money(ord.sellerTotal)}</b>
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
                      {tracking && <small className="tracking-text block">TRK: {tracking}</small>}
                    </td>
                    <td>
                      <button onClick={() => openFulfill(ord)} className="btn-sm-action">
                        Update Status →
                      </button>
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

              <label>
                <span>Fulfillment Status *</span>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  required
                >
                  <option value="confirmed">Confirmed</option>
                  <option value="processing">Processing & Packing</option>
                  <option value="packed">Packed (Ready for Courier Pickup)</option>
                  <option value="shipped">Shipped / In Transit</option>
                  <option value="delivered">Delivered to Customer</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>

              <label>
                <span>Courier Tracking Number</span>
                <input
                  type="text"
                  value={trackingNum}
                  onChange={(e) => setTrackingNum(e.target.value)}
                  placeholder="e.g. TCS-98214-PK, LEOPARDS-88123"
                />
              </label>

              <div className="modal-actions">
                <button type="button" onClick={() => setSelectedOrd(null)} className="btn-cancel">Cancel</button>
                <button type="submit" className="seller-btn-pri" disabled={updating}>
                  {updating ? 'Saving...' : 'Update Fulfillment Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
