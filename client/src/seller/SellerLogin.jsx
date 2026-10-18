import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Ic from '../components/Icons.jsx';

export default function SellerLogin() {
  const navigate = useNavigate();
  const { loginSeller } = useAuth();
  const [params, setParams] = useSearchParams();
  const urlResetToken = params.get('resetToken') || '';
  const urlEmail = params.get('email') || '';
  const urlAffiliate = (params.get('affiliate') || params.get('ref') || params.get('affiliateCode') || params.get('code') || '').trim();
  const urlMode = (params.get('mode') || params.get('tab') || '').toLowerCase().trim();

  const [mode, setMode] = useState(urlAffiliate || urlMode === 'register' ? 'register' : 'login'); // 'login' | 'register'

  useEffect(() => {
    if (urlMode === 'register' || urlAffiliate) {
      setMode('register');
    }
  }, [urlMode, urlAffiliate]);

  // The address follows the tab: "Create account" is /seller/login?mode=register, so a reload
  // (or a link someone shares) opens the same tab. It used to fall back to Sign in on reload.
  useEffect(() => {
    if (mode !== 'login' && mode !== 'register') return;
    const next = new URLSearchParams(params);
    if (mode === 'register') next.set('mode', 'register');
    else next.delete('mode');
    next.delete('tab');
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const switchMode = (m) => {
    setMode(m);
    setErr('');
    setIsPendingApprovalErr(false);
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
  };

  // Registration Submitted State
  const [submittedInfo, setSubmittedInfo] = useState(null);
  const [isPendingApprovalErr, setIsPendingApprovalErr] = useState(false);

  // Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Forgot Password Modal State
  const [forgotModalOpen, setForgotModalOpen] = useState(Boolean(urlResetToken));
  const [forgotStep, setForgotStep] = useState(urlResetToken ? 'reset' : 'request'); // 'request' | 'reset'
  const [forgotEmail, setForgotEmail] = useState(urlEmail);
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotErr, setForgotErr] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  // Register State
  const [regForm, setRegForm] = useState({
    storeName: '',
    ownerName: '',
    email: '',
    phone: '',
    password: '',
    referralCode: urlAffiliate.toUpperCase(),
    aadhaarFront: '',
    aadhaarBack: '',
    panFront: '',
    panBack: '',
    description: '',
  });

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setIsPendingApprovalErr(false);
    setSuccessMsg('');
    setLoading(true);
    try {
      const data = await api('/sellers/login', {
        method: 'POST',
        body: { email: email.trim(), password },
      });
      loginSeller(data.token, data.seller);
      navigate('/seller');
    } catch (e) {
      if (e.isPendingApproval || (e.message && e.message.toLowerCase().includes('pending admin approval'))) {
        setIsPendingApprovalErr(true);
      }
      setErr(e.message || 'Login failed. Please check your business email and password.');
    } finally {
      setLoading(false);
    }
  };

  // Phone photos are 2–6 MB each. Four of them in one request were often more than the server
  // accepts, and on a mobile connection the upload ran past the time limit ("Request timed out")
  // even when the registration had already been saved. So every picture is made smaller here,
  // on the phone, before it is sent: max 1600 px, JPEG — still perfectly readable for KYC.
  const [preparing, setPreparing] = useState('');
  const shrinkImage = (file) =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const encode = (maxSide, quality) => {
            const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
            const w = Math.max(1, Math.round(img.naturalWidth * scale));
            const h = Math.max(1, Math.round(img.naturalHeight * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            return canvas.toDataURL('image/jpeg', quality);
          };
          let out = encode(1600, 0.8);
          if (out.length > 900 * 1024) out = encode(1280, 0.7);
          if (out.length > 900 * 1024) out = encode(1024, 0.6);
          URL.revokeObjectURL(url);
          resolve(out);
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('unreadable'));
      };
      img.src = url;
    });

  const handleFileUpload = (field) => async (e) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    if (isPdf) {
      if (file.size > 1024 * 1024) {
        input.value = '';
        return alert('This PDF is larger than 1 MB. Please upload a photo of the card instead (it is made smaller automatically).');
      }
      const reader = new FileReader();
      reader.onload = () => setRegForm((prev) => ({ ...prev, [field]: reader.result }));
      reader.readAsDataURL(file);
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      input.value = '';
      return alert('This picture is too large. Please choose another photo.');
    }
    setPreparing(field);
    try {
      const small = await shrinkImage(file);
      setRegForm((prev) => ({ ...prev, [field]: small }));
    } catch {
      // the browser could not open this picture format: send it as it is if it is small enough
      if (file.size <= 1024 * 1024) {
        const reader = new FileReader();
        reader.onload = () => setRegForm((prev) => ({ ...prev, [field]: reader.result }));
        reader.readAsDataURL(file);
      } else {
        input.value = '';
        alert('This picture could not be opened. Please take a JPG / PNG photo of the card and try again.');
      }
    } finally {
      setPreparing('');
    }
  };

  // ─── Already applied with this email? ───
  // Asked before the documents are uploaded (and when the email field is left), so somebody who
  // already sent an application is told at once that it was received and is waiting for approval.
  const [emailNotice, setEmailNotice] = useState(null); // { code, message, application }
  const checkEmail = async (value) => {
    const clean = String(value || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(clean)) return null;
    try {
      const res = await api('/sellers/register/check-email', { method: 'POST', body: { email: clean }, timeout: 15000 });
      return res?.exists ? res : null;
    } catch {
      return null; // never stop a registration because this check failed
    }
  };
  const showAlreadyApplied = (answer, fallbackEmail) => {
    const app = answer?.application || {};
    setSubmittedInfo({
      already: true,
      storeName: app.storeName || regForm.storeName,
      ownerName: app.ownerName || regForm.ownerName,
      email: app.email || fallbackEmail || regForm.email,
      phone: regForm.phone,
      submittedOn: app.submittedAt ? new Date(app.submittedAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '',
    });
    setEmail(app.email || fallbackEmail || regForm.email); // pre-filled for when it is approved
    setEmailNotice(null);
    setErr('');
    setMode('submitted');
  };
  const onRegEmailBlur = async () => {
    const answer = await checkEmail(regForm.email);
    setEmailNotice(answer ? { code: answer.code, message: answer.message, application: answer.application } : null);
  };

  // ─── Affiliate code: checked live while it is typed (optional, but a given code must exist) ───
  const [affCheck, setAffCheck] = useState({ state: 'idle', message: '' }); // idle | checking | valid | invalid | error
  const checkAffiliate = async (raw) => {
    const code = String(raw || '').replace(/\s+/g, '').toUpperCase();
    if (!code) return { state: 'idle', message: '' };
    try {
      const res = await api(`/sellers/affiliate/validate?code=${encodeURIComponent(code)}`, { timeout: 15000 });
      return res?.valid ? { state: 'valid', message: res.message || 'Valid affiliate code' } : { state: 'invalid', message: res?.message || 'This affiliate code does not exist.' };
    } catch {
      return { state: 'error', message: 'Could not check the code right now. It will be checked when you submit.' };
    }
  };
  useEffect(() => {
    if (mode !== 'register') return undefined;
    const code = regForm.referralCode;
    if (!String(code || '').trim()) {
      setAffCheck({ state: 'idle', message: '' });
      return undefined;
    }
    setAffCheck({ state: 'checking', message: '' });
    let alive = true;
    const t = setTimeout(async () => {
      const r = await checkAffiliate(code);
      if (alive) setAffCheck(r);
    }, 450);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [regForm.referralCode, mode]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setErr('');
    setIsPendingApprovalErr(false);
    setSuccessMsg('');
    if (preparing) {
      setErr('Please wait a moment: the photos are still being prepared.');
      return;
    }
    // everything together must stay under what the server accepts (5 MB)
    if (JSON.stringify(regForm).length > 4.6 * 1024 * 1024) {
      setErr('The documents are too large together. Please upload smaller photos (or photos instead of PDFs).');
      return;
    }
    if (String(regForm.referralCode || '').trim()) {
      const aff = affCheck.state === 'valid' || affCheck.state === 'invalid' ? affCheck : await checkAffiliate(regForm.referralCode);
      setAffCheck(aff);
      if (aff.state === 'invalid') {
        setErr(aff.message + ' (You can also leave the affiliate code empty.)');
        return;
      }
    }
    setLoading(true);
    // Already an account / application for this email: say so, do not upload the documents again
    const existing = await checkEmail(regForm.email);
    if (existing) {
      setLoading(false);
      if (existing.code === 'APPLICATION_PENDING') return showAlreadyApplied(existing, regForm.email);
      setEmailNotice({ code: existing.code, message: existing.message, application: existing.application });
      setErr(existing.message);
      return;
    }
    try {
      // documents on a slow mobile connection: up to 2 minutes
      const res = await api('/sellers/register', {
        method: 'POST',
        body: regForm,
        timeout: 120000,
      });

      setSubmittedInfo({
        storeName: regForm.storeName,
        ownerName: regForm.ownerName,
        email: regForm.email,
        phone: regForm.phone,
        submittedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
      setEmail(regForm.email); // Pre-fill email in login tab
      setMode('submitted');
      setRegForm({
        storeName: '',
        ownerName: '',
        email: '',
        phone: '',
        password: '',
        referralCode: '',
        aadhaarFront: '',
        aadhaarBack: '',
        panFront: '',
        panBack: '',
        description: '',
      });
    } catch (e) {
      const msg = e.message || '';
      if (e.code === 'APPLICATION_PENDING') {
        showAlreadyApplied(e.data, regForm.email);
        return;
      }
      if (/timed out|unable to connect/i.test(msg)) {
        // The answer did not arrive, but the registration may well have been saved. Sending the
        // form again would then only say "this email already exists".
        setErr(
          'The connection was too slow to get the answer. Your registration may already have been received: wait one minute, then try to Sign In with this email. If it says "pending admin approval", it worked — no need to register again.'
        );
      } else if (e.code === 'INVALID_AFFILIATE_CODE') {
        setAffCheck({ state: 'invalid', message: msg });
        setErr(msg);
      } else if (e.code === 'APPLICATION_REJECTED' || e.code === 'ALREADY_REGISTERED' || /already exists/i.test(msg)) {
        setErr(msg);
      } else {
        setErr(msg || 'Registration failed. Please check your information and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendRecoveryEmail = async (e) => {
    e.preventDefault();
    setForgotErr('');
    setForgotSuccess('');
    setForgotBusy(true);
    try {
      const res = await api('/sellers/forgot-password', {
        method: 'POST',
        body: { email: forgotEmail.trim() },
      });
      setForgotSuccess(res.message || 'Recovery instructions sent!');
      setForgotStep('reset');
    } catch (err) {
      setForgotErr(err.message || 'Failed to send recovery email.');
    } finally {
      setForgotBusy(false);
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    if (forgotNewPassword !== forgotConfirmPassword) {
      return setForgotErr('Passwords do not match');
    }
    setForgotErr('');
    setForgotSuccess('');
    setForgotBusy(true);
    try {
      const payload = {
        password: forgotNewPassword,
        ...(urlResetToken ? { token: urlResetToken } : { email: forgotEmail.trim(), otp: forgotOtp.trim() }),
      };
      const res = await api('/sellers/reset-password', {
        method: 'POST',
        body: payload,
      });
      setForgotSuccess(res.message || 'Password updated successfully! You can now log in.');
      setTimeout(() => {
        setForgotModalOpen(false);
        setMode('login');
        setEmail(forgotEmail);
      }, 1500);
    } catch (err) {
      setForgotErr(err.message || 'Failed to reset password.');
    } finally {
      setForgotBusy(false);
    }
  };

  const DOCS = [
    { field: 'aadhaarFront', label: 'Aadhaar card', side: 'Front' },
    { field: 'aadhaarBack', label: 'Aadhaar card', side: 'Back' },
    { field: 'panFront', label: 'PAN card', side: 'Front' },
    { field: 'panBack', label: 'PAN card', side: 'Back' },
  ];
  const docsDone = DOCS.filter((d) => regForm[d.field]).length;
  const isReg = mode === 'register';

  return (
    <div className="sl">
      {/* ── Left: what selling on Bazario means (desktop) ── */}
      <aside className="sl-side">
        <Link to="/" className="sl-brand">
          <span className="sl-logo">B</span>
          <span><b>Bazario</b> <em>Seller Hub</em></span>
        </Link>

        <div className="sl-side-body">
          <h1>{isReg ? 'Start selling on Bazario' : 'Welcome back to your store'}</h1>
          <p>{isReg ? 'Open your online store in a few minutes. We hold the stock and deliver every order — you choose the products and earn on each sale.' : 'Sign in to manage your products, confirm orders and follow your earnings.'}</p>

          <ul className="sl-perks">
            <li><span><Ic name="sparkle" size={16} /></span><div><b>No stock to buy</b><small>Pick ready products from the Product Treasury.</small></div></li>
            <li><span><Ic name="truck" size={16} /></span><div><b>We pack and deliver</b><small>Bazario ships every order to your customers.</small></div></li>
            <li><span><Ic name="wallet" size={16} /></span><div><b>Earn on every order</b><small>20% profit per order — 35% on the Diamond plan.</small></div></li>
          </ul>

          <ol className="sl-steps">
            <li><i>1</i><span>Create your seller account</span></li>
            <li><i>2</i><span>We verify your documents</span></li>
            <li><i>3</i><span>Add products and start selling</span></li>
          </ol>
        </div>

        <Link to="/login" className="sl-side-foot">Shopping on Bazario? <b>Customer sign in</b> <Ic name="arrowRight" size={14} /></Link>
      </aside>

      {/* ── Right: the form ── */}
      <main className="sl-main">
        <div className={`sl-card ${isReg ? 'wide' : ''}`}>
          <Link to="/" className="sl-brand sl-brand-m">
            <span className="sl-logo">B</span>
            <span><b>Bazario</b> <em>Seller Hub</em></span>
          </Link>

          {mode !== 'submitted' && (
            <>
              <div className="sl-head">
                <h2>{isReg ? 'Create your seller account' : 'Seller sign in'}</h2>
                <p>{isReg ? 'Takes about 3 minutes. Keep your Aadhaar and PAN card ready.' : 'Use the email and password of your store.'}</p>
              </div>
              <div className="sl-seg" role="tablist">
                <button type="button" role="tab" aria-selected={!isReg} className={!isReg ? 'on' : ''} onClick={() => switchMode('login')}>Sign in</button>
                <button type="button" role="tab" aria-selected={isReg} className={isReg ? 'on' : ''} onClick={() => switchMode('register')}>Create account</button>
              </div>
            </>
          )}

          {isPendingApprovalErr && (
            <div className="sl-alert warn">
              <Ic name="clock" size={18} />
              <div>
                <b>Your application is under review</b>
                <p>Sign in opens as soon as our team approves your store. You will be able to sign in here with the same email and password.</p>
              </div>
            </div>
          )}
          {successMsg && !isPendingApprovalErr && mode !== 'submitted' && (
            <div className="sl-alert ok"><Ic name="checkCircle" size={18} /><div><p>{successMsg}</p></div></div>
          )}
          {err && !isPendingApprovalErr && (
            <div className="sl-alert err"><Ic name="alert" size={18} /><div><p>{err}</p></div></div>
          )}

          {mode === 'submitted' ? (
            <div className="sl-done">
              <span className="sl-done-ico"><Ic name="checkCircle" size={30} /></span>
              <h2>{submittedInfo?.already ? 'You have already applied' : 'Application received!'}</h2>
              <p>
                {submittedInfo?.already
                  ? `An application with this email${submittedInfo.submittedOn ? ` was sent on ${submittedInfo.submittedOn}` : ' already exists'} and is waiting for approval.`
                  : 'Thank you. Our team will check your details and documents.'}
              </p>

              {submittedInfo && (
                <dl className="sl-summary">
                  <div><dt>Store</dt><dd>{submittedInfo.storeName || '—'}</dd></div>
                  <div><dt>Owner</dt><dd>{submittedInfo.ownerName || '—'}</dd></div>
                  <div className="full"><dt>Email</dt><dd>{submittedInfo.email}</dd></div>
                  <div className="full"><dt>Status</dt><dd><span className="sl-pill">Under review</span></dd></div>
                </dl>
              )}

              <ol className="sl-next">
                <li className="done"><i><Ic name="check" size={12} /></i><span>Application sent</span></li>
                <li className="now"><i>2</i><span>Document check by our team</span></li>
                <li><i>3</i><span>Store approved — sign in and start selling</span></li>
              </ol>
              <p className="sl-fine">You cannot sign in until the store is approved. Please do not register again with the same email.</p>

              <button type="button" className="sl-btn primary" onClick={() => switchMode('login')}>Go to sign in</button>
              <button type="button" className="sl-btn ghost" onClick={() => switchMode('register')}>Register a different store</button>
            </div>
          ) : !isReg ? (
            <form onSubmit={submit} className="sl-form">
              <label className="sl-field">
                <span>Email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourstore.com" required autoFocus autoComplete="email" />
              </label>
              <label className="sl-field">
                <span>Password</span>
                <div className="sl-pw">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" required autoComplete="current-password" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}><Ic name="eye" size={17} /></button>
                </div>
              </label>
              <button type="submit" className="sl-btn primary" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
              <p className="sl-fine center">Forgot your password? Contact Bazario support and we will reset it for you.</p>

              <div className="sl-switch">
                <span>New to Bazario?</span>
                <button type="button" onClick={() => switchMode('register')}>Create a seller account <Ic name="arrowRight" size={14} /></button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="sl-form">
              <section className="sl-sec">
                <h3><i>1</i> Your store</h3>
                <div className="sl-grid">
                  <label className="sl-field">
                    <span>Store name</span>
                    <input type="text" value={regForm.storeName} onChange={(e) => setRegForm({ ...regForm, storeName: e.target.value })} placeholder="e.g. Apex Electronics" required />
                  </label>
                  <label className="sl-field">
                    <span>Owner full name</span>
                    <input type="text" value={regForm.ownerName} onChange={(e) => setRegForm({ ...regForm, ownerName: e.target.value })} placeholder="As on your Aadhaar card" required />
                  </label>
                </div>
              </section>

              <section className="sl-sec">
                <h3><i>2</i> Your account</h3>
                <div className="sl-grid">
                  <label className="sl-field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={regForm.email}
                      onChange={(e) => {
                        setRegForm({ ...regForm, email: e.target.value });
                        if (emailNotice) setEmailNotice(null);
                      }}
                      onBlur={onRegEmailBlur}
                      placeholder="you@email.com"
                      required
                    />
                  </label>
                  <label className="sl-field">
                    <span>Phone / WhatsApp</span>
                    <input type="tel" value={regForm.phone} onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })} placeholder="+91 98765 43210" required />
                  </label>
                </div>
                {emailNotice && (
                  <div className={`sl-alert ${emailNotice.code === 'APPLICATION_REJECTED' ? 'err' : 'warn'} tight`}>
                    <Ic name="alert" size={16} />
                    <div>
                      <p>{emailNotice.message}</p>
                      {emailNotice.code === 'APPLICATION_PENDING' && (
                        <button type="button" className="sl-link" onClick={() => showAlreadyApplied(emailNotice, regForm.email)}>See my application status</button>
                      )}
                      {emailNotice.code === 'ALREADY_REGISTERED' && (
                        <button type="button" className="sl-link" onClick={() => { setEmail(regForm.email); setMode('login'); setEmailNotice(null); setErr(''); }}>Go to sign in</button>
                      )}
                    </div>
                  </div>
                )}
                <div className="sl-grid">
                  <label className="sl-field">
                    <span>Create a password</span>
                    <input type="password" value={regForm.password} onChange={(e) => setRegForm({ ...regForm, password: e.target.value })} placeholder="At least 6 characters" minLength={6} required autoComplete="new-password" />
                  </label>
                  <label className="sl-field">
                    <span>Affiliate code <em>(optional)</em></span>
                    <input
                      type="text"
                      className={affCheck.state === 'valid' ? 'is-ok' : affCheck.state === 'invalid' ? 'is-bad' : ''}
                      value={regForm.referralCode}
                      onChange={(e) => setRegForm({ ...regForm, referralCode: e.target.value.replace(/\s+/g, '').toUpperCase() })}
                      placeholder="If someone gave you a code"
                      maxLength={32}
                      aria-invalid={affCheck.state === 'invalid'}
                    />
                    {affCheck.state !== 'idle' && (
                      <small role="status" className={affCheck.state === 'valid' ? 't-ok' : affCheck.state === 'invalid' ? 't-bad' : ''}>
                        {affCheck.state === 'checking' ? 'Checking code…' : affCheck.state === 'valid' ? `✓ ${affCheck.message}` : affCheck.state === 'invalid' ? `✕ ${affCheck.message}` : affCheck.message}
                      </small>
                    )}
                  </label>
                </div>
              </section>

              <section className="sl-sec">
                <h3><i>3</i> Identity documents <span className="sl-count">{docsDone}/4</span></h3>
                <p className="sl-fine">Clear photos of both sides of your Aadhaar and PAN card. Only our verification team sees them.</p>
                <div className="sl-docs">
                  {DOCS.map((d) => {
                    const has = Boolean(regForm[d.field]);
                    const busy = preparing === d.field;
                    return (
                      <label key={d.field} className={`sl-doc ${has ? 'has' : ''} ${busy ? 'busy' : ''}`}>
                        <input type="file" accept="image/*,.pdf" onChange={handleFileUpload(d.field)} required={!has} />
                        <span className="sl-doc-ico">{has ? <Ic name="check" size={18} /> : <Ic name="image" size={18} />}</span>
                        <span className="sl-doc-txt">
                          <b>{d.label}</b>
                          <small>{busy ? 'Preparing photo…' : has ? `${d.side} added · tap to change` : `${d.side} side · tap to upload`}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>

              <button type="submit" className="sl-btn primary" disabled={loading || !!preparing}>
                {loading ? 'Sending… please keep this page open' : preparing ? 'Preparing photos…' : 'Submit application'}
              </button>
              <p className="sl-fine center">After you submit, our team checks your details. You can sign in once your store is approved.</p>

              <div className="sl-switch">
                <span>Already have a seller account?</span>
                <button type="button" onClick={() => switchMode('login')}>Sign in <Ic name="arrowRight" size={14} /></button>
              </div>
            </form>
          )}
        </div>
        <Link to="/login" className="sl-cust-m">Shopping on Bazario? <b>Customer sign in</b></Link>
      </main>

      {/* Password reset (opened from the reset email link) */}
      {forgotModalOpen && (
        <div className="sl-modal-root" onClick={() => setForgotModalOpen(false)}>
          <div className="sl-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="sl-modal-head">
              <h3>{forgotStep === 'request' ? 'Reset your password' : 'Set a new password'}</h3>
              <button type="button" onClick={() => setForgotModalOpen(false)} aria-label="Close"><Ic name="x" size={18} /></button>
            </div>
            {forgotErr && <div className="sl-alert err tight"><Ic name="alert" size={16} /><div><p>{forgotErr}</p></div></div>}
            {forgotSuccess && <div className="sl-alert ok tight"><Ic name="checkCircle" size={16} /><div><p>{forgotSuccess}</p></div></div>}
            {forgotStep === 'request' ? (
              <form onSubmit={handleSendRecoveryEmail} className="sl-form">
                <p className="sl-fine">Enter the email of your store. We will send you a 6-digit code.</p>
                <label className="sl-field">
                  <span>Email</span>
                  <input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="you@yourstore.com" required autoFocus />
                </label>
                <button type="submit" className="sl-btn primary" disabled={forgotBusy}>{forgotBusy ? 'Sending…' : 'Send code'}</button>
                <button type="button" className="sl-link center" onClick={() => setForgotStep('reset')}>I already have a code</button>
              </form>
            ) : (
              <form onSubmit={handleResetPasswordSubmit} className="sl-form">
                {!urlResetToken && (
                  <>
                    <label className="sl-field">
                      <span>Email</span>
                      <input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="you@yourstore.com" required />
                    </label>
                    <label className="sl-field">
                      <span>6-digit code from the email</span>
                      <input type="text" inputMode="numeric" maxLength={6} value={forgotOtp} onChange={(e) => setForgotOtp(e.target.value)} placeholder="e.g. 849201" required autoFocus />
                    </label>
                  </>
                )}
                <label className="sl-field">
                  <span>New password</span>
                  <input type="password" value={forgotNewPassword} onChange={(e) => setForgotNewPassword(e.target.value)} placeholder="At least 6 characters" minLength={6} required />
                </label>
                <label className="sl-field">
                  <span>Repeat new password</span>
                  <input type="password" value={forgotConfirmPassword} onChange={(e) => setForgotConfirmPassword(e.target.value)} placeholder="Type it again" minLength={6} required />
                </label>
                <button type="submit" className="sl-btn primary" disabled={forgotBusy}>{forgotBusy ? 'Saving…' : 'Save new password'}</button>
                <button type="button" className="sl-link center" onClick={() => setForgotStep('request')}>Back</button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
