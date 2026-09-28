import React, { useState, useEffect } from 'react';
import Ic from '../components/Icons.jsx';

export default function InstallShortcutModal({ isOpen, onClose }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      alert('To add this shortcut:\n• On Chrome / Android: Tap the 3 dots (⋮) and select "Add to Home screen" or "Install app".\n• On iPhone / Safari: Tap Share (⎋) and choose "Add to Home Screen".');
    }
  };

  return (
    <div className="bf-modal-backdrop" onClick={onClose}>
      <div className="bf-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bf-modal-header">
          <h2 className="bf-modal-title">
            <span>📲</span>
            <span>Install App on Home Screen</span>
          </h2>
          <button type="button" className="bf-icon-btn" onClick={onClose}>
            <Ic name="x" size={18} />
          </button>
        </div>

        <div className="bf-modal-body">
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, marginBottom: 12, boxShadow: '0 8px 24px rgba(245, 158, 11, 0.3)' }}>
              💎
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: '0 0 6px' }}>Bazario Finance Manager</h3>
            <p style={{ fontSize: 13, color: 'var(--bf-text-muted)', margin: 0 }}>
              Launch separately from your mobile home screen with instant PIN lock protection.
            </p>
          </div>

          {/* Quick Install Action Button */}
          <button
            type="button"
            className="bf-btn-submit"
            onClick={handleInstallClick}
            style={{ marginBottom: 20 }}
          >
            {installed ? '✅ Added to Home Screen!' : '📲 Add Shortcut to Home Screen'}
          </button>

          {/* Step-by-step guides */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: 12, padding: 14, border: '1px solid var(--bf-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color: '#60a5fa', marginBottom: 6 }}>
                <span>🤖 Android (Google Chrome)</span>
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--bf-text-muted)', lineHeight: 1.6 }}>
                <li>Tap the <b>three dots menu (⋮)</b> in the top right corner of Chrome.</li>
                <li>Select <b>"Add to Home screen"</b> or <b>"Install app"</b>.</li>
                <li>Tap <b>Install</b>. A dedicated "Bazario Finance" icon will appear on your phone home screen!</li>
              </ol>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: 12, padding: 14, border: '1px solid var(--bf-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color: '#f43f5e', marginBottom: 6 }}>
                <span>🍎 iPhone / iPad (Safari)</span>
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--bf-text-muted)', lineHeight: 1.6 }}>
                <li>Tap the <b>Share button</b> (the square with an arrow pointing up ⎋) at the bottom.</li>
                <li>Scroll down and tap <b>"Add to Home Screen"</b>.</li>
                <li>Tap <b>Add</b> in the top right. It will open like a native iOS financial application!</li>
              </ol>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: 12, padding: 14, border: '1px solid var(--bf-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color: '#f59e0b', marginBottom: 6 }}>
                <span>🔒 Privacy & Stealth Guarantee</span>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--bf-text-muted)', lineHeight: 1.5 }}>
                This portal is strictly concealed from regular marketplace staff and admins. Even if someone opens your phone, your confidential transactions and partner profit splits are secured behind your custom PIN.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
