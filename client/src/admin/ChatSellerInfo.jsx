import { useCallback, useEffect, useState } from 'react';
import { api, fmtDay } from '../api.js';

const usd = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The store behind the open chat, at a glance: balance, frozen amount, orders waiting to be
 * confirmed, how much it is short, plan, health, last deposit. Each quick button puts a shortcut
 * button on the next message (`onButton(action)`), nothing is sent until support presses Send.
 */
export default function ChatSellerInfo({ conversationId, onButton, onClose }) {
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setErr('');
    api(`/chat/admin/conversations/${conversationId}/seller-info`)
      .then((d) => setInfo(d))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !info) return <div className="csi-box csi-muted">Loading store details…</div>;
  if (err) return <div className="csi-box csi-err">{err} <button type="button" onClick={load}>Retry</button></div>;
  if (!info || info.guest) return <div className="csi-box csi-muted">This chat is not linked to a store.</div>;

  const statusTone = info.status === 'frozen' ? 'blue' : info.status === 'suspended' ? 'red' : 'green';

  return (
    <div className="csi-box">
      <div className="csi-head">
        <div className="csi-tags">
          <span className={`csi-tag ${info.tier === 'Diamond' ? 'violet' : ''}`}>{info.tier === 'Diamond' ? '💎 Diamond' : 'Basic'}</span>
          <span className={`csi-tag ${statusTone}`}>{info.status}</span>
          <span className={`csi-tag ${info.health < 50 ? 'red' : info.health < 80 ? 'amber' : ''}`}>Health {info.health}/100</span>
          {info.ownerMember && <span className="csi-tag">👤 {info.ownerMember}</span>}
          {info.isTest && <span className="csi-tag amber">Test account</span>}
        </div>
        <div className="csi-head-btns">
          <button type="button" onClick={load} title="Refresh" disabled={loading}>{loading ? '…' : '↻'}</button>
          <button type="button" onClick={onClose} title="Hide">✕</button>
        </div>
      </div>

      <div className="csi-tiles">
        <div><span>Available</span><b>{usd(info.balance)}</b></div>
        <div><span>Frozen amount</span><b className={info.frozenAmount > 0 ? 't-blue' : ''}>{usd(info.frozenAmount)}</b></div>
        <div><span>Waiting orders</span><b>{info.pendingOrders} · {usd(info.pendingAmount)}</b></div>
        <div><span>Short by</span><b className={info.shortBy > 0 ? 't-red' : 't-green'}>{info.shortBy > 0 ? usd(info.shortBy) : 'Nothing'}</b></div>
        <div><span>In processing</span><b>{usd(info.processingFund)}</b></div>
        <div><span>Last deposit</span><b>{info.lastDeposit ? `${usd(info.lastDeposit.amount)} · ${fmtDay(info.lastDeposit.at)}` : 'None yet'}</b></div>
      </div>

      {(info.freezeReason && info.status === 'frozen') || info.warning ? (
        <p className="csi-note">{info.status === 'frozen' && info.freezeReason ? `🧊 ${info.freezeReason}` : `⚠️ ${info.warning}`}</p>
      ) : null}

      <div className="csi-quick">
        {info.shortBy > 0 && (
          <button
            type="button"
            onClick={() =>
              onButton({ kind: 'page', key: 'deposit', amount: info.shortBy, label: `💰 Deposit $${info.shortBy.toLocaleString('en-US')}`, sub: 'Tap to open the deposit form with this amount' })
            }
          >
            💰 Ask to deposit {usd(info.shortBy)}
          </button>
        )}
        {info.tier !== 'Diamond' && (
          <button type="button" onClick={() => onButton({ kind: 'page', key: 'diamond', label: '💎 Upgrade to Diamond', sub: '35% profit and 72 hours to confirm orders' })}>
            💎 Diamond button
          </button>
        )}
        <button type="button" onClick={() => onButton({ kind: 'page', key: 'wallet', label: '👛 Open my wallet', sub: 'Balance, deposits and payouts' })}>
          👛 Wallet button
        </button>
      </div>

      {info.waitingOrders?.length > 0 && (
        <ul className="csi-orders">
          {info.waitingOrders.map((o) => (
            <li key={o._id}>
              <span className="csi-o-txt">
                <b>{o.orderNumber}</b> · {usd(o.value)}
                <small>{o.items} · {fmtDay(o.createdAt)}</small>
              </span>
              <button type="button" onClick={() => onButton({ kind: 'order', refId: o._id, label: `✅ Confirm order ${o.orderNumber}`, sub: 'Tap to open and confirm it' })}>
                Send button
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
