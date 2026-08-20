import { useEffect, useState } from 'react';
import Ic from './Icons.jsx';

export default function InstallAppBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already in standalone app mode
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    setIsStandalone(standalone);
    if (standalone) return;

    // Detect iOS
    const ua = window.navigator.userAgent.toLowerCase();
    const isApple = /iphone|ipad|ipod/.test(ua);
    setIsIOS(isApple);

    // Check if dismissed recently
    const dismissed = localStorage.getItem('bazario_pwa_dismissed');
    if (dismissed && Date.now() - Number(dismissed) < 1000 * 60 * 60 * 24 * 3) {
      return; // Suppress for 3 days after user closes
    }

    // Android/Chrome/Edge beforeinstallprompt listener
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // On iOS, show banner if not standalone
    if (isApple && !standalone) {
      setShowBanner(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    } else if (isIOS) {
      setShowIOSModal(true);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('bazario_pwa_dismissed', Date.now().toString());
  };

  if (isStandalone || !showBanner) return null;

  return (
    <>
      <div className="pwa-install-banner">
        <div className="pwa-icon-col">
          <img src="/icon-192.svg" alt="Bazario App" className="pwa-app-icon" />
        </div>
        <div className="pwa-text-col">
          <div className="pwa-title-row">
            <span className="pwa-app-title">Bazario Mobile App</span>
            <span className="pwa-official-tag">Official</span>
          </div>
          <p className="pwa-app-subtitle">
            Fast, lightweight, offline-ready & instant notification alerts!
          </p>
        </div>
        <div className="pwa-actions-col">
          <button onClick={handleInstallClick} className="btn-pwa-install">
            <Ic name="download" size={14} /> Install App
          </button>
          <button onClick={handleDismiss} className="btn-pwa-close" title="Dismiss">
            ✕
          </button>
        </div>
      </div>

      {/* iOS Step-by-Step Install Modal */}
      {showIOSModal && (
        <div className="admin-modal-overlay" onClick={() => setShowIOSModal(false)}>
          <div className="pwa-ios-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <h3>📱 Install Bazario on iPhone / iPad</h3>
              <button onClick={() => setShowIOSModal(false)} className="btn-close-modal">✕</button>
            </div>
            <div style={{ padding: '16px 20px', fontSize: 13.5, color: '#334155', lineHeight: 1.6 }}>
              <p style={{ margin: '0 0 14px' }}>
                Install the Bazario app on your home screen for full-screen mode and instant alerts:
              </p>
              <div className="ios-step-item">
                <span className="step-num">1</span>
                <span>Tap the <b>Share button</b> (⎋ / square with arrow) in Safari bottom bar.</span>
              </div>
              <div className="ios-step-item">
                <span className="step-num">2</span>
                <span>Scroll down and tap <b>"Add to Home Screen"</b> (➕).</span>
              </div>
              <div className="ios-step-item">
                <span className="step-num">3</span>
                <span>Tap <b>"Add"</b> in the top right corner. Done! 🚀</span>
              </div>
            </div>
            <div className="modal-bottom-actions" style={{ padding: '12px 20px' }}>
              <button onClick={() => setShowIOSModal(false)} className="btn-primary full-width">
                Got It, Thanks!
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
