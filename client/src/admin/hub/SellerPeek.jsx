import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmtDay } from '../../api.js';
import Ic from '../../components/Icons.jsx';
import { PEEK_EVENT, chatPath, initialsOf, orderPath, profilePath, rememberStore, usd, ago, refreshHub } from './hubBus.js';

/**
 * Store quick view: opens from any store name (and from Ctrl + K) on the right side, without
 * leaving the page. Balance, frozen amount, waiting orders, plan, health, pending money requests,
 * and one tap to the profile, the store's dashboard or its support chat. ⭐ pins the store.
 */
export default function SellerPeek({ can }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(null); // { id, name }
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);

  const load = useCallback((id) => {
    setLoading(true);
    setErr('');
    api(`/admin-hub/seller/${id}`)
      .then((d) => {
        setInfo(d);
        rememberStore({ id, storeName: d.storeName, ownerName: d.ownerName });
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onPeek = (e) => {
      const { id, name } = e.detail || {};
      if (!id) return;
      setOpen({ id, name });
      setInfo(null);
      load(id);
    };
    window.addEventListener(PEEK_EVENT, onPeek);
    return () => window.removeEventListener(PEEK_EVENT, onPeek);
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  const go = (path) => {
    setOpen(null);
    navigate(path);
  };

  const togglePin = async () => {
    if (!info) return;
    setPinBusy(true);
    try {
      await api(`/admin-hub/pins/${open.id}`, { method: 'POST', body: { pinned: !info.pinned } });
      setInfo((cur) => ({ ...cur, pinned: !cur.pinned }));
      refreshHub();
    } catch (e) {
      setErr(e.message);
    } finally {
      setPinBusy(false);
    }
  };

  const name = info?.storeName || open.name || 'Store';
  const statusTone = info?.status === 'frozen' ? 'blue' : info?.status === 'suspended' ? 'red' : info?.status === 'pending_approval' ? 'amber' : 'green';

  return (
    <div className="hub-peek-overlay" onClick={() => setOpen(null)}>
      <aside className="hub-peek" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${name} quick view`}>
        <header className="hub-peek-head">
          <div className="hub-peek-av">{initialsOf(name)}</div>
          <div className="hub-peek-title">
            <b>{name}</b>
            <span>{info ? `${info.ownerName || 'Owner'}${info.ownerMember ? ` · member: ${info.ownerMember}` : ''}` : 'Loading…'}</span>
          </div>
          <div className="hub-peek-head-btns">
            {info && (
              <button type="button" className={`hub-pin ${info.pinned ? 'on' : ''}`} onClick={togglePin} disabled={pinBusy} title={info.pinned ? 'Unpin this store' : 'Pin this store for quick access'}>
                <Ic name="star" size={16} />
              </button>
            )}
            <button type="button" className="hub-x" onClick={() => setOpen(null)} aria-label="Close">
              <Ic name="x" size={16} />
            </button>
          </div>
        </header>

        <div className="hub-peek-body">
          {err && <div className="hub-err">{err}</div>}
          {loading && !info && <div className="hub-muted">Loading store…</div>}

          {info && (
            <>
              <div className="hub-tags">
                <span className={`hub-tag ${info.tier === 'Diamond' ? 'violet' : ''}`}>{info.tier === 'Diamond' ? '💎 Diamond' : 'Basic'}</span>
                <span className={`hub-tag cap ${statusTone}`}>{String(info.status || 'active').replace('_', ' ')}</span>
                <span className={`hub-tag ${info.health < 50 ? 'red' : info.health < 80 ? 'amber' : ''}`}>Health {info.health}/100</span>
                {info.isTest && <span className="hub-tag amber">Test account</span>}
                {info.chatWaiting && <span className="hub-tag red">Chat waiting for reply</span>}
              </div>

              {(info.status === 'frozen' && info.freezeReason) || info.warning ? (
                <p className="hub-note">{info.status === 'frozen' && info.freezeReason ? `🧊 ${info.freezeReason}` : `⚠️ ${info.warning}`}</p>
              ) : null}

              <div className="hub-tiles">
                <div><span>Available</span><b>{usd(info.balance)}</b></div>
                <div><span>Frozen amount</span><b className={info.frozenAmount > 0 ? 't-blue' : ''}>{usd(info.frozenAmount)}</b></div>
                <div><span>In processing</span><b>{usd(info.processingFund)}</b></div>
                <div><span>Waiting orders</span><b>{info.pendingOrders} · {usd(info.pendingAmount)}</b></div>
                <div><span>Short by</span><b className={info.shortBy > 0 ? 't-red' : 't-green'}>{info.shortBy > 0 ? usd(info.shortBy) : 'Nothing'}</b></div>
                {info.lastDeposit !== undefined && (
                  <div className="wide"><span>Last deposit</span><b>{info.lastDeposit ? `${usd(info.lastDeposit.amount)} · ${fmtDay(info.lastDeposit.at)}` : 'None yet'}</b></div>
                )}
              </div>

              {info.pendingPayments?.length > 0 && (
                <div className="hub-pay">
                  {info.pendingPayments.map((p, i) => (
                    <button key={i} type="button" onClick={() => go('/admin/withdrawals')}>
                      {p.kind === 'deposit' ? '↓ Deposit' : '↑ Withdrawal'} {usd(p.amount)} <small>waiting {ago(p.at)}</small>
                    </button>
                  ))}
                </div>
              )}

              <div className="hub-actions">
                <button type="button" className="primary" onClick={() => go(profilePath(open.id))}>
                  <Ic name="user" size={15} /> Open profile
                </button>
                <button type="button" onClick={() => go(profilePath(open.id, 'dashboard'))}>
                  <Ic name="grid" size={15} /> Store dashboard
                </button>
                {info.conversationId && can?.('chat') && (
                  <button type="button" onClick={() => go(chatPath(info.conversationId))}>
                    <Ic name="chat" size={15} /> Open chat
                  </button>
                )}
              </div>

              <h4 className="hub-h">Orders waiting to be confirmed</h4>
              {info.waitingOrders?.length ? (
                <ul className="hub-orders">
                  {info.waitingOrders.map((o) => (
                    <li key={o._id}>
                      <button type="button" onClick={() => (can?.('orders') ? go(orderPath(o._id)) : null)} disabled={!can?.('orders')}>
                        <span>
                          <span className="hub-o-top">
                            <b>{o.orderNumber}</b> · {usd(o.value)}
                          </span>
                          <small>{o.items}</small>
                        </span>
                        <em>{ago(o.createdAt)}</em>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hub-muted">No order is waiting. ✓</p>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
