import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Ic from '../components/Icons.jsx';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token, admin } = await api('/auth/login', {
        method: 'POST',
        body: { email: email.trim(), password },
      });
      localStorage.setItem('ng_admin_token', token);
      localStorage.setItem('ng_admin', JSON.stringify(admin));
      localStorage.setItem('ng_admin_name', admin.name);
      navigate('/admin');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-login-page">
      <form className="card admin-login-card" onSubmit={submit}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 28, fontWeight: 900, color: '#f59e0b', letterSpacing: '-1px' }}>Bazario</span>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 2, marginTop: 2 }}>ADMIN PANEL</div>
        </div>
        <p className="muted-sm" style={{ textAlign: 'center', marginBottom: 20 }}>Sign in to manage your platform</p>
        {error && <div className="alert-error"><Ic name="x" size={14} /> {error}</div>}
        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@yourdomain.com"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
          />
        </div>
        <div className="field">
          <label>Password</label>
          <div className="pw-wrap">
            <input
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              autoCapitalize="none"
            />
            <button type="button" className="pw-eye" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
              <Ic name="eye" size={17} />
            </button>
          </div>
        </div>
        <button className="btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'SIGN IN'}</button>
      </form>
    </div>
  );
}
