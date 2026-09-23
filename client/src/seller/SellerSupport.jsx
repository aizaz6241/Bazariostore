import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { sapi, fmtDate, compressImage } from '../api.js';
import { getSocket } from '../socket.js';
import Ic from '../components/Icons.jsx';
import ChatAttachment from '../components/ChatAttachment.jsx';
import ChatMessageBubble from '../components/ChatMessageBubble.jsx';

export default function SellerSupport() {
  const context = useOutletContext() || {};
  const seller = context.seller || null;
  const setUnreadChat = context.setUnreadChat || (() => {});
  const [conv, setConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const scrollRef = useRef(null);
  const threadMessagesRef = useRef(null);
  const fileInputRef = useRef(null);
  const textInputRef = useRef(null);
  const isNearBottomRef = useRef(true);

  const scrollToBottom = (behavior = 'smooth') => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior });
    }
  };

  const handleThreadScroll = (e) => {
    const el = e.currentTarget;
    const threshold = 150;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceToBottom <= threshold;
  };

  const loadThread = (isPolling = false) => {
    sapi('/chat/seller/thread?limit=100')
      .then((res) => {
        if (!res) return;
        setConv(res.conversation || null);
        const msgList = Array.isArray(res.messages) ? res.messages : [];
        const more = Boolean(res.hasMore);

        if (!isPolling) {
          setMessages(msgList);
          setHasMore(more);
          setTimeout(() => scrollToBottom('auto'), 50);
        } else {
          setMessages((prev) => {
            if (!Array.isArray(prev) || prev.length === 0) return msgList;
            const existingIds = new Set(prev.map((m) => m._id));
            const newOnes = msgList.filter((m) => !existingIds.has(m._id));
            if (newOnes.length === 0) return prev;
            if (isNearBottomRef.current) {
              setTimeout(() => scrollToBottom('smooth'), 50);
            }
            return [...prev, ...newOnes];
          });
        }

        // Mark read
        sapi('/chat/seller/read', { method: 'POST' }).catch(() => {});
        try {
          const s = getSocket();
          if (s) s.emit('seller:read', { sellerId: seller?._id || res.conversation?.seller });
        } catch {}
        if (typeof setUnreadChat === 'function') setUnreadChat(0);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };

  // Load earlier messages with scroll anchoring
  const handleLoadEarlier = async () => {
    if (loadingEarlier || !hasMore || messages.length === 0) return;
    const earliest = messages[0]?.createdAt;
    if (!earliest) return;

    setLoadingEarlier(true);
    const container = threadMessagesRef.current;
    const prevScrollHeight = container ? container.scrollHeight : 0;
    const prevScrollTop = container ? container.scrollTop : 0;

    try {
      const res = await sapi(`/chat/seller/thread?before=${encodeURIComponent(earliest)}&limit=100`);
      const olderMsgs = Array.isArray(res?.messages) ? res.messages : [];
      const more = Boolean(res?.hasMore);
      setHasMore(more);

      if (olderMsgs.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m._id));
          const freshOlder = olderMsgs.filter((m) => !existingIds.has(m._id));
          return [...freshOlder, ...prev];
        });

        // Anchor scroll position
        requestAnimationFrame(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
          }
        });
      }
    } catch (err) {
      console.error('Failed to load earlier messages:', err);
    } finally {
      setLoadingEarlier(false);
    }
  };

  useEffect(() => {
    loadThread(false);

    let socket;
    try {
      socket = getSocket();
    } catch (e) {
      console.warn('Socket warning:', e);
    }

    const onNewMessage = (msg) => {
      if (!msg) return;
      setMessages((prev) => {
        if (!Array.isArray(prev)) return [msg];
        if (prev.some((m) => m?._id === msg?._id)) return prev;
        return [...prev, msg];
      });
      if (isNearBottomRef.current) {
        setTimeout(() => scrollToBottom('smooth'), 50);
      }
      sapi('/chat/seller/read', { method: 'POST' }).catch(() => {});
      try {
        if (socket) socket.emit('seller:read', { sellerId: seller?._id, conversationId: msg.conversation });
      } catch {}
      if (typeof setUnreadChat === 'function') setUnreadChat(0);
    };

    const onMessageEdit = (payload) => {
      const targetId = payload?.messageId || payload?._id;
      if (!targetId) return;
      setMessages((prev) =>
        Array.isArray(prev)
          ? prev.map((m) =>
              m._id === targetId
                ? { ...m, text: payload.text, isEdited: true, editedAt: payload.editedAt || new Date() }
                : m
            )
          : prev
      );
    };

    const onMessageDelete = (payload) => {
      const targetId = payload?.messageId || payload?._id;
      if (!targetId) return;
      setMessages((prev) =>
        Array.isArray(prev)
          ? prev.map((m) =>
              m._id === targetId
                ? { ...m, isDeleted: true, text: '', attachment: null, attachmentName: '', attachmentType: null, deletedAt: payload.deletedAt || new Date() }
                : m
            )
          : prev
      );
    };

    if (socket) {
      socket.on('message:new', onNewMessage);
      socket.on('message:edit', onMessageEdit);
      socket.on('message:delete', onMessageDelete);
    }
    return () => {
      if (socket) {
        socket.off('message:new', onNewMessage);
        socket.off('message:edit', onMessageEdit);
        socket.off('message:delete', onMessageDelete);
      }
    };
  }, [seller]);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    // Check size limit (max 15MB)
    if (selected.size > 15 * 1024 * 1024) {
      alert('File size exceeds 15 MB limit');
      return;
    }

    setFile(selected);
    if (selected.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setFilePreview(ev.target.result);
      reader.readAsDataURL(selected);
    } else {
      setFilePreview(null);
    }
  };

  const removeFile = () => {
    setFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleStartReply = (msg) => {
    setReplyingTo(msg);
    textInputRef.current?.focus();
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean && !file) return;

    setSending(true);
    let attachmentUrl = null;
    let attachmentType = null;
    let attachmentName = '';
    let attachmentSize = 0;

    try {
      if (file) {
        setUploading(true);
        const fileToUpload = await compressImage(file);
        const fd = new FormData();
        fd.append('files', fileToUpload);

        const uploadRes = await sapi('/uploads', {
          method: 'POST',
          body: fd,
        });

        const uploadedItem = Array.isArray(uploadRes) ? uploadRes[0] : uploadRes;
        if (uploadedItem?.url) {
          attachmentUrl = uploadedItem.url;
          attachmentType = uploadedItem.type || (file.type === 'application/pdf' ? 'pdf' : 'image');
          attachmentName = uploadedItem.name || file.name;
          attachmentSize = uploadedItem.size || file.size;
        }
        setUploading(false);
      }

      const targetReply = replyingTo ? {
        messageId: replyingTo._id,
        sender: replyingTo.sender,
        senderName: replyingTo.sender === 'seller' ? 'You' : (replyingTo.senderName || 'Super Admin'),
        text: replyingTo.text || (replyingTo.attachmentType === 'pdf' ? `📄 ${replyingTo.attachmentName || 'PDF Document'}` : '📷 Image Attachment'),
        attachmentType: replyingTo.attachmentType || null,
        attachmentName: replyingTo.attachmentName || '',
      } : null;

      setText('');
      removeFile();
      setReplyingTo(null);

      const newMsg = await sapi('/chat/seller/send', {
        method: 'POST',
        body: {
          text: clean,
          attachment: attachmentUrl,
          attachmentType,
          attachmentName,
          attachmentSize,
          replyTo: targetReply,
        },
      });
      if (newMsg?._id) {
        setMessages((prev) => (prev.some((m) => m._id === newMsg._id) ? prev : [...prev, newMsg]));
      }
      setTimeout(() => scrollToBottom('smooth'), 50);
    } catch (err) {
      setText(clean);
      alert('Failed to send message: ' + err.message);
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  return (
    <div className="seller-support-page">
      {/* Top Header Banner */}
      <div className="seller-support-header">
        <div className="ssh-left">
          <div className="ssh-icon-box">
            <Ic name="chat" size={24} />
          </div>
          <div>
            <h2>24/7 Merchant Support &amp; Helpline 🎧</h2>
            <p>Direct official channel to Super Admin &amp; Compliance Team. Inquire regarding orders, payouts, account health, or store assistance.</p>
          </div>
        </div>

        <div className="ssh-chips">
          <div className="ssh-chip">
            <span className="ssh-pulse-green"></span>
            <span>24/7 Live Support &amp; Helpline</span>
          </div>
          <div className="ssh-chip hide-on-mobile">
            <span>⚡ Avg Reply: &lt; 2 mins</span>
          </div>
        </div>
      </div>

      {/* Main Support Chat Console Card */}
      <div className="seller-chat-container">
        {/* Support Console Bar */}
        <div className="seller-chat-head">
          <div className="admin-status-indicator">
            <div className="admin-avatar-wrap">
              <Ic name="headset" size={20} />
              <span className="online-beacon" title="Online and Ready"></span>
            </div>
            <div className="admin-status-info">
              <b className="admin-title">Bazario Official Merchant Helpline</b>
              <span className="admin-subtitle">
                {conv?.assignedStaffName ? `Assigned agent: ${conv.assignedStaffName}` : 'Super Admin & Financial Compliance Team'}
              </span>
            </div>
          </div>

          <div className="seller-chat-head-actions">
            <div className="ticket-status-pill">
              <span className="status-dot"></span>
              <span>Open Support Ticket</span>
            </div>
            <button
              type="button"
              onClick={loadThread}
              className="chat-refresh-btn"
              title="Refresh conversation messages"
            >
              <Ic name="refresh" size={15} />
            </button>
          </div>
        </div>

        {/* Messages Feed Area */}
        <div
          ref={threadMessagesRef}
          onScroll={handleThreadScroll}
          className="seller-chat-messages"
        >
          {loading && (
            <div className="chat-loading-box">
              <div className="chat-spinner"></div>
              <p>Connecting to secure support thread...</p>
            </div>
          )}

          {hasMore && (
            <div style={{ textAlign: 'center', padding: '10px 0 16px' }}>
              <button
                type="button"
                onClick={handleLoadEarlier}
                disabled={loadingEarlier}
                style={{
                  padding: '7px 18px',
                  fontSize: 12.5,
                  fontWeight: 700,
                  borderRadius: 20,
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#1e293b',
                  cursor: loadingEarlier ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}
              >
                {loadingEarlier ? (
                  <span>⏳ Loading earlier messages...</span>
                ) : (
                  <>
                    <span>⬆️</span>
                    <span>Load earlier messages (Purani chat dekhein)</span>
                  </>
                )}
              </button>
            </div>
          )}
          {!hasMore && messages.length >= 50 && (
            <div style={{ textAlign: 'center', padding: '8px 0 14px', fontSize: 11.5, color: '#94a3b8' }}>
              📜 Beginning of conversation history
            </div>
          )}

          {!loading && messages.length === 0 && (
            <div className="chat-empty-state">
              <div className="empty-icon"><Ic name="chat" size={32} /></div>
              <h4>Start a conversation with Support Desk</h4>
              <p>Type your message below regarding balance deposits, payout withdrawals, catalog listings, or account verification.</p>
            </div>
          )}

          {messages.map((m) => {
            const isMe = m.sender === 'seller';
            return (
              <ChatMessageBubble
                key={m._id}
                msg={m}
                isMe={isMe}
                myRole="seller"
                onReply={handleStartReply}
              />
            );
          })}
          <div ref={scrollRef} />
        </div>

        {/* WhatsApp-Style Quoted Replying Bar */}
        {replyingTo && (
          <div className="chat-replying-bar">
            <div className="crb-left">
              <div className="crb-indicator"></div>
              <div className="crb-info">
                <span className="crb-title">Replying to <b>{replyingTo.sender === 'seller' ? 'You' : (replyingTo.senderName || 'Super Admin')}</b></span>
                <span className="crb-snippet">
                  {replyingTo.text || (replyingTo.attachmentType === 'pdf' ? `📄 ${replyingTo.attachmentName || 'PDF Document'}` : '📷 Image Attachment')}
                </span>
              </div>
            </div>
            <button type="button" className="crb-close" onClick={() => setReplyingTo(null)} title="Cancel reply">
              <Ic name="x" size={16} />
            </button>
          </div>
        )}

        {/* Pending Attachment Preview Bar */}
        {file && (
          <div className="chat-attachment-preview-bar">
            <div className="preview-file-box">
              {filePreview ? (
                <img src={filePreview} alt="Upload preview" className="preview-thumb" />
              ) : (
                <div className="preview-pdf-icon">
                  <Ic name="fileText" size={24} />
                  <span>PDF</span>
                </div>
              )}
              <div className="preview-file-details">
                <b className="preview-file-name">{file.name}</b>
                <small className="muted-sm">
                  {(file.size / 1024).toFixed(1)} KB • {file.type.startsWith('image/') ? 'Photo Attachment' : 'PDF Document'}
                </small>
              </div>
            </div>
            <button type="button" className="btn-remove-preview" onClick={removeFile} title="Remove attachment">
              <Ic name="x" size={16} />
            </button>
          </div>
        )}

        {/* Chat Input Console Bar */}
        <form onSubmit={handleSend} className="seller-chat-input-bar" style={{ alignItems: 'flex-end' }}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            style={{ display: 'none' }}
          />

          <button
            type="button"
            className="chat-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Attach Screenshot, Photo or PDF (Max 15MB)"
            disabled={sending}
            style={{ marginBottom: 6 }}
          >
            <Ic name="paperclip" size={19} stroke={2} />
          </button>

          <textarea
            ref={textInputRef}
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            placeholder={file ? 'Add a caption with your attachment...' : replyingTo ? `Replying to message... (Enter to send, Shift+Enter for newline)` : 'Type your message to Support Desk... (Enter to send, Shift+Enter for newline)'}
            disabled={sending}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              resize: 'vertical',
              minHeight: 52,
              maxHeight: 140,
              fontFamily: 'inherit',
              fontSize: 13.5,
              lineHeight: 1.45,
            }}
          />

          <button
            type="submit"
            className="seller-send-btn"
            disabled={sending || (!text.trim() && !file)}
            style={{ height: 42, marginBottom: 4 }}
          >
            {sending ? (uploading ? 'Uploading...' : 'Sending...') : <><Ic name="send" size={16} /> <span>Send</span></>}
          </button>
        </form>
      </div>
    </div>
  );
}
