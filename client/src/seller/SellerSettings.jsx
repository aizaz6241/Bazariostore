import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { sapi } from '../api.js';
import Ic from '../components/Icons.jsx';
import SellerAppModal from '../components/SellerAppModal.jsx';
import VerifiedStoreBadge from '../components/VerifiedStoreBadge.jsx';

const INDIAN_BANKS = [
  'State Bank of India (SBI)', 'HDFC Bank', 'ICICI Bank', 'Punjab National Bank (PNB)', 'Axis Bank', 'Bank of Baroda (BOB)',
  'Kotak Mahindra Bank', 'Canara Bank', 'Union Bank of India', 'IndusInd Bank', 'Bank of India (BOI)', 'Central Bank of India',
  'IDBI Bank', 'Indian Bank', 'Yes Bank', 'IDFC FIRST Bank', 'Federal Bank', 'UCO Bank', 'Indian Overseas Bank',
  'Punjab & Sind Bank', 'Paytm Payments Bank', 'Airtel Payments Bank', 'Jio Payments Bank', 'Other Indian Scheduled Bank',
];

const METHODS = [
  {
    key: 'bankTransfer', icon: 'banknote', name: 'Bank transfer', sub: 'NEFT / IMPS / RTGS to an Indian bank account',
    fields: [
      { k: 'accountTitle', label: 'Account holder name', req: true, ph: 'As written in your passbook' },
      { k: 'bankName', label: 'Bank', req: true, options: INDIAN_BANKS },
      { k: 'accountNumber', label: 'Account number', req: true, ph: '01234567890123', mode: 'numeric' },
      { k: 'ifscCode', label: 'IFSC code', req: true, ph: 'SBIN0001234', upper: true, max: 11 },
      { k: 'branchName', label: 'Branch (optional)', ph: 'e.g. Bandra West' },
      { k: 'accountType', label: 'Account type', options: ['Savings', 'Current'] },
    ],
    summary: (m) => `${m.bankName || 'Bank'} · ••••${String(m.accountNumber || '').slice(-4)}`,
  },
  {
    key: 'upi', icon: 'drop', name: 'UPI', sub: 'Instant payout to your UPI ID',
    fields: [
      { k: 'upiId', label: 'UPI ID', req: true, ph: 'name@okhdfcbank' },
      { k: 'holderName', label: 'Name on UPI', req: true, ph: 'Registered name' },
    ],
    summary: (m) => m.upiId,
  },
  {
    key: 'paytm', icon: 'phone', name: 'Paytm', sub: 'Paytm wallet or Payments Bank',
    fields: [
      { k: 'phone', label: 'Paytm mobile number', req: true, ph: '9876543210', mode: 'tel' },
      { k: 'accountName', label: 'Account name (optional)' },
    ],
    summary: (m) => m.phone,
  },
  {
    key: 'gpay', icon: 'card', name: 'Google Pay', sub: 'GPay mobile number or UPI ID',
    fields: [
      { k: 'phone', label: 'Mobile number', ph: '9876543210', mode: 'tel' },
      { k: 'upiId', label: 'or UPI ID', ph: 'name@okaxis' },
      { k: 'accountName', label: 'Account name (optional)' },
    ],
    summary: (m) => m.upiId || m.phone,
  },
  {
    key: 'phonepe', icon: 'phone', name: 'PhonePe', sub: 'PhonePe mobile number or UPI ID',
    fields: [
      { k: 'phone', label: 'Mobile number', ph: '9876543210', mode: 'tel' },
      { k: 'upiId', label: 'or UPI ID', ph: 'name@ybl' },
      { k: 'accountName', label: 'Account name (optional)' },
    ],
    summary: (m) => m.upiId || m.phone,
  },
  {
    key: 'usdt', icon: 'wallet', name: 'USDT', sub: 'Crypto payout to your wallet address',
    fields: [
      { k: 'network', label: 'Network', options: ['TRC-20', 'BEP-20', 'ERC-20'] },
      { k: 'walletAddress', label: 'Wallet address', req: true, ph: 'T… (TRC-20) or 0x… (BEP-20 / ERC-20)', mono: true },
    ],
    summary: (m) => `${m.network || 'TRC-20'} · ${String(m.walletAddress || '').slice(0, 6)}…${String(m.walletAddress || '').slice(-4)}`,
  },
];

const SECTIONS = [
  { key: 'profile', icon: 'home', label: 'Store profile' },
  { key: 'payouts', icon: 'banknote', label: 'Payout methods' },
  { key: 'address', icon: 'mapPin', label: 'Business address' },
  { key: 'security', icon: 'lock', label: 'Password & security' },
  { key: 'account', icon: 'shield', label: 'Account & plan' },
];

function methodsFrom(seller) {
  const wm = seller?.withdrawalMethods || {};
  const legacy = seller?.bankDetails || {};
  const bt = wm.bankTransfer || {};
  return {
    bankTransfer: {
      enabled: bt.enabled !== undefined ? Boolean(bt.enabled) : Boolean(legacy.accountNumber),
      accountTitle: bt.accountTitle || legacy.accountTitle || '',
      accountNumber: bt.accountNumber || legacy.accountNumber || '',
      bankName: bt.bankName || legacy.bankName || INDIAN_BANKS[0],
      ifscCode: bt.ifscCode || legacy.iban || '',
      branchName: bt.branchName || '',
      accountType: bt.accountType || 'Savings',
    },
    upi: { enabled: Boolean(wm.upi?.enabled), upiId: wm.upi?.upiId || '', holderName: wm.upi?.holderName || '' },
    paytm: { enabled: Boolean(wm.paytm?.enabled), phone: wm.paytm?.phone || '', accountName: wm.paytm?.accountName || '' },
    gpay: { enabled: Boolean(wm.gpay?.enabled), phone: wm.gpay?.phone || '', upiId: wm.gpay?.upiId || '', accountName: wm.gpay?.accountName || '' },
    phonepe: { enabled: Boolean(wm.phonepe?.enabled), phone: wm.phonepe?.phone || '', upiId: wm.phonepe?.upiId || '', accountName: wm.phonepe?.accountName || '' },
    usdt: { enabled: Boolean(wm.usdt?.enabled), walletAddress: wm.usdt?.walletAddress || '', network: wm.usdt?.network || 'TRC-20' },
  };
}

// the same checks the server makes, so mistakes show before saving
function methodProblem(key, m) {
  if (!m.enabled) return '';
  if (key === 'bankTransfer') {
    if (!m.accountTitle.trim()) return 'Enter the account holder name.';
    if (!/^\d{6,20}$/.test(m.accountNumber.replace(/[\s-]/g, ''))) return 'Account number should be 6–20 digits.';
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(m.ifscCode.trim().toUpperCase())) return 'IFSC code looks wrong (example: SBIN0001234).';
  }
  if (key === 'upi' && (!/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(m.upiId.trim()) || !m.holderName.trim())) return 'Enter a valid UPI ID (like name@okhdfcbank) and the name on it.';
  if (['paytm', 'gpay', 'phonepe'].includes(key) && !(/^\+?\d[\d\s]{8,14}$/.test(m.phone.trim()) || /@/.test(m.upiId || ''))) return key === 'paytm' ? 'Enter a valid mobile number.' : 'Enter a mobile number or UPI ID.';
  if (key === 'usdt') {
    const a = m.walletAddress.trim();
    if (m.network === 'TRC-20' ? !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a) : !/^0x[a-fA-F0-9]{40}$/.test(a)) return m.network === 'TRC-20' ? 'A TRC-20 address starts with T and has 34 characters.' : 'A BEP-20 / ERC-20 address starts with 0x and has 42 characters.';
  }
  return '';
}

function saveLocal(updated) {
  try { localStorage.setItem('ng_seller', JSON.stringify(updated)); } catch {}
}

export default function SellerSettings() {
  const { seller, setSeller, isFrozen: restricted } = useOutletContext() || {};
  const [section, setSection] = useState('profile');
  const [toast, setToast] = useState(null);
  const [appModalOpen, setAppModalOpen] = useState(false);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const save = async (body) => {
    const updated = await sapi('/sellers/me', { method: 'PUT', body });
    setSeller?.(updated);
    saveLocal(updated);
    return updated;
  };

  return (
    <div className="st">
      <header className="st-head">
        <div>
          <p className="st-eyebrow">Settings</p>
          <h1>Store settings</h1>
          <p className="st-sub">Your store profile, where your money is paid out, your address and your password.</p>
        </div>
      </header>

      {restricted && (
        <div className="st-banner tone-red">
          <Ic name="lock" size={18} />
          <div>
            <b>Settings are locked while your store is restricted</b>
            <p>You cannot change your store or payout details until the restriction is lifted. You can still change your password. <Link to="/seller/support">Contact support</Link></p>
          </div>
        </div>
      )}

      <div className="st-layout">
        <nav className="st-nav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button key={s.key} type="button" className={section === s.key ? 'on' : ''} onClick={() => setSection(s.key)}>
              <Ic name={s.icon} size={17} /> <span>{s.label}</span>
            </button>
          ))}
        </nav>

        <div className="st-main">
          {section === 'profile' && <ProfileSection seller={seller} restricted={restricted} save={save} setToast={setToast} />}
          {section === 'payouts' && <PayoutSection seller={seller} restricted={restricted} save={save} setToast={setToast} />}
          {section === 'address' && <AddressSection seller={seller} restricted={restricted} save={save} setToast={setToast} />}
          {section === 'security' && <SecuritySection setToast={setToast} />}
          {section === 'account' && <AccountSection seller={seller} onApp={() => setAppModalOpen(true)} />}
        </div>
      </div>

      <SellerAppModal isOpen={appModalOpen} onClose={() => setAppModalOpen(false)} />

      {toast && (
        <div className={`st-toast ${toast.ok ? 'ok' : 'err'}`} role="status">
          <Ic name={toast.ok ? 'checkCircle' : 'alert'} size={18} />
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Close"><Ic name="x" size={14} /></button>
        </div>
      )}
    </div>
  );
}

function Card({ title, sub, children, foot }) {
  return (
    <section className="st-card">
      <div className="st-card-head">
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      <div className="st-card-body">{children}</div>
      {foot && <div className="st-card-foot">{foot}</div>}
    </section>
  );
}

function ProfileSection({ seller, restricted, save, setToast }) {
  const initial = useMemo(() => ({ storeName: seller?.storeName || '', ownerName: seller?.ownerName || '', phone: seller?.phone || '', description: seller?.description || '', logo: seller?.logo || '' }), [seller]);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  useEffect(() => setForm(initial), [initial]);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { setErr('The picture is too big (max 4 MB).'); return; }
    setUploading(true);
    setErr('');
    try {
      const fd = new FormData();
      fd.append('files', file);
      const res = await sapi('/uploads', { method: 'POST', body: fd });
      const url = (Array.isArray(res) ? res[0] : res)?.url;
      if (!url) throw new Error('No picture link came back');
      setForm((f) => ({ ...f, logo: url }));
    } catch (er) {
      setErr(`Upload failed: ${er.message}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (form.storeName.trim().length < 2) return setErr('Store name must be at least 2 characters.');
    if (form.ownerName.trim().length < 2) return setErr('Owner name must be at least 2 characters.');
    setSaving(true);
    setErr('');
    try {
      await save({ storeName: form.storeName.trim(), ownerName: form.ownerName.trim(), phone: form.phone.trim(), description: form.description.trim(), logo: form.logo });
      setToast({ ok: true, text: 'Store profile saved.' });
    } catch (er) {
      setErr(er.message);
    } finally {
      setSaving(false);
    }
  };

  const initials = (form.storeName || 'S').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  return (
    <form onSubmit={submit}>
      <Card
        title="Store profile"
        sub="How your store appears to customers on Bazario."
        foot={<SaveBar dirty={dirty} saving={saving || uploading} disabled={restricted} onReset={() => { setForm(initial); setErr(''); }} label="Save profile" err={err} />}
      >
        <div className="st-logo-row">
          <div className="st-logo">{form.logo ? <img src={form.logo} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <span>{initials}</span>}</div>
          <div className="st-logo-txt">
            <div className="st-store-line"><b>{form.storeName || 'Your store'}</b>{Boolean(seller?.verified) && <VerifiedStoreBadge variant="icon" size={15} />}</div>
            <small>Square picture, at least 200 × 200 px. PNG, JPG or WebP.</small>
            <div className="st-logo-btns">
              <button type="button" className="st-btn st-btn-ghost sm" disabled={restricted || uploading} onClick={() => fileRef.current?.click()}><Ic name="image" size={14} /> {uploading ? 'Uploading…' : form.logo ? 'Change logo' : 'Upload logo'}</button>
              {form.logo && <button type="button" className="st-btn st-btn-text sm" disabled={restricted} onClick={() => setForm((f) => ({ ...f, logo: '' }))}>Remove</button>}
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={upload} />
          </div>
        </div>

        <div className="st-grid">
          <Field label="Store name" req hint="Shown on your products and receipts. Must be unique on Bazario.">
            <input className="st-input" value={form.storeName} maxLength={60} onChange={set('storeName')} disabled={restricted} />
          </Field>
          <Field label="Owner name" req hint="Used for account verification. Customers do not see it.">
            <input className="st-input" value={form.ownerName} maxLength={80} onChange={set('ownerName')} disabled={restricted} />
          </Field>
          <Field label="Contact phone / WhatsApp" hint="For the Bazario team to reach you.">
            <input className="st-input" type="tel" value={form.phone} maxLength={30} onChange={set('phone')} placeholder="+91 98765 43210" disabled={restricted} />
          </Field>
          <Field label="Login email" hint="To change your email, contact support.">
            <input className="st-input" value={seller?.email || ''} disabled readOnly />
          </Field>
          <Field label="About your store" full hint={`${form.description.length}/1000`}>
            <textarea className="st-input" rows={4} maxLength={1000} value={form.description} onChange={set('description')} placeholder="What you sell and why customers can trust your store." disabled={restricted} />
          </Field>
        </div>
      </Card>
    </form>
  );
}

function PayoutSection({ seller, restricted, save, setToast }) {
  const initial = useMemo(() => methodsFrom(seller), [seller]);
  const [wm, setWm] = useState(initial);
  const [open, setOpen] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [askPw, setAskPw] = useState(false);
  const [pw, setPw] = useState('');
  const [pwErr, setPwErr] = useState('');
  useEffect(() => setWm(initial), [initial]);
  const dirty = JSON.stringify(wm) !== JSON.stringify(initial);
  const enabledCount = Object.values(wm).filter((m) => m.enabled).length;

  const setField = (key, k, v) => setWm((p) => ({ ...p, [key]: { ...p[key], [k]: v } }));
  const toggle = (key) => {
    setWm((p) => ({ ...p, [key]: { ...p[key], enabled: !p[key].enabled } }));
    if (!wm[key].enabled) setOpen(key);
  };

  const submit = async (password) => {
    for (const m of METHODS) {
      // details saved earlier and not touched now are not re-checked (same as the server)
      if (JSON.stringify(wm[m.key]) === JSON.stringify(initial[m.key])) continue;
      const p = methodProblem(m.key, wm[m.key]);
      if (p) { setOpen(m.key); setErr(`${m.name}: ${p}`); return; }
    }
    if (!password) { setErr(''); setPw(''); setPwErr(''); setAskPw(true); return; }
    setSaving(true);
    try {
      await save({ withdrawalMethods: wm, currentPassword: password });
      setAskPw(false);
      setPw('');
      setOpen(null);
      setErr('');
      setToast({ ok: true, text: 'Payout methods saved. The Bazario team has been told about the change.' });
    } catch (er) {
      if (/password/i.test(er.message)) setPwErr(er.message);
      else { setAskPw(false); setErr(er.message); }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card
        title="Payout methods"
        sub="Where your withdrawals are sent. Switch on the ones you use — you pick one each time you withdraw."
        foot={<SaveBar dirty={dirty} saving={saving} disabled={restricted} onReset={() => { setWm(initial); setErr(''); }} label="Save payout methods" err={err} onSave={() => submit('')} />}
      >
        <div className="st-note"><Ic name="shield" size={16} /><p>For your safety, changing payout details asks for your password, and the Bazario team is notified.</p></div>
        {enabledCount === 0 && <p className="st-warn"><Ic name="alert" size={14} /> No payout method is on yet — add one before your first withdrawal.</p>}
        <ul className="st-methods">
          {METHODS.map((m) => {
            const v = wm[m.key];
            const isOpen = open === m.key && v.enabled;
            const problem = v.enabled ? methodProblem(m.key, v) : '';
            return (
              <li key={m.key} className={`st-method ${v.enabled ? 'on' : ''} ${isOpen ? 'open' : ''}`}>
                <div className="st-m-head">
                  <span className="st-m-ico"><Ic name={m.icon} size={18} /></span>
                  <button type="button" className="st-m-txt" onClick={() => v.enabled && setOpen(isOpen ? null : m.key)} disabled={!v.enabled}>
                    <b>{m.name}</b>
                    <small>{v.enabled ? (problem ? <span className="t-red">{problem}</span> : m.summary(v)) : m.sub}</small>
                  </button>
                  {v.enabled && !restricted && (
                    <button type="button" className="st-btn st-btn-text sm" onClick={() => setOpen(isOpen ? null : m.key)}>{isOpen ? 'Done' : 'Edit'}</button>
                  )}
                  <label className="st-switch">
                    <input type="checkbox" checked={v.enabled} disabled={restricted} onChange={() => toggle(m.key)} aria-label={`${m.name} on or off`} />
                    <i />
                  </label>
                </div>
                {isOpen && (
                  <div className="st-grid st-m-fields">
                    {m.fields.map((f) => (
                      <Field key={f.k} label={f.label} req={f.req} full={f.k === 'walletAddress'}>
                        {f.options ? (
                          <select className="st-input" value={v[f.k]} disabled={restricted} onChange={(e) => setField(m.key, f.k, e.target.value)}>
                            {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input
                            className={`st-input ${f.mono || f.upper ? 'mono' : ''}`}
                            value={v[f.k]}
                            inputMode={f.mode === 'numeric' ? 'numeric' : f.mode === 'tel' ? 'tel' : undefined}
                            maxLength={f.max || 120}
                            placeholder={f.ph}
                            disabled={restricted}
                            onChange={(e) => setField(m.key, f.k, f.upper ? e.target.value.toUpperCase() : e.target.value)}
                          />
                        )}
                      </Field>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {askPw && (
        <div className="st-modal-root" role="dialog" aria-modal="true" aria-label="Confirm with your password">
          <button type="button" className="st-modal-bg" onClick={() => !saving && setAskPw(false)} aria-label="Close" />
          <form className="st-modal" onSubmit={(e) => { e.preventDefault(); if (pw) submit(pw); }}>
            <span className="st-modal-ico"><Ic name="lock" size={20} /></span>
            <h3>Confirm it’s you</h3>
            <p>Enter your account password to change where your payouts are sent.</p>
            <input className="st-input" type="password" autoFocus autoComplete="current-password" value={pw} onChange={(e) => { setPw(e.target.value); setPwErr(''); }} placeholder="Your password" />
            {pwErr && <p className="st-err">{pwErr}</p>}
            <div className="st-modal-btns">
              <button type="button" className="st-btn st-btn-ghost" onClick={() => setAskPw(false)} disabled={saving}>Cancel</button>
              <button type="submit" className="st-btn st-btn-dark" disabled={saving || !pw}>{saving ? 'Saving…' : 'Confirm & save'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function AddressSection({ seller, restricted, save, setToast }) {
  const initial = useMemo(() => ({
    street: seller?.address?.street || '', city: seller?.address?.city || '', state: seller?.address?.state || '',
    postalCode: seller?.address?.postalCode || '', country: seller?.address?.country || '',
  }), [seller]);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => setForm(initial), [initial]);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await save({ address: form });
      setToast({ ok: true, text: 'Business address saved.' });
    } catch (er) {
      setErr(er.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <Card title="Business address" sub="Your registered business address. Customers do not see it." foot={<SaveBar dirty={dirty} saving={saving} disabled={restricted} onReset={() => setForm(initial)} label="Save address" err={err} />}>
        <div className="st-grid">
          <Field label="Street address" full><input className="st-input" value={form.street} maxLength={150} onChange={set('street')} placeholder="House / shop no., street, area" disabled={restricted} /></Field>
          <Field label="City"><input className="st-input" value={form.city} maxLength={150} onChange={set('city')} disabled={restricted} /></Field>
          <Field label="State / province"><input className="st-input" value={form.state} maxLength={150} onChange={set('state')} disabled={restricted} /></Field>
          <Field label="Postal code"><input className="st-input" value={form.postalCode} maxLength={20} onChange={set('postalCode')} disabled={restricted} /></Field>
          <Field label="Country"><input className="st-input" value={form.country} maxLength={150} onChange={set('country')} placeholder="India" disabled={restricted} /></Field>
        </div>
      </Card>
    </form>
  );
}

function SecuritySection({ setToast }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErr(''); };
  const np = form.newPassword;
  const strength = !np ? 0 : [np.length >= 8, /[A-Z]/.test(np) && /[a-z]/.test(np), /\d/.test(np), /[^A-Za-z0-9]/.test(np)].filter(Boolean).length;
  const strengthLabel = ['', 'Weak', 'Okay', 'Good', 'Strong'][strength];

  const submit = async (e) => {
    e.preventDefault();
    if (!form.currentPassword) return setErr('Enter your current password.');
    if (np.length < 6) return setErr('The new password must be at least 6 characters.');
    if (np !== form.confirmPassword) return setErr('The two new passwords do not match.');
    if (np === form.currentPassword) return setErr('The new password must be different from the current one.');
    setSaving(true);
    try {
      const res = await sapi('/sellers/me/change-password', { method: 'POST', body: { currentPassword: form.currentPassword, newPassword: np } });
      // changing the password ends every older login; this browser gets a fresh one
      if (res?.token) { try { localStorage.setItem('ng_seller_token', res.token); } catch {} }
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setToast({ ok: true, text: 'Password changed. You were signed out on other devices.' });
    } catch (er) {
      setErr(er.message || 'Could not change the password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <Card
        title="Password"
        sub="Changing your password signs you out on every other phone and computer."
        foot={
          <div className="st-savebar">
            {err ? <p className="st-err"><Ic name="alert" size={14} /> {err}</p> : <span />}
            <button type="submit" className="st-btn st-btn-dark" disabled={saving}>{saving ? 'Changing…' : 'Change password'}</button>
          </div>
        }
      >
        <div className="st-grid one">
          <Field label="Current password"><input className="st-input" type={show ? 'text' : 'password'} autoComplete="current-password" value={form.currentPassword} onChange={set('currentPassword')} /></Field>
          <Field label="New password" hint={np ? `Strength: ${strengthLabel}` : 'At least 6 characters — longer with numbers and symbols is safer.'}>
            <input className="st-input" type={show ? 'text' : 'password'} autoComplete="new-password" value={np} onChange={set('newPassword')} />
            {np && <div className={`st-strength s${strength}`}><i /><i /><i /><i /></div>}
          </Field>
          <Field label="Repeat new password"><input className="st-input" type={show ? 'text' : 'password'} autoComplete="new-password" value={form.confirmPassword} onChange={set('confirmPassword')} /></Field>
          <label className="st-check"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords</label>
        </div>
      </Card>
    </form>
  );
}

function AccountSection({ seller, onApp }) {
  const diamond = seller?.tier === 'diamond';
  const deposit = Number(seller?.securityDeposit?.amount || seller?.wallet?.securityDeposit || 0);
  return (
    <>
      <Card title="Account & plan" sub="Your store’s status on Bazario.">
        <dl className="st-facts">
          <div><dt>Plan</dt><dd><span className={`st-plan ${diamond ? 'diamond' : ''}`}>{diamond ? 'Diamond' : 'Basic'}</span> {!diamond && <Link to="/seller/diamond" className="st-link">See Diamond</Link>}</dd></div>
          <div><dt>Your profit per order</dt><dd><b>{diamond ? 35 : 20}%</b> of the order value</dd></div>
          <div><dt>Time to confirm an order</dt><dd><b>{diamond ? 72 : 48} hours</b></dd></div>
          <div><dt>Verification</dt><dd>{seller?.verified ? <VerifiedStoreBadge variant="pill" text="Verified store" size={13} /> : <span className="st-plan">Not verified yet</span>}</dd></div>
          {deposit > 0 && <div><dt>Security deposit</dt><dd><b>${deposit.toLocaleString('en-US')}</b></dd></div>}
          <div><dt>Store email</dt><dd>{seller?.email || '—'}</dd></div>
        </dl>
      </Card>
      <Card title="Seller app" sub="Get order and payout alerts on your phone.">
        <div className="st-app">
          <button type="button" className="st-btn st-btn-ghost" onClick={onApp}><Ic name="download" size={16} /> Android app</button>
          <button type="button" className="st-btn st-btn-ghost" onClick={onApp}><Ic name="phone" size={16} /> iPhone (add to home screen)</button>
        </div>
      </Card>
    </>
  );
}

function Field({ label, req, hint, full, children }) {
  return (
    <label className={`st-field ${full ? 'full' : ''}`}>
      <span>{label}{req && <em>*</em>}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function SaveBar({ dirty, saving, disabled, onReset, label, err, onSave }) {
  return (
    <div className="st-savebar">
      {err ? <p className="st-err"><Ic name="alert" size={14} /> {err}</p> : <span className="st-dirty">{dirty ? 'You have unsaved changes' : 'All changes saved'}</span>}
      <div className="st-savebar-btns">
        {dirty && <button type="button" className="st-btn st-btn-ghost" onClick={onReset} disabled={saving}>Discard</button>}
        <button type={onSave ? 'button' : 'submit'} onClick={onSave} className="st-btn st-btn-primary" disabled={saving || disabled || !dirty}>{saving ? 'Saving…' : label}</button>
      </div>
    </div>
  );
}
