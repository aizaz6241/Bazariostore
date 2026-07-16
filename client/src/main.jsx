import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { CartProvider } from './cart.jsx';
import { AuthProvider } from './auth.jsx';
import { ContentProvider } from './content.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ContentProvider>
        <AuthProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </AuthProvider>
      </ContentProvider>
    </BrowserRouter>
  </React.StrictMode>
);
