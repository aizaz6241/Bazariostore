import { useState, useEffect } from 'react';
import { api } from '../api.js';
import Ic from './Icons.jsx';

const TONES = [
  { id: 'auto', label: '⚡ Auto (Urdu / English)', tip: 'Auto-detects Urdu script or English & polishes it' },
  { id: 'urdu', label: '🇵🇰 اردو (Urdu)', tip: 'Clean, polite, and elegant Urdu script (اردو رسم الخط)' },
  { id: 'english', label: '🌐 English', tip: 'Clean, polite, and professional English' },
  { id: 'short', label: '✂️ Short & Direct', tip: 'Keep it 1 short direct sentence' },
];

const DEFAULT_KEY_B64 = 'c2stb3ItdjEtMTVkZTYwOTJjMjFiODMyNWFkNTJjMTNhMThkNTZkNDc2NGVhYjM4YTUwYjQzZWIwYWE2MWY5Y2I0NmUwMTQzZg==';
const OPENROUTER_API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENROUTER_API_KEY) || atob(DEFAULT_KEY_B64);
const OPENROUTER_MODEL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENROUTER_MODEL) || 'nvidia/nemotron-3-ultra-550b-a55b:free';

function cleanChatRewrittenOutput(raw) {
  if (!raw) return '';
  let text = String(raw).trim();
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // If output leaked reasoning, analysis, or checklists
  if (
    text.includes("thinking process") ||
    text.includes("**Analyze") ||
    text.includes("The user wants me to") ||
    text.includes("Issues in draft:") ||
    text.includes("Constraint Checklist")
  ) {
    const finalMatch = text.match(/(?:\*\*Final(?:\s+Response|\s+Output|\s+Message)?:\*\*|\*\*Output:\*\*|Final Message:|Output:)\s*([\s\S]+)$/i);
    if (finalMatch && finalMatch[1]) {
      text = finalMatch[1].trim();
    } else {
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (
          !line.startsWith('**') &&
          !line.startsWith('-') &&
          !line.startsWith('1.') &&
          !line.startsWith('2.') &&
          !line.startsWith('3.') &&
          !line.startsWith('4.') &&
          !line.startsWith('5.') &&
          !line.includes('thinking process') &&
          !line.includes('Constraint Checklist') &&
          !line.includes('The user wants') &&
          line.length > 5
        ) {
          text = line;
          break;
        }
      }
    }
  }

  text = text.replace(/^(draft|rewritten|response|chat message|polished|output):\s*/i, '').trim();
  text = text.replace(/^(dear\s+(seller|merchant|customer|user|partner|sir|madam|team|all)[,\n\r\s\-:]*)/i, '').trim();
  text = text.replace(/\n*(regards|best regards|warm regards|sincerely|thanks and regards|support team|bazario support|bazario team)[,\s\S]*$/i, '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith('“') && text.endsWith('”')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

async function fetchOpenRouterDirect(cleanDraft, targetTone) {
  let modeInstruction = 'If draft is in Urdu (or Roman Urdu/Hindi), rewrite in elegant, polite, and clean Urdu script (اردو رسم الخط). If draft is in English, rewrite in clean, polite, professional English.';
  if (targetTone === 'concise' || targetTone === 'short') {
    modeInstruction = 'Keep it very short, crisp, and direct (1 simple sentence) in Urdu script or English.';
  } else if (targetTone === 'urdu') {
    modeInstruction = 'Rewrite or polish in clean, respectful, formal Urdu script (اردو رسم الخط).';
  } else if (targetTone === 'english') {
    modeInstruction = 'Rewrite or polish in clear, polite, and professional business English.';
  }

  const messages = [
    {
      role: 'system',
      content: `You are a real-time instant chat message polisher (like WhatsApp / Live Support) helping an e-commerce admin.
Task: Polish the user's draft message into natural, professional, human-like chat wording in Urdu Script (اردو رسم الخط) or English.
Mode: ${modeInstruction}

CRITICAL RULES:
1. THIS IS LIVE INSTANT CHAT, NOT AN EMAIL.
2. ONLY output Urdu Script (اردو رسم الخط) or English. NEVER write in Hindi/Devanagari script or Roman Urdu.
3. NEVER write email greetings ("Dear Seller", "Hello there! I hope you are having a wonderful day").
4. NEVER write email signatures ("Regards, Bazario Support Team", "Best regards", "Sincerely").
5. NEVER output analysis, reasoning, checklists, notes, or explanations.
6. Output ONLY the final rewritten chat message text.`
    },
    {
      role: 'user',
      content: 'Draft: آپ کا پارسل واپس آگیا ہے ایڈریس چیک کر کے کل دوبارہ بھیجیں'
    },
    {
      role: 'assistant',
      content: 'آپ کا پارسل واپس آ گیا ہے۔ برائے مہربانی ایڈریس چیک کر کے کل دوبارہ بھیج دیجیے گا۔'
    },
    {
      role: 'user',
      content: 'Draft: please send your bank details for payment'
    },
    {
      role: 'assistant',
      content: 'Please share your bank details so we can process your payment.'
    },
    {
      role: 'user',
      content: `Draft: ${cleanDraft}`
    }
  ];


  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://bazario.pk',
      'X-Title': 'Bazario Marketplace Admin Chat',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 350,
    }),
  });


  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`AI service error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  let rawRewritten = data.choices?.[0]?.message?.content?.trim() || '';
  let rewritten = cleanChatRewrittenOutput(rawRewritten);

  if (!rewritten) {
    throw new Error('AI returned an empty response.');
  }

  return rewritten;
}

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
  const [tone, setTone] = useState('auto');
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
      let rewrittenText = null;

      // 1. Try backend server route first
      try {
        const res = await api('/chat/admin/ai-rewrite', {
          method: 'POST',
          body: { text: cleanDraft, tone: targetTone },
        });

        if (res?.ok && res?.rewritten) {
          rewrittenText = res.rewritten;
        }
      } catch (backendErr) {
        console.warn('Backend AI rewrite route unavailable, using direct fallback:', backendErr.message);
      }

      // 2. Resilient fallback to direct OpenRouter API
      if (!rewrittenText) {
        rewrittenText = await fetchOpenRouterDirect(cleanDraft, targetTone);
      }

      setSuggestion(rewrittenText);
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
