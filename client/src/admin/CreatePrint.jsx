import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Ic from '../components/Icons.jsx';
import { buildCreatePrintDoc, CREATE_PRINT_SANDBOX } from './createPrintDoc.js';

// Create / Print — the private tool, admins only. The files come from the server only after the
// admin login is checked (/api/private-tools/create-print) and run in a locked frame.
let memo = null; // keep it for this visit so re-opening is instant

export default function CreatePrint() {
  const [doc, setDoc] = useState(memo);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const boxRef = useRef(null);

  const load = async () => {
    setError('');
    try {
      const r = await api('/private-tools/create-print', { timeout: 60000 });
      memo = buildCreatePrintDoc(r.files);
      setDoc(memo);
    } catch (e) {
      setError(e.message || 'Could not open the tool.');
    }
  };

  useEffect(() => {
    if (!memo) load();
  }, []);

  const fullScreen = () => {
    const el = boxRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="cp-page">
      <div className="cp-bar">
        <Link to="/admin" className="ins-btn">
          <Ic name="arrowLeft" size={14} /> Dashboard
        </Link>
        <div className="cp-title">
          <Ic name="shield" size={16} /> Create / Print
        </div>
        <div className="cp-actions">
          <button type="button" className="ins-btn" onClick={() => setReloadKey((k) => k + 1)} disabled={!doc}>
            <Ic name="refresh" size={14} /> Restart
          </button>
          <button type="button" className="ins-btn" onClick={fullScreen} disabled={!doc}>
            Full screen
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: 18, margin: '12px 0' }}>
          <b>Could not open Create / Print.</b> <span className="muted">{error}</span>{' '}
          <button type="button" className="ins-btn" onClick={load}>Try again</button>
        </div>
      )}

      <div ref={boxRef} className="cp-frame-box">
        {doc ? (
          <iframe
            key={reloadKey}
            title="Create / Print"
            className="cp-frame"
            sandbox={CREATE_PRINT_SANDBOX}
            allow="fullscreen; clipboard-write"
            referrerPolicy="no-referrer"
            srcDoc={doc}
          />
        ) : (
          !error && <div className="cp-loading">Opening…</div>
        )}
      </div>

      <style>{`
        .cp-page{display:flex;flex-direction:column;gap:10px;min-height:calc(100vh - 110px)}
        .cp-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
        .cp-title{display:flex;align-items:center;gap:6px;font-weight:700;font-size:16px;flex:1;min-width:140px}
        .cp-actions{display:flex;gap:8px}
        .cp-frame-box{flex:1;display:flex;border:1px solid var(--border,#e2e8f0);border-radius:14px;overflow:hidden;background:#fff;min-height:70vh}
        .cp-frame-box:fullscreen{border-radius:0}
        .cp-frame{flex:1;width:100%;border:0;min-height:70vh;background:#fff}
        .cp-loading{margin:auto;color:#64748b;padding:40px}
      `}</style>
    </div>
  );
}
