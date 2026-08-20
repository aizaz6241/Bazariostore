import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Ic from './Icons.jsx';

export default function NotificationToast({ toasts = [], onDismiss }) {
  const navigate = useNavigate();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="global-toast-container" aria-live="polite">
      {toasts.map((toast) => {
        const getIcon = () => {
          const t = toast.type || 'system';
          if (t.includes('deposit') || t === 'payment') return 'banknote';
          if (t.includes('withdraw')) return 'wallet';
          if (t.includes('order')) return 'package';
          if (t.includes('chat') || t.includes('message')) return 'chat';
          if (t.includes('success') || t.includes('approve')) return 'badgeCheck';
          return 'bell';
        };

        const getToastClass = () => {
          const t = toast.type || 'system';
          if (t.includes('deposit') || t === 'payment') return 'toast-deposit';
          if (t.includes('withdraw')) return 'toast-withdraw';
          if (t.includes('order')) return 'toast-order';
          if (t.includes('chat')) return 'toast-chat';
          if (t.includes('success') || t.includes('approve')) return 'toast-success';
          return 'toast-default';
        };

        return (
          <div
            key={toast.id}
            className={`global-toast-item ${getToastClass()}`}
            onClick={() => {
              if (toast.link) {
                navigate(toast.link);
                if (onDismiss) onDismiss(toast.id);
              }
            }}
          >
            <div className="toast-icon-wrap">
              <Ic name={getIcon()} size={20} stroke={2.2} />
            </div>

            <div className="toast-content">
              <b className="toast-title">{toast.title}</b>
              {toast.body && <p className="toast-body">{toast.body}</p>}
            </div>

            <button
              type="button"
              className="toast-close-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (onDismiss) onDismiss(toast.id);
              }}
              title="Dismiss"
            >
              <Ic name="x" size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
