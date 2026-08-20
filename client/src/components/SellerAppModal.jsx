import { useState, useEffect } from 'react';
import Ic from './Icons.jsx';

export default function SellerAppModal({ isOpen, onClose, defaultTab }) {
  const [activeTab, setActiveTab] = useState('android');
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Auto-detect OS
    const ua = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    if (defaultTab) {
      setActiveTab(defaultTab);
    } else if (isIOS) {
      setActiveTab('ios');
    } else {
      setActiveTab('android');
    }

    const handlePrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handlePrompt);
    return () => window.removeEventListener('beforeinstallprompt', handlePrompt);
  }, [defaultTab]);

  if (!isOpen) return null;

  const handleNativeInstall = async () => {
    if (deferredPrompt) {
      setInstalling(true);
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        onClose();
      }
      setInstalling(false);
      setDeferredPrompt(null);
    } else {
      alert('To install directly: Tap your browser menu (3 dots ⋮) and select "Install app" or "Add to Home screen".');
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="seller-app-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="seller-app-modal-head">
          <div className="modal-head-brand">
            <div className="app-icon-badge">
              <img src="/icon-192.svg" alt="Bazario App" />
            </div>
            <div>
              <h3>📱 Bazario Seller Central App</h3>
              <p>Official Merchant App for Android &amp; iOS</p>
            </div>
          </div>
          <button className="btn-close-modal" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Platform Switcher Tabs */}
        <div className="seller-app-tabs">
          <button
            type="button"
            className={`seller-app-tab ${activeTab === 'android' ? 'active' : ''}`}
            onClick={() => setActiveTab('android')}
          >
            🤖 Android (APK &amp; PWA)
          </button>
          <button
            type="button"
            className={`seller-app-tab ${activeTab === 'ios' ? 'active' : ''}`}
            onClick={() => setActiveTab('ios')}
          >
            🍎 iPhone / iPad (iOS)
          </button>
        </div>

        {/* Tab 1: Android Content */}
        {activeTab === 'android' && (
          <div className="seller-app-tab-content">
            <div className="app-feature-box">
              <div className="app-feature-item">
                <span className="feature-ic">⚡</span>
                <span><b>Instant Push Alerts:</b> Real-time sound notifications on every new customer order.</span>
              </div>
              <div className="app-feature-item">
                <span className="feature-ic">📦</span>
                <span><b>Quick Dispatch:</b> Manage orders, scan barcodes, and fulfill items anywhere.</span>
              </div>
              <div className="app-feature-item">
                <span className="feature-ic">💬</span>
                <span><b>Direct Live Chat:</b> Instant support messenger with Admin &amp; file sharing.</span>
              </div>
            </div>

            <div className="app-download-grid">
              {/* Option 1: 1-Click PWA App Install */}
              <div className="download-card pwa-install-card">
                <div className="dc-badge">RECOMMENDED (FASTEST)</div>
                <h4>⚡ 1-Click Instant App Install</h4>
                <p>Installs directly onto your Android device without consuming storage space.</p>
                <button
                  type="button"
                  className="btn-primary btn-block btn-app-action"
                  onClick={handleNativeInstall}
                  disabled={installing}
                >
                  <Ic name="download" size={16} /> {installing ? 'Installing...' : 'Install Seller App Now'}
                </button>
              </div>

              {/* Option 2: Download APK File */}
              <div className="download-card apk-download-card">
                <div className="dc-badge secondary">DIRECT PACKAGE</div>
                <h4>📥 Download Android APK File</h4>
                <p>Download the standalone APK package installer directly to your mobile.</p>
                <a
                  href="/downloads/bazario-seller.apk"
                  download="bazario-seller.apk"
                  className="btn-secondary btn-block btn-app-action btn-apk"
                >
                  <Ic name="package" size={16} /> Download .APK Package
                </a>
              </div>
            </div>

            {/* Android Browser Manual Setup Guide */}
            <div className="android-manual-steps">
              <b>💡 Alternative Setup (Add to Home Screen):</b>
              <ol>
                <li>Tap the <b>3 dots menu (⋮)</b> in top right of Chrome / browser.</li>
                <li>Tap <b>"Install app"</b> or <b>"Add to Home screen"</b>.</li>
                <li>Tap <b>Add / Install</b> to place the app on your home screen.</li>
              </ol>
            </div>
          </div>
        )}

        {/* Tab 2: iOS Content */}
        {activeTab === 'ios' && (
          <div className="seller-app-tab-content">
            <div className="ios-instructions-box">
              <div className="ios-banner-header">
                <span className="ios-safari-badge">Safari Browser Guide</span>
                <h4>How to Install on iPhone &amp; iPad</h4>
                <p>Apple iOS supports full-screen Web Apps directly through Safari with zero App Store downloads needed:</p>
              </div>

              <div className="ios-steps-list">
                <div className="ios-step-card">
                  <div className="ios-step-circle">1</div>
                  <div className="ios-step-text">
                    <b>Open in Safari</b>
                    <span>Make sure you are viewing this page in the default Apple Safari browser.</span>
                  </div>
                </div>

                <div className="ios-step-card">
                  <div className="ios-step-circle">2</div>
                  <div className="ios-step-text">
                    <b>Tap the Share Icon</b>
                    <span>Tap the <b>Share button (⎋ / square with up arrow)</b> at the bottom navigation bar of your screen.</span>
                  </div>
                </div>

                <div className="ios-step-card">
                  <div className="ios-step-circle">3</div>
                  <div className="ios-step-text">
                    <b>Select "Add to Home Screen"</b>
                    <span>Scroll down in the share menu and tap <b>"Add to Home Screen" (➕)</b>.</span>
                  </div>
                </div>

                <div className="ios-step-card">
                  <div className="ios-step-circle">4</div>
                  <div className="ios-step-text">
                    <b>Tap "Add" in Top Right</b>
                    <span>Tap <b>Add</b>. The Bazario Seller Hub app icon will now appear on your home screen! 🚀</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="seller-app-modal-footer">
          <button type="button" className="btn-outline" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}