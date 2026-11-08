import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { CartProvider } from './cart.jsx';
import { AuthProvider } from './auth.jsx';
import { ContentProvider } from './content.jsx';
import { CurrencyProvider } from './context/CurrencyContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './styles/base.css';
import './styles/components.css';
import './styles/storefront.css';
import './styles/seller.css';
import './styles/admin.css';
import './styles/chat.css';
import './styles/responsive.css';
import './styles/seller/treasury.css';
import './styles/admin/treasury.css';
import './styles.css';
// admin visual refresh: loaded last so it wins over the older admin rules
import './styles/admin/affiliates.css';
import './styles/admin/refresh.css';

// Safety net for pages translated by the browser (Google Translate / Edge / Samsung Internet).
// The translator swaps React's text for its own <font> tags; when React later removes or moves that
// text, the browser throws "NotFoundError: removeChild … not a child of this node" and the whole page
// shows the error screen. Here such a step is skipped (the translator re-draws the text) instead of crashing.
if (typeof Node === 'function' && Node.prototype && !Node.prototype.__bzSafeDom) {
  const origRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    if (child && child.parentNode !== this) {
      if (child.parentNode) return origRemoveChild.call(child.parentNode, child);
      return child;
    }
    return origRemoveChild.call(this, child);
  };
  const origInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (newNode, refNode) {
    if (refNode && refNode.parentNode !== this) return origInsertBefore.call(this, newNode, null);
    return origInsertBefore.call(this, newNode, refNode);
  };
  Node.prototype.__bzSafeDom = true;
}

// PWA Service Worker Management
if ('serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    // In development mode: Unregister existing service workers and clear cache to avoid stale styling
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
      }
    });
    if ('caches' in window) {
      caches.keys().then((names) => {
        for (const name of names) caches.delete(name);
      });
    }
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          reg.update().catch(() => {});
          console.log('✅ Bazario PWA Service Worker Active:', reg.scope);
        })
        .catch((err) => {
          console.log('SW note:', err.message);
        });
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <CurrencyProvider>
        <ContentProvider>
          <AuthProvider>
            <CartProvider>
              <ErrorBoundary>
                <App />
              </ErrorBoundary>
            </CartProvider>
          </AuthProvider>
        </ContentProvider>
      </CurrencyProvider>
    </BrowserRouter>
  </React.StrictMode>
);
