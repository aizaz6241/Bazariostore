import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, money, fmtDate } from '../api.js';
import { STATUS_LABELS, ALL_STATUSES, PAYMENT_LABELS } from '../data.js';
import { ErrorBox } from './ui.jsx';
import Ic from '../components/Icons.jsx';

export default function Orders() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const [sellerFilter, setSellerFilter] = useState('');
  const [q, setQ] = useState('');
  const [orders, setOrders] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Place Order Modal on Behalf of Seller
  const [placeOrderOpen, setPlaceOrderOpen] = useState(false);
  const [selectedSellerId, setSelectedSellerId] = useState('');
  const [sellerProds, setSellerProds] = useState([]);
  const [loadingProds, setLoadingProds] = useState(false);
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
    adminNotes: 'Manually placed by Platform Admin',
  });
  const [placingOrder, setPlacingOrder] = useState(false);

  // Quick Order View Modal
  const [inspectOrder, setInspectOrder] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const loadSellers = () => {
    api('/sellers')
      .then((data) => {
        const list = Array.isArray(data) ? data : data.sellers || [];
        setSellers(list.filter((s) => s.status !== 'pending_approval'));
      })
      .catch(() => {});
  };

  const loadOrders = () => {
    setLoading(true);
    setError('');
    const query = new URLSearchParams();
    if (status) query.set('status', status);
    if (sellerFilter) query.set('sellerId', sellerFilter);
    if (q.trim()) query.set('q', q.trim());

    api('/orders?' + query.toString())
      .then((res) => {
        setOrders(Array.isArray(res) ? res : res.orders || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSellers();
  }, []);

  useEffect(() => {
    loadOrders();
  }, [status, sellerFilter]);

  // When admin selects a seller in Place Order modal, load their catalog
  const handleSellerChangeForOrder = async (sellerId) => {
    setSelectedSellerId(sellerId);
    setSellerProds([]);
    setOrderForm((prev) => ({ ...prev, productId: '' }));
    if (!sellerId) return;

    setLoadingProds(true);
    try {
      const data = await api(`/sellers/${sellerId}`);
      const prods = data.products || [];
      setSellerProds(prods);
      if (prods.length > 0) {
        setOrderForm((prev) => ({ ...prev, productId: prods[0]._id }));
      }
    } catch (err) {
      alert('Error loading seller products: ' + err.message);
    } finally {
      setLoadingProds(false);
    }
  };

  const handleOpenPlaceOrder = (preselectSellerId = '') => {
    const sId = preselectSellerId || (sellers[0]?._id || '');
    setPlaceOrderOpen(true);
    if (sId) {
      handleSellerChangeForOrder(sId);
    }
  };

  const handlePlaceOrderSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSellerId) {
      alert('Please select a merchant store.');
      return;
    }
    if (!orderForm.productId) {
      alert('Please select a product from the merchant’s catalog.');
      return;
    }
    setPlacingOrder(true);
    try {
      const selProd = sellerProds.find((p) => p._id === orderForm.productId);
      const selSeller = sellers.find((s) => s._id === selectedSellerId);

      await api('/sellers/place-order', {
        method: 'POST',
        body: {
          sellerId: selectedSellerId,
          items: [
            {
              productId: selProd?._id,
              name: selProd?.name || 'Product',
              price: selProd?.price || 0,
              qty: Number(orderForm.qty),
              image: selProd?.image || selProd?.images?.[0]?.url || '',
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
            country: 'United States',
          },
          paymentMethod: orderForm.paymentMethod,
          shippingCost: Number(orderForm.shippingCost),
          adminNotes: orderForm.adminNotes,
        },
      });

      alert(`✅ Order placed successfully on behalf of ${selSeller?.storeName || 'Seller'}!`);
      setPlaceOrderOpen(false);
      loadOrders();
    } catch (err) {
      alert('Error placing order: ' + err.message);
    } finally {
      setPlacingOrder(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    setUpdatingStatus(true);
    try {
      await api(`/orders/${orderId}/status`, {
        method: 'POST',
        body: { status: newStatus, note: `Status updated to ${newStatus} by Platform Admin` },
      });
      alert(`Order status updated to ${newStatus.toUpperCase()}! ✅`);
      loadOrders();
      if (inspectOrder && inspectOrder._id === orderId) {
        setInspectOrder((prev) => ({ ...prev, status: newStatus }));
      }
    } catch (err) {
      alert('Error updating status: ' + err.message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Helper to extract seller info from order
  const getOrderSeller = (order) => {
    if (order.seller && typeof order.seller === 'object' && order.seller.storeName) {
      return order.seller;
    }
    const itemSeller = order.items?.find((i) => i.sellerName || i.seller);
    if (itemSeller) {
      return {
        _id: itemSeller.seller,
        storeName: itemSeller.sellerName || 'Merchant Store',
        ownerName: itemSeller.ownerName || '',
      };
    }
    return null;
  };

  const totalRevenue = orders.filter((o) => o.status !== 'cancelled').reduce((acc, o) => acc + (o.total || 0), 0);
  const pendingCount = orders.filter((o) => o.status === 'pending').length;
  const deliveredCount = orders.filter((o) => o.status === 'delivered').length;

  return (
    <div className="admin-orders-page">
      <div className="admin-header-row">
        <div>
          <h2>📦 Platform Multi-Vendor Orders</h2>
          <p className="muted">
            Monitor real-time customer orders across all seller catalogs, inspect line items, update fulfillment statuses, and manually place orders.
          </p>
        </div>
        <button
          type="button"
          onClick={() => handleOpenPlaceOrder()}
          className="btn-primary"
        >
          <Ic name="plus" size={16} /> + Place Order on Behalf of Seller
        </button>
      </div>

      {/* KPI Stats Bar */}
      <div className="admin-sellers-stats-bar" style={{ marginBottom: 18 }}>
        <div className="stat-box" style={{ borderLeft: '4px solid #2563eb' }}>
          <span className="lbl">Total Orders in View</span>
          <b className="val" style={{ color: '#2563eb' }}>{orders.length}</b>
        </div>
        <div className="stat-box" style={{ borderLeft: '4px solid #d97706' }}>
          <span className="lbl">Awaiting Confirmation</span>
          <b className="val" style={{ color: '#d97706' }}>{pendingCount}</b>
        </div>
        <div className="stat-box" style={{ borderLeft: '4px solid #16a34a' }}>
          <span className="lbl">Delivered &amp; Settled</span>
          <b className="val" style={{ color: '#16a34a' }}>{deliveredCount}</b>
        </div>
        <div className="stat-box" style={{ borderLeft: '4px solid #0f172a' }}>
          <span className="lbl">Gross Order GMV</span>
          <b className="val">{money(totalRevenue)}</b>
        </div>
      </div>

      {/* Search & Seller Filter Toolbar */}
      <form
        className="orders-toolbar-card"
        style={{ marginBottom: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          loadOrders();
        }}
      >
        <div className="orders-search-input-wrap">
          <Ic name="search" size={16} />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by customer name, phone, order #, email…"
          />
        </div>

        <div className="orders-seller-select-wrap">
          <select
            value={sellerFilter}
            onChange={(e) => setSellerFilter(e.target.value)}
          >
            <option value="">🏢 All Merchant Stores ({sellers.length})</option>
            {sellers.map((s) => (
              <option key={s._id} value={s._id}>
                🏬 {s.storeName} ({s.ownerName})
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="orders-filter-btn">
          <Ic name="search" size={15} /> Filter Orders
        </button>
      </form>

      {/* Status Filter Tabs */}
      <div className="filter-tabs" style={{ marginBottom: 16 }}>
        <button className={!status ? 'on' : ''} onClick={() => setParams(sellerFilter ? { sellerId: sellerFilter } : {})}>
          All Statuses ({orders.length})
        </button>
        {ALL_STATUSES.map((s) => (
          <button
            key={s}
            className={status === s ? 'on' : ''}
            onClick={() => {
              const p = {};
              if (s) p.status = s;
              if (sellerFilter) p.sellerId = sellerFilter;
              setParams(p);
            }}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <ErrorBox error={error} />

      {/* Orders Table */}
      <div className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Order # &amp; Date</th>
                <th>Merchant / Seller</th>
                <th>Customer Name &amp; Contact</th>
                <th>Delivery Location</th>
                <th>Items &amp; Details</th>
                <th>Total Value</th>
                <th>Payment</th>
                <th>Fulfillment Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="9" className="text-center py-8 muted">Loading orders stream...</td>
                </tr>
              )}
              {!loading && orders.length === 0 && (
                <tr>
                  <td colSpan="9" className="text-center py-8 muted">
                    No orders found {status ? `with status "${STATUS_LABELS[status]}"` : ''}.
                  </td>
                </tr>
              )}
              {orders.map((o) => {
                const seller = getOrderSeller(o);
                const itemsCount = o.items?.reduce((sum, it) => sum + (it.qty || 1), 0) || 0;

                return (
                  <tr key={o._id}>
                    <td>
                      <b style={{ color: '#0f172a' }}>{o.orderNumber}</b>
                      <small className="muted block">{fmtDate(o.createdAt)}</small>
                    </td>
                    <td>
                      {seller ? (
                        <div className="seller-name-cell">
                          <div className="avatar-chip" style={{ width: 28, height: 28, fontSize: 12, borderRadius: 8 }}>
                            {seller.storeName?.[0] || 'M'}
                          </div>
                          <div>
                            <b style={{ color: '#0f172a', fontSize: 13 }}>{seller.storeName}</b>
                            {seller.ownerName && <small className="muted block">{seller.ownerName}</small>}
                          </div>
                        </div>
                      ) : (
                        <span className="muted-sm">Bazario Direct</span>
                      )}
                    </td>
                    <td>
                      <b>{o.shippingAddress?.fullName || o.contact?.fullName || 'Customer'}</b>
                      <small className="muted block">📞 {o.contact?.phone || o.shippingAddress?.phone || 'N/A'}</small>
                      {o.contact?.email && <small className="muted block">✉️ {o.contact.email}</small>}
                    </td>
                    <td>
                      <span>{o.shippingAddress?.city || 'N/A'}</span>
                      {o.shippingAddress?.state && <small className="muted block">{o.shippingAddress.state}</small>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 800, fontSize: 13 }}>{itemsCount}</span>
                        <small className="muted">item(s)</small>
                      </div>
                      {o.items?.[0]?.name && (
                        <small className="muted block" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {o.items[0].name}
                        </small>
                      )}
                    </td>
                    <td>
                      <b style={{ color: '#0f172a', fontSize: 14 }}>{money(o.total)}</b>
                      {o.shipping?.cost > 0 && <small className="muted block">+{money(o.shipping.cost)} Ship</small>}
                    </td>
                    <td>
                      <span className="pay-chip">
                        {(PAYMENT_LABELS[o.paymentMethod] || o.paymentMethod || 'COD').toUpperCase()}
                      </span>
                      <small className="muted block" style={{ fontSize: 10.5, fontWeight: 700, color: o.paymentStatus === 'paid' ? '#16a34a' : '#d97706' }}>
                        {o.paymentStatus === 'paid' ? '● Paid' : '○ Pending'}
                      </small>
                    </td>
                    <td>
                      <span className={`status-pill st-${o.status}`}>
                        {STATUS_LABELS[o.status] || o.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => setInspectOrder(o)}
                          className="order-action-btn"
                          title="Quick View Order Details"
                        >
                          <Ic name="eye" size={13} /> Details
                        </button>
                        <Link
                          to={`/admin/orders/${o._id}`}
                          className="order-link-btn"
                          title="Open Full Management Page"
                        >
                          Full Page ↗
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Modal 1: Place Order on Behalf of Seller ─── */}
      {placeOrderOpen && (
        <div className="admin-modal-overlay" onClick={() => setPlaceOrderOpen(false)}>
          <div className="admin-modal-box" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>📦</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Place Manual Order for Merchant</h3>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                    Select a seller store, choose product, and enter customer delivery details.
                  </p>
                </div>
              </div>
              <button onClick={() => setPlaceOrderOpen(false)} className="btn-close-modal">✕</button>
            </div>

            <form onSubmit={handlePlaceOrderSubmit} className="admin-modal-form" style={{ padding: '18px 22px' }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                  1. Select Target Merchant Store *:
                </label>
                <select
                  value={selectedSellerId}
                  onChange={(e) => handleSellerChangeForOrder(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13.5, fontWeight: 700 }}
                  required
                >
                  <option value="">-- Choose a seller --</option>
                  {sellers.map((s) => (
                    <option key={s._id} value={s._id}>
                      🏬 {s.storeName} ({s.ownerName} - {s.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Product Selection */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                  2. Select Product from Catalog *:
                </label>
                {loadingProds ? (
                  <p className="muted-sm">Loading seller catalog...</p>
                ) : sellerProds.length === 0 ? (
                  <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 12.5, color: '#92400e' }}>
                    ⚠️ This seller has no active listed products. Please onboard products first or select another seller.
                  </div>
                ) : (
                  <select
                    value={orderForm.productId}
                    onChange={(e) => setOrderForm({ ...orderForm, productId: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                    required
                  >
                    {sellerProds.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name} — {money(p.price)} (Available Stock: {p.stock})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                    Quantity *:
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={orderForm.qty}
                    onChange={(e) => setOrderForm({ ...orderForm, qty: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                    Payment Method:
                  </label>
                  <select
                    value={orderForm.paymentMethod}
                    onChange={(e) => setOrderForm({ ...orderForm, paymentMethod: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                  >
                    <option value="cod">Cash on Delivery (COD)</option>
                    <option value="credit_card">Paid via Card</option>
                    <option value="easypaisa">EasyPaisa / JazzCash</option>
                    <option value="upi">UPI / Online</option>
                  </select>
                </div>
              </div>

              {/* Customer Details */}
              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 14 }}>
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: 8 }}>
                  3. Customer Delivery Information
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 3 }}>Full Name *</label>
                    <input
                      type="text"
                      value={orderForm.customerName}
                      onChange={(e) => setOrderForm({ ...orderForm, customerName: e.target.value })}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5 }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 3 }}>Phone Number *</label>
                    <input
                      type="text"
                      value={orderForm.customerPhone}
                      onChange={(e) => setOrderForm({ ...orderForm, customerPhone: e.target.value })}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5 }}
                      required
                    />
                  </div>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 3 }}>Street Address *</label>
                  <input
                    type="text"
                    value={orderForm.street}
                    onChange={(e) => setOrderForm({ ...orderForm, street: e.target.value })}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5 }}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 3 }}>City *</label>
                    <input
                      type="text"
                      value={orderForm.city}
                      onChange={(e) => setOrderForm({ ...orderForm, city: e.target.value })}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5 }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 3 }}>State</label>
                    <input
                      type="text"
                      value={orderForm.state}
                      onChange={(e) => setOrderForm({ ...orderForm, state: e.target.value })}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 3 }}>Delivery Fee ($)</label>
                    <input
                      type="number"
                      value={orderForm.shippingCost}
                      onChange={(e) => setOrderForm({ ...orderForm, shippingCost: e.target.value })}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5 }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4, color: '#1e293b' }}>
                  Admin Notes:
                </label>
                <input
                  type="text"
                  value={orderForm.adminNotes}
                  onChange={(e) => setOrderForm({ ...orderForm, adminNotes: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </div>

              <div className="modal-bottom-actions">
                <button type="button" onClick={() => setPlaceOrderOpen(false)} className="btn-cancel">Cancel</button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={placingOrder || sellerProds.length === 0}
                >
                  {placingOrder ? 'Dispatching Order...' : '📦 Confirm & Place Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal 2: Quick Inspect Order Details ─── */}
      {inspectOrder && (
        <div className="admin-modal-overlay" onClick={() => setInspectOrder(null)}>
          <div className="admin-modal-box" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <div>
                <h3 style={{ margin: 0, fontSize: 16 }}>Order Details: <b>{inspectOrder.orderNumber}</b></h3>
                <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>Placed on {fmtDate(inspectOrder.createdAt)}</p>
              </div>
              <button onClick={() => setInspectOrder(null)} className="btn-close-modal">✕</button>
            </div>

            <div style={{ padding: '18px 22px' }}>
              {/* Order Status Controller */}
              <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Current Status:</span>
                  <div style={{ marginTop: 2 }}>
                    <span className={`status-pill st-${inspectOrder.status}`}>
                      {STATUS_LABELS[inspectOrder.status] || inspectOrder.status}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['confirmed', 'processing', 'shipped', 'delivered', 'cancelled'].map((st) => (
                    <button
                      key={st}
                      type="button"
                      disabled={updatingStatus || inspectOrder.status === st}
                      onClick={() => handleUpdateOrderStatus(inspectOrder._id, st)}
                      style={{
                        padding: '5px 9px',
                        fontSize: 11.5,
                        fontWeight: 700,
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        cursor: inspectOrder.status === st ? 'default' : 'pointer',
                        background: inspectOrder.status === st ? '#0f172a' : '#fff',
                        color: inspectOrder.status === st ? '#fff' : '#334155',
                      }}
                    >
                      {st.charAt(0).toUpperCase() + st.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Items breakdown */}
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 13, fontWeight: 800, margin: '0 0 8px', color: '#1e293b' }}>
                  Ordered Items ({inspectOrder.items?.length || 0})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {inspectOrder.items?.map((it, idx) => (
                    <div
                      key={it._id || idx}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#fdfdfe', border: '1px solid #e2e8f0', borderRadius: 6 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <img
                          src={it.image || '/img/products/serum.svg'}
                          alt=""
                          style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, background: '#f1f5f9' }}
                        />
                        <div>
                          <b style={{ fontSize: 13 }}>{it.name}</b>
                          <small className="muted block">
                            Seller: <b>{it.sellerName || inspectOrder.seller?.storeName || 'Merchant'}</b> &bull; Qty: {it.qty}
                          </small>
                        </div>
                      </div>
                      <b style={{ fontSize: 13.5, color: '#0f172a' }}>
                        {money((it.price || 0) * (it.qty || 1))}
                      </b>
                    </div>
                  ))}
                </div>
              </div>

              {/* Customer & Delivery Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16, background: '#f8fafc', padding: '12px 14px', borderRadius: 8 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Customer</span>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginTop: 2 }}>
                    {inspectOrder.shippingAddress?.fullName || 'Customer'}
                  </div>
                  <small className="muted block">📞 {inspectOrder.contact?.phone || inspectOrder.shippingAddress?.phone}</small>
                  <small className="muted block">✉️ {inspectOrder.contact?.email}</small>
                </div>

                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Delivery Destination</span>
                  <div style={{ fontSize: 12.5, color: '#1e293b', marginTop: 2 }}>
                    {inspectOrder.shippingAddress?.street}, {inspectOrder.shippingAddress?.city}, {inspectOrder.shippingAddress?.state}
                  </div>
                  <small className="muted block">Payment: {(PAYMENT_LABELS[inspectOrder.paymentMethod] || inspectOrder.paymentMethod || 'COD').toUpperCase()}</small>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#64748b' }}>Total Payable Amount:</span>
                <b style={{ fontSize: 20, color: '#0f172a' }}>{money(inspectOrder.total)}</b>
              </div>

              <div className="modal-bottom-actions" style={{ marginTop: 18 }}>
                <Link to={`/admin/orders/${inspectOrder._id}`} className="btn-primary" style={{ textDecoration: 'none' }}>
                  Open Full Order Management Page ↗
                </Link>
                <button type="button" onClick={() => setInspectOrder(null)} className="btn-cancel">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
