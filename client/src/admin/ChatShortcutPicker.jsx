import { useEffect, useRef, useState } from 'react';
import { api, fmtDay } from '../api.js';

/**
 * Support picks a button to send in a store's chat: a page of the seller panel, one of the
 * store's orders, or one of its products. `onPick({ kind, key|refId, label, sub })`.
 */
export default function ChatShortcutPicker({ conversationId, storeName, onPick, onClose }) {
  const [tab, setTab] = useState('page');
  const [pages, setPages] = useState([]);
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [depAmount, setDepAmount] = useState('');
  const seq = useRef(0);
  const depNum = Math.round((Number(depAmount) || 0) * 100) / 100;
  const depOk = depNum >= 1 && depNum <= 1000000;

  useEffect(() => {
    api('/chat/admin/shortcut-pages')
      .then((d) => setPages(Array.isArray(d) ? d : []))
      .catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    if (tab === 'page') return undefined;
    const my = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      api(`/chat/admin/conversations/${conversationId}/shortcuts?kind=${tab}&q=${encodeURIComponent(q.trim())}`)
        .then((d) => my === seq.current && setItems(Array.isArray(d) ? d : []))
        .catch((e) => my === seq.current && setErr(e.message))
        .finally(() => my === seq.current && setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [tab, q, conversationId]);

  const switchTab = (t) => {
    setTab(t);
    setQ('');
    setItems([]);
    setErr('');
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal-box csp-box" onClick={(e) => e.stopPropagation()}>
        <div className="csp-head">
          <div>
            <h3>🔗 Send a shortcut button</h3>
            <p>{storeName ? <>To <b>{storeName}</b> — </> : null}the seller taps it and lands right there.</p>
          </div>
          <button type="button" className="csp-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="csp-tabs" role="tablist">
          {[
            { id: 'page', label: '📄 Pages' },
            { id: 'order', label: '🧾 An order' },
            { id: 'product', label: '📦 A product' },
          ].map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => switchTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {err && <div className="csp-err">{err}</div>}

        {tab === 'page' ? (
          <div className="csp-grid">
            {pages.map((p) => (
              <button key={p.key} type="button" className="csp-page" onClick={() => onPick({ kind: 'page', key: p.key, label: p.label, sub: p.sub })}>
                <b>{p.label}</b>
                <span>{p.sub}</span>
              </button>
            ))}
            {pages.some((p) => p.key === 'deposit') && (
              <form
                className="csp-dep"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!depOk) return;
                  onPick({ kind: 'page', key: 'deposit', amount: depNum, label: `💰 Deposit $${depNum.toLocaleString('en-US')}`, sub: 'Tap to open the deposit form with this amount' });
                }}
              >
                <span>💰 Deposit with an amount</span>
                <div className="csp-dep-row">
                  <em>$</em>
                  <input type="number" min="1" max="1000000" step="0.01" inputMode="decimal" value={depAmount} onChange={(e) => setDepAmount(e.target.value)} placeholder="e.g. 250" />
                  <button type="submit" disabled={!depOk}>Add button</button>
                </div>
                <small>The amount is filled in on the seller's deposit form.</small>
              </form>
            )}
          </div>
        ) : (
          <>
            <input
              autoFocus
              type="search"
              className="csp-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tab === 'order' ? 'Order number (e.g. 182), product or customer name…' : 'Product name, SKU or brand…'}
            />
            <ul className="csp-list">
              {loading && !items.length && <li className="csp-muted">Searching…</li>}
              {!loading && !items.length && <li className="csp-muted">{q ? 'Nothing found in this store.' : 'No items yet.'}</li>}
              {items.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onPick({
                        kind: tab,
                        refId: it.id,
                        label: tab === 'order' ? `🧾 Open order ${it.title}` : `📦 ${it.title}`,
                        sub: tab === 'order' ? 'Tap to see this order' : 'Tap to open it in My Store Products',
                      })
                    }
                  >
                    {it.image ? <img src={it.image} alt="" /> : <span className="csp-ico">{tab === 'order' ? '🧾' : '📦'}</span>}
                    <span className="csp-txt">
                      <b>{it.title}</b>
                      <small>
                        {it.sub}
                        {it.date ? ` · ${fmtDay(it.date)}` : ''}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
