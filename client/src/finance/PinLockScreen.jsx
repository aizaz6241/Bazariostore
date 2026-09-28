import React, { useState, useEffect } from 'react';
import Ic from '../components/Icons.jsx';

export default function PinLockScreen({ onUnlock, defaultPin = '7860' }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleKeyPress = (num) => {
    if (pin.length < 6) {
      const nextPin = pin + num;
      setPin(nextPin);
      setError('');
      if (nextPin.length >= 4) {
        verify(nextPin);
      }
    }
  };

  const handleDelete = () => {
    if (pin.length > 0) {
      setPin(pin.slice(0, -1));
      setError('');
    }
  };

  const handleClear = () => {
    setPin('');
    setError('');
  };

  const verify = async (pinToTest) => {
    setLoading(true);
    try {
      const res = await fetch('/api/business-finance/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinToTest }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        onUnlock(data.token, data.settings, pinToTest);
      } else {
        setError(data.message || 'Incorrect PIN. Please try again.');
        setTimeout(() => setPin(''), 600);
      }
    } catch (err) {
      // Fallback check against default pin if backend server offline
      if (pinToTest === defaultPin) {
        onUnlock('offline_session_token', null, pinToTest);
      } else {
        setError('Incorrect Security PIN. Please try again.');
        setTimeout(() => setPin(''), 600);
      }
    } finally {
      setLoading(false);
    }
  };

  // Allow physical keyboard typing
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key >= '0' && e.key <= '9') {
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      } else if (e.key === 'Escape') {
        handleClear();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin]);

  return (
    <div className="bf-lock-screen">
      <div className="bf-lock-box">
        <div className="bf-lock-badge">
          <i><Ic name="shield" size={14} /></i>
          <span>PARTNER CONFIDENTIAL</span>
        </div>

        <div className="bf-lock-icon">
          <Ic name="lock" size={28} />
        </div>

        <h1 className="bf-lock-title">Business Finance</h1>
        <p className="bf-lock-sub">
          Confidential Partner Ledger & Investment Hub.<br />
          Enter Security PIN to unlock.
        </p>

        {/* Visual Dots */}
        <div className="bf-pin-dots">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`bf-pin-dot ${pin.length > idx ? 'filled' : ''}`}
            />
          ))}
        </div>

        {/* Error message */}
        <div className="bf-lock-error">
          {error}
        </div>

        {/* Numeric Tactile Keypad */}
        <div className="bf-keypad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              type="button"
              className="bf-key-btn"
              onClick={() => handleKeyPress(String(num))}
              disabled={loading}
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            className="bf-key-btn action"
            onClick={handleClear}
          >
            Clear
          </button>
          <button
            type="button"
            className="bf-key-btn"
            onClick={() => handleKeyPress('0')}
            disabled={loading}
          >
            0
          </button>
          <button
            type="button"
            className="bf-key-btn action"
            onClick={handleDelete}
          >
            ⌫
          </button>
        </div>
      </div>
    </div>
  );
}
