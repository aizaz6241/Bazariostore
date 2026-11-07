import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Ic from '../components/Icons.jsx';
import OtpVerificationModal from '../components/OtpVerificationModal.jsx';

function AuthShell({ title, sub, children }) {
  return (
    <div className="auth-page">
      <div className="card auth-card">
        <div className="seller-auth-brand">
          <div className="amazon-logo-seller">
            <span className="brand-prime" style={{ fontWeight: 900, letterSpacing: '-1px', color: '#0f172a' }}>Bazario</span>
            <span className="brand-hub" style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}>Customer</span>
          </div>
          <p className="seller-auth-sub">{sub || 'Manage your account, order tracking & fast checkout'}</p>
        </div>

        {/* This page is for shoppers. A seller who lands here is sent to Seller Center in one tap. */}
        <div className="auth-seller-strip" role="note">
          <span className="ass-ic" aria-hidden="true">🏪</span>
          <div className="ass-txt">
            <b>Are you a seller?</b>
            <small>This page is for customers (shopping). Sellers login here:</small>
          </div>
          <div className="ass-btns">
            <Link to="/seller/login" className="ass-btn">Seller login</Link>
            <Link to="/seller/login?mode=register" className="ass-btn green">Register store</Link>
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api('/user/login', { method: 'POST', body: { email, password } });
      login(d.token, d.user);
      navigate(params.get('next') || '/account');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Sign In" sub="Sign in to your customer account">
      <form onSubmit={submit} className="auth-form-clean">
        {error && <div className="alert-error"><Ic name="x" size={14} /> {error}</div>}
        <div className="field">
          <label>Email Address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoFocus
          />
        </div>
        <div className="field">
          <label style={{ marginBottom: 4 }}>Password</label>
          <div className="pw-wrap" style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{ paddingRight: 38 }}
            />
            <button
              type="button"
              className="pw-eye"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
            >
              <Ic name="eye" size={16} />
            </button>
          </div>
        </div>
        <button className="btn-primary btn-block btn-auth-submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in as customer'}
        </button>

        {/* Customer Support Password Reset Notice */}
        <div style={{ marginTop: 14, padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#64748b', textAlign: 'center', lineHeight: 1.45 }}>
          🔒 <b>Forgot password?</b> Please contact <b>Customer Support</b>. Our team will verify your account and provide a new reset password.
        </div>
      </form>

      <div className="auth-links" style={{ justifyContent: 'center', marginTop: 16 }}>
        <span>New customer? <Link to="/register" style={{ fontWeight: 700, color: '#2563eb' }}>Create an account</Link></span>
      </div>

    </AuthShell>
  );
}

export function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api('/user/register', { method: 'POST', body: form });
      if (res.requiresOtp) {
        setOtpModalOpen(true);
      } else if (res.token) {
        login(res.token, res.user);
        navigate('/account');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (otpString) => {
    setOtpBusy(true);
    try {
      const res = await api('/user/verify-otp', {
        method: 'POST',
        body: { email: form.email, otp: otpString },
      });
      login(res.token, res.user);
      setOtpModalOpen(false);
      navigate('/account');
    } finally {
      setOtpBusy(false);
    }
  };

  const handleResendOtp = async () => {
    await api('/user/send-otp', {
      method: 'POST',
      body: { email: form.email, name: form.name },
    });
  };

  return (
    <AuthShell title="Create Account" sub="Create your customer account — save addresses and order history">
      <form onSubmit={submit} className="auth-form-clean">
        {error && <div className="alert-error"><Ic name="x" size={14} /> {error}</div>}
        <div className="field">
          <label>Full Name</label>
          <input value={form.name} onChange={set('name')} placeholder="Your full name" required autoFocus />
        </div>
        <div className="field">
          <label>Email Address (For Verification Code)</label>
          <input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required />
        </div>
        <div className="field">
          <label>Phone Number</label>
          <input value={form.phone} onChange={set('phone')} placeholder="+1 (555) 000-0000" required />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={form.password} onChange={set('password')} placeholder="At least 6 characters" required />
        </div>
        <button className="btn-primary btn-block btn-auth-submit" disabled={busy}>
          {busy ? 'Sending Verification Code…' : 'CREATE ACCOUNT & VERIFY EMAIL →'}
        </button>
      </form>

      <div className="auth-links" style={{ justifyContent: 'center', marginTop: 16 }}>
        <span>Already have an account? <Link to="/login" style={{ fontWeight: 700, color: '#2563eb' }}>Sign In</Link></span>
      </div>

      {/* OTP Verification Modal */}
      <OtpVerificationModal
        isOpen={otpModalOpen}
        onClose={() => setOtpModalOpen(false)}
        email={form.email}
        title="Verify Customer Email"
        onVerify={handleVerifyOtp}
        onResend={handleResendOtp}
        busy={otpBusy}
      />
    </AuthShell>
  );
}

export function Forgot() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api('/user/forgot', { method: 'POST', body: { email } });
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Forgot Password" sub="Enter your registered email address to receive password reset link & OTP code">
      {result ? (
        <div className="forgot-result">
          <div className="alert-success" style={{ marginBottom: 14 }}>
            <Ic name="checkCircle" size={16} />
            <span>{result.message}</span>
          </div>
          <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.5, margin: '0 0 16px' }}>
            We've dispatched an email to <b>{email}</b> containing a secure 1-click password reset link and a 6-digit recovery code.
            {' '}Not in your inbox? Please check your <b>Spam / Junk</b> folder.
          </p>
          <Link
            to={`/reset-password?email=${encodeURIComponent(email)}`}
            className="btn-primary btn-block"
            style={{ textAlign: 'center', textDecoration: 'none' }}
          >
            ENTER 6-DIGIT CODE TO RESET PASSWORD →
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="auth-form-clean">
          {error && <div className="alert-error"><Ic name="x" size={14} /> {error}</div>}
          <div className="field">
            <label>Registered Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>
          <button className="btn-primary btn-block btn-auth-submit" disabled={busy}>
            {busy ? 'Sending Reset Email…' : 'SEND PASSWORD RECOVERY EMAIL →'}
          </button>
        </form>
      )}
      <div className="auth-links" style={{ justifyContent: 'center', marginTop: 16 }}>
        <Link to="/login" style={{ fontWeight: 700, color: '#2563eb' }}>← Back to login</Link>
      </div>
    </AuthShell>
  );
}

export function Reset() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const urlToken = params.get('token') || '';
  const urlEmail = params.get('email') || '';

  const [email, setEmail] = useState(urlEmail);
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return setError('Passwords do not match');
    setBusy(true);
    setError('');
    try {
      const payload = {
        password,
        ...(urlToken ? { token: urlToken } : { email: email.trim(), otp: otp.trim() }),
      };
      const d = await api('/user/reset', { method: 'POST', body: payload });
      setSuccess(d.message || 'Password reset successfully!');
      setTimeout(() => {
        if (d.token) login(d.token, d.user);
        navigate('/account');
      }, 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Reset Password" sub="Set a new secure password for your customer account">
      <form onSubmit={submit} className="auth-form-clean">
        {error && <div className="alert-error"><Ic name="x" size={14} /> {error}</div>}
        {success && <div className="alert-success"><Ic name="checkCircle" size={14} /> {success}</div>}

        {!urlToken && (
          <>
            <div className="field">
              <label>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="field">
              <label>6-Digit Recovery Code (From Email)</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="e.g. 749201"
                required
              />
            </div>
          </>
        )}

        <div className="field">
          <label>New Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            required
            autoFocus
          />
        </div>
        <div className="field">
          <label>Confirm New Password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter new password"
            required
          />
        </div>
        <button className="btn-primary btn-block btn-auth-submit" disabled={busy}>
          {busy ? 'Updating Password…' : 'UPDATE PASSWORD & SIGN IN →'}
        </button>
      </form>
    </AuthShell>
  );
}


