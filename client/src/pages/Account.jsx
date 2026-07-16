import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { uapi, money, fmtDate } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PROVINCES, STATUS_LABELS } from '../data.js';
import Ic from '../components/Icons.jsx';
import { OrderTimeline, OrderDetailCard } from './TrackOrder.jsx';

const EMPTY_ADDR = { label: 'Home', fullName: '', phone: '', street: '', apartment: '', city: '', state: '', postalCode: '', isDefault: false };

export default function Account() {
  const { user, update, logout } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'profile';
  const [profile, setProfile] = useState({ name: '', phone: '' });
  const [pw, setPw] = useState({ current: '', next: '' });
  const [orders, setOrders] = useState([]);
  const [openOrder, setOpenOrder] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [editAddr, setEditAddr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [refundFor, setRefundFor] = useState(null);
  const [refundReason, setRefundReason] = useState('');

  useEffect(() => {
    if (!user) return;
    uapi('/user/me').then((d) => {
      setProfile({ name: d.user.name, phone: d.user.phone });
      setAddresses(d.user.addresses || []);
    }).catch(() => {});
    uapi('/user/me/orders').then(setOrders).catch(() => {});
  }, [user]);

  if (!user) return <Navigate to="/login?next=/account" replace />;

  const flash = (ok, text) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 3000);
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    try {
      const d = await uapi('/user/me', { method: 'PUT', body: profile });
      update(d.user);
      localStorage.setItem('ng_user_token', d.token);
      flash(true, 'Profile updated');
    } catch (err) {
      flash(false, err.message);
    }
  };

  const changePw = async (e) => {
    e.preventDefault();
    try {
      await uapi('/user/me/password', { method: 'PUT', body: pw });
      setPw({ current: '', next: '' });
      flash(true, 'Password changed');
    } catch (err) {
      flash(false, err.message);
    }
  };

  const saveAddr = async (e) => {
    e.preventDefault();
    try {
      const d = editAddr._id
        ? await uapi(`/user/me/addresses/${editAddr._id}`, { method: 'PUT', body: editAddr })
        : await uapi('/user/me/addresses', { method: 'POST', body: editAddr });
      setAddresses(d.addresses);
      setEditAddr(null);
      flash(true, 'Address saved');
    } catch (err) {
      flash(false, err.message);
    }
  };

  const delAddr = async (id) => {
    const d = await uapi(`/user/me/addresses/${id}`, { method: 'DELETE' });
    setAddresses(d.addresses);
  };

  const requestRefund = async (e) => {
    e.preventDefault();
    try {
      await uapi(`/orders/${refundFor._id}/refund-request`, { method: 'POST', body: { reason: refundReason } });
      setRefundFor(null);
      setRefundReason('');
      flash(true, 'Refund request submit ho gayi — support team jald rabta karegi');
      uapi('/user/me/orders').then(setOrders).catch(() => {});
    } catch (err) {
      flash(false, err.message);
    }
  };

  const setA = (k) => (e) => setEditAddr({ ...editAddr, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <div className="container section account-page">
      <div className="account-head">
        <h1 className="page-title serif">My Account</h1>
        <span className="muted">Assalam o Alaikum, <b>{user.name}</b></span>
      </div>

      <div className="account-tabs">
        {[['profile', 'Profile'], ['orders', `Order History (${orders.length})`], ['addresses', 'Saved Addresses']].map(([k, label]) => (
          <button key={k} className={'chip' + (tab === k ? ' chip-on' : '')} onClick={() => setParams({ tab: k })}>{label}</button>
        ))}
      </div>

      {msg && <div className={msg.ok ? 'alert-ok' : 'alert-error'}>{msg.text}</div>}

      {tab === 'profile' && (
        <div className="account-grid">
          <form className="card form-card" onSubmit={saveProfile}>
            <h3>Profile</h3>
            <div className="field"><label>Full Name</label><input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></div>
            <div className="field"><label>Email</label><input value={user.email} disabled /></div>
            <div className="field"><label>Phone</label><input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="03XX XXXXXXX" /></div>
            <button className="btn-primary">SAVE PROFILE</button>
          </form>
          <form className="card form-card" onSubmit={changePw}>
            <h3>Change Password</h3>
            <div className="field"><label>Current Password</label><input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></div>
            <div className="field"><label>New Password</label><input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></div>
            <button className="btn-outline">CHANGE PASSWORD</button>
          </form>
        </div>
      )}

      {tab === 'orders' && (
        <div className="account-orders">
          {orders.length === 0 && (
            <div className="empty-box">
              <Ic name="package" size={40} stroke={1.2} />
              <p>Abhi tak koi order nahi.</p>
              <Link to="/shop" className="btn-primary">START SHOPPING</Link>
            </div>
          )}
          {orders.map((o) => (
            <div className="card account-order" key={o._id}>
              <button className="account-order-head" onClick={() => setOpenOrder(openOrder === o._id ? null : o._id)}>
                <span><b>{o.orderNumber}</b><small className="muted">{fmtDate(o.createdAt)} · {o.items.length} item(s)</small></span>
                <span className="order-list-right">
                  <b>{money(o.total)}</b>
                  <span className={`status-pill st-${o.status}`}>{STATUS_LABELS[o.status]}</span>
                  <Ic name="chevDown" size={15} />
                </span>
              </button>
              {openOrder === o._id && (
                <div className="account-order-body">
                  <OrderTimeline order={o} />
                  <OrderDetailCard order={o} />
                  <div className="account-order-actions">
                    <Link className="btn-outline" to={`/track-order?order=${o.orderNumber}&phone=${encodeURIComponent(o.contact?.phone || '')}`}>TRACK ORDER</Link>
                    {!o.refundId && ['shipped', 'out_for_delivery', 'delivered'].includes(o.status) && (
                      <button className="btn-outline" onClick={() => setRefundFor(o)}>REQUEST REFUND</button>
                    )}
                    {o.refundId && <span className="muted-sm"><Ic name="refresh" size={13} /> Refund request submitted</span>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'addresses' && (
        <div>
          <div className="addr-grid">
            {addresses.map((a) => (
              <div className="card addr-card" key={a._id}>
                <div className="addr-card-head">
                  <b><Ic name="mapPin" size={14} /> {a.label} {a.isDefault && <span className="off-chip">Default</span>}</b>
                  <span>
                    <button className="row-link" onClick={() => setEditAddr(a)}>Edit</button>{' '}
                    <button className="row-link danger" onClick={() => delAddr(a._id)}>Delete</button>
                  </span>
                </div>
                <p className="addr">{a.fullName}<br />{a.street}{a.apartment ? ', ' + a.apartment : ''}<br />{a.city}, {a.state} {a.postalCode}<br />{a.phone}</p>
              </div>
            ))}
            <button className="card addr-add" onClick={() => setEditAddr({ ...EMPTY_ADDR })}>
              <Ic name="plus" size={22} /> Add New Address
            </button>
          </div>

          {editAddr && (
            <form className="card form-card addr-form" onSubmit={saveAddr}>
              <h3>{editAddr._id ? 'Edit Address' : 'New Address'}</h3>
              <div className="form-grid">
                <div className="field"><label>Label</label><input value={editAddr.label} onChange={setA('label')} placeholder="Home / Office" /></div>
                <div className="field"><label>Full Name</label><input value={editAddr.fullName} onChange={setA('fullName')} /></div>
                <div className="field"><label>Phone</label><input value={editAddr.phone} onChange={setA('phone')} /></div>
                <div className="field"><label>City</label><input value={editAddr.city} onChange={setA('city')} /></div>
                <div className="field field-full"><label>Street Address</label><input value={editAddr.street} onChange={setA('street')} /></div>
                <div className="field"><label>Apartment (optional)</label><input value={editAddr.apartment} onChange={setA('apartment')} /></div>
                <div className="field">
                  <label>State / Province</label>
                  <select value={editAddr.state} onChange={setA('state')}>
                    <option value="">Select</option>
                    {PROVINCES.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="field"><label>Postal Code</label><input value={editAddr.postalCode} onChange={setA('postalCode')} /></div>
              </div>
              <label className="checkbox"><input type="checkbox" checked={!!editAddr.isDefault} onChange={setA('isDefault')} /> Set as default address</label>
              <div className="form-actions">
                <button className="btn-primary">SAVE ADDRESS</button>
                <button type="button" className="btn-outline" onClick={() => setEditAddr(null)}>CANCEL</button>
              </div>
            </form>
          )}
        </div>
      )}

      {refundFor && (
        <div className="modal-back" onClick={() => setRefundFor(null)}>
          <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={requestRefund}>
            <h3>Request Refund — {refundFor.orderNumber}</h3>
            <div className="field">
              <label>Reason <em>*</em></label>
              <textarea value={refundReason} onChange={(e) => setRefundReason(e.target.value)} rows={4} placeholder="Refund ki wajah likhein..." required />
            </div>
            <div className="form-actions">
              <button className="btn-primary">SUBMIT REQUEST</button>
              <button type="button" className="btn-outline" onClick={() => setRefundFor(null)}>CANCEL</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
