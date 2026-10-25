import { useEffect, useMemo, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import StoreLink from './hub/StoreLink.jsx';
import { api, money, fmtDate, getCurrencyRate } from '../api.js';
import { STATUS_LABELS, ALL_STATUSES, PAYMENT_LABELS, STATUS_WARNINGS } from '../data.js';
import { ErrorBox } from './ui.jsx';
import Ic from '../components/Icons.jsx';
import { getSocket } from '../socket.js';
import { MOCK_CUSTOMERS, getRandomCustomer } from './mockCustomers.js';
import AddFundsModal from './AddFundsModal.jsx';
import SellerSelectDropdown from './SellerSelectDropdown.jsx';
import OrdersAnalytics from './OrdersAnalytics.jsx';
import OrdersStoreBoard from './OrdersStoreBoard.jsx';
import OrdersStorePicker from './OrdersStorePicker.jsx';
import { StatusMenu, ConfirmBox, BulkBar, changeText, needsConfirm, runStatusChanges, choicesFor } from './OrdersStatusTools.jsx';
import { Hero, MetaChip, Seg, Badge, Avatar, Empty } from './insights.jsx';

// status → badge tone (state colours, always shown with the status name)
const STATUS_TONE = {
  pending: 'warning',
  confirmed: 'info',
  processing: 'info',
  packed: 'info',
  out_from_warehouse: 'violet',
  delivery_warehouse: 'violet',
  shipped: 'violet',
  out_for_delivery: 'violet',
  delivery_failed: 'warning',
  returned_to_warehouse: 'warning',
  delivered: 'good',
  cancelled: 'critical',
  refunded: 'neutral',
};
// status groups (from the "Orders by store" table) → the statuses they cover
const STATUS_GROUPS = {
  warehouse: ['processing', 'packed', 'out_from_warehouse', 'delivery_warehouse', 'shipped'],
  problem: ['delivery_failed', 'returned_to_warehouse'],
};
const GROUP_LABELS = { warehouse: 'In warehouse', problem: 'Delivery problem' };
const statusMatches = (f, st) => !f || (STATUS_GROUPS[f] ? STATUS_GROUPS[f].includes(st) : f === st);
const CLOSED = ['delivered', 'cancelled', 'refunded'];
const LATE_MS = 7 * 86400000;
const SCROLL_KEY = 'admin.orders.back';
// the element the admin page scrolls in (the layout scrolls inside, not the window)
const scroller = () => {
  let el = document.querySelector('.admin-orders-page');
  while (el && el !== document.body) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  return document.scrollingElement;
};
const shortTime = (d) =>
  new Date(d).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const ageLabel = (d) => {
  const h = (Date.now() - new Date(d).getTime()) / 3600000;
  if (h < 1) return 'just now';
  if (h < 24) return `${Math.floor(h)}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
};

export default function Orders() {
  // every filter lives in the page address, so it is still there after Manage → Back
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const sellerFilter = params.get('store') || '';
  const late = params.get('late') === '1';
  const stuck = params.get('stuck') === '1';
  const clientsOnly = params.get('clients') === '1';
  const setParam = (patch) =>
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v === true ? '1' : String(v)) : n.delete(k)));
        return n;
      },
      { replace: true }
    );
  const setSellerFilter = (id) => setParam({ store: id });
  const [q, setQ] = useState(() => params.get('q') || '');
  const [orders, setOrders] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState('auto'); // 'auto' | 'table' | 'cards'
  const [statusCounts, setStatusCounts] = useState({});
  const [analyticsKey, setAnalyticsKey] = useState(0);
  // live filters for the socket handlers (their effect is not re-created on every keystroke)
  const filtersRef = useRef({ status, sellerFilter, q, late, stuck, clientsOnly });
  filtersRef.current = { status, sellerFilter, q, late, stuck, clientsOnly };

  // "Orders by store" numbers (also the counts in the store picker)
  const [boardDays, setBoardDays] = useState(30);
  const [storeStats, setStoreStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const storeCounts = useMemo(() => new Map((storeStats?.stores || []).map((x) => [String(x._id), x])), [storeStats]);

  // ticked orders, the row status menu, the "are you sure?" box and the last result
  const [picked, setPicked] = useState(() => new Set());
  const [menu, setMenu] = useState(null); // { order, anchor }
  const [ask, setAsk] = useState(null); // { orders, status, skipped }
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null); // { status, done, failed, skipped }
  const [lastOpened, setLastOpened] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(SCROLL_KEY) || 'null')?.orderId || '';
    } catch {
      return '';
    }
  });

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

  const loadReq = useRef(0);
  const loadOrders = (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    // always the CURRENT filters: a live update used to reload with the search text that was
    // typed when the page opened, so a search was silently replaced by the full list
    const f = filtersRef.current;
    const query = new URLSearchParams();
    if (f.status) query.set('status', f.status);
    if (f.sellerFilter) query.set('sellerId', f.sellerFilter);
    if (f.q.trim()) query.set('q', f.q.trim());
    if (f.late) query.set('late', '1');
    if (f.stuck) query.set('stuck', '1');
    if (f.clientsOnly) query.set('clients', '1');
    const reqId = ++loadReq.current;

    return api('/orders?' + query.toString())
      .then((res) => {
        if (reqId !== loadReq.current) return; // an older request answering late
        setOrders(Array.isArray(res) ? res : res.orders || []);
      })
      .catch((e) => reqId === loadReq.current && setError(e.message))
      .finally(() => {
        if (!silent && reqId === loadReq.current) setLoading(false);
      });
  };

  const loadStatusCounts = () => {
    const f = filtersRef.current;
    api(`/orders/analytics/overview?days=7${f.sellerFilter ? `&sellerId=${f.sellerFilter}` : ''}`)
      .then((d) => setStatusCounts(d.statusCounts || {}))
      .catch(() => {});
  };

  useEffect(() => {
    loadSellers();
  }, []);

  useEffect(() => {
    loadOrders();
    setPicked(new Set());
  }, [status, sellerFilter, late, stuck, clientsOnly]);

  useEffect(() => {
    let alive = true;
    setStatsLoading(true);
    api(`/orders/analytics/stores?days=${boardDays}`)
      .then((d) => alive && setStoreStats(d))
      .catch(() => {})
      .finally(() => alive && setStatsLoading(false));
    return () => {
      alive = false;
    };
  }, [boardDays, analyticsKey]);

  // back from an order page: the same filters (they are in the address) and the same scroll spot
  const restored = useRef(false);
  useEffect(() => {
    if (loading || restored.current) return;
    restored.current = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || 'null');
      if (saved && saved.qs === params.toString()) {
        requestAnimationFrame(() => {
          const el = scroller();
          if (el) el.scrollTop = saved.y || 0;
        });
      }
      sessionStorage.removeItem(SCROLL_KEY);
    } catch {
      /* storage blocked */
    }
  }, [loading]);
  const paramsRef = useRef('');
  paramsRef.current = params.toString();
  const rememberSpot = (orderId) => {
    try {
      sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ qs: paramsRef.current, y: scroller()?.scrollTop || 0, orderId }));
    } catch {
      /* storage blocked */
    }
    setLastOpened(orderId);
  };

  useEffect(() => {
    loadStatusCounts();
  }, [sellerFilter, analyticsKey]);

  // a burst of live events refreshes the counts and charts once, not once per event
  const liveTimer = useRef(null);
  const refreshInsightsSoon = () => {
    clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(() => setAnalyticsKey((k) => k + 1), 1500);
  };
  useEffect(() => () => clearTimeout(liveTimer.current), []);

  // every status change arrives as two or three events: reload the list once for all of them
  const reloadTimer = useRef(null);
  const reloadOrdersSoon = () => {
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => loadOrders(true), 800);
  };
  useEffect(() => () => clearTimeout(reloadTimer.current), []);

  // Real-time synchronization on WebSocket events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Safety net: ensure admin is in 'admins' room so order events are received
    const adminToken = localStorage.getItem('ng_admin_token');
    const rejoin = () => {
      // fresh read: the admin may have logged out since this screen opened
      const t = localStorage.getItem('ng_admin_token');
      if (t && t === adminToken) socket.emit('admin:join', { token: t });
    };
    if (socket.connected) rejoin();
    socket.on('connect', rejoin);

    const handleOrderUpdate = (payload) => {
      const updatedOrder = payload?.order || payload;
      const { status, sellerFilter, q, late, stuck } = filtersRef.current;
      refreshInsightsSoon();
      if (!updatedOrder?._id) {
        reloadOrdersSoon();
        return;
      }

      // 1. Immediately update matching order in table without page reload
      setOrders((prev) => {
        const idx = prev.findIndex((o) => o._id === updatedOrder._id);
        if (idx !== -1) {
          // If a status filter is active and the order no longer matches, remove it
          if (!statusMatches(status, updatedOrder.status) || ((late || stuck) && CLOSED.includes(updatedOrder.status))) {
            return prev.filter((o) => o._id !== updatedOrder._id);
          }
          const next = [...prev];
          next[idx] = { ...next[idx], ...updatedOrder };
          return next;
        } else {
          // If order wasn't in the list, but matches current filters, add it
          // (with a search active the server decides, through the re-sync below)
          if (
            !q.trim() &&
            !late &&
            !stuck &&
            statusMatches(status, updatedOrder.status) &&
            (!sellerFilter ||
              String(updatedOrder.seller?._id || updatedOrder.seller) === String(sellerFilter) ||
              (updatedOrder.items || []).some((it) => String(it.seller?._id || it.seller) === String(sellerFilter)))
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
      reloadOrdersSoon();
    };

    const handleOrderNew = () => {
      reloadOrdersSoon();
      refreshInsightsSoon();
    };

    const handleNotify = (n) => {
      if (n?.type === 'order') {
        reloadOrdersSoon();
        refreshInsightsSoon();
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
  }, []);

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
      setAnalyticsKey((k) => k + 1);
    } catch (err) {
      alert('Error placing order: ' + err.message);
    } finally {
      setPlacingOrder(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    // these move money at once and cannot simply be clicked back
    const warn = STATUS_WARNINGS[newStatus];
    if (warn && !window.confirm(warn)) return;
    setUpdatingStatus(true);
    try {
      await api(`/orders/${orderId}/status`, {
        method: 'POST',
        body: { status: newStatus, note: `Status updated to ${newStatus} by Platform Admin` },
      });
      loadOrders();
      setAnalyticsKey((k) => k + 1);
      if (inspectOrder && inspectOrder._id === orderId) {
        setInspectOrder((prev) => ({ ...prev, status: newStatus }));
      }
    } catch (err) {
      alert('Error updating status: ' + err.message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // ── status change from the list (one row or the ticked orders) ──
  const askChange = (list, newStatus) => {
    setMenu(null);
    setResult(null);
    const can = list.filter((o) => choicesFor(o.status).includes(newStatus));
    const skipped = list.length - can.length;
    if (!can.length) {
      setResult({ status: newStatus, done: 0, failed: [], skipped });
      return;
    }
    if (can.length === 1 && !needsConfirm(newStatus)) return doChange(can, newStatus, skipped);
    setAsk({ orders: can, status: newStatus, skipped });
  };
  const doChange = async (list, newStatus, skipped = 0) => {
    setBusy(list.length > 1 ? `Changing 0 / ${list.length}…` : 'Changing…');
    const r = await runStatusChanges(list, newStatus, (d, t) => t > 1 && setBusy(`Changing ${d} / ${t}…`));
    setBusy('');
    setAsk(null);
    setResult({ status: newStatus, ...r, skipped });
    // the ones that failed stay ticked, to try again after fixing them
    setPicked(new Set(r.failed.map((x) => x.id)));
    loadOrders(true);
    setAnalyticsKey((k) => k + 1);
  };
  const togglePick = (id) =>
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allPicked = orders.length > 0 && orders.every((o) => picked.has(o._id));
  const pickAll = () => setPicked(allPicked ? new Set() : new Set(orders.map((o) => o._id)));

  // what is special about this order right now: late, stopped, or the next automatic step
  const orderNote = (o) => {
    if (CLOSED.includes(o.status)) return null;
    const out = [];
    const age = Date.now() - new Date(o.createdAt).getTime();
    if (age > LATE_MS) out.push(<span key="l" className="ost-late">Late · {Math.floor(age / 86400000)}d</span>);
    if (o.autoIssue?.reason) out.push(<span key="i" className="ost-issue" title={o.autoIssue.reason}>⚠ Can’t move: {o.autoIssue.reason.length > 60 ? `${o.autoIssue.reason.slice(0, 60)}…` : o.autoIssue.reason}</span>);
    else if (o.nextStatusAt && Date.now() - new Date(o.nextStatusAt).getTime() > 3600000) out.push(<span key="o" className="ost-issue">⚠ Next step overdue {Math.round((Date.now() - new Date(o.nextStatusAt).getTime()) / 3600000)}h</span>);
    else if (o.nextStatus && o.nextStatusAt) out.push(<span key="n" className="ost-next">Next: {STATUS_LABELS[o.nextStatus] || o.nextStatus} · {shortTime(o.nextStatusAt)}</span>);
    else if (o.status === 'pending') out.push(<span key="p" className="ost-next">Waiting for the store to confirm</span>);
    return out.length ? <div className="ost-notes">{out}</div> : null;
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
      setAnalyticsKey((k) => k + 1);
    } finally {
      setTimeout(() => setRefreshing(false), 500);
    }
  };

  const hasActiveFilters = Boolean(status || sellerFilter || q.trim() || late || stuck || clientsOnly);
  const handleClearAllFilters = () => {
    const onlySearch = !status && !sellerFilter && !late && !stuck && !clientsOnly;
    setQ('');
    setParams({}, { replace: true });
    // with only a search active no filter effect fires, so reload here
    if (onlySearch) {
      filtersRef.current = { status: '', sellerFilter: '', q: '', late: false, stuck: false, clientsOnly: false };
      loadOrders();
    }
  };

  const scrollToList = () => setTimeout(() => document.querySelector('.ins-orders-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  const pickSeller = (id) => {
    setSellerFilter(id);
    scrollToList();
  };
  // a number in "Orders by store": that store (or all) + that group, late or stopped orders
  const pickFromBoard = (sid, f) => {
    // the totals count real client stores only: the list then leaves test stores out as well
    setParam({ store: sid, status: f.status || '', late: f.late || '', stuck: f.stuck || '', clients: sid ? '' : true });
    scrollToList();
  };
  const setStatus = (st) => setParam({ status: st, late: '', stuck: '', clients: '' });
  const viewLabel = late ? 'Late — not delivered after 7 days' : stuck ? 'Stopped moving by themselves' : GROUP_LABELS[status] || (clientsOnly ? STATUS_LABELS[status] || 'All statuses' : '');
  const allCount = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const chosenSeller = sellers.find((s) => s._id === sellerFilter);
  const showTable = viewMode === 'auto' || viewMode === 'table';
  const showCards = viewMode === 'auto' || viewMode === 'cards';

  const customerOf = (o) => o.shippingAddress?.fullName || o.contact?.fullName || 'Guest customer';
  const phoneOf = (o) => o.contact?.phone || o.shippingAddress?.phone || '';

  const orderBadge = (o) => (
    <Badge tone={STATUS_TONE[o.status] || 'neutral'}>{STATUS_LABELS[o.status] || o.status}</Badge>
  );

  return (
    <div className="ins-page admin-orders-page">
      <Hero
        icon="box"
        tone="blue"
        title="Orders"
        subtitle="Every customer order across all stores — live. Track value and fulfilment per seller, find stuck orders, update statuses and place orders for a store."
        actions={
          <>
            <button type="button" className="ins-btn" onClick={() => handleOpenAddFunds()} title="Add or credit funds to a seller wallet in INR / USD">
              <Ic name="card" size={15} /> Add funds
            </button>
            <button type="button" className="ins-btn ins-btn-primary" onClick={() => handleOpenPlaceOrder()}>
              <Ic name="plus" size={15} /> Place order
            </button>
          </>
        }
      >
        <MetaChip live>Live sync</MetaChip>
        <MetaChip>{allCount.toLocaleString('en-US')} orders in total</MetaChip>
        {(statusCounts.pending || 0) > 0 && <MetaChip>⏳ {statusCounts.pending} waiting for confirmation</MetaChip>}
      </Hero>

      <OrdersStoreBoard
        data={storeStats}
        loading={statsLoading}
        days={boardDays}
        onDays={setBoardDays}
        onPick={pickFromBoard}
        activeSeller={sellerFilter}
        activeFilter={{ status: status || undefined, late: late || undefined, stuck: stuck || undefined }}
      />

      <OrdersAnalytics sellerId={sellerFilter} refreshKey={analyticsKey} onPickSeller={pickSeller} />

      <ErrorBox error={error} />

      <div className="ins-table-card ins-orders-list">
        <div className="ins-table-head" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <h3>📋 Customer orders</h3>
              <span className="ins-card-hint">
                {loading ? 'Loading…' : `${orders.length}${orders.length >= 300 ? '+ (newest 300 shown — narrow the filters to see older ones)' : ''} shown`}
                {chosenSeller ? ` · ${chosenSeller.storeName}` : ''}
              </span>
            </div>
            <div className="ins-toolbar-group">
              <Seg small label="Layout" value={viewMode === 'cards' ? 'cards' : 'table'} onChange={setViewMode} options={[{ value: 'table', label: '▤ Table' }, { value: 'cards', label: '☷ Cards' }]} />
              <button type="button" className="ins-btn ins-btn-sm" onClick={handleManualRefresh} disabled={refreshing}>
                <Ic name="refresh" size={13} /> {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </div>

          <form
            className="ins-toolbar"
            style={{ justifyContent: 'flex-start' }}
            onSubmit={(e) => {
              e.preventDefault();
              setParam({ q: q.trim() });
              loadOrders();
            }}
          >
            <div className="ins-search" style={{ maxWidth: 380 }}>
              <Ic name="search" size={15} />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order #, customer, phone, email, store…" />
              {q && (
                <button
                  type="button"
                  className="ins-search-clear"
                  onClick={() => {
                    setQ('');
                    setParam({ q: '' });
                    filtersRef.current = { ...filtersRef.current, q: '' };
                    loadOrders();
                  }}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
            <OrdersStorePicker sellers={sellers} counts={storeCounts} value={sellerFilter} onChange={setSellerFilter} />
            <button type="submit" className="ins-btn ins-btn-primary">
              <Ic name="search" size={14} /> Search
            </button>
            {hasActiveFilters && (
              <button type="button" className="ins-btn ins-btn-ghost" onClick={handleClearAllFilters}>
                ✕ Reset filters
              </button>
            )}
          </form>

          <div style={{ overflowX: 'auto' }}>
            <Seg
              small
              label="Status"
              value={status}
              onChange={setStatus}
              options={[
                { value: '', label: 'All', count: allCount },
                ...ALL_STATUSES.map((st) => ({ value: st, label: STATUS_LABELS[st], count: statusCounts[st] || 0 })),
              ]}
            />
          </div>
          {viewLabel && (
            <div className="ost-view">
              <span>Showing: <b>{viewLabel}</b>{chosenSeller ? ` · ${chosenSeller.storeName}` : clientsOnly ? ' · all client stores (no test accounts)' : ' · all stores'}{late || stuck ? ' · oldest first' : ''}</span>
              <button type="button" onClick={() => setParam({ status: '', late: '', stuck: '', clients: '' })} aria-label="Show all statuses">✕</button>
            </div>
          )}
          {result && (
            <div className={`ost-result ${result.failed.length ? 'has-fail' : ''}`} role="status">
              <div>
                {result.done > 0 && <b>✓ {result.done} {result.done === 1 ? 'order' : 'orders'} changed to “{STATUS_LABELS[result.status] || result.status}”. </b>}
                {result.skipped > 0 && <span>{result.skipped} skipped (already there, or a delivered order cannot be cancelled). </span>}
                {result.failed.length > 0 && (
                  <>
                    <b>{result.failed.length} could not change</b> (still ticked):
                    <ul>
                      {result.failed.slice(0, 6).map((f) => (
                        <li key={f.id}>#{f.orderNumber} — {f.error}</li>
                      ))}
                      {result.failed.length > 6 && <li>…and {result.failed.length - 6} more</li>}
                    </ul>
                  </>
                )}
              </div>
              <button type="button" onClick={() => setResult(null)} aria-label="Close">✕</button>
            </div>
          )}
        </div>

        {showTable && (
          <div className={`ins-table-scroll${viewMode === 'auto' ? ' ins-hide-mobile' : ''}`}>
            <table className="ins-table">
              <thead>
                <tr>
                  <th className="ost-pick">
                    <input type="checkbox" checked={allPicked} onChange={pickAll} aria-label="Tick all orders shown" disabled={!orders.length} />
                  </th>
                  <th>Order</th>
                  <th>Store</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th className="num">Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={`sk-${i}`}>
                      {Array.from({ length: 9 }).map((__, j) => (
                        <td key={j}><span className="ins-skel" style={{ width: `${45 + ((i + j) % 4) * 13}%` }} /></td>
                      ))}
                    </tr>
                  ))}
                {!loading && orders.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      <Empty icon="📦" text={hasActiveFilters ? 'No order matches these filters.' : 'No orders yet.'}>
                        {hasActiveFilters && (
                          <button type="button" className="ins-btn ins-btn-sm" onClick={handleClearAllFilters}>Clear filters</button>
                        )}
                      </Empty>
                    </td>
                  </tr>
                )}
                {!loading &&
                  orders.map((o) => {
                    const seller = getOrderSeller(o);
                    const itemsCount = o.items?.reduce((sum, it) => sum + (it.qty || 1), 0) || 0;
                    const storeCount = new Set((o.items || []).map((it) => String(it.seller?._id || it.seller || ''))).size;
                    return (
                      <tr key={o._id} className={`${picked.has(o._id) ? 'ost-row-on' : ''} ${lastOpened === o._id ? 'ost-row-last' : ''}`}>
                        <td className="ost-pick">
                          <input type="checkbox" checked={picked.has(o._id)} onChange={() => togglePick(o._id)} aria-label={`Tick order ${o.orderNumber}`} />
                        </td>
                        <td>
                          <button type="button" className="ins-badge ins-badge-neutral" style={{ cursor: 'pointer', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} onClick={(e) => handleCopyOrder(e, o.orderNumber)} title="Copy order number">
                            {copiedId === o.orderNumber ? '✓ Copied' : `#${o.orderNumber}`}
                          </button>
                          <span className="ins-sub" style={{ marginTop: 4 }} title={fmtDate(o.createdAt)}>
                            {fmtDate(o.createdAt)} · {ageLabel(o.createdAt)}
                          </span>
                          {o.placedBy && o.placedBy !== 'customer' && <span className="ins-sub">Placed by admin</span>}
                        </td>
                        <td>
                          {seller ? (
                            <div className="ins-cell-who">
                              <Avatar name={seller.storeName} size={30} />
                              <div>
                                <b className="ins-clip" style={{ maxWidth: 160 }} title={seller.storeName}>
                                  <StoreLink id={seller._id} name={seller.storeName} />
                                </b>
                                <span className="ins-sub">{storeCount > 1 ? `+${storeCount - 1} more store${storeCount > 2 ? 's' : ''}` : seller.ownerName || ''}</span>
                              </div>
                            </div>
                          ) : (
                            <Badge tone="info">Bazario Direct</Badge>
                          )}
                        </td>
                        <td>
                          <span className="ins-strong ins-clip" style={{ display: 'block', maxWidth: 170 }}>{customerOf(o)}</span>
                          {phoneOf(o) && (
                            <a href={`tel:${phoneOf(o)}`} className="ins-sub" style={{ color: '#2a78d6', textDecoration: 'none' }}>
                              {phoneOf(o)}
                            </a>
                          )}
                          {o.shippingAddress?.city && <span className="ins-sub">{o.shippingAddress.city}{o.shippingAddress.state ? `, ${o.shippingAddress.state}` : ''}</span>}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <span style={{ width: 38, height: 38, borderRadius: 9, background: '#f1f5f9', overflow: 'hidden', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                              {o.items?.[0]?.image ? (
                                <img src={o.items[0].image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                              ) : (
                                <Ic name="box" size={16} />
                              )}
                            </span>
                            <span style={{ minWidth: 0 }}>
                              <span className="ins-clip" style={{ display: 'block', maxWidth: 170, fontWeight: 600, color: '#0f172a' }} title={o.items?.[0]?.name}>{o.items?.[0]?.name || 'Item'}</span>
                              <span className="ins-sub">{itemsCount} item{itemsCount === 1 ? '' : 's'}{o.items?.length > 1 ? ` · ${o.items.length} products` : ''}</span>
                            </span>
                          </div>
                        </td>
                        <td className="num">
                          <b style={{ fontSize: 14, color: '#0f172a' }}>{money(o.total)}</b>
                          <span className="ins-sub">{o.shipping?.cost > 0 ? `incl. ${money(o.shipping.cost)} delivery` : 'Free delivery'}</span>
                        </td>
                        <td>
                          <span className="ins-sub" style={{ fontWeight: 600, color: '#334155' }}>{PAYMENT_LABELS[o.paymentMethod] || o.paymentMethod || 'COD'}</span>
                          <Badge tone={o.paymentStatus === 'paid' ? 'good' : 'neutral'}>{o.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}</Badge>
                        </td>
                        <td>
                          <button type="button" className="ost-badge-btn" onClick={(e) => setMenu({ order: o, anchor: e.currentTarget })} aria-haspopup="menu" aria-expanded={menu?.order?._id === o._id} disabled={Boolean(busy)} title="Click to change the status">
                            {orderBadge(o)}
                            <span className="ost-caret" aria-hidden="true">▾</span>
                          </button>
                          {orderNote(o)}
                        </td>
                        <td>
                          <div className="ins-actions" style={{ flexWrap: 'nowrap' }}>
                            <button type="button" className="ins-btn ins-btn-sm" onClick={() => setInspectOrder(o)} title="Quick view">
                              <Ic name="eye" size={13} /> View
                            </button>
                            <Link to={`/admin/orders/${o._id}`} className="ins-btn ins-btn-sm" title="Open the full order page" onClick={() => rememberSpot(o._id)}>
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

        {showCards && (
          <div className="ins-cards" style={viewMode === 'cards' ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' } : undefined}>
            {loading && <Empty icon="⏳" text="Loading orders…" />}
            {!loading && orders.length === 0 && <Empty icon="📦" text={hasActiveFilters ? 'No order matches these filters.' : 'No orders yet.'} />}
            {!loading &&
              orders.map((o) => {
                const seller = getOrderSeller(o);
                const itemsCount = o.items?.reduce((sum, it) => sum + (it.qty || 1), 0) || 0;
                return (
                  <div key={o._id} className={`ins-mcard ${picked.has(o._id) ? 'ost-row-on' : ''} ${lastOpened === o._id ? 'ost-row-last' : ''}`}>
                    <div className="ins-mcard-row">
                      <label className="ost-card-pick">
                        <input type="checkbox" checked={picked.has(o._id)} onChange={() => togglePick(o._id)} aria-label={`Tick order ${o.orderNumber}`} />
                        <button type="button" className="ins-badge ins-badge-neutral" style={{ cursor: 'pointer' }} onClick={(e) => handleCopyOrder(e, o.orderNumber)}>
                          {copiedId === o.orderNumber ? '✓ Copied' : `#${o.orderNumber}`}
                        </button>
                      </label>
                      {orderBadge(o)}
                    </div>
                    {orderNote(o)}
                    <div className="ins-mcard-row">
                      <span>Store</span>
                      <b className="ins-clip" style={{ maxWidth: 180 }}>{seller ? <StoreLink id={seller._id} name={seller.storeName} /> : 'Bazario Direct'}</b>
                    </div>
                    <div className="ins-mcard-row">
                      <span>Customer</span>
                      <span style={{ textAlign: 'right' }}>
                        <b>{customerOf(o)}</b>
                        {phoneOf(o) && <a href={`tel:${phoneOf(o)}`} className="ins-sub" style={{ color: '#2a78d6' }}>{phoneOf(o)}</a>}
                      </span>
                    </div>
                    <div className="ins-mcard-row">
                      <span>{itemsCount} item{itemsCount === 1 ? '' : 's'} · {ageLabel(o.createdAt)}</span>
                      <b style={{ fontSize: 15 }}>{money(o.total)}</b>
                    </div>
                    <div className="ins-actions" style={{ justifyContent: 'stretch' }}>
                      <button type="button" className="ins-btn ins-btn-sm ost-status-btn" style={{ flex: 1 }} onClick={(e) => setMenu({ order: o, anchor: e.currentTarget })} disabled={Boolean(busy)}>
                        Status ▾
                      </button>
                      <button type="button" className="ins-btn ins-btn-sm" style={{ flex: 1 }} onClick={() => setInspectOrder(o)}>
                        <Ic name="eye" size={13} /> View
                      </button>
                      <Link to={`/admin/orders/${o._id}`} className="ins-btn ins-btn-sm" style={{ flex: 1 }} onClick={() => rememberSpot(o._id)}>
                        Manage ↗
                      </Link>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {picked.size > 0 && (
          <BulkBar count={picked.size} busy={busy} onClear={() => setPicked(new Set())} onApply={(st) => askChange(orders.filter((o) => picked.has(o._id)), st)} />
        )}
      </div>

      {menu && <StatusMenu anchor={menu.anchor} current={menu.order.status} onClose={() => setMenu(null)} onPick={(st) => askChange([menu.order], st)} />}
      {ask && (
        <ConfirmBox
          title={ask.orders.length === 1 ? `Change order #${ask.orders[0].orderNumber} to “${STATUS_LABELS[ask.status] || ask.status}”?` : `Change ${ask.orders.length} orders to “${STATUS_LABELS[ask.status] || ask.status}”?`}
          tone={ask.status === 'delivered' ? 'good' : ask.status === 'cancelled' ? 'bad' : 'dark'}
          confirmLabel={ask.orders.length === 1 ? 'Yes, change it' : `Yes, change ${ask.orders.length} orders`}
          busy={busy}
          onCancel={() => setAsk(null)}
          onConfirm={() => doChange(ask.orders, ask.status, ask.skipped)}
        >
          <p>{changeText(ask.status, ask.orders.length)}</p>
          {ask.orders.length > 1 && (
            <p className="ost-confirm-list">
              {ask.orders.slice(0, 8).map((o) => `#${o.orderNumber}`).join(', ')}
              {ask.orders.length > 8 ? ` and ${ask.orders.length - 8} more` : ''}
            </p>
          )}
          {ask.skipped > 0 && <p className="ost-confirm-skip">{ask.skipped} ticked {ask.skipped === 1 ? 'order is' : 'orders are'} skipped (already there, or delivered and cannot be cancelled).</p>}
        </ConfirmBox>
      )}

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
                    extraAction={
                      selSeller && (
                        <button
                          type="button"
                          className="btn-add-seller-funds"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenAddFunds(selSeller._id);
                          }}
                          title="Add funds directly to this merchant wallet in INR / USD with Binance USDT rate"
                        >
                          <Ic name="plus" size={13} /> 💳 Add Funds
                        </button>
                      )
                    }
                  />

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
                  {['confirmed', 'processing', 'packed', 'out_from_warehouse', 'delivery_warehouse', 'out_for_delivery', 'delivery_failed', 'returned_to_warehouse', 'delivered', 'cancelled']
                    // a delivered order was already paid out: it goes back only through a refund
                    .filter((st) => !(st === 'cancelled' && inspectOrder.status === 'delivered'))
                    .map((st) => (
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
