import { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, money, fmtDate, getCurrencyRate } from '../api.js';
import { STATUS_LABELS, ALL_STATUSES, PAYMENT_LABELS } from '../data.js';
import { ErrorBox } from './ui.jsx';
import Ic from '../components/Icons.jsx';
import { getSocket } from '../socket.js';
import { MOCK_CUSTOMERS, getRandomCustomer } from './mockCustomers.js';
import AddFundsModal from './AddFundsModal.jsx';
import SellerSelectDropdown from './SellerSelectDropdown.jsx';

export default function Orders() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const [sellerFilter, setSellerFilter] = useState('');
  const [q, setQ] = useState('');
  const [orders, setOrders] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState('auto'); // 'auto' | 'table' | 'cards'

  // Add Funds Modal state
  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const [addFundsPreselectId, setAddFundsPreselectId] = useState('');

  const handleOpenAddFunds = (sellerId = '') => {
    setAddFundsPreselectId(sellerId || selectedSellerId || '');
    setAddFundsOpen(true);
  };

  // Place Order Modal on Behalf of Seller
  const [placeOrderOpen, setPlaceOrderOpen] = useState(false);
  const [selectedSellerId, setSelectedSellerId] = useState('');
  const [sellerProds, setSellerProds] = useState([]);
  const [loadingProds, setLoadingProds] = useState(false);
  const activeSellerReqRef = useRef(0);
  const [randomNotice, setRandomNotice] = useState('');
  const [selectedMockId, setSelectedMockId] = useState('');
  const [orderForm, setOrderForm] = useState(() => {
    const initCust = getRandomCustomer();
    return {
      productId: '',
      qty: 1,
      customerName: initCust.name,
      customerPhone: initCust.phone,
      customerEmail: initCust.email,
      street: initCust.street,
      city: initCust.city,
      state: initCust.state,
      paymentMethod: 'cod',
      shippingCost: 0,
      adminNotes: 'Manually placed by Platform Admin',
    };
  });
  const [placingOrder, setPlacingOrder] = useState(false);

  const applyCustomer = (cust) => {
    if (!cust) return;
    setSelectedMockId(String(cust.id));
    setOrderForm((prev) => ({
      ...prev,
      customerName: cust.name,
      customerPhone: cust.phone,
      customerEmail: cust.email,
      street: cust.street,
      city: cust.city,
      state: cust.state,
    }));
    setRandomNotice(`Loaded: #${cust.id} ${cust.name} (${cust.city}, ${cust.state})`);
    setTimeout(() => setRandomNotice(''), 4000);
  };

  const applyRandomCustomer = () => {
    const cust = getRandomCustomer();
    applyCustomer(cust);
  };

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

  const loadOrders = (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    const query = new URLSearchParams();
    if (status) query.set('status', status);
    if (sellerFilter) query.set('sellerId', sellerFilter);
    if (q.trim()) query.set('q', q.trim());

    return api('/orders?' + query.toString())
      .then((res) => {
        setOrders(Array.isArray(res) ? res : res.orders || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        if (!silent) setLoading(false);
      });
  };

  useEffect(() => {
    loadSellers();
  }, []);

  useEffect(() => {
    loadOrders();
  }, [status, sellerFilter]);

  // Real-time synchronization on WebSocket events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Safety net: ensure admin is in 'admins' room so order events are received
    const adminToken = localStorage.getItem('ng_admin_token');
    const rejoin = () => {
      if (adminToken) socket.emit('admin:join', { token: adminToken });
    };
    if (socket.connected) rejoin();
    socket.on('connect', rejoin);

    const handleOrderUpdate = (payload) => {
      const updatedOrder = payload?.order || payload;
      if (!updatedOrder?._id) {
        loadOrders(true);
        return;
      }

      // 1. Immediately update matching order in table without page reload
      setOrders((prev) => {
        const idx = prev.findIndex((o) => o._id === updatedOrder._id);
        if (idx !== -1) {
          // If a status filter is active and the order no longer matches, remove it
          if (status && updatedOrder.status !== status) {
            return prev.filter((o) => o._id !== updatedOrder._id);
          }
          const next = [...prev];
          next[idx] = { ...next[idx], ...updatedOrder };
          return next;
        } else {
          // If order wasn't in the list, but matches current filters, add it
          if (
            (!status || updatedOrder.status === status) &&
            (!sellerFilter || String(updatedOrder.seller?._id || updatedOrder.seller) === String(sellerFilter))
          ) {
            return [updatedOrder, ...prev];
          }
        }
        return prev;
      });

      // 2. If quick view modal is open for this order, update it live
      setInspectOrder((prev) => {
        if (prev && prev._id === updatedOrder._id) {
          return { ...prev, ...updatedOrder };
        }
        return prev;
      });

      // 3. Silently re-sync with server for verified consistency
      loadOrders(true);
    };

    const handleOrderNew = () => {
      loadOrders(true);
    };

    const handleNotify = (n) => {
      if (n?.type === 'order') {
        loadOrders(true);
      }
    };

    socket.on('order:update', handleOrderUpdate);
    socket.on('order:status_update', handleOrderUpdate);
    socket.on('order:new', handleOrderNew);
    socket.on('notify', handleNotify);

    return () => {
      socket.off('connect', rejoin);
      socket.off('order:update', handleOrderUpdate);
      socket.off('order:status_update', handleOrderUpdate);
      socket.off('order:new', handleOrderNew);
      socket.off('notify', handleNotify);
    };
  }, [status, sellerFilter]);

  // When admin selects a seller in Place Order modal, load their catalog
  const handleSellerChangeForOrder = async (sellerId) => {
    setSelectedSellerId(sellerId);
    setSellerProds([]);
    setOrderForm((prev) => ({ ...prev, productId: '' }));
    if (!sellerId) return;

    const reqId = ++activeSellerReqRef.current;
    setLoadingProds(true);
    try {
      const data = await api(`/sellers/${sellerId}?kyc=0`);
      if (activeSellerReqRef.current !== reqId) return; // Discard stale response
      const prods = data.products || [];
      setSellerProds(prods);
      if (prods.length > 0) {
        setOrderForm((prev) => ({ ...prev, productId: prods[0]._id }));
      }
    } catch (err) {
      if (activeSellerReqRef.current === reqId) {
        alert('Error loading seller products: ' + err.message);
      }
    } finally {
      if (activeSellerReqRef.current === reqId) {
        setLoadingProds(false);
      }
    }
  };

  const handleClosePlaceOrder = () => {
    setPlaceOrderOpen(false);
    setSelectedSellerId('');
    setSellerProds([]);
    setOrderForm((prev) => ({ ...prev, productId: '' }));
  };

  const handleOpenPlaceOrder = (preselectSellerId = '') => {
    const sId = preselectSellerId || (sellers[0]?._id || '');
    setPlaceOrderOpen(true);
    applyRandomCustomer();
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
    const selProd = sellerProds.find((p) => p._id === orderForm.productId);
    if (!selProd) {
      alert('Selected product is not found in the current merchant’s catalog. Please re-select the product.');
      return;
    }
    setPlacingOrder(true);
    try {
      const selSeller = sellers.find((s) => s._id === selectedSellerId);

      await api('/sellers/place-order', {
        method: 'POST',
        body: {
          sellerId: selectedSellerId,
          items: [
            {
              productId: selProd._id,
              name: selProd.name || 'Product',
              price: selProd.price || 0,
              qty: Number(orderForm.qty),
              image: selProd.image || selProd.images?.[0]?.url || '',
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
      handleClosePlaceOrder();
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

  const STORE_COLORS = [
    { bg: '#eff6ff', text: '#1d4ed8' },
    { bg: '#faf5ff', text: '#7e22ce' },
    { bg: '#f0fdf4', text: '#15803d' },
    { bg: '#fff7ed', text: '#c2410c' },
    { bg: '#f0fdfa', text: '#0f766e' },
    { bg: '#fef2f2', text: '#b91c1c' },
  ];

  const getStoreColor = (name = '') => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return STORE_COLORS[Math.abs(hash) % STORE_COLORS.length];
  };

  const handleCopyOrder = (e, num) => {
    e.stopPropagation();
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(num);
    }
    setCopiedId(num);
    setTimeout(() => setCopiedId(''), 1800);
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await loadOrders(false);
    } finally {
      setTimeout(() => setRefreshing(false), 500);
    }
  };

  const hasActiveFilters = Boolean(status || sellerFilter || q.trim());
  const handleClearAllFilters = () => {
    setQ('');
    setSellerFilter('');
    setParams({});
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => handleOpenAddFunds()}
            className="btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 14px',
              borderRadius: 8,
              fontWeight: 800,
              fontSize: 13,
              background: '#ffffff',
              border: '1.5px solid #cbd5e1',
              color: '#1e293b',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              transition: 'all 0.15s ease',
            }}
            title="Directly add or credit funds to any seller wallet in INR / USD"
          >
            <Ic name="creditCard" size={16} /> 💳 Add Funds to Seller
          </button>
          <button
            type="button"
            onClick={() => handleOpenPlaceOrder()}
            className="btn-primary"
          >
            <Ic name="plus" size={16} /> + Place Order on Behalf of Seller
          </button>
        </div>
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
          <span className="search-icon">
            <Ic name="search" size={16} />
          </span>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by customer name, phone, order #, email…"
          />
          {q && (
            <button
              type="button"
              className="orders-search-clear-btn"
              onClick={() => {
                setQ('');
              }}
              title="Clear search text"
            >
              ✕
            </button>
          )}
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

        {hasActiveFilters && (
          <button
            type="button"
            className="orders-clear-filters-btn"
            onClick={handleClearAllFilters}
            title="Reset all filters and search queries"
          >
            ✕ Reset Filters
          </button>
        )}
      </form>

      {/* Status Filter Tabs */}
      <div className="filter-tabs" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={!status ? 'on' : ''}
          onClick={() => setParams(sellerFilter ? { sellerId: sellerFilter } : {})}
        >
          All Statuses <span className="tab-count">{orders.length}</span>
        </button>
        {ALL_STATUSES.map((s) => (
          <button
            type="button"
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

      {/* Orders Table Card */}
      <div className="orders-table-card">
        {/* Table Topbar Header */}
        <div className="orders-table-topbar">
          <div className="orders-table-title-group">
            <h3 className="orders-table-title">
              <span>📋 Customer Orders</span>
              <span className="orders-count-badge">{orders.length} in view</span>
            </h3>
            <span className="orders-live-sync-indicator" title="Connected to real-time order synchronization stream">
              <span className="pulse-dot" /> Live Sync
            </span>
          </div>

          <div className="orders-table-actions-group">
            <div className="orders-view-toggle">
              <button
                type="button"
                className={viewMode === 'table' || viewMode === 'auto' ? 'active' : ''}
                onClick={() => setViewMode('table')}
                title="Display standard table layout"
              >
                ▤ Table
              </button>
              <button
                type="button"
                className={viewMode === 'cards' ? 'active' : ''}
                onClick={() => setViewMode('cards')}
                title="Display card grid layout"
              >
                ☷ Cards
              </button>
            </div>

            <button
              type="button"
              className={`orders-refresh-btn ${refreshing ? 'spinning' : ''}`}
              onClick={handleManualRefresh}
              title="Refresh order stream from server"
            >
              <Ic name="refresh" size={13} />
              <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* 1. Desktop & Tablet Table (Auto on >= 769px or forced table) */}
        {(viewMode === 'auto' || viewMode === 'table') && (
          <div className={`orders-table-wrap ${viewMode === 'auto' ? 'auto-desktop' : ''}`}>
            <table className="orders-modern-table">
              <thead>
                <tr>
                  <th style={{ width: '16%' }}>Order # &amp; Date</th>
                  <th style={{ width: '17%' }}>Merchant / Seller</th>
                  <th style={{ width: '20%' }}>Customer &amp; Contact</th>
                  <th style={{ width: '17%' }}>Items &amp; Details</th>
                  <th style={{ width: '11%' }}>Total Value</th>
                  <th style={{ width: '10%' }}>Payment</th>
                  <th style={{ width: '11%' }}>Fulfillment</th>
                  <th style={{ width: '8%', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={`skel-${idx}`} className="orders-table-skeleton-row">
                      <td><div className="skeleton-bar" style={{ width: '75%' }} /></td>
                      <td><div className="skeleton-bar" style={{ width: '85%' }} /></td>
                      <td><div className="skeleton-bar" style={{ width: '80%' }} /></td>
                      <td><div className="skeleton-bar" style={{ width: '65%' }} /></td>
                      <td><div className="skeleton-bar" style={{ width: '50%' }} /></td>
                      <td><div className="skeleton-bar" style={{ width: '60%' }} /></td>
                      <td><div className="skeleton-bar" style={{ width: '70%' }} /></td>
                      <td><div className="skeleton-bar" style={{ width: '90%' }} /></td>
                    </tr>
                  ))
                )}
                {!loading && orders.length === 0 && (
                  <tr>
                    <td colSpan="8" style={{ padding: 0 }}>
                      <div className="orders-empty-state">
                        <div className="orders-empty-icon">📦</div>
                        <h4 className="orders-empty-title">No orders found</h4>
                        <p className="orders-empty-desc">
                          {status || sellerFilter || q
                            ? 'No orders matched your current filters or search query.'
                            : 'There are currently no orders in the system.'}
                        </p>
                        {(status || sellerFilter || q) && (
                          <button
                            type="button"
                            onClick={handleClearAllFilters}
                            className="orders-clear-filters-btn"
                          >
                            ✕ Clear all filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {!loading && orders.map((o) => {
                  const seller = getOrderSeller(o);
                  const itemsCount = o.items?.reduce((sum, it) => sum + (it.qty || 1), 0) || 0;
                  const storePalette = getStoreColor(seller?.storeName || 'Bazario');

                  return (
                    <tr key={o._id}>
                      {/* 1. Order Number & Date */}
                      <td>
                        <div className="order-id-badge-wrap">
                          <span
                            className="order-id-badge"
                            title="Click to copy order number"
                            onClick={(e) => handleCopyOrder(e, o.orderNumber)}
                            style={{ cursor: 'pointer' }}
                          >
                            #{o.orderNumber}
                          </span>
                          <button
                            type="button"
                            className="order-copy-btn"
                            onClick={(e) => handleCopyOrder(e, o.orderNumber)}
                            title="Copy order number"
                          >
                            {copiedId === o.orderNumber ? (
                              <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 800 }}>✓ Copied</span>
                            ) : (
                              <Ic name="paperclip" size={12} />
                            )}
                          </button>
                        </div>
                        <div className="order-date-row">
                          <Ic name="clock" size={11} />
                          <span>{fmtDate(o.createdAt)}</span>
                        </div>
                      </td>

                      {/* 2. Merchant Store */}
                      <td>
                        {seller ? (
                          <div className="order-merchant-cell">
                            <div
                              className="order-merchant-avatar"
                              style={{
                                background: storePalette.bg,
                                color: storePalette.text,
                              }}
                            >
                              {seller.storeName?.[0]?.toUpperCase() || 'M'}
                            </div>
                            <div className="order-merchant-info">
                              <span className="order-merchant-name" title={seller.storeName}>
                                {seller.storeName}
                              </span>
                              {seller.ownerName && (
                                <span className="order-merchant-sub" title={seller.ownerName}>
                                  👤 {seller.ownerName}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="order-platform-tag">
                            <Ic name="badgeCheck" size={12} /> Bazario Direct
                          </div>
                        )}
                      </td>

                      {/* 3. Customer & Contact */}
                      <td>
                        <div className="order-customer-cell">
                          <span className="order-customer-name">
                            {o.shippingAddress?.fullName || o.contact?.fullName || 'Guest Customer'}
                          </span>
                          {(o.contact?.phone || o.shippingAddress?.phone) && (
                            <a
                              href={`tel:${o.contact?.phone || o.shippingAddress?.phone}`}
                              className="order-customer-phone"
                              title="Call customer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Ic name="phone" size={11} />
                              <span>{o.contact?.phone || o.shippingAddress?.phone}</span>
                            </a>
                          )}
                          {o.contact?.email && (
                            <span className="order-customer-email" title={o.contact.email}>
                              ✉️ {o.contact.email}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 4. Items & Details */}
                      <td>
                        <div className="order-items-cell">
                          <div className="order-thumb-wrap">
                            {o.items?.[0]?.image ? (
                              <img
                                src={o.items[0].image}
                                alt=""
                                className="order-thumb-img"
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                            ) : (
                              <div className="order-thumb-fallback">
                                <Ic name="box" size={18} />
                              </div>
                            )}
                          </div>
                          <div className="order-items-meta">
                            <span className="order-items-count-badge">
                              📦 {itemsCount} {itemsCount === 1 ? 'item' : 'items'}
                            </span>
                            {o.items?.[0]?.name && (
                              <span className="order-item-title" title={o.items[0].name}>
                                {o.items[0].name}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 5. Total Value */}
                      <td>
                        <div className="order-amount-cell">
                          <span className="order-total-price">{money(o.total)}</span>
                          {o.shipping?.cost > 0 ? (
                            <span className="order-ship-fee">+{money(o.shipping.cost)} Delivery</span>
                          ) : (
                            <span className="order-ship-free">✓ Free Shipping</span>
                          )}
                        </div>
                      </td>

                      {/* 6. Payment */}
                      <td>
                        <div className="order-pay-stack">
                          <span className="pay-chip">
                            {(PAYMENT_LABELS[o.paymentMethod] || o.paymentMethod || 'COD').toUpperCase()}
                          </span>
                          <span className={`pay-status-badge ${o.paymentStatus === 'paid' ? 'paid' : 'pending'}`}>
                            {o.paymentStatus === 'paid' ? '● Paid' : '○ Unpaid'}
                          </span>
                        </div>
                      </td>

                      {/* 7. Fulfillment Status */}
                      <td>
                        <span className={`status-pill st-${o.status}`}>
                          <span className="st-dot" />
                          <span className="st-text">{STATUS_LABELS[o.status] || o.status}</span>
                        </span>
                      </td>

                      {/* 8. Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <div className="order-actions-cell" style={{ justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => setInspectOrder(o)}
                            className="order-action-btn"
                            title="Quick View Order Details"
                          >
                            <Ic name="eye" size={13} /> View
                          </button>
                          <Link
                            to={`/admin/orders/${o._id}`}
                            className="order-link-btn"
                            title="Open Full Management Page"
                          >
                            Manage ↗
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 2. Mobile Responsive Card View (Auto on <= 768px or forced cards) */}
        {(viewMode === 'auto' || viewMode === 'cards') && (
          <div className={`orders-mobile-card-list ${viewMode === 'auto' ? 'auto-mobile' : ''}`}>
            {loading && (
              <div style={{ textAlign: 'center', padding: '30px 16px', color: '#64748b' }}>
                <p>Loading orders stream...</p>
              </div>
            )}
            {!loading && orders.length === 0 && (
              <div className="orders-empty-state">
                <div className="orders-empty-icon">📦</div>
                <h4 className="orders-empty-title">No orders found</h4>
                <p className="orders-empty-desc">
                  {status || sellerFilter || q
                    ? 'No orders matched your current filters or search query.'
                    : 'There are currently no orders in the system.'}
                </p>
                {(status || sellerFilter || q) && (
                  <button
                    type="button"
                    onClick={handleClearAllFilters}
                    className="orders-clear-filters-btn"
                  >
                    ✕ Clear all filters
                  </button>
                )}
              </div>
            )}
            {!loading && orders.map((o) => {
              const seller = getOrderSeller(o);
              const itemsCount = o.items?.reduce((sum, it) => sum + (it.qty || 1), 0) || 0;

              return (
                <div key={o._id} className="order-mobile-card">
                  <div className="order-m-head">
                    <div className="order-id-badge-wrap">
                      <span className="order-id-badge" onClick={(e) => handleCopyOrder(e, o.orderNumber)}>
                        #{o.orderNumber}
                      </span>
                      <button type="button" className="order-copy-btn" onClick={(e) => handleCopyOrder(e, o.orderNumber)}>
                        {copiedId === o.orderNumber ? '✓' : <Ic name="paperclip" size={11} />}
                      </button>
                    </div>
                    <span className={`status-pill st-${o.status}`}>
                      <span className="st-dot" />
                      <span className="st-text">{STATUS_LABELS[o.status] || o.status}</span>
                    </span>
                  </div>

                  <div className="order-m-body">
                    <div className="order-m-row">
                      <span className="order-m-label">Merchant</span>
                      <span className="order-m-val">
                        {seller ? seller.storeName : 'Bazario Direct'}
                      </span>
                    </div>

                    <div className="order-m-row">
                      <span className="order-m-label">Customer</span>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, fontSize: 13, color: '#0f172a' }}>
                          {o.shippingAddress?.fullName || o.contact?.fullName || 'Customer'}
                        </div>
                        {(o.contact?.phone || o.shippingAddress?.phone) && (
                          <a
                            href={`tel:${o.contact?.phone || o.shippingAddress?.phone}`}
                            style={{ fontSize: 11.5, color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}
                          >
                            📞 {o.contact?.phone || o.shippingAddress?.phone}
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="order-m-row">
                      <span className="order-m-label">Items</span>
                      <span className="order-m-val" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{itemsCount} item(s)</span>
                        {o.items?.[0]?.name && (
                          <span className="muted-sm" style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            ({o.items[0].name})
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="order-m-row">
                      <span className="order-m-label">Total Amount</span>
                      <div style={{ textAlign: 'right' }}>
                        <div className="order-total-price">{money(o.total)}</div>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', marginTop: 2 }}>
                          <span className="pay-chip" style={{ fontSize: 10, padding: '1px 5px' }}>
                            {(PAYMENT_LABELS[o.paymentMethod] || o.paymentMethod || 'COD').toUpperCase()}
                          </span>
                          <span className={`pay-status-badge ${o.paymentStatus === 'paid' ? 'paid' : 'pending'}`} style={{ fontSize: 10 }}>
                            {o.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="order-m-foot">
                    <button type="button" onClick={() => setInspectOrder(o)} className="order-action-btn">
                      <Ic name="eye" size={13} /> Quick View
                    </button>
                    <Link to={`/admin/orders/${o._id}`} className="order-link-btn">
                      Manage Order ↗
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Modal 1: Place Order on Behalf of Seller ─── */}
      {placeOrderOpen && (() => {
        const selProd = sellerProds.find((p) => p._id === orderForm.productId) || sellerProds[0] || null;
        const selSeller = sellers.find((s) => s._id === selectedSellerId);
        const curBal = selSeller?.wallet?.balance || 0;
        const inrRate = getCurrencyRate('INR');
        const curInr = Math.round(curBal * inrRate);
        const curLocked = selSeller?.wallet?.processingFund || 0;
        const prodPrice = selProd?.price || 0;
        const orderQty = Math.max(1, parseInt(orderForm.qty, 10) || 1);
        const shipping = Math.max(0, parseFloat(orderForm.shippingCost) || 0);
        const orderSubtotal = prodPrice * orderQty;
        const orderTotal = orderSubtotal + shipping;
        const orderTotalInr = Math.round(orderTotal * inrRate);

        return (
          <div className="admin-modal-overlay" onClick={handleClosePlaceOrder}>
            <div className="admin-modal-box" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
              <div className="pom-header">
                <div className="pom-header-left">
                  <div className="pom-header-icon">📦</div>
                  <div>
                    <h3 className="pom-title">Place Order on Behalf of Seller</h3>
                    <p className="pom-subtitle">
                      Create and dispatch a customer order on behalf of any merchant store.
                    </p>
                  </div>
                </div>
                <button type="button" onClick={handleClosePlaceOrder} className="btn-close-modal">✕</button>
              </div>

              <form onSubmit={handlePlaceOrderSubmit} className="pom-body">
                {/* 1. SELLER SELECTION & WALLET STATUS */}
                <div className="pom-section">
                  <div className="pom-label">
                    <span>1. Target Merchant Store *</span>
                    <span className="pom-label-sub">{sellers.length} Stores Available &bull; Searchable</span>
                  </div>

                  <SellerSelectDropdown
                    sellers={sellers}
                    value={selectedSellerId}
                    onChange={(id) => handleSellerChangeForOrder(id)}
                    inrRate={inrRate}
                    placeholder="-- Choose target merchant store --"
                  />

                  {/* Selected Seller Live Wallet Balance Banner */}
                  {selSeller && (
                    <div className="order-seller-wallet-banner">
                      <div className="oswb-left">
                        <div className="oswb-icon-circle">💼</div>
                        <div>
                          <span className="oswb-lbl">Merchant Available Wallet Balance:</span>
                          <div className="oswb-bal">
                            <span className="oswb-usd">{money(curBal)}</span>
                            <span className="oswb-inr">(≈ ₹{curInr.toLocaleString('en-IN')} INR)</span>
                            {curLocked > 0 && (
                              <span className="oswb-locked">Locked: {money(curLocked)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-add-seller-funds"
                        onClick={() => handleOpenAddFunds(selSeller._id)}
                        title="Add funds directly to this merchant wallet in INR / USD with Binance USDT rate"
                      >
                        <Ic name="plus" size={13} /> 💳 Add Funds to Wallet
                      </button>
                    </div>
                  )}

                  {selSeller && curBal <= 0 && (
                    <div style={{ marginTop: 4, padding: '6px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, fontSize: 11.5, color: '#92400e', fontWeight: 600 }}>
                      ⚠️ Seller currently has $0 available balance. Once confirmed, processing will require funds in their wallet.
                    </div>
                  )}
                </div>

                {/* 2. PRODUCT CATALOG SELECTION & QUANTITY */}
                <div className="pom-section">
                  <div className="pom-label">
                    <span>2. Select Product from Catalog *</span>
                    <span className="pom-label-sub">
                      {loadingProds ? 'Loading catalog...' : `${sellerProds.length} Products Available`}
                    </span>
                  </div>

                  {loadingProds ? (
                    <div style={{ padding: '12px', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 8, textAlign: 'center', fontSize: 12.5, color: '#64748b' }}>
                      ⏳ Loading merchant product catalog...
                    </div>
                  ) : sellerProds.length === 0 ? (
                    <div style={{ padding: '12px 14px', background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 8, fontSize: 12.5, color: '#92400e' }}>
                      ⚠️ This seller has no active listed products. Please onboard products first or select another seller store.
                    </div>
                  ) : (
                    <>
                      <select
                        className="pom-select"
                        value={orderForm.productId}
                        onChange={(e) => setOrderForm({ ...orderForm, productId: e.target.value })}
                        required
                      >
                        {sellerProds.map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.name} — {money(p.price)} (Stock: {p.stock || 0})
                          </option>
                        ))}
                      </select>

                      {/* Selected Product Preview Card */}
                      {selProd && (
                        <div className="pom-product-preview-card">
                          <div className="pom-ppc-left">
                            <div className="pom-ppc-thumb">
                              {selProd.image || selProd.images?.[0]?.url ? (
                                <img src={selProd.image || selProd.images?.[0]?.url} alt={selProd.name} />
                              ) : (
                                <span style={{ fontSize: 18 }}>🛍️</span>
                              )}
                            </div>
                            <div className="pom-ppc-info">
                              <span className="pom-ppc-name" title={selProd.name}>
                                {selProd.name}
                              </span>
                              <div className="pom-ppc-tags">
                                <span className="pom-ppc-price">{money(selProd.price)}</span>
                                <span className="muted-sm">&bull;</span>
                                <span className="muted-sm">≈ ₹{Math.round((selProd.price || 0) * inrRate).toLocaleString('en-IN')} INR</span>
                                <span className={`pom-ppc-stock ${(selProd.stock || 0) > 0 ? 'in-stock' : 'out-of-stock'}`}>
                                  {(selProd.stock || 0) > 0 ? `Stock: ${selProd.stock}` : 'Out of Stock'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="pom-ppc-total-box">
                            <span className="pom-ppc-total-lbl">Subtotal ({orderQty}x)</span>
                            <b className="pom-ppc-total-val">{money(orderSubtotal)}</b>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* QUANTITY & PAYMENT METHOD */}
                <div className="pom-grid-2">
                  <div className="pom-field">
                    <label className="pom-field-label">Quantity *</label>
                    <input
                      type="number"
                      min="1"
                      className="pom-input"
                      value={orderForm.qty}
                      onChange={(e) => setOrderForm({ ...orderForm, qty: e.target.value })}
                      required
                    />
                  </div>
                  <div className="pom-field">
                    <label className="pom-field-label">Payment Method</label>
                    <select
                      className="pom-select"
                      value={orderForm.paymentMethod}
                      onChange={(e) => setOrderForm({ ...orderForm, paymentMethod: e.target.value })}
                    >
                      <option value="cod">Cash on Delivery (COD)</option>
                      <option value="credit_card">Paid via Card</option>
                      <option value="easypaisa">EasyPaisa / JazzCash</option>
                      <option value="upi">UPI / Online Transfer</option>
                    </select>
                  </div>
                </div>

                {/* 3. CUSTOMER DELIVERY INFORMATION */}
                <div className="pom-customer-card">
                  <div className="pom-customer-header">
                    <div className="pom-customer-title-wrap">
                      <span className="pom-customer-title">3. Customer Delivery Information</span>
                      <span className="pom-customer-badge">500 Profiles</span>
                    </div>
                    <button
                      type="button"
                      onClick={applyRandomCustomer}
                      className="pom-btn-random"
                      title="Pick another random customer from 500 profiles"
                    >
                      🎲 Random Customer
                    </button>
                  </div>

                  {/* Profile Dropdown */}
                  <div className="pom-field">
                    <label className="pom-field-label">
                      <span>Or Select Specific Profile:</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#2563eb' }}>
                        {MOCK_CUSTOMERS.length} Preloaded
                      </span>
                    </label>
                    <select
                      className="pom-select"
                      value={selectedMockId}
                      onChange={(e) => {
                        const id = Number(e.target.value);
                        const found = MOCK_CUSTOMERS.find((c) => c.id === id);
                        if (found) applyCustomer(found);
                      }}
                    >
                      <option value="" disabled>-- Choose from 500 preloaded customers --</option>
                      {MOCK_CUSTOMERS.map((c) => (
                        <option key={c.id} value={c.id}>
                          #{c.id}: {c.name} — {c.city}, {c.state} ({c.phone})
                        </option>
                      ))}
                    </select>
                  </div>

                  {randomNotice && (
                    <div className="pom-notice-banner">
                      <span>✨</span>
                      <span>{randomNotice}</span>
                    </div>
                  )}

                  <div className="pom-grid-2">
                    <div className="pom-field">
                      <label className="pom-field-label">Full Name *</label>
                      <input
                        type="text"
                        className="pom-input"
                        value={orderForm.customerName}
                        onChange={(e) => setOrderForm({ ...orderForm, customerName: e.target.value })}
                        required
                      />
                    </div>
                    <div className="pom-field">
                      <label className="pom-field-label">Phone Number *</label>
                      <input
                        type="text"
                        className="pom-input"
                        value={orderForm.customerPhone}
                        onChange={(e) => setOrderForm({ ...orderForm, customerPhone: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="pom-field">
                    <label className="pom-field-label">Customer Email</label>
                    <input
                      type="email"
                      className="pom-input"
                      placeholder="customer@example.com"
                      value={orderForm.customerEmail}
                      onChange={(e) => setOrderForm({ ...orderForm, customerEmail: e.target.value })}
                    />
                  </div>

                  <div className="pom-field">
                    <label className="pom-field-label">Street Address *</label>
                    <input
                      type="text"
                      className="pom-input"
                      value={orderForm.street}
                      onChange={(e) => setOrderForm({ ...orderForm, street: e.target.value })}
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 1.2fr', gap: 10 }}>
                    <div className="pom-field">
                      <label className="pom-field-label">City *</label>
                      <input
                        type="text"
                        className="pom-input"
                        value={orderForm.city}
                        onChange={(e) => setOrderForm({ ...orderForm, city: e.target.value })}
                        required
                      />
                    </div>
                    <div className="pom-field">
                      <label className="pom-field-label">State</label>
                      <input
                        type="text"
                        className="pom-input"
                        style={{ textAlign: 'center' }}
                        value={orderForm.state}
                        onChange={(e) => setOrderForm({ ...orderForm, state: e.target.value })}
                      />
                    </div>
                    <div className="pom-field">
                      <label className="pom-field-label" style={{ whiteSpace: 'nowrap' }}>Delivery ($)</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        className="pom-input"
                        value={orderForm.shippingCost}
                        onChange={(e) => setOrderForm({ ...orderForm, shippingCost: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* 4. ORDER SUMMARY BANNER */}
                <div className="pom-summary-card">
                  <div className="pom-summary-item">
                    <small>Items Subtotal</small>
                    <b>{money(orderSubtotal)}</b>
                  </div>
                  <div className="pom-summary-item">
                    <small>Delivery Fee</small>
                    <b>{money(shipping)}</b>
                  </div>
                  <div className="pom-summary-total">
                    <span className="pom-summary-total-lbl">Estimated Order Total</span>
                    <b className="pom-summary-total-val">{money(orderTotal)}</b>
                    <span className="pom-summary-total-inr">≈ ₹{orderTotalInr.toLocaleString('en-IN')} INR</span>
                  </div>
                </div>

                {/* ADMIN NOTES */}
                <div className="pom-field">
                  <label className="pom-field-label">Admin Notes (Internal instruction or reference)</label>
                  <input
                    type="text"
                    className="pom-input"
                    value={orderForm.adminNotes}
                    onChange={(e) => setOrderForm({ ...orderForm, adminNotes: e.target.value })}
                  />
                </div>

                {/* FOOTER ACTIONS */}
                <div className="pom-footer-actions">
                  <button type="button" onClick={handleClosePlaceOrder} className="pom-btn-cancel">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="pom-btn-submit"
                    disabled={placingOrder || sellerProds.length === 0 || !selProd}
                  >
                    {placingOrder ? 'Dispatching Order...' : `📦 Confirm & Place Order (${money(orderTotal)})`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

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
                  {['confirmed', 'processing', 'packed', 'out_from_warehouse', 'delivery_warehouse', 'out_for_delivery', 'delivered', 'cancelled'].map((st) => (
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
                      {STATUS_LABELS[st] || st.charAt(0).toUpperCase() + st.slice(1)}
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

      {/* ─── Modal 3: Add Funds to Seller Wallet (INR & USD with Binance USDT Rate) ─── */}
      <AddFundsModal
        isOpen={addFundsOpen}
        onClose={() => setAddFundsOpen(false)}
        sellers={sellers}
        preselectedSellerId={addFundsPreselectId || selectedSellerId}
        onSuccess={(res) => {
          loadSellers();
          if (res?.wallet && (addFundsPreselectId || selectedSellerId)) {
            const targetId = addFundsPreselectId || selectedSellerId;
            setSellers((prev) =>
              prev.map((s) => (s._id === targetId ? { ...s, wallet: res.wallet } : s))
            );
          }
        }}
      />
    </div>
  );
}
