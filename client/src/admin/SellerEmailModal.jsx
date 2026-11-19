import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, fmtDate } from '../api.js';

/**
 * Support inbox → ✉️ Email: send one store an email — a ready template (health, orders, wallet …),
 * a template the team saved, or one written from scratch. {placeholders} are filled with the
 * store's real values; [square brackets] must be typed before sending. Live preview on the right
 * shows exactly what the seller will get. "Sent emails" lists what the team sent, and by whom.
 *
 * Props: sellerId (optional, opened from a store's chat), onClose
 */
const EMPTY = { templateKey: '', templateLabel: '', subject: '', heading: '', badge: '', body: '', note: '', tone: 'info', buttonKey: 'dashboard', buttonLabel: '' };
const TONE_LABEL = { info: 'Dark (normal)', success: 'Green (good news)', warning: 'Orange (reminder)', danger: 'Red (urgent)', diamond: 'Purple (Diamond)' };
const STATUS_TAG = { frozen: 'Frozen', suspended: 'Suspended', rejected: 'Rejected', inactive: 'Inactive', pending_approval: 'In review' };

export default function SellerEmailModal({ sellerId = '', onClose }) {
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [tab, setTab] = useState('write');

  // store
  const [store, setStore] = useState(null);
  const [q, setQ] = useState('');
  const [stores, setStores] = useState(null);
  const [storesLoading, setStoresLoading] = useState(false);
  const reqRef = useRef(0);

  // email
  const [mail, setMail] = useState(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [cat, setCat] = useState('all');
  const [focusField, setFocusField] = useState('body');
  const refs = { subject: useRef(null), heading: useRef(null), body: useRef(null), note: useRef(null) };

  // preview
  const [preview, setPreview] = useState(null);
  const [showPreview, setShowPreview] = useState(false); // phones: switch between form and preview
  const [sending, setSending] = useState(false);

  // history
  const [history, setHistory] = useState(null);
  const [histAll, setHistAll] = useState(!sellerId);
  const [openLog, setOpenLog] = useState('');

  const loadMeta = useCallback(() => api('/seller-email/meta').then(setMeta).catch((e) => setErr(e.message)), []);
  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !sending && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sending, onClose]);

  // store opened from its chat
  useEffect(() => {
    if (!sellerId) return;
    api(`/seller-email/stores/${sellerId}`)
      .then(setStore)
      .catch((e) => setErr(e.message));
  }, [sellerId]);

  // store search
  useEffect(() => {
    if (store) return;
    const id = ++reqRef.current;
    setStoresLoading(true);
    const t = setTimeout(() => {
      api(`/seller-email/stores${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
        .then((d) => id === reqRef.current && setStores(Array.isArray(d) ? d : []))
        .catch((e) => id === reqRef.current && setErr(e.message))
        .finally(() => id === reqRef.current && setStoresLoading(false));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, store]);

  // live preview (a short pause after typing)
  useEffect(() => {
    if (!mail.subject && !mail.body) {
      setPreview(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      api('/seller-email/preview', { method: 'POST', body: { ...mail, sellerId: store?._id || '' } })
        .then((d) => live && setPreview(d))
        .catch((e) => live && setPreview({ error: e.message }));
    }, 450);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [mail, store]);

  // history
  const loadHistory = useCallback(() => {
    setHistory(null);
    const qs = !histAll && store?._id ? `?sellerId=${store._id}` : '';
    api(`/seller-email/history${qs}`)
      .then((d) => setHistory(Array.isArray(d) ? d : []))
      .catch((e) => setErr(e.message));
  }, [histAll, store]);
  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  const templates = useMemo(() => (meta?.templates || []).filter((t) => cat === 'all' || t.category === cat), [meta, cat]);
  const btnOf = (key) => meta?.buttons?.find((b) => b.key === key);

  const set = (k, v) => {
    setMail((m) => ({ ...m, [k]: v }));
    setDirty(true);
    setOk('');
  };

  const pickTemplate = (t) => {
    if (dirty && !window.confirm('Replace what you wrote with this template?')) return;
    setMail(
      t
        ? { templateKey: t.key, templateLabel: t.label, subject: t.subject || '', heading: t.heading || '', badge: t.badge || '', body: t.body || '', note: t.note || '', tone: t.tone || 'info', buttonKey: t.buttonKey || '', buttonLabel: '' }
        : { ...EMPTY, templateLabel: 'Custom email' }
    );
    setDirty(false);
    setOk('');
    setErr('');
    setTimeout(() => (t ? refs.body : refs.subject).current?.focus(), 30);
  };

  const insert = (key) => {
    const tag = `{${key}}`;
    const field = refs[focusField] ? focusField : 'body';
    const el = refs[field].current;
    const val = mail[field] || '';
    const at = el && typeof el.selectionStart === 'number' ? el.selectionStart : val.length;
    const end = el && typeof el.selectionEnd === 'number' ? el.selectionEnd : at;
    set(field, `${val.slice(0, at)}${tag}${val.slice(end)}`);
    setTimeout(() => {
      el?.focus();
      try {
        el?.setSelectionRange(at + tag.length, at + tag.length);
      } catch {
        /* not a text field */
      }
    }, 0);
  };

  const missing = preview?.missing || [];
  const limitReached = meta && meta.sentToday >= meta.dailyLimit;
  const canSend = store?.hasEmail && mail.subject.trim().length >= 3 && mail.body.trim() && !missing.length && !sending && meta?.enabled && !limitReached;

  const send = async () => {
    if (!canSend) return;
    if (!window.confirm(`Send this email to ${store.storeName}?\n\nTo: ${store.email}\nSubject: ${preview?.subject || mail.subject}\n\nAn email cannot be taken back once sent.`)) return;
    setSending(true);
    setErr('');
    setOk('');
    try {
      const d = await api('/seller-email/send', { method: 'POST', body: { ...mail, sellerId: store._id } });
      setOk(d?.message || 'Email sent');
      setMeta((m) => (m ? { ...m, sentToday: d?.sentToday ?? m.sentToday + 1 } : m));
      setDirty(false);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  };

  const saveTemplate = async () => {
    if (!mail.subject.trim() || !mail.body.trim()) return setErr('Write a subject and a message first, then save it as a template.');
    const label = window.prompt('Name for this template (only the team sees it):', mail.templateKey?.startsWith('saved:') ? '' : mail.subject.slice(0, 60));
    if (!label || !label.trim()) return;
    const category = (meta?.templates || []).find((t) => t.key === mail.templateKey)?.category;
    try {
      await api('/seller-email/templates', { method: 'POST', body: { ...mail, label: label.trim(), category: category && category !== 'saved' ? category : 'general' } });
      setOk(`Template "${label.trim()}" saved — find it under "Saved by team".`);
      loadMeta();
    } catch (e) {
      setErr(e.message);
    }
  };

  const deleteTemplate = async (t) => {
    if (!window.confirm(`Remove the saved template "${t.label}"?`)) return;
    try {
      await api(`/seller-email/templates/${t._id}`, { method: 'DELETE' });
      if (mail.templateKey === t.key) setMail((m) => ({ ...m, templateKey: '', templateLabel: 'Custom email' }));
      loadMeta();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={() => !sending && onClose()}>
      <div className="admin-modal-box sem-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Send email to a store">
        <div className="csp-head sem-head">
          <div>
            <h3>✉️ Send email to a store</h3>
            <p>A ready template or your own email — the store gets it in its inbox from Bazario.</p>
          </div>
          <div className="sem-head-right">
            {meta && (
              <span className={`sem-count ${limitReached ? 'full' : meta.sentToday >= meta.dailyLimit * 0.8 ? 'near' : ''}`} title="Emails the team sent by hand today (free email plan: about 100 a day, automatic emails included)">
                {meta.sentToday}/{meta.dailyLimit} today
              </span>
            )}
            <button type="button" className="csp-x" onClick={onClose} disabled={sending} aria-label="Close">✕</button>
          </div>
        </div>

        <div className="csp-tabs sem-tabs">
          <button type="button" className={tab === 'write' ? 'on' : ''} onClick={() => setTab('write')}>Write email</button>
          <button type="button" className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>Sent emails</button>
        </div>

        {meta && !meta.enabled && <div className="csp-err">Email sending is not set up on the server yet (RESEND_API_KEY on Render).</div>}
        {err && <div className="csp-err">{err}</div>}
        {ok && <div className="cbc-ok">✅ {ok}</div>}

        {tab === 'write' && (
          <div className={`sem-grid ${showPreview ? 'show-preview' : ''}`}>
            {/* ── form ── */}
            <div className="sem-form">
              {/* 1. store */}
              <section className="sem-step">
                <div className="sem-step-h"><em>1</em> Store</div>
                {store ? (
                  <div className="sem-store">
                    <div>
                      <b>{store.storeName}</b>
                      {store.isTest && <span className="sem-tag test">Test</span>}
                      {store.tier === 'diamond' && <span className="sem-tag dia">Diamond</span>}
                      {STATUS_TAG[store.status] && <span className="sem-tag">{STATUS_TAG[store.status]}</span>}
                      <small>{store.ownerName ? `${store.ownerName} · ` : ''}{store.hasEmail ? store.email : 'No valid email — cannot send'}</small>
                    </div>
                    <button type="button" className="cqr-btn" onClick={() => { setStore(null); setQ(''); }}>Change</button>
                  </div>
                ) : (
                  <>
                    <input className="csp-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search store, owner, email or phone…" autoFocus />
                    <ul className="sem-stores">
                      {storesLoading && !stores && <li className="csp-muted">Loading…</li>}
                      {stores && !stores.length && <li className="csp-muted">No store found.</li>}
                      {(stores || []).map((s) => (
                        <li key={s._id}>
                          <button type="button" disabled={!s.hasEmail} onClick={() => setStore(s)}>
                            <span className="csp-txt">
                              <b>
                                {s.storeName}
                                {s.isTest && <span className="sem-tag test">Test</span>}
                                {STATUS_TAG[s.status] && <span className="sem-tag">{STATUS_TAG[s.status]}</span>}
                              </b>
                              <small>{s.ownerName ? `${s.ownerName} · ` : ''}{s.hasEmail ? s.email : 'no email'}</small>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>

              {/* 2. template */}
              <section className="sem-step">
                <div className="sem-step-h"><em>2</em> Template</div>
                <div className="sem-cats">
                  {[{ key: 'all', label: 'All' }, ...(meta?.categories || [])].map((c) => (
                    <button key={c.key} type="button" className={cat === c.key ? 'on' : ''} onClick={() => setCat(c.key)}>{c.label}</button>
                  ))}
                </div>
                <div className="sem-tpls">
                  <button type="button" className={`sem-tpl scratch ${mail.templateLabel === 'Custom email' && !mail.templateKey ? 'on' : ''}`} onClick={() => pickTemplate(null)}>
                    ✍️ Write from scratch
                  </button>
                  {templates.map((t) => (
                    <span key={t.key} className={`sem-tpl-wrap ${mail.templateKey === t.key ? 'on' : ''}`}>
                      <button type="button" className={`sem-tpl tone-${t.tone}`} onClick={() => pickTemplate(t)} title={t.subject}>
                        {t.label}
                      </button>
                      {!t.builtIn && (
                        <button type="button" className="sem-tpl-x" onClick={() => deleteTemplate(t)} title="Remove this saved template" aria-label={`Remove ${t.label}`}>✕</button>
                      )}
                    </span>
                  ))}
                  {meta && cat === 'saved' && !templates.length && <span className="csp-muted">No saved templates yet — write an email and press “Save as template”.</span>}
                </div>
              </section>

              {/* 3. email */}
              <section className="sem-step cqr-form sem-fields">
                <div className="sem-step-h"><em>3</em> Email</div>
                <label>
                  Subject
                  <input ref={refs.subject} value={mail.subject} maxLength={150} onFocus={() => setFocusField('subject')} onChange={(e) => set('subject', e.target.value)} placeholder="e.g. Your orders are waiting for confirmation" />
                </label>
                <label>
                  Headline <small>(big title inside the email — empty = same as subject)</small>
                  <input ref={refs.heading} value={mail.heading} maxLength={150} onFocus={() => setFocusField('heading')} onChange={(e) => set('heading', e.target.value)} placeholder="e.g. 3 orders are waiting for you" />
                </label>
                <label>
                  Message
                  <textarea ref={refs.body} value={mail.body} maxLength={5000} rows={8} onFocus={() => setFocusField('body')} onChange={(e) => set('body', e.target.value)} placeholder={'Write your message…\n\nEmpty line = new paragraph · "- " at the start = bullet · **text** = bold'} />
                </label>
                {meta?.placeholders?.length > 0 && (
                  <div className="cqr-ph">
                    <span>Tap to add the store’s real value (into the {focusField === 'body' ? 'message' : focusField}):</span>
                    <div>
                      {meta.placeholders.map((p) => (
                        <button key={p.key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(p.key)} title={p.label}>{`{${p.key}}`}</button>
                      ))}
                    </div>
                  </div>
                )}
                <label>
                  Highlight box <small>(optional — shown in a coloured box)</small>
                  <textarea ref={refs.note} value={mail.note} maxLength={1000} rows={2} onFocus={() => setFocusField('note')} onChange={(e) => set('note', e.target.value)} placeholder="e.g. Deposits are usually approved within 15 minutes." />
                </label>
                <div className="cbc-row">
                  <label>
                    Colour
                    <select value={mail.tone} onChange={(e) => set('tone', e.target.value)}>
                      {(meta?.tones || Object.keys(TONE_LABEL)).map((t) => (
                        <option key={t} value={t}>{TONE_LABEL[t] || t}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Small label <small>(optional)</small>
                    <input value={mail.badge} maxLength={40} onChange={(e) => set('badge', e.target.value)} placeholder="e.g. Orders" />
                  </label>
                </div>
                <div className="cbc-row">
                  <label>
                    Button
                    <select value={mail.buttonKey} onChange={(e) => set('buttonKey', e.target.value)}>
                      <option value="">No button</option>
                      {(meta?.buttons || []).map((b) => (
                        <option key={b.key} value={b.key}>{b.label} ({b.path})</option>
                      ))}
                    </select>
                  </label>
                  {mail.buttonKey && (
                    <label>
                      Button text <small>(optional)</small>
                      <input value={mail.buttonLabel} maxLength={40} onChange={(e) => set('buttonLabel', e.target.value)} placeholder={btnOf(mail.buttonKey)?.label || ''} />
                    </label>
                  )}
                </div>
              </section>

              {missing.length > 0 && (
                <div className="sem-missing">✏️ Type these in before sending: <b>{missing.join(', ')}</b></div>
              )}

              <div className="sem-actions">
                <button type="button" className="cqr-btn sem-preview-toggle" onClick={() => setShowPreview(true)}>👁️ Preview</button>
                <button type="button" className="cqr-btn" onClick={saveTemplate} disabled={!mail.subject.trim() || !mail.body.trim()}>💾 Save as template</button>
                <button type="button" className="cqr-btn primary sem-send" onClick={send} disabled={!canSend}>
                  {sending ? 'Sending…' : store ? `Send to ${store.storeName}` : 'Choose a store first'}
                </button>
              </div>
            </div>

            {/* ── preview ── */}
            <div className="sem-preview">
              <div className="sem-preview-top">
                <button type="button" className="cqr-btn sem-preview-back" onClick={() => setShowPreview(false)}>← Back to edit</button>
                <div className="sem-preview-meta">
                  <span><b>To:</b> {store ? (store.hasEmail ? store.email : 'no email') : <i>choose a store</i>}</span>
                  <span><b>Subject:</b> {preview?.subject || (mail.subject ? `[Bazario] ${mail.subject}` : '—')}</span>
                  {preview?.sample && <span className="sem-sample">Sample values shown — choose a store to see its real numbers.</span>}
                </div>
              </div>
              {preview?.html ? (
                <iframe className="sem-frame" title="Email preview" sandbox="" srcDoc={preview.html} />
              ) : (
                <div className="sem-frame-empty">{preview?.error || 'Pick a template or start writing — the email appears here exactly as the seller will see it.'}</div>
              )}
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div className="sem-history">
            {store && (
              <div className="sem-hist-filter">
                <button type="button" className={!histAll ? 'on' : ''} onClick={() => setHistAll(false)}>{store.storeName}</button>
                <button type="button" className={histAll ? 'on' : ''} onClick={() => setHistAll(true)}>All stores</button>
              </div>
            )}
            <ul className="cbc-list">
              {!history && <li className="cqr-empty">Loading…</li>}
              {history && !history.length && <li className="cqr-empty">No email sent yet.</li>}
              {(history || []).map((l) => (
                <li key={l._id} className={l.status === 'failed' ? 'sem-failed' : ''}>
                  <button type="button" className="sem-log-top" onClick={() => setOpenLog(openLog === l._id ? '' : l._id)}>
                    <b>{l.subject}</b>
                    <small>
                      {l.storeName} · {l.to} · {fmtDate(l.createdAt)} · {l.sentBy?.name || 'Admin'}
                    </small>
                    <span className={`sem-st ${l.status}`}>{l.status === 'sent' ? '✓ Sent' : '✕ Failed'}</span>
                  </button>
                  {l.templateLabel && <span className="cqr-tag">{l.templateLabel}</span>}
                  {l.status === 'failed' && l.error && <small className="sem-err">{l.error}</small>}
                  {openLog === l._id && (
                    <div className="sem-log-body">
                      {l.heading && <b>{l.heading}</b>}
                      <p>{l.body}</p>
                      {l.note && <p className="sem-log-note">{l.note}</p>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
