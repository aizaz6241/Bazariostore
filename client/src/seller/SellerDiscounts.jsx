import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useOutletContext } from 'react-router-dom';
import { sapi, fmtDay } from '../api.js';
import Ic from '../components/Icons.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
  { key: 'ended', label: 'Ended' },
];

const EMPTY = { code: '', type: 'percentage', value: '', minOrder: '', maxUses: '', expiresAt: '', active: true };

// one place that says what state a coupon is really in (an expired coupon used to show "Active")
function stateOf(c, now = Date.now()) {
  if (c.expiresAt && new Date(c.expiresAt).getTime() < now) return { key: 'ended', label: 'Expired', tone: 'slate' };
  if (c.maxUses && (c.usedCount || 0) >= c.maxUses) return { key: 'ended', label: 'Used up', tone: 'slate' };
  if (!c.active) return { key: 'paused', label: 'Paused', tone: 'amber' };
  return { key: 'active', label: 'Active', tone: 'green' };
}

const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const todayInput = () => new Date().toISOString().slice(0, 10);

export default function SellerDiscounts() {
  const { formatMoney } = useCurrency();
  const { isFrozen: restricted } = useOutletContext() || {};
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | coupon
  const [deleting, setDeleting] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [copied, setCopied] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(() => {
    sapi('/sellers/coupons')
      .then((d) => {
        setCoupons(Array.isArray(d) ? d : []);
        setLoadErr('');
      })
      .catch((e) => setLoadErr(e.message || 'Could not load your coupons'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const withState = useMemo(() => coupons.map((c) => ({ ...c, st: stateOf(c) })), [coupons]);
  const stats = useMemo(() => {
    const s = { active: 0, paused: 0, ended: 0, uses: 0 };
    withState.forEach((c) => { s[c.st.key]++; s.uses += c.usedCount || 0; });
    return s;
  }, [withState]);

  const shown = useMemo(() => {
    const term = q.trim().toUpperCase();
    return withState.filter((c) => (tab === 'all' || c.st.key === tab) && (!term || c.code.includes(term)));
  }, [withState, tab, q]);

  const copy = (code) => {
    try { navigator.clipboard?.writeText(code); } catch {}
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const toggle = async (c) => {
    if (restricted || busyId) return;
    setBusyId(c._id);
    try {
      const updated = await sapi(`/sellers/coupons/${c._id}`, { method: 'PUT', body: { active: !c.active } });
      setCoupons((prev) => prev.map((x) => (x._id === c._id ? { ...x, ...updated } : x)));
      setToast({ ok: true, text: `${c.code} is ${c.active ? 'paused' : 'active again'}.` });
    } catch (e) {
      setToast({ ok: false, text: e.message });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (c) => {
    setBusyId(c._id);
    try {
      await sapi(`/sellers/coupons/${c._id}`, { method: 'DELETE' });
      setCoupons((prev) => prev.filter((x) => x._id !== c._id));
      setToast({ ok: true, text: `${c.code} was deleted.` });
      setDeleting(null);
    } catch (e) {
      setToast({ ok: false, text: e.message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="sx">
      <header className="sx-head">
        <div>
          <p className="sx-eyebrow">Marketing</p>
          <h1>Discounts &amp; coupons</h1>
          <p className="sx-sub">Create coupon codes for your customers — a percentage or a fixed amount off, with an optional minimum order, usage limit and end date.</p>
        </div>
        <button type="button" className="sx-btn sx-btn-primary" disabled={restricted} onClick={() => setEditing('new')}>
          <Ic name="plus" size={16} /> New coupon
        </button>
      </header>

      {restricted && (
        <div className="sx-banner tone-red">
          <Ic name="lock" size={18} />
          <div>
            <b>Coupons are locked while your store is restricted</b>
            <p>You can see your coupons but not create, edit or pause them. <Link to="/seller/support">Contact support</Link></p>
          </div>
        </div>
      )}

      <section className="sx-stats">
        <div className="sx-stat"><span className="sx-stat-lbl"><i className="dot green" /> Active</span><b>{stats.active}</b><small>Customers can use these now</small></div>
        <div className="sx-stat"><span className="sx-stat-lbl"><i className="dot violet" /> Times used</span><b>{stats.uses}</b><small>Across all your coupons</small></div>
        <div className="sx-stat"><span className="sx-stat-lbl"><i className="dot amber" /> Paused</span><b>{stats.paused}</b><small>Switched off by you</small></div>
        <div className="sx-stat"><span className="sx-stat-lbl"><i className="dot slate" /> Ended</span><b>{stats.ended}</b><small>Expired or used up</small></div>
      </section>

      <div className="sx-toolbar">
        <div className="sx-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
              {t.label}
              <span className="sx-count">{t.key === 'all' ? coupons.length : stats[t.key]}</span>
            </button>
          ))}
        </div>
        <label className="sx-search">
          <Ic name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code" />
        </label>
      </div>

      {loading ? (
        <div className="sx-grid">{[0, 1, 2].map((i) => <div key={i} className="sx-skel" />)}</div>
      ) : loadErr ? (
        <div className="sx-card sx-empty">
          <span className="sx-empty-ico"><Ic name="alert" size={22} /></span>
          <b>Could not load your coupons</b>
          <p>{loadErr}</p>
          <button type="button" className="sx-btn sx-btn-ghost sm" onClick={() => { setLoading(true); load(); }}>Try again</button>
        </div>
      ) : shown.length === 0 ? (
        <div className="sx-card sx-empty">
          <span className="sx-empty-ico"><Ic name="gift" size={22} /></span>
          <b>{coupons.length ? 'No coupons here' : 'No coupons yet'}</b>
          <p>{coupons.length ? 'Try another tab or search.' : 'A coupon gives customers a reason to order today. Create your first one.'}</p>
          {!coupons.length && !restricted && <button type="button" className="sx-btn sx-btn-primary sm" onClick={() => setEditing('new')}><Ic name="plus" size={14} /> New coupon</button>}
        </div>
      ) : (
        <div className="sx-grid">
          {shown.map((c) => {
            const used = c.usedCount || 0;
            const pct = c.maxUses ? Math.min(100, (used / c.maxUses) * 100) : 0;
            return (
              <article key={c._id} className={`sx-coupon is-${c.st.key}`}>
                <div className="sx-cp-top">
                  <div className="sx-cp-offer">
                    <b>{c.type === 'percentage' ? `${c.value}%` : formatMoney(c.value)}</b>
                    <span>OFF</span>
                  </div>
                  <span className={`sx-tag tone-${c.st.tone}`}>{c.st.label}</span>
                </div>
                <button type="button" className="sx-cp-code" onClick={() => copy(c.code)} title="Copy code">
                  <span>{c.code}</span>
                  <Ic name={copied === c.code ? 'check' : 'copy'} size={14} />
                </button>
                <ul className="sx-cp-rules">
                  <li><Ic name="cart" size={14} /> {c.minOrder > 0 ? `Orders from ${formatMoney(c.minOrder)}` : 'Any order amount'}</li>
                  <li><Ic name="clock" size={14} /> {c.expiresAt ? `${new Date(c.expiresAt) < new Date() ? 'Ended' : 'Ends'} ${fmtDay(c.expiresAt)}` : 'No end date'}</li>
                  <li><Ic name="users" size={14} /> {c.maxUses ? `${used} of ${c.maxUses} used` : `${used} used · no limit`}</li>
                </ul>
                {c.maxUses ? <div className="sx-bar"><i style={{ width: `${pct}%` }} /></div> : null}
                <div className="sx-cp-foot">
                  {deleting === c._id ? (
                    <>
                      <span className="sx-confirm">Delete {c.code}?</span>
                      <button type="button" className="sx-btn sx-btn-ghost sm" onClick={() => setDeleting(null)} disabled={busyId === c._id}>Keep</button>
                      <button type="button" className="sx-btn sx-btn-danger sm" onClick={() => remove(c)} disabled={busyId === c._id}>{busyId === c._id ? 'Deleting…' : 'Delete'}</button>
                    </>
                  ) : (
                    <>
                      {c.st.key === 'ended' ? (
                        <span className="sx-ended">Ended · edit to reuse</span>
                      ) : (
                        <label className={`sx-switch ${restricted ? 'off' : ''}`}>
                          <input type="checkbox" checked={c.active} disabled={restricted || busyId === c._id} onChange={() => toggle(c)} />
                          <i />
                          <span>{c.active ? 'On' : 'Off'}</span>
                        </label>
                      )}
                      <div className="sx-cp-actions">
                        <button type="button" className="sx-icon-btn" disabled={restricted} onClick={() => setEditing(c)} aria-label={`Edit ${c.code}`}><Ic name="edit" size={16} /></button>
                        <button type="button" className="sx-icon-btn danger" disabled={restricted} onClick={() => setDeleting(c._id)} aria-label={`Delete ${c.code}`}><Ic name="trash" size={16} /></button>
                      </div>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editing && (
        <CouponDrawer
          coupon={editing === 'new' ? null : editing}
          formatMoney={formatMoney}
          onClose={() => setEditing(null)}
          onSaved={(text) => { setEditing(null); setToast({ ok: true, text }); load(); }}
        />
      )}

      {toast && (
        <div className={`sx-toast ${toast.ok ? 'ok' : 'err'}`} role="status">
          <Ic name={toast.ok ? 'checkCircle' : 'alert'} size={18} />
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Close"><Ic name="x" size={14} /></button>
        </div>
      )}
    </div>
  );
}

function CouponDrawer({ coupon, formatMoney, onClose, onSaved }) {
  const [shown, setShown] = useState(false);
  const [form, setForm] = useState(() =>
    coupon
      ? { code: coupon.code, type: coupon.type, value: String(coupon.value ?? ''), minOrder: coupon.minOrder ? String(coupon.minOrder) : '', maxUses: coupon.maxUses ? String(coupon.maxUses) : '', expiresAt: toDateInput(coupon.expiresAt), active: coupon.active }
      : EMPTY
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    const onKey = (e) => e.key === 'Escape' && !saving && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { cancelAnimationFrame(t); document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose, saving]);

  const suggest = () => {
    const words = ['SAVE', 'DEAL', 'FLASH', 'VIP', 'OFFER', 'WELCOME'];
    const n = form.value ? Math.round(Number(form.value)) : 10;
    const tail = Math.random().toString(36).slice(2, 4).toUpperCase();
    setForm((f) => ({ ...f, code: `${words[Math.floor(Math.random() * words.length)]}${n}${tail}`.slice(0, 20) }));
  };

  const value = Number(form.value) || 0;
  const min = Number(form.minOrder) || 0;

  const save = async (e) => {
    e.preventDefault();
    const code = form.code.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,20}$/.test(code)) return setErr('Code: 3–20 letters or numbers, no spaces.');
    if (!(value > 0)) return setErr('Enter a discount value above 0.');
    if (form.type === 'percentage' && (value < 1 || value > 90)) return setErr('A percentage must be between 1% and 90%.');
    if (form.type === 'flat' && min > 0 && value >= min) return setErr('A fixed discount must be smaller than the minimum order.');
    if (form.expiresAt && form.expiresAt < todayInput()) return setErr('The end date is already in the past.');
    setSaving(true);
    setErr('');
    try {
      const body = { code, type: form.type, value, minOrder: min, maxUses: form.maxUses ? Number(form.maxUses) : null, expiresAt: form.expiresAt || null, active: form.active };
      if (coupon) await sapi(`/sellers/coupons/${coupon._id}`, { method: 'PUT', body });
      else await sapi('/sellers/coupons', { method: 'POST', body });
      onSaved(coupon ? `${code} was updated.` : `${code} is ready to share.`);
    } catch (er) {
      setErr(er.message || 'Could not save the coupon');
      setSaving(false);
    }
  };

  return createPortal(
    <div className="sx-drawer-root" role="dialog" aria-modal="true" aria-label={coupon ? 'Edit coupon' : 'New coupon'}>
      <button type="button" className={`sx-drawer-bg ${shown ? 'on' : ''}`} onClick={() => !saving && onClose()} aria-label="Close" />
      <form className={`sx-drawer ${shown ? 'on' : ''}`} onSubmit={save} noValidate>
        <div className="sx-dr-head">
          <div>
            <p className="sx-eyebrow">{coupon ? 'Edit coupon' : 'New coupon'}</p>
            <h2>{coupon ? coupon.code : 'Create a coupon'}</h2>
          </div>
          <button type="button" className="sx-icon-btn" onClick={onClose} disabled={saving} aria-label="Close"><Ic name="x" size={18} /></button>
        </div>

        <div className="sx-dr-body">
          <div className="sx-preview">
            <div>
              <span>Your customers see</span>
              <b>{form.code.trim().toUpperCase() || 'YOURCODE'}</b>
              <p>{value > 0 ? (form.type === 'percentage' ? `${value}% off` : `${formatMoney(value)} off`) : 'Discount'} {min > 0 ? `on orders from ${formatMoney(min)}` : 'on any order'}{form.expiresAt ? ` · until ${fmtDay(form.expiresAt)}` : ''}</p>
            </div>
            <em>{value > 0 ? (form.type === 'percentage' ? `${value}%` : formatMoney(value)) : '—'}<small>OFF</small></em>
          </div>

          <section className="sx-sec">
            <label className="sx-field">
              <span>Coupon code</span>
              <div className="sx-input-row">
                <input className="sx-input mono" value={form.code} maxLength={20} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))} placeholder="e.g. WELCOME10" autoFocus={!coupon} />
                <button type="button" className="sx-btn sx-btn-ghost" onClick={suggest}><Ic name="sparkle" size={14} /> Suggest</button>
              </div>
              <small>Letters and numbers only. Customers type this at checkout.</small>
            </label>

            <div className="sx-field">
              <span>Discount type</span>
              <div className="sx-seg">
                <button type="button" className={form.type === 'percentage' ? 'on' : ''} onClick={() => setForm((f) => ({ ...f, type: 'percentage' }))}>Percentage %</button>
                <button type="button" className={form.type === 'flat' ? 'on' : ''} onClick={() => setForm((f) => ({ ...f, type: 'flat' }))}>Fixed amount $</button>
              </div>
            </div>

            <div className="sx-row">
              <label className="sx-field">
                <span>{form.type === 'percentage' ? 'Discount (%)' : 'Discount (US$)'}</span>
                <div className="sx-affix"><i>{form.type === 'percentage' ? '%' : '$'}</i><input className="sx-input" type="number" inputMode="decimal" min="1" max={form.type === 'percentage' ? 90 : undefined} step="any" value={form.value} onChange={set('value')} placeholder={form.type === 'percentage' ? '10' : '5'} /></div>
                {form.type === 'flat' && value > 0 && <small>Customer sees {formatMoney(value)}</small>}
              </label>
              <label className="sx-field">
                <span>Minimum order (US$)</span>
                <div className="sx-affix"><i>$</i><input className="sx-input" type="number" inputMode="decimal" min="0" step="any" value={form.minOrder} onChange={set('minOrder')} placeholder="No minimum" /></div>
                {min > 0 && <small>{formatMoney(min)} in the customer’s currency</small>}
              </label>
            </div>

            <div className="sx-row">
              <label className="sx-field">
                <span>Usage limit</span>
                <input className="sx-input" type="number" min={coupon?.usedCount || 1} step="1" value={form.maxUses} onChange={set('maxUses')} placeholder="No limit" />
                <small>{coupon?.usedCount ? `Used ${coupon.usedCount} times so far.` : 'Total uses across all customers.'}</small>
              </label>
              <label className="sx-field">
                <span>End date</span>
                <input className="sx-input" type="date" min={todayInput()} value={form.expiresAt} onChange={set('expiresAt')} />
                <small>{form.expiresAt ? 'Works until the end of that day.' : 'Leave empty for no end date.'}</small>
              </label>
            </div>

            <label className="sx-toggle-row">
              <input type="checkbox" checked={form.active} onChange={set('active')} />
              <span><b>{form.active ? 'Coupon is on' : 'Coupon is off'}</b><small>{form.active ? 'Customers can use it right away.' : 'Saved but customers cannot use it yet.'}</small></span>
            </label>
          </section>

          {err && <p className="sx-err"><Ic name="alert" size={14} /> {err}</p>}
        </div>

        <div className="sx-dr-foot">
          <button type="button" className="sx-btn sx-btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="sx-btn sx-btn-primary" disabled={saving}>{saving ? 'Saving…' : coupon ? 'Save changes' : 'Create coupon'}</button>
        </div>
      </form>
    </div>,
    document.body
  );
}
