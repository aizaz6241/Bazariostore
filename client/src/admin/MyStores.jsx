import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { api, money } from '../api.js';
import Ic from '../components/Icons.jsx';
import useLiveReload from '../useLiveReload.js';
import { Avatar } from './insights.jsx';
import { Nick, useNicknames } from './nicknames.jsx';
import { chatPath, peekSeller } from './hub/hubBus.js';

/**
 * MY STORES — the "Sellers" page of a team member's login (assigned stores only, server:
 * utils/staffScope.js). Only his stores, read only: health, waiting orders, wallet, and quick
 * ways to their orders, their support chat and the store quick view.
 */
const healthTone = (n) => (n >= 75 ? 'good' : n >= 60 ? 'warn' : n >= 40 ? 'risk' : 'bad');
const STATUS = { active: 'Active', frozen: 'Frozen', suspended: 'Suspended', pending_approval: 'Waiting for approval' };

export default function MyStores() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { admin, can } = useOutletContext() || {};
  const nickMap = useNicknames();
  const [stores, setStores] = useState(null);
  const [chats, setChats] = useState({});
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('attention');

  const load = useCallback(() => {
    api('/sellers')
      .then((list) => {
        setStores(Array.isArray(list) ? list : []);
        setErr('');
      })
      .catch((e) => setErr(e.message || 'Could not load your stores'));
    if (can?.('chat')) {
      api('/chat/admin/conversations')
        .then((list) => {
          const m = {};
          (Array.isArray(list) ? list : []).forEach((c) => {
            const sid = String(c.seller?._id || c.seller || '');
            if (sid && !m[sid]) m[sid] = { id: c._id, waiting: c.status !== 'resolved' && ['seller', 'guest', 'customer'].includes(c.lastSender), unread: c.unreadForAdmin || 0 };
          });
          setChats(m);
        })
        .catch(() => {});
    }
  }, [can]);
  useEffect(() => {
    load();
  }, [load]);
  useLiveReload(['order:new', 'order:update', 'message:new', 'wallet:update', 'seller:status_update'], load, 2500);

  // ?open=<store> (a link from the store quick view): open that store's panel
  useEffect(() => {
    const open = params.get('open');
    if (!open) return;
    peekSeller(open);
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.delete('open');
      n.delete('tab');
      return n;
    }, { replace: true });
  }, [params, setParams]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = (stores || []).filter((s) => !t || `${s.storeName} ${nickMap[String(s._id)] || ''} ${s.ownerName} ${s.email} ${s.phone || ''}`.toLowerCase().includes(t));
    const by = {
      attention: (a, b) => (b.pendingOrders || 0) - (a.pendingOrders || 0) || (a.accountHealth?.score ?? 100) - (b.accountHealth?.score ?? 100),
      name: (a, b) => String(a.storeName).localeCompare(String(b.storeName)),
      health: (a, b) => (a.accountHealth?.score ?? 100) - (b.accountHealth?.score ?? 100),
    };
    return [...list].sort(by[sort] || by.attention);
  }, [stores, q, sort, nickMap]);

  const totals = useMemo(() => {
    const list = stores || [];
    return {
      stores: list.length,
      pending: list.reduce((n, s) => n + (Number(s.pendingOrders) || 0), 0),
      low: list.filter((s) => (s.accountHealth?.score ?? 100) < 60).length,
      chats: Object.values(chats).filter((c) => c.waiting).length,
    };
  }, [stores, chats]);

  return (
    <div className="mys">
      <header className="mys-head">
        <div>
          <h1>My stores</h1>
          <p>Only the stores assigned to you{admin?.name ? `, ${admin.name.replace(/\s*·\s*Team$/, '')}` : ''}. Their orders, support chat and details.</p>
        </div>
        <button type="button" className="mys-btn" onClick={load}>
          <Ic name="refresh" size={14} /> Refresh
        </button>
      </header>

      <div className="mys-kpis">
        <div><span>Stores</span><b>{stores ? totals.stores : '…'}</b></div>
        <div className={totals.pending ? 'is-warn' : ''}><span>Orders waiting to confirm</span><b>{stores ? totals.pending : '…'}</b></div>
        <div className={totals.low ? 'is-bad' : ''}><span>Health below 60</span><b>{stores ? totals.low : '…'}</b></div>
        {can?.('chat') && <div className={totals.chats ? 'is-warn' : ''}><span>Chats waiting</span><b>{totals.chats}</b></div>}
      </div>

      <div className="mys-tools">
        <label className="mys-search">
          <Ic name="search" size={15} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Store, nickname, owner, phone" aria-label="Search your stores" />
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort stores">
          <option value="attention">Needs attention first</option>
          <option value="health">Lowest health first</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      {err && <div className="mys-err">{err}</div>}
      {!stores && !err && <div className="mys-empty">Loading your stores…</div>}
      {stores && stores.length === 0 && (
        <div className="mys-empty">
          <b>No store is assigned to you yet.</b>
          <span>Ask the Super Admin to assign your stores (Staff &amp; Team → Team members).</span>
        </div>
      )}
      {stores && stores.length > 0 && shown.length === 0 && <div className="mys-empty">No store matches “{q}”.</div>}

      <div className="mys-grid">
        {shown.map((s) => {
          const sid = String(s._id);
          const score = s.accountHealth?.score ?? 100;
          const chat = chats[sid];
          return (
            <article key={sid} className="mys-card">
              <div className="mys-top">
                <Avatar name={s.storeName} size={38} />
                <div className="mys-who">
                  <b title={s.storeName}>
                    {s.storeName}
                    <Nick id={sid} compact />
                  </b>
                  <small>{s.ownerName || '—'}{s.phone ? ` · ${s.phone}` : ''}</small>
                </div>
                <span className={`mys-st st-${s.status || 'active'}`}>{STATUS[s.status] || s.status || 'Active'}</span>
              </div>
              <dl className="mys-tiles">
                <div className={s.pendingOrders ? 'is-warn' : ''}><dt>Waiting</dt><dd>{s.pendingOrders || 0}</dd></div>
                <div><dt>Orders</dt><dd>{s.orderCount || 0}</dd></div>
                <div><dt>Wallet</dt><dd>{money(s.wallet?.balance || 0)}</dd></div>
                <div><dt>Health</dt><dd><span className={`mys-health t-${healthTone(score)}`}>{score}</span></dd></div>
              </dl>
              <div className="mys-actions">
                {can?.('orders') && (
                  <button type="button" className="mys-btn primary" onClick={() => navigate(`/admin/orders?store=${sid}`)}>
                    <Ic name="box" size={14} /> Orders
                  </button>
                )}
                {can?.('chat') && chat && (
                  <button type="button" className={`mys-btn${chat.waiting ? ' is-hot' : ''}`} onClick={() => navigate(chatPath(chat.id))}>
                    <Ic name="chat" size={14} /> Chat{chat.unread ? ` (${chat.unread})` : ''}
                  </button>
                )}
                <button type="button" className="mys-btn" onClick={() => peekSeller(sid, s.storeName)}>
                  <Ic name="eye" size={14} /> Quick view
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
