import { useState, useEffect, useRef } from 'react';
import Ic from './Icons.jsx';

export default function OtpVerificationModal({
  isOpen,
  onClose,
  email,
  title = 'Verify Your Email Address',
  subtitle = 'We sent a 6-digit verification code to',
  onVerify, // async (otpString) => Promise<void>
  onResend, // async () => Promise<void>
  busy = false,
}) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [timer, setTimer] = useState(60);
  const [resending, setResending] = useState(false);
  const inputsRef = useRef([]);

  // Reset inputs when opened
  useEffect(() => {
    if (isOpen) {
      setDigits(['', '', '', '', '', '']);
      setError('');
      setSuccess('');
      setTimer(60);
      setTimeout(() => inputsRef.current[0]?.focus(), 150);
    }
  }, [isOpen]);

  // Countdown timer for resend code
  useEffect(() => {
    if (!isOpen || timer <= 0) return;
    const interval = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, timer]);

  if (!isOpen) return null;

  const handleChange = (index, value) => {
    // Only accept numeric digit
    const char = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);
    setError('');

    // If digit entered, advance to next box
    if (char && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }

    // If all 6 digits entered, auto-trigger verify
    if (char && index === 5 && newDigits.every((d) => d !== '')) {
      handleComplete(newDigits.join(''));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        setDigits(newDigits);
        inputsRef.current[index - 1]?.focus();
      } else {
        const newDigits = [...digits];
        newDigits[index] = '';
        setDigits(newDigits);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pastedData) return;

    const newDigits = [...digits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pastedData[i] || '';
    }
    setDigits(newDigits);

    const focusIdx = Math.min(pastedData.length, 5);
    inputsRef.current[focusIdx]?.focus();

    if (pastedData.length === 6) {
      handleComplete(pastedData);
    }
  };

  const handleComplete = async (otpString) => {
    setError('');
    try {
      await onVerify(otpString);
    } catch (err) {
      setError(err.message || 'Invalid verification code. Please try again.');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const otp = digits.join('');
    if (otp.length < 6) {
      return setError('Please enter all 6 digits of the verification code.');
    }
    handleComplete(otp);
  };

  const handleResendClick = async () => {
    if (timer > 0 || resending) return;
    setResending(true);
    setError('');
    setSuccess('');
    try {
      await onResend();
      setSuccess('A new 6-digit verification code has been sent to your email!');
      setTimer(60);
      setDigits(['', '', '', '', '', '']);
      inputsRef.current[0]?.focus();
    } catch (err) {
      setError(err.message || 'Failed to resend verification code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="seller-modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="seller-modal-box otp-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 440, padding: 0, overflow: 'hidden' }}
      >
        <div className="otp-modal-header">
          <div className="otp-icon-bubble">
            <Ic name="shield" size={24} />
          </div>
          <h3 className="otp-modal-title">{title}</h3>
          <p className="otp-modal-sub">
            {subtitle} <b>{email}</b>
          </p>
          <button type="button" onClick={onClose} className="otp-close-btn" aria-label="Close">
            <Ic name="x" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="otp-modal-body">
          {error && (
            <div className="alert-error" style={{ marginBottom: 16 }}>
              <Ic name="shield" size={15} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="alert-success" style={{ marginBottom: 16 }}>
              <Ic name="checkCircle" size={15} />
              <span>{success}</span>
            </div>
          )}

          <div className="otp-digits-container" onPaste={handlePaste}>
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => (inputsRef.current[idx] = el)}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                className={`otp-digit-box ${digit ? 'filled' : ''}`}
                disabled={busy}
                autoComplete="one-time-code"
              />
            ))}
          </div>

          <div className="otp-resend-row">
            {timer > 0 ? (
              <span className="otp-timer-text">
                ⏱️ Resend code in <b>0:{timer < 10 ? `0${timer}` : timer}</b>
              </span>
            ) : (
              <button
                type="button"
                onClick={handleResendClick}
                className="btn-otp-resend"
                disabled={resending || busy}
              >
                {resending ? 'Sending…' : '🔄 Resend Verification Code'}
              </button>
            )}
          </div>

          <button
            type="submit"
            className="btn-primary btn-block btn-otp-submit"
            disabled={busy || digits.join('').length < 6}
          >
            {busy ? 'Verifying Code…' : 'VERIFY & CONTINUE →'}
          </button>

          <p className="otp-modal-footnote">
            Didn't receive email? Check your <b>Spam or Promotions</b> folder.
          </p>
        </form>
      </div>
    </div>
  );
}
