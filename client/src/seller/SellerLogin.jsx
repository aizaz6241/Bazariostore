import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Ic from '../components/Icons.jsx';
import { TERMS_VERSION } from './sellerTerms.js';

export default function SellerLogin() {
  const navigate = useNavigate();
  const { loginSeller, loginAdmin, login: loginCustomer } = useAuth();
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
    setRegStep(1);
    setStepErr('');
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
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
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
  // the reset link from the email (token in the address); dropped once a new code is asked for
  const [linkToken, setLinkToken] = useState(urlResetToken);
  const dropResetParams = () => {
    const next = new URLSearchParams(params);
    next.delete('resetToken');
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  };

  // the Seller Terms & Conditions box on the registration form
  const [acceptTerms, setAcceptTerms] = useState(false);
  // registration is done in 3 small steps; stepErr = what is missing on the current step
  const [regStep, setRegStep] = useState(1);
  const [stepErr, setStepErr] = useState('');

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
      // ONE login box: the server finds out whether the email is a team admin, a store or a
      // customer and answers like that account's own login ({ admin } / { seller } / { user }).
      const body = { email: email.trim(), password };
      let data;
      try {
        data = await api('/auth/any-login', { method: 'POST', body });
      } catch (e1) {
        if (e1.status !== 404) throw e1;
        // a server that does not have the one-login route yet: try the store login, then the
        // team login, then the customer login (each with its own checks and limits)
        try {
          data = await api('/sellers/login', { method: 'POST', body });
        } catch (e2) {
          if (e2.status !== 401) throw e2;
          try {
            data = await api('/auth/login', { method: 'POST', body });
          } catch (e3) {
            if (e3.status !== 401) throw e3;
            data = await api('/user/login', { method: 'POST', body });
          }
        }
      }
      if (data.admin) {
        loginAdmin(data.token, data.admin);
        navigate('/admin');
      } else if (data.user && !data.seller) {
        loginCustomer(data.token, data.user);
        const next = params.get('next');
        navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/account');
      } else {
        loginSeller(data.token, data.seller);
        navigate('/seller');
      }
    } catch (e) {
      // right password, application still in review: show its status page (not an error)
      if (e.code === 'application_pending' || e.data?.isPendingApproval) {
        const app = e.data?.application || {};
        setSubmittedInfo({
          pending: true,
          storeName: app.storeName,
          ownerName: app.ownerName,
          email: app.email || email.trim(),
          submittedAt: app.submittedAt || null,
          reviewHours: Number(app.reviewHours) || 24,
          checkedAt: new Date(),
        });
        setErr('');
        setMode('submitted');
        try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
        return;
      }
      if (e.message && e.message.toLowerCase().includes('pending admin approval')) {
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
  // ─── Email: no code is asked any more (Nov 2026). `ev` only resets an older verified state. ───
  const EV0 = { status: 'idle', email: '', code: '', token: '', msg: '', err: '', resendAt: 0 };
  const [ev, setEv] = useState(EV0);
  const cleanRegEmail = String(regForm.email || '').trim().toLowerCase();

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
      return res?.valid ? { state: 'valid', message: res.message || 'Valid security code' } : { state: 'invalid', message: res?.message || 'This security code does not exist.' };
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
    if (!acceptTerms) {
      setErr('Please read and accept the Seller Terms & Conditions to register.');
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
        setErr(aff.message + ' (You can also leave the security code empty.)');
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
        body: { ...regForm, acceptTerms: true, termsVersion: TERMS_VERSION, ...(ev.token ? { emailToken: ev.token } : {}) },
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
      setEv(EV0);
      setRegStep(1);
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
      } else if (e.code === 'EMAIL_NOT_VERIFIED') {
        setEv(EV0);
        setRegStep(2);
        setErr(msg);
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
      setForgotSuccess(`${res.message || 'Recovery instructions sent!'} Check your inbox — and your Spam / Junk folder if you don't see it.`);
      // a new code was asked for: the code from this new email is used, not an older link
      setLinkToken('');
      dropResetParams();
      setForgotOtp('');
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
        ...(linkToken ? { token: linkToken } : { email: forgotEmail.trim(), otp: forgotOtp.trim() }),
      };
      const res = await api('/sellers/reset-password', {
        method: 'POST',
        body: payload,
      });
      setForgotSuccess(res.message || 'Password updated successfully! You can now log in.');
      setLinkToken('');
      dropResetParams();
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
    { field: 'aadhaarFront', label: 'ID card', side: 'Front' },
    { field: 'aadhaarBack', label: 'ID card', side: 'Back' },
    { field: 'panFront', label: 'PAN card', side: 'Front' },
    { field: 'panBack', label: 'PAN card', side: 'Back' },
  ];
  const docsDone = DOCS.filter((d) => regForm[d.field]).length;
  const isReg = mode === 'register';

  // ─── Registration in 3 small steps (one screen at a time — easier on a phone) ───
  const phoneDigits = String(regForm.phone || '').replace(/\D/g, '');
  const stepProblem = (n) => {
    if (n === 1) {
      if (!regForm.storeName.trim()) return 'Please write your store name.';
      if (!regForm.ownerName.trim()) return 'Please write your full name.';
      return '';
    }
    if (n === 2) {
      if (!/^\S+@\S+\.\S+$/.test(cleanRegEmail)) return 'Please write a correct email address.';
      if (emailNotice) return emailNotice.message || 'This email is already used.';
      if (phoneDigits.length < 7) return 'Please write your phone / WhatsApp number.';
      if (String(regForm.password || '').length < 6) return 'Please make a password with at least 6 letters or numbers.';
      if (affCheck.state === 'invalid') return `${affCheck.message} (You can also leave the security code empty.)`;
      return '';
    }
    return '';
  };
  const goStep = (n) => {
    setStepErr('');
    setErr('');
    setRegStep(n);
    try { document.querySelector('.sx-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
  };
  const goNext = () => {
    const p = stepProblem(regStep);
    if (p) {
      setStepErr(p);
      return;
    }
    goStep(regStep + 1);
  };
  const STEPS = [
    { n: 1, label: 'Store' },
    { n: 2, label: 'Contact' },
    { n: 3, label: 'Documents' },
  ];

  return (
    <div className="sl sx">
      {/* Brand */}
      <div className="sx-top">
        <span className="sl-logo">B</span>
        <span className="sl-brand-txt"><b>Bazario</b></span>
        <span className="sx-tag">Seller Center</span>
      </div>

      <div className={`sl-card sx-card ${isReg ? 'wide' : ''}`}>
        {/* Login or Register — two big, clear choices */}
        {mode !== 'submitted' && (
          <div className="sx-choose" role="tablist" aria-label="Login or register">
            <button type="button" role="tab" aria-selected={!isReg} className={!isReg ? 'on' : ''} onClick={() => switchMode('login')}>
              <span className="sx-choose-ic" aria-hidden="true"><Ic name="lock" size={20} /></span>
              <span><b>Login</b><small>I already have a store</small></span>
            </button>
            <button type="button" role="tab" aria-selected={isReg} className={isReg ? 'on' : ''} onClick={() => switchMode('register')}>
              <span className="sx-choose-ic" aria-hidden="true"><Ic name="plus" size={20} /></span>
              <span><b>Register</b><small>Open a new store</small></span>
            </button>
          </div>
        )}

        {isPendingApprovalErr && (
          <div className="sl-alert warn">
            <Ic name="clock" size={18} />
            <div>
              <b>Your application is under review</b>
              <p>Login opens as soon as our team approves your store. Use the same email and password then.</p>
            </div>
          </div>
        )}
        {successMsg && !isPendingApprovalErr && mode !== 'submitted' && (
          <div className="sl-alert ok"><Ic name="checkCircle" size={18} /><div><p>{successMsg}</p></div></div>
        )}
        {err && !isPendingApprovalErr && (
          <div className="sl-alert err" role="alert"><Ic name="alert" size={18} /><div><p>{err}</p></div></div>
        )}

        {mode === 'submitted' && submittedInfo?.pending ? (
          <PendingReview info={submittedInfo} loading={loading} onCheck={submit} onBack={() => switchMode('login')} />
        ) : mode === 'submitted' ? (
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
            {!submittedInfo?.already && (
              <div className="sl-alert ok tight sl-mailnote">
                <Ic name="mail" size={16} />
                <div>
                  <b>We have sent you an email</b>
                  <p>
                    We sent it to <strong>{submittedInfo?.email || 'your email'}</strong>. Please check your <strong>inbox</strong> — and your <strong>Spam / Junk</strong> folder if
                    you don't see it. We will email you again as soon as your store is approved (usually within 24 hours).
                  </p>
                </div>
              </div>
            )}
            <ol className="sl-next">
              <li className="done"><i><Ic name="check" size={12} /></i><span>Application sent</span></li>
              <li className="now"><i>2</i><span>Document check by our team</span></li>
              <li><i>3</i><span>Store approved — login and start selling</span></li>
            </ol>
            <p className="sl-fine">You can login once the store is approved. Please do not register again with the same email.</p>
            <button type="button" className="sl-btn primary" onClick={() => switchMode('login')}>Go to login</button>
            <button type="button" className="sl-btn ghost" onClick={() => switchMode('register')}>Register a different store</button>
          </div>
        ) : !isReg ? (
          /* ───────────── LOGIN ───────────── */
          <form onSubmit={submit} className="sl-form sx-form">
            <div className="sx-head">
              <h1>Login</h1>
              <p>Login to your store with your email and password.</p>
            </div>
            <label className="sl-field sx-field">
              <span><Ic name="mail" size={15} /> Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" required autoFocus autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} />
            </label>
            <label className="sl-field sx-field">
              <span><Ic name="lock" size={15} /> Password</span>
              <div className="sl-pw">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" required autoComplete="current-password" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'}><Ic name="eye" size={18} /></button>
              </div>
            </label>
            <button type="submit" className="sl-btn primary sx-big" disabled={loading}>
              {loading ? 'Logging in…' : <>Login <Ic name="arrowRight" size={17} /></>}
            </button>
            <button
              type="button"
              className="sx-forgot"
              onClick={() => { setForgotEmail(email.trim()); setForgotStep('request'); setForgotErr(''); setForgotSuccess(''); setForgotModalOpen(true); }}
            >
              Forgot password?
            </button>

            <div className="sx-new">
              <span className="sx-new-ic" aria-hidden="true">🏪</span>
              <div>
                <b>New seller?</b>
                <small>Open your own store. No stock to buy — we deliver every order.</small>
              </div>
              <button type="button" className="sl-btn sx-green" onClick={() => switchMode('register')}>
                Register your store <Ic name="arrowRight" size={16} />
              </button>
            </div>
          </form>
        ) : (
          /* ───────────── REGISTER (3 steps) ───────────── */
          <form
            onSubmit={(e) => {
              if (regStep < 3) {
                e.preventDefault();
                goNext();
                return;
              }
              handleRegister(e);
            }}
            className="sl-form sx-form"
            noValidate={regStep < 3}
          >
            <div className="sx-head">
              <h1>Register your store</h1>
              <p>3 easy steps. It takes about 5 minutes.</p>
            </div>

            <ol className="sx-steps" aria-label="Steps">
              {STEPS.map((s) => (
                <li key={s.n} className={regStep === s.n ? 'now' : regStep > s.n ? 'done' : ''} aria-current={regStep === s.n ? 'step' : undefined}>
                  <i>{regStep > s.n ? <Ic name="check" size={13} /> : s.n}</i>
                  <span>{s.label}</span>
                </li>
              ))}
            </ol>

            {stepErr && (
              <div className="sl-alert err tight" role="alert"><Ic name="alert" size={16} /><div><p>{stepErr}</p></div></div>
            )}

            {regStep === 1 && (
              <section className="sx-step">
                <h2><span>Step 1 of 3</span> About your store</h2>
                <label className="sl-field sx-field">
                  <span>Store name</span>
                  <input type="text" value={regForm.storeName} onChange={(e) => { setRegForm({ ...regForm, storeName: e.target.value }); setStepErr(''); }} placeholder="e.g. Sharma Electronics" autoFocus />
                </label>
                <label className="sl-field sx-field">
                  <span>Your full name</span>
                  <input type="text" value={regForm.ownerName} onChange={(e) => { setRegForm({ ...regForm, ownerName: e.target.value }); setStepErr(''); }} placeholder="Same as on your ID card" autoComplete="name" />
                </label>
                <div className="sx-need">
                  <b>Keep these ready:</b>
                  <ul>
                    <li><Ic name="mail" size={15} /> Your email</li>
                    <li><Ic name="phone" size={15} /> Phone / WhatsApp number</li>
                    <li><Ic name="image" size={15} /> ID card &amp; PAN card photos <em>(you can also add them later)</em></li>
                  </ul>
                </div>
              </section>
            )}

            {regStep === 2 && (
              <section className="sx-step">
                <h2><span>Step 2 of 3</span> Contact &amp; password</h2>
                <label className="sl-field sx-field">
                  <span><Ic name="mail" size={15} /> Email</span>
                  <input
                    type="email"
                    value={regForm.email}
                    onChange={(e) => {
                      setRegForm({ ...regForm, email: e.target.value });
                      setStepErr('');
                      if (emailNotice) setEmailNotice(null);
                    }}
                    onBlur={onRegEmailBlur}
                    placeholder="Your email"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoComplete="email"
                  />
                </label>
                {emailNotice && (
                  <div className={`sl-alert ${emailNotice.code === 'APPLICATION_REJECTED' ? 'err' : 'warn'} tight`}>
                    <Ic name="alert" size={16} />
                    <div>
                      <p>{emailNotice.message}</p>
                      {emailNotice.code === 'APPLICATION_PENDING' && (
                        <button type="button" className="sl-link" onClick={() => showAlreadyApplied(emailNotice, regForm.email)}>See my application status</button>
                      )}
                      {emailNotice.code === 'ALREADY_REGISTERED' && (
                        <button type="button" className="sl-link" onClick={() => { setEmail(regForm.email); setMode('login'); setEmailNotice(null); setErr(''); }}>Go to login</button>
                      )}
                    </div>
                  </div>
                )}
                <label className="sl-field sx-field">
                  <span><Ic name="phone" size={15} /> Phone / WhatsApp</span>
                  <input type="tel" value={regForm.phone} onChange={(e) => { setRegForm({ ...regForm, phone: e.target.value }); setStepErr(''); }} placeholder="e.g. +91 98765 43210" autoComplete="tel" inputMode="tel" />
                </label>
                <label className="sl-field sx-field">
                  <span><Ic name="lock" size={15} /> Make a password</span>
                  <div className="sl-pw">
                    <input type={showRegPassword ? 'text' : 'password'} value={regForm.password} onChange={(e) => { setRegForm({ ...regForm, password: e.target.value }); setStepErr(''); }} placeholder="At least 6 letters or numbers" minLength={6} autoComplete="new-password" />
                    <button type="button" onClick={() => setShowRegPassword((v) => !v)} aria-label={showRegPassword ? 'Hide password' : 'Show password'} title={showRegPassword ? 'Hide password' : 'Show password'}><Ic name="eye" size={18} /></button>
                  </div>
                  <small>Remember it — you will login with this email and password.</small>
                </label>
                <label className="sl-field sx-field">
                  <span><Ic name="tag" size={15} /> Security code <em>(only if someone gave you one)</em></span>
                  <input
                    type="text"
                    className={affCheck.state === 'valid' ? 'is-ok' : affCheck.state === 'invalid' ? 'is-bad' : ''}
                    value={regForm.referralCode}
                    onChange={(e) => { setRegForm({ ...regForm, referralCode: e.target.value.replace(/\s+/g, '').toUpperCase() }); setStepErr(''); }}
                    placeholder="Leave empty if you have none"
                    maxLength={32}
                    aria-invalid={affCheck.state === 'invalid'}
                  />
                  {affCheck.state !== 'idle' && (
                    <small role="status" className={affCheck.state === 'valid' ? 't-ok' : affCheck.state === 'invalid' ? 't-bad' : ''}>
                      {affCheck.state === 'checking' ? 'Checking code…' : affCheck.state === 'valid' ? `✓ ${affCheck.message}` : affCheck.state === 'invalid' ? `✕ ${affCheck.message}` : affCheck.message}
                    </small>
                  )}
                </label>
              </section>
            )}

            {regStep === 3 && (
              <section className="sx-step">
                <h2><span>Step 3 of 3</span> ID card &amp; PAN card photos <em className="sl-count">{docsDone}/4</em></h2>
                <p className="sl-fine">Take a clear photo of each side. Only our checking team sees them.</p>
                <div className="sx-later" role="note">
                  <Ic name="clock" size={16} />
                  <span><b>Don't have them right now?</b> You can still submit. After your store is approved, upload them from your Seller Central dashboard.</span>
                </div>
                <div className="sl-docs sx-docs">
                  {DOCS.map((d) => {
                    const has = Boolean(regForm[d.field]);
                    const busy = preparing === d.field;
                    return (
                      <label key={d.field} className={`sl-doc ${has ? 'has' : ''} ${busy ? 'busy' : ''}`}>
                        <input type="file" accept="image/*,.pdf" onChange={handleFileUpload(d.field)} />
                        <span className="sl-doc-ico">{has ? <Ic name="check" size={18} /> : <Ic name="image" size={18} />}</span>
                        <span className="sl-doc-txt">
                          <b>{d.label} — {d.side}</b>
                          <small>{busy ? 'Preparing photo…' : has ? 'Added ✓ · tap to change' : 'Tap to add photo'}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>

                {/* Seller Terms & Conditions */}
                <label className={`sl-terms ${acceptTerms ? 'on' : ''}`}>
                  <input type="checkbox" checked={acceptTerms} onChange={(e) => { setAcceptTerms(e.target.checked); if (e.target.checked && /terms/i.test(err)) setErr(''); }} required />
                  <span>
                    I have read and accept the{' '}
                    <a href="/seller/terms" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>Seller Terms &amp; Conditions</a>
                  </span>
                </label>
              </section>
            )}

            <div className="sx-nav">
              {regStep > 1 && (
                <button type="button" className="sl-btn ghost" onClick={() => goStep(regStep - 1)} disabled={loading}>
                  <Ic name="arrowLeft" size={16} /> Back
                </button>
              )}
              {regStep < 3 ? (
                <button type="submit" className="sl-btn primary sx-big">
                  Next <Ic name="arrowRight" size={17} />
                </button>
              ) : (
                <button type="submit" className="sl-btn sx-green sx-big" disabled={loading || !!preparing}>
                  {loading ? 'Sending… keep this page open' : preparing ? 'Preparing photos…' : <>Submit application <Ic name="check" size={17} /></>}
                </button>
              )}
            </div>
            {regStep === 3 && <p className="sl-fine center">Our team checks your details within 24 hours. Then you can login.</p>}

            <div className="sl-switch">
              <span>Already have a store?</span>
              <button type="button" onClick={() => switchMode('login')}>Login <Ic name="arrowRight" size={14} /></button>
            </div>
          </form>
        )}
      </div>

      {/* Everybody logs in with the box above (stores, Bazario team, customers).
          Only customers who want a shopping account need this small link. */}
      <p className="sx-other">
        Shopping customer? <Link to="/register">Create a customer account</Link>
      </p>

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
                {!linkToken && (
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
                  <div className="sl-pw">
                    <input type={showResetPassword ? 'text' : 'password'} value={forgotNewPassword} onChange={(e) => setForgotNewPassword(e.target.value)} placeholder="At least 6 characters" minLength={6} required autoComplete="new-password" />
                    <button type="button" onClick={() => setShowResetPassword((v) => !v)} aria-label={showResetPassword ? 'Hide password' : 'Show password'} title={showResetPassword ? 'Hide password' : 'Show password'}><Ic name="eye" size={17} /></button>
                  </div>
                </label>
                <label className="sl-field">
                  <span>Repeat new password</span>
                  <div className="sl-pw">
                    <input type={showResetPassword ? 'text' : 'password'} value={forgotConfirmPassword} onChange={(e) => setForgotConfirmPassword(e.target.value)} placeholder="Type it again" minLength={6} required autoComplete="new-password" />
                    <button type="button" onClick={() => setShowResetPassword((v) => !v)} aria-label={showResetPassword ? 'Hide password' : 'Show password'} title={showResetPassword ? 'Hide password' : 'Show password'}><Ic name="eye" size={17} /></button>
                  </div>
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

/** Shown when a seller signs in while the application is still being reviewed. */
function PendingReview({ info, loading, onCheck, onBack }) {
  const sent = info.submittedAt ? new Date(info.submittedAt) : null;
  const hours = info.reviewHours || 24;
  const due = sent ? new Date(sent.getTime() + hours * 3600000) : null;
  const late = due ? Date.now() > due.getTime() : false;
  const fmt = (d) => d.toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  return (
    <div className="sl-done sl-review">
      <span className="sl-done-ico review"><Ic name="clock" size={30} /></span>
      <h2>Your application is under review</h2>
      <p>
        Thank you for applying! Our team checks every application <b>within {hours} hours</b>. As soon as your store is approved you can sign in here with the
        same email and password — and we will also send you an email.
      </p>
      <dl className="sl-summary">
        {info.storeName && <div><dt>Store</dt><dd>{info.storeName}</dd></div>}
        {info.ownerName && <div><dt>Owner</dt><dd>{info.ownerName}</dd></div>}
        <div className="full"><dt>Email</dt><dd>{info.email}</dd></div>
        {sent && <div><dt>Applied on</dt><dd>{fmt(sent)}</dd></div>}
        {due && <div><dt>{late ? 'Expected by' : 'Decision by'}</dt><dd>{fmt(due)}</dd></div>}
        <div className="full"><dt>Status</dt><dd><span className="sl-pill">Under review</span></dd></div>
      </dl>
      {late && (
        <div className="sl-alert warn tight">
          <Ic name="clock" size={16} />
          <div><p>Your review is taking a little longer than usual. It will be completed soon — no need to apply again.</p></div>
        </div>
      )}
      <ol className="sl-next">
        <li className="done"><i><Ic name="check" size={12} /></i><span>Application sent</span></li>
        <li className="now"><i>2</i><span>Our team is checking your details and documents</span></li>
        <li><i>3</i><span>Store approved — sign in and start selling</span></li>
      </ol>
      <button type="button" className="sl-btn primary" onClick={onCheck} disabled={loading}>
        <Ic name="refresh" size={16} /> {loading ? 'Checking…' : 'Check my status again'}
      </button>
      <button type="button" className="sl-btn ghost" onClick={onBack}>Back to sign in</button>
      <p className="sl-fine">Please do not register again with the same email.</p>
    </div>
  );
}
