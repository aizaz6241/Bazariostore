import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Logo } from '../components/StoreLayout.jsx';
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
        <Logo />
        <h2>Admin Panel</h2>
        <p className="muted-sm">Sign in to manage your store</p>
        {error && <div className="alert-error"><Ic name="x" size={14} /> {error}</div>}
        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@nayabglow.com"
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
          {show && password && /\s/.test(password) && (
            <small className="field-err">Warning: password mein space hai — check kar lein</small>
          )}
        </div>
        <button className="btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'SIGN IN'}</button>
      </form>
    </div>
  );
}
