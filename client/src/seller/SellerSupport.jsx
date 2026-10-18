import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { sapi, compressImage, dropClearedMessages, addChatMessage, syncLatestMessages } from '../api.js';
import { getSocket } from '../socket.js';
import Ic from '../components/Icons.jsx';
import ChatMessageBubble from '../components/ChatMessageBubble.jsx';

const MAX_FILE = 15 * 1024 * 1024; // same limit as the upload server
const FILE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];

const TOPICS = [
  { icon: 'package', label: 'An order', text: 'Hi, I need help with order #' },
  { icon: 'wallet', label: 'Deposit / add funds', text: 'Hi, I want to add funds to my wallet. ' },
  { icon: 'banknote', label: 'Withdrawal', text: 'Hi, I have a question about my withdrawal. ' },
  { icon: 'tag', label: 'Products', text: 'Hi, I need help with a product in my store. ' },
  { icon: 'shield', label: 'My account', text: 'Hi, I have a question about my store account. ' },
  { icon: 'star', label: 'Diamond plan', text: 'Hi, I would like to know more about the Diamond plan. ' },
];

const STATUS = {
  open: { label: 'Open', tone: 'green', text: 'Your messages go straight to the Bazario team.' },
  in_progress: { label: 'Team is on it', tone: 'blue', text: 'Someone from the team is looking into your request.' },
  resolved: { label: 'Resolved', tone: 'slate', text: 'Marked as resolved. Send a message any time to open it again.' },
};

const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
};
function dayLabel(d) {
  const x = new Date(d);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (dayKey(x) === dayKey(today)) return 'Today';
  if (dayKey(x) === dayKey(y)) return 'Yesterday';
  return x.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: x.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}
const quoteText = (m) => m?.text || (m?.attachmentType === 'pdf' ? `📄 ${m.attachmentName || 'PDF document'}` : '📷 Photo');
const fileSize = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function SellerSupport() {
  const context = useOutletContext() || {};
  const seller = context.seller || null;
  const sellerId = seller?._id || null;
  const restricted = context.isFrozen;
  const setUnreadChat = context.setUnreadChat || (() => {});

  const [conv, setConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [newBelow, setNewBelow] = useState(0);
  const [dragging, setDragging] = useState(false);

  const feedRef = useRef(null);
  const endRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const nearBottomRef = useRef(true);
  const sendingRef = useRef(false);
  const sellerIdRef = useRef(sellerId);
  sellerIdRef.current = sellerId;

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    endRef.current?.scrollIntoView({ behavior, block: 'end' });
    setNewBelow(0);
  }, []);

  const markRead = useCallback(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    sapi('/chat/seller/read', { method: 'POST' }).catch(() => {});
    try { getSocket()?.emit('seller:read', { sellerId: sellerIdRef.current }); } catch {}
    setUnreadChat(0);
  }, [setUnreadChat]);

  // first load (fresh) or a quiet re-sync (keeps "Load earlier" messages, does not jump)
  const loadThread = useCallback((resync = false) => {
    return sapi('/chat/seller/thread?limit=100')
      .then((res) => {
        if (!res) return;
        setConv(res.conversation || null);
        const list = Array.isArray(res.messages) ? res.messages : [];
        const more = Boolean(res.hasMore);
        if (!resync) {
          setMessages(list);
          setHasMore(more);
          setTimeout(() => scrollToBottom('auto'), 30);
        } else {
          setMessages((prev) => {
            const next = syncLatestMessages(prev, list, more);
            if (next !== prev && next[next.length - 1]?._id !== prev[prev.length - 1]?._id) {
              if (nearBottomRef.current) setTimeout(() => scrollToBottom('smooth'), 30);
              else setNewBelow((n) => n + 1);
            }
            return next;
          });
        }
        setLoadErr('');
        markRead();
      })
      .catch((e) => { if (!resync) setLoadErr(e.message || 'Could not open the support chat'); })
      .finally(() => setLoading(false));
  }, [markRead, scrollToBottom]);

  // Live updates. Keyed on the seller's id only: the store object changes on every wallet
  // update, and the whole chat (with any "Load earlier" messages) used to reload and jump each time.
  useEffect(() => {
    if (!sellerId) return undefined;
    loadThread(false);
    let socket;
    try { socket = getSocket(); } catch {}
    const mine = (msg) => {
      const id = msg?.seller?._id || msg?.seller;
      return id && String(id) === String(sellerIdRef.current);
    };
    const onNew = (msg) => {
      if (!mine(msg)) return;
      setMessages((prev) => addChatMessage(prev, msg));
      if (nearBottomRef.current || msg.sender === 'seller') setTimeout(() => scrollToBottom('smooth'), 30);
      else setNewBelow((n) => n + 1);
      if (msg.sender !== 'seller') markRead();
    };
    const onEdit = (p) => {
      const id = p?.messageId || p?._id;
      if (!id) return;
      setMessages((prev) => prev.map((m) => (m._id === id ? { ...m, text: p.text, isEdited: true, editedAt: p.editedAt || new Date() } : m)));
    };
    const onDelete = (p) => {
      const id = p?.messageId || p?._id;
      if (!id) return;
      setMessages((prev) => prev.filter((m) => m._id !== id));
    };
    const onCleared = (p) => p && setMessages((prev) => dropClearedMessages(prev, p));
    const onReconnect = () => loadThread(true);
    const onVisible = () => { if (document.visibilityState === 'visible') loadThread(true); };
    if (socket) {
      socket.on('connect', onReconnect);
      socket.on('message:new', onNew);
      socket.on('message:edit', onEdit);
      socket.on('message:delete', onDelete);
      socket.on('chat:cleared', onCleared);
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (socket) {
        socket.off('connect', onReconnect);
        socket.off('message:new', onNew);
        socket.off('message:edit', onEdit);
        socket.off('message:delete', onDelete);
        socket.off('chat:cleared', onCleared);
      }
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sellerId, loadThread, markRead, scrollToBottom]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // the box grows with the text (up to a limit)
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const onFeedScroll = (e) => {
    const el = e.currentTarget;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 150;
    if (nearBottomRef.current && newBelow) setNewBelow(0);
  };

  const loadEarlier = async () => {
    if (loadingEarlier || !hasMore || !messages.length) return;
    const earliest = messages[0]?.createdAt;
    if (!earliest) return;
    setLoadingEarlier(true);
    const box = feedRef.current;
    const prevHeight = box?.scrollHeight || 0;
    const prevTop = box?.scrollTop || 0;
    try {
      const res = await sapi(`/chat/seller/thread?before=${encodeURIComponent(earliest)}&limit=100`);
      const older = Array.isArray(res?.messages) ? res.messages : [];
      setHasMore(Boolean(res?.hasMore));
      if (older.length) {
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m._id));
          return [...older.filter((m) => !ids.has(m._id)), ...prev];
        });
        requestAnimationFrame(() => { if (box) box.scrollTop = prevTop + (box.scrollHeight - prevHeight); });
      }
    } catch (err) {
      setToast({ ok: false, text: err.message || 'Could not load earlier messages' });
    } finally {
      setLoadingEarlier(false);
    }
  };

  const pickFile = (f) => {
    if (!f) return;
    if (!FILE_TYPES.includes(f.type)) { setToast({ ok: false, text: 'Only photos (PNG, JPG, WebP, GIF) and PDF files can be sent.' }); return; }
    if (f.size > MAX_FILE) { setToast({ ok: false, text: `This file is ${fileSize(f.size)} — the limit is 15 MB.` }); return; }
    setFile(f);
    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setFilePreview(ev.target.result);
      reader.readAsDataURL(f);
    } else setFilePreview(null);
    inputRef.current?.focus();
  };
  const clearFile = () => {
    setFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startReply = (msg) => {
    setReplyingTo(msg);
    inputRef.current?.focus();
  };

  const applyTopic = (t) => {
    setText((cur) => (cur.trim() ? cur : t.text));
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    });
  };

  const send = async (e) => {
    e?.preventDefault();
    const clean = text.trim();
    if ((!clean && !file) || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    const keep = { text, file, filePreview, replyingTo };
    try {
      let attachment = null;
      if (file) {
        setUploading(true);
        const fd = new FormData();
        fd.append('files', await compressImage(file));
        const up = await sapi('/uploads', { method: 'POST', body: fd });
        const item = Array.isArray(up) ? up[0] : up;
        // a failed upload used to send the message WITHOUT the file, and the file was gone
        if (!item?.url) throw new Error('The file could not be uploaded. Please try again.');
        attachment = {
          attachment: item.url,
          attachmentType: item.type || (file.type === 'application/pdf' ? 'pdf' : 'image'),
          attachmentName: item.name || file.name,
          attachmentSize: item.size || file.size,
        };
        setUploading(false);
      }
      // the server reads the quoted message itself; only its id matters
      const replyTo = replyingTo ? { messageId: replyingTo._id, text: quoteText(replyingTo) } : null;
      setText('');
      clearFile();
      setReplyingTo(null);
      const msg = await sapi('/chat/seller/send', { method: 'POST', body: { text: clean, ...(attachment || {}), replyTo } });
      if (msg?._id) setMessages((prev) => addChatMessage(prev, msg));
      setConv((c) => (c ? { ...c, status: 'open' } : c));
      setTimeout(() => scrollToBottom('smooth'), 30);
    } catch (err) {
      // nothing is lost: the text, the file and the reply come back
      setText(keep.text);
      setFile(keep.file);
      setFilePreview(keep.filePreview);
      setReplyingTo(keep.replyingTo);
      setToast({ ok: false, text: err.message || 'Message not sent. Please try again.' });
    } finally {
      sendingRef.current = false;
      setSending(false);
      setUploading(false);
    }
  };

  const deleteOwn = async (msg) => {
    try {
      await sapi(`/chat/messages/${msg._id}`, { method: 'DELETE' });
      setMessages((prev) => prev.filter((m) => m._id !== msg._id));
      setToast({ ok: true, text: 'Message deleted for you and for support.' });
    } catch (err) {
      setToast({ ok: false, text: err.message || 'Could not delete the message' });
    } finally {
      setConfirmDelete(null);
    }
  };

  const onPaste = (e) => {
    const f = Array.from(e.clipboardData?.files || [])[0];
    if (f) { e.preventDefault(); pickFile(f); }
  };
  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer?.files?.[0]);
  };

  const st = STATUS[conv?.status] || STATUS.open;

  let lastDay = '';
  return (
    <div className="sp">
      <header className="sp-head">
        <div>
          <p className="sp-eyebrow">Help</p>
          <h1>Support</h1>
          <p className="sp-sub">Chat with the Bazario team about orders, deposits, withdrawals, products or your account.</p>
        </div>
      </header>

      <div className="sp-layout">
        <section
          className={`sp-chat ${dragging ? 'is-drag' : ''}`}
          onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
          onDrop={onDrop}
        >
          <div className="sp-chat-head">
            <div className="sp-agent">
              <span className="sp-avatar"><Ic name="headset" size={20} /></span>
              <div>
                <b>Bazario Support</b>
                <small>The Bazario team</small>
              </div>
            </div>
            <div className="sp-head-right">
              <span className={`sp-tag tone-${st.tone}`} title={st.text}><i />{st.label}</span>
              <button type="button" className="sp-icon-btn" onClick={() => loadThread(true)} title="Refresh" aria-label="Refresh"><Ic name="refresh" size={16} /></button>
            </div>
          </div>

          <div className="sp-feed" ref={feedRef} onScroll={onFeedScroll}>
            {loading ? (
              <div className="sp-feed-state"><span className="sp-spin" /><p>Opening your support chat…</p></div>
            ) : loadErr ? (
              <div className="sp-feed-state">
                <span className="sp-state-ico"><Ic name="alert" size={22} /></span>
                <b>Could not open the chat</b>
                <p>{loadErr}</p>
                <button type="button" className="sp-btn sp-btn-ghost sm" onClick={() => { setLoading(true); loadThread(false); }}>Try again</button>
              </div>
            ) : messages.length === 0 ? (
              <div className="sp-feed-state">
                <span className="sp-state-ico"><Ic name="chat" size={22} /></span>
                <b>How can we help?</b>
                <p>Pick a topic or type your question below. You can also send a screenshot or a PDF.</p>
                <div className="sp-topics center">
                  {TOPICS.map((t) => (
                    <button key={t.label} type="button" onClick={() => applyTopic(t)}><Ic name={t.icon} size={14} /> {t.label}</button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {hasMore ? (
                  <div className="sp-earlier">
                    <button type="button" onClick={loadEarlier} disabled={loadingEarlier}>{loadingEarlier ? 'Loading…' : 'Show earlier messages'}</button>
                  </div>
                ) : (
                  <div className="sp-begin">Start of your conversation with Bazario Support</div>
                )}
                {messages.map((m) => {
                  const k = dayKey(m.createdAt);
                  const sep = k !== lastDay;
                  lastDay = k;
                  const isMe = m.sender === 'seller';
                  return (
                    <div key={m._id} className="sp-msg">
                      {sep && <div className="sp-day"><span>{dayLabel(m.createdAt)}</span></div>}
                      <ChatMessageBubble msg={m} isMe={isMe} myRole="seller" onReply={startReply} onDelete={isMe ? (msg) => setConfirmDelete(msg) : undefined} />
                    </div>
                  );
                })}
              </>
            )}
            <div ref={endRef} />
          </div>

          {newBelow > 0 && (
            <button type="button" className="sp-jump" onClick={() => scrollToBottom('smooth')}>
              <Ic name="chevDown" size={14} /> {newBelow === 1 ? 'New message' : `${newBelow} new messages`}
            </button>
          )}

          {dragging && <div className="sp-drop"><Ic name="paperclip" size={22} /><b>Drop a photo or PDF to attach</b></div>}

          <div className="sp-composer-wrap">
            {replyingTo && (
              <div className="sp-pending">
                <i className="bar" />
                <div className="sp-pending-txt">
                  <b>Replying to {replyingTo.sender === 'seller' ? 'yourself' : 'Bazario Support'}</b>
                  <span>{quoteText(replyingTo)}</span>
                </div>
                <button type="button" className="sp-icon-btn" onClick={() => setReplyingTo(null)} aria-label="Cancel reply"><Ic name="x" size={15} /></button>
              </div>
            )}
            {file && (
              <div className="sp-pending">
                {filePreview ? <img src={filePreview} alt="" /> : <span className="sp-pdf"><Ic name="fileText" size={18} /></span>}
                <div className="sp-pending-txt">
                  <b>{file.name}</b>
                  <span>{fileSize(file.size)} · {file.type === 'application/pdf' ? 'PDF' : 'Photo'}{uploading ? ' · uploading…' : ''}</span>
                </div>
                <button type="button" className="sp-icon-btn" onClick={clearFile} disabled={sending} aria-label="Remove file"><Ic name="x" size={15} /></button>
              </div>
            )}
            <form className="sp-composer" onSubmit={send}>
              <input ref={fileInputRef} type="file" hidden accept={FILE_TYPES.join(',')} onChange={(e) => pickFile(e.target.files?.[0])} />
              <button type="button" className="sp-icon-btn attach" onClick={() => fileInputRef.current?.click()} disabled={sending} title="Attach a photo or PDF (max 15 MB)" aria-label="Attach file">
                <Ic name="paperclip" size={18} />
              </button>
              <textarea
                ref={inputRef}
                rows={1}
                value={text}
                maxLength={5000}
                onChange={(e) => setText(e.target.value)}
                onPaste={onPaste}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
                }}
                placeholder={file ? 'Add a message (optional)' : 'Write a message…'}
                aria-label="Message"
              />
              <button type="submit" className="sp-send" disabled={sending || (!text.trim() && !file)} aria-label="Send">
                {sending ? <span className="sp-spin sm" /> : <Ic name="send" size={17} />}
              </button>
            </form>
            <p className="sp-hint">Enter to send · Shift + Enter for a new line · paste or drop a screenshot</p>
          </div>
        </section>

        <aside className="sp-side">
          {restricted && (
            <div className="sp-card sp-alert">
              <Ic name="lock" size={16} />
              <p><b>Your store is restricted.</b> This chat stays open — tell the team what happened and they will guide you.</p>
            </div>
          )}
          <div className="sp-card">
            <h3>Quick topics</h3>
            <p>Starts your message for you.</p>
            <div className="sp-topics">
              {TOPICS.map((t) => (
                <button key={t.label} type="button" onClick={() => applyTopic(t)}><Ic name={t.icon} size={14} /> {t.label}</button>
              ))}
            </div>
          </div>
          <div className="sp-card">
            <h3>Get a faster answer</h3>
            <ul className="sp-tips">
              <li><Ic name="check" size={14} /> <span>Write the order number (like <code>ORD-2026-…</code>)</span></li>
              <li><Ic name="check" size={14} /> For a deposit, send the payment screenshot</li>
              <li><Ic name="check" size={14} /> One message with all the details is quicker than many short ones</li>
            </ul>
          </div>
          <div className="sp-card">
            <h3>Shortcuts</h3>
            <div className="sp-links">
              <Link to="/seller/orders"><Ic name="package" size={15} /> Orders <Ic name="chevRight" size={14} /></Link>
              <Link to="/seller/wallet"><Ic name="wallet" size={15} /> Wallet <Ic name="chevRight" size={14} /></Link>
              <Link to="/seller/refunds"><Ic name="refresh" size={15} /> Returns <Ic name="chevRight" size={14} /></Link>
            </div>
          </div>
          <div className="sp-card sp-safe">
            <Ic name="shield" size={16} />
            <p>The Bazario team will <b>never</b> ask for your password or OTP. Do not share them in chat.</p>
          </div>
        </aside>
      </div>

      {confirmDelete && (
        <div className="sp-modal-root" role="dialog" aria-modal="true" aria-label="Delete message">
          <button type="button" className="sp-modal-bg" onClick={() => setConfirmDelete(null)} aria-label="Close" />
          <div className="sp-modal">
            <h3>Delete this message?</h3>
            <p>It will be removed for you and for the support team.</p>
            <blockquote>{quoteText(confirmDelete)}</blockquote>
            <div className="sp-modal-btns">
              <button type="button" className="sp-btn sp-btn-ghost" onClick={() => setConfirmDelete(null)}>Keep</button>
              <button type="button" className="sp-btn sp-btn-danger" onClick={() => deleteOwn(confirmDelete)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`sp-toast ${toast.ok ? 'ok' : 'err'}`} role="status">
          <Ic name={toast.ok ? 'checkCircle' : 'alert'} size={18} />
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Close"><Ic name="x" size={14} /></button>
        </div>
      )}
    </div>
  );
}
