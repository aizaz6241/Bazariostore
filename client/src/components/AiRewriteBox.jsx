import { useState, useEffect } from 'react';
import { api } from '../api.js';
import Ic from './Icons.jsx';

const TONES = [
  { id: 'professional', label: '💼 Professional', tip: 'Balanced, polite, and clear' },
  { id: 'concise', label: '⚡ Short & Direct', tip: 'Quick, concise, without extra words' },
  { id: 'polite', label: '🤝 Polite & Soft', tip: 'Warm, highly respectful, customer-friendly' },
  { id: 'roman_urdu', label: '📝 Roman Urdu', tip: 'Clean & professional Roman Urdu' },
  { id: 'urdu', label: '🇵🇰 اردو', tip: 'Formal Urdu Nastaliq text' },
  { id: 'english', label: '🌐 English', tip: 'Polite business English' },
];

export default function AiRewriteBox({
  text = '',
  onApply,
  onApplyAndSend,
  disabled = false,
  compact = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [originalDraft, setOriginalDraft] = useState('');
  const [tone, setTone] = useState('professional');
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  // Close preview if parent draft was cleared outside
  useEffect(() => {
    if (!text.trim() && !loading && !suggestion) {
      setIsOpen(false);
    }
  }, [text, loading, suggestion]);

  const handleRewrite = async (overrideTone = null) => {
    const targetTone = overrideTone || tone;
    const cleanDraft = text.trim();

    if (!cleanDraft) {
      alert('Please type a draft message in the input box first before using AI Rewrite.');
      return;
    }

    setLoading(true);
    setError(null);
    setIsOpen(true);
    setOriginalDraft(cleanDraft);
    if (overrideTone) setTone(overrideTone);

    try {
      const res = await api('/chat/admin/ai-rewrite', {
        method: 'POST',
        body: { text: cleanDraft, tone: targetTone },
      });

      if (res?.ok && res?.rewritten) {
        setSuggestion(res.rewritten);
      } else {
        throw new Error(res?.message || 'Failed to rewrite message');
      }
    } catch (err) {
      console.error('AI Rewrite error:', err);
      setError(err.message || 'AI service is temporarily unavailable. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!suggestion) return;
    if (typeof onApply === 'function') {
      onApply(suggestion);
    }
    setIsOpen(false);
  };

  const handleApplyAndSend = () => {
    if (!suggestion) return;
    if (typeof onApplyAndSend === 'function') {
      onApplyAndSend(suggestion);
      setIsOpen(false);
    } else if (typeof onApply === 'function') {
      onApply(suggestion);
      setIsOpen(false);
    }
  };

  const handleCopy = () => {
    if (!suggestion) return;
    navigator.clipboard?.writeText(suggestion);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDiscard = () => {
    setIsOpen(false);
    setError(null);
  };

  const hasDraft = Boolean(text.trim());

  return (
    <div className="ai-rewrite-wrapper">
      {/* ─── SUGGESTION PREVIEW CARD (Visible when AI is working or generated) ─── */}
      {isOpen && (
        <div className={`ai-suggestion-card ${compact ? 'ai-card-compact' : ''}`}>
          {/* Header */}
          <div className="ai-card-header">
            <div className="ai-card-title-group">
              <span className="ai-sparkle-icon">✨</span>
              <b className="ai-card-title">AI Rewritten Suggestion</b>
              <span className="ai-model-badge" title="Powered by NVIDIA Nemotron 3 550B via OpenRouter">
                Nemotron 3
              </span>
            </div>

            <div className="ai-card-top-actions">
              <button
                type="button"
                className="ai-card-btn-close"
                onClick={handleDiscard}
                title="Close preview (leaves your input untouched)"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Tone Selector Pills */}
          <div className="ai-tone-bar">
            <span className="ai-tone-label">Tone:</span>
            <div className="ai-tone-pills">
              {TONES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`ai-tone-pill ${tone === t.id ? 'active' : ''}`}
                  onClick={() => handleRewrite(t.id)}
                  disabled={loading}
                  title={t.tip}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Body Content */}
          <div className="ai-card-body">
            {loading && (
              <div className="ai-loading-state">
                <div className="ai-spinner"></div>
                <div className="ai-loading-text">
                  <span>Generating professional rewrite with AI...</span>
                  <small className="muted-sm">Optimizing tone, clarity, and conciseness</small>
                </div>
              </div>
            )}

            {!loading && error && (
              <div className="ai-error-state">
                <span className="ai-error-icon">⚠️</span>
                <div className="ai-error-text">
                  <b>Rewrite failed</b>
                  <p>{error}</p>
                </div>
                <button
                  type="button"
                  className="ai-btn-retry"
                  onClick={() => handleRewrite(tone)}
                >
                  Try Again
                </button>
              </div>
            )}

            {!loading && !error && suggestion && (
              <>
                <div className="ai-suggestion-box">
                  <p className="ai-suggestion-text">{suggestion}</p>
                </div>

                {originalDraft && originalDraft !== suggestion && (
                  <div className="ai-original-preview">
                    <span className="ai-orig-label">Your original draft:</span>
                    <span className="ai-orig-text">"{originalDraft}"</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Action Buttons */}
          {!loading && !error && suggestion && (
            <div className="ai-card-footer">
              <div className="ai-footer-left">
                <button
                  type="button"
                  className="ai-btn-secondary"
                  onClick={handleCopy}
                  title="Copy to clipboard"
                >
                  {copied ? '✓ Copied' : '📋 Copy'}
                </button>
                <button
                  type="button"
                  className="ai-btn-secondary"
                  onClick={() => handleRewrite(tone)}
                  title="Generate another variation"
                >
                  🔄 Regenerate
                </button>
                <button
                  type="button"
                  className="ai-btn-discard"
                  onClick={handleDiscard}
                  title="Cancel and keep current text"
                >
                  Discard
                </button>
              </div>

              <div className="ai-footer-right">
                <button
                  type="button"
                  className="ai-btn-apply"
                  onClick={handleApply}
                  title="Overwrite input field with this rewritten text"
                >
                  ✅ Apply (Use This)
                </button>
                {onApplyAndSend && (
                  <button
                    type="button"
                    className="ai-btn-apply-send"
                    onClick={handleApplyAndSend}
                    title="Apply text and send message immediately"
                  >
                    🚀 Apply &amp; Send
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TRIGGER BUTTON (Shown in Chat Bar) ─── */}
      <button
        type="button"
        className={`btn-ai-rewrite-trigger ${hasDraft ? 'has-draft' : ''} ${isOpen ? 'active' : ''}`}
        onClick={() => handleRewrite()}
        disabled={disabled || loading || !hasDraft}
        title={
          hasDraft
            ? '✨ Rewrite & Polish message with AI (NVIDIA Nemotron)'
            : 'Type a message first to rewrite with AI'
        }
      >
        <span className="ai-trigger-sparkle">✨</span>
        <span className="ai-trigger-text">{compact ? 'AI' : 'AI Rewrite'}</span>
      </button>
    </div>
  );
}
