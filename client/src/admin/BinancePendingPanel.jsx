import { useCallback, useEffect, useState } from 'react';
import { api, fmtDate, money } from '../api.js';
import Ic from '../components/Icons.jsx';
import { getSocket } from '../socket.js';

/**
 * Top of the admin Wallet page: direct "Add funds" lines that were saved with
 * "Not received on Binance yet — I will add INR / USDT later". Each line stays here until its
 * INR + USDT are entered; then the team portal finance divides the USDT as usual.
 * Server: GET / POST /api/sellers/wallet/binance-pending.
 */
function PendingRow({ item, onSaved }) {
  const [inr, setInr] = useState(item.inrAmount > 0 ? String(item.inrAmount) : '');
  const [usdt, setUsdt] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const real = Math.max(0, Number(item.amount || 0) - Number(item.helpingAmount || 0));
  const u = parseFloat(usdt) || 0;
  const i = parseFloat(inr) || 0;
  const rate = u > 0 && i > 0 ? (i / u).toFixed(2) : '';

  const save = async () => {
    setMsg(null);
    if (!(i > 0)) return setMsg({ ok: false, text: 'Enter the INR received.' });
    if (!(u > 0)) return setMsg({ ok: false, text: 'Enter the USDT received on Binance.' });
    const r = i / u;
    if (r < 40 || r > 200) return setMsg({ ok: false, text: `That is ₹${r.toFixed(2)} per USDT — looks wrong. Please check both numbers.` });
    if (real > 0 && Math.abs(u - real) / real > 0.25 &&
      !window.confirm(`₮${u} USDT is quite different from the $${real.toFixed(2)} real money added to the wallet. Save anyway?`)) return;
    setBusy(true);
    try {
      const res = await api(`/sellers/wallet/binance-pending/${item._id}`, {
        method: 'POST',
        body: { usdtAmount: u, inrAmount: i },
      });
      setMsg({ ok: true, text: res.message || 'Saved ✓' });
      setTimeout(onSaved, 900);
    } catch (e) {
      setMsg({ ok: false, text: e.message || 'Could not save. Please try again.' });
      if (e.status === 409) setTimeout(onSaved, 1500);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bp-row">
      <div className="bp-info">
        <b>{item.storeName || 'Store'}</b>
        <small>
          Wallet credit <span className="bp-amt">{money(item.amount || 0)}</span>
          {item.helpingAmount > 0 ? ` • helping ${money(item.helpingAmount)} • real ${money(real)}` : ''}
        </small>
        <small>
          {fmtDate(item.processedAt || item.createdAt)} • by {item.processedBy || 'admin'}
          {item.transactionRef ? ` • ref ${item.transactionRef}` : ''}
        </small>
      </div>
      <div className="bp-form">
        <label>
          🇮🇳 INR received (₹)
          <input type="number" min="0" step="any" inputMode="decimal" placeholder="e.g. 5000" value={inr} onChange={(e) => setInr(e.target.value)} />
        </label>
        <label>
          💎 USDT received on Binance
          <input type="number" min="0" step="any" inputMode="decimal" placeholder="e.g. 52.40" value={usdt} onChange={(e) => setUsdt(e.target.value)} />
        </label>
        <button type="button" className="bp-save" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {rate && <span className="bp-rate">Rate: ₹{rate} / USDT</span>}
        {msg && <p className={`bp-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</p>}
      </div>
    </div>
  );
}

export default function BinancePendingPanel({ refreshKey = 0 }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(true);

  const load = useCallback(() => {
    api('/sellers/wallet/binance-pending')
      .then((d) => setItems(Array.isArray(d?.items) ? d.items : []))
      .catch(() => {}); // an older server without this route: nothing is shown
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    socket.on('withdrawal:new', load);
    socket.on('withdrawal:update', load);
    return () => {
      socket.off('withdrawal:new', load);
      socket.off('withdrawal:update', load);
    };
  }, [load]);

  if (!items.length) return null;
  const total = items.reduce((t, x) => t + Math.max(0, Number(x.amount || 0) - Number(x.helpingAmount || 0)), 0);

  return (
    <section className={`bp-panel ${open ? 'open' : ''}`} aria-label="Binance amounts pending">
      <button type="button" className="bp-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="bp-head-ic" aria-hidden="true">⏳</span>
        <span>
          <b>Binance amounts pending</b>
          <small>Funds added to seller wallets — INR / USDT still to be entered ({money(total)} real money). Finance divides each one once it is saved.</small>
        </span>
        <span className="bp-count">{items.length}</span>
        <span className="bp-chev"><Ic name="chevDown" size={18} /></span>
      </button>
      {open && (
        <div className="bp-list">
          {items.map((it) => (
            <PendingRow key={it._id} item={it} onSaved={load} />
          ))}
        </div>
      )}
    </section>
  );
}
