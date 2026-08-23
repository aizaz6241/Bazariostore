import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { CartProvider } from './cart.jsx';
import { AuthProvider } from './auth.jsx';
import { ContentProvider } from './content.jsx';
import { CurrencyProvider } from './context/CurrencyContext.jsx';
import './styles/base.css';
import './styles/components.css';
import './styles/storefront.css';
import './styles/seller.css';
import './styles/admin.css';
import './styles/chat.css';
import './styles/responsive.css';
import './styles.css';

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
              <App />
            </CartProvider>
          </AuthProvider>
        </ContentProvider>
      </CurrencyProvider>
    </BrowserRouter>
  </React.StrictMode>
);
