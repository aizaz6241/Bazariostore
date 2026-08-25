import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { sapi, api, fmtDate, compressImage } from '../api.js';
import { getSocket, getGuestId } from '../socket.js';
import Ic from './Icons.jsx';
import ChatAttachment from './ChatAttachment.jsx';
import ChatMessageBubble from './ChatMessageBubble.jsx';
import AiRewriteBox from './AiRewriteBox.jsx';
import VoiceRecordButton from './VoiceRecordButton.jsx';

export default function FloatingChatWidget({ role = 'seller', currentSeller = null }) {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [conv, setConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);

  // Admin specific state
  const [adminConvos, setAdminConvos] = useState([]);
  const [selectedConvoId, setSelectedConvoId] = useState(null);

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const textInputRef = useRef(null);

  // ─── DRAGGABLE FLOATING FAB STATE & REFS ───
  const buttonRef = useRef(null);
  const [btnPos, setBtnPos] = useState({ x: null, y: null, side: 'right' });
  const [isDragging, setIsDragging] = useState(false);
  const dragInfoRef = useRef({
    startX: 0,
    startY: 0,
    startPosX: 0,
    startPosY: 0,
    isMoved: false,
    pointerId: null,
  });
  const justDraggedRef = useRef(false);

  // Safe boundary calculator (ensures chat button never overlaps bottom navigation on mobile)
  const getBounds = (btnWidth = 120, btnHeight = 44) => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    const paddingX = isMobile ? 12 : 20;
    const minX = paddingX;
    const maxX = Math.max(minX, (typeof window !== 'undefined' ? window.innerWidth : 400) - btnWidth - paddingX);
    const minY = 64; // Below top header
    // On mobile, 58px is the fixed bottom navigation bar + safe margin
    const bottomNavHeight = isMobile ? 74 : 24;
    const maxY = Math.max(minY, (typeof window !== 'undefined' ? window.innerHeight : 700) - bottomNavHeight - btnHeight);
    return { minX, maxX, minY, maxY, paddingX, isMobile };
  };

  // Initialize and handle window resize / orientation change
  useEffect(() => {
    const initPos = () => {
      const btnEl = buttonRef.current;
      const btnW = btnEl ? btnEl.offsetWidth || 120 : 120;
      const btnH = btnEl ? btnEl.offsetHeight || 44 : 44;
      const { minX, maxX, minY, maxY } = getBounds(btnW, btnH);

      let saved = null;
      try {
        const raw = localStorage.getItem('bazario_chat_pos');
        if (raw) saved = JSON.parse(raw);
      } catch {}

      const side = saved?.side === 'left' ? 'left' : 'right';
      const targetX = side === 'left' ? minX : maxX;

      let targetY;
      if (saved && typeof saved.yRatio === 'number' && !isNaN(saved.yRatio)) {
        targetY = Math.min(Math.max(saved.yRatio * window.innerHeight, minY), maxY);
      } else {
        // Default initial placement: Safely above the bottom mobile navigation bar
        targetY = maxY;
      }

      setBtnPos({ x: targetX, y: targetY, side });
    };

    initPos();

    const handleResize = () => {
      setBtnPos((prev) => {
        if (prev.x === null || prev.y === null) return prev;
        const btnEl = buttonRef.current;
        const btnW = btnEl ? btnEl.offsetWidth || 120 : 120;
        const btnH = btnEl ? btnEl.offsetHeight || 44 : 44;
        const { minX, maxX, minY, maxY } = getBounds(btnW, btnH);
        const targetX = prev.side === 'left' ? minX : maxX;
        const targetY = Math.min(Math.max(prev.y, minY), maxY);
        return { x: targetX, y: targetY, side: prev.side };
      });
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Pointer Handlers for Smooth Drag & Messenger-Style Edge Snapping
  const handlePointerDown = (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    const btnEl = buttonRef.current;
    if (!btnEl) return;

    try {
      btnEl.setPointerCapture(e.pointerId);
    } catch {}

    dragInfoRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: btnPos.x ?? (window.innerWidth - 130),
      startPosY: btnPos.y ?? (window.innerHeight - 120),
      isMoved: false,
      pointerId: e.pointerId,
    };
  };

  const handlePointerMove = (e) => {
    const drag = dragInfoRef.current;
    if (drag.pointerId === null || drag.pointerId !== e.pointerId) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const dist = Math.hypot(dx, dy);

    if (dist > 6) {
      if (!drag.isMoved) {
        drag.isMoved = true;
        setIsDragging(true);
      }

      const btnEl = buttonRef.current;
      const btnW = btnEl ? btnEl.offsetWidth || 120 : 120;
      const btnH = btnEl ? btnEl.offsetHeight || 44 : 44;
      const { minX, maxX, minY, maxY } = getBounds(btnW, btnH);

      const rawX = drag.startPosX + dx;
      const rawY = drag.startPosY + dy;

      const clampedX = Math.min(Math.max(rawX, 4), window.innerWidth - btnW - 4);
      const clampedY = Math.min(Math.max(rawY, minY), maxY);

      setBtnPos({
        x: clampedX,
        y: clampedY,
        side: clampedX + btnW / 2 < window.innerWidth / 2 ? 'left' : 'right',
      });
    }
  };

  const handlePointerUp = (e) => {
    const drag = dragInfoRef.current;
    if (drag.pointerId === null || drag.pointerId !== e.pointerId) return;

    try {
      buttonRef.current?.releasePointerCapture(e.pointerId);
    } catch {}

    if (drag.isMoved) {
      setIsDragging(false);
      justDraggedRef.current = true;
      setTimeout(() => {
        justDraggedRef.current = false;
      }, 250);

      // Snap smoothly to Left or Right Edge (like Messenger chat head)
      const btnEl = buttonRef.current;
      const btnW = btnEl ? btnEl.offsetWidth || 120 : 120;
      const btnH = btnEl ? btnEl.offsetHeight || 44 : 44;
      const { minX, maxX, minY, maxY } = getBounds(btnW, btnH);

      const currentX = btnPos.x ?? maxX;
      const currentY = btnPos.y ?? maxY;

      const centerX = currentX + btnW / 2;
      const shouldSnapLeft = centerX < window.innerWidth / 2;
      const snappedX = shouldSnapLeft ? minX : maxX;
      const side = shouldSnapLeft ? 'left' : 'right';
      const snappedY = Math.min(Math.max(currentY, minY), maxY);

      setBtnPos({ x: snappedX, y: snappedY, side });

      try {
        localStorage.setItem(
          'bazario_chat_pos',
          JSON.stringify({
            side,
            yRatio: snappedY / window.innerHeight,
          })
        );
      } catch {}
    }

    dragInfoRef.current.pointerId = null;
    dragInfoRef.current.isMoved = false;
  };

  const handleBtnClick = (e) => {
    if (justDraggedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    toggleOpen();
  };

  // Hide floating widget if user is already on the full dedicated chat page
  const isFullChatPage =
    location.pathname === '/seller/support' ||
    location.pathname === '/admin/chat';

  // Load seller or guest thread
  const loadSellerThread = () => {
    setLoading(true);
    const isSellerLoggedIn = Boolean(localStorage.getItem('ng_seller_token'));
    if (!isSellerLoggedIn) {
      const guestId = getGuestId();
      api(`/chat/guest/${guestId}`)
        .then((res) => {
          if (!res) return;
          setConv(res.conversation || null);
          setMessages(Array.isArray(res.messages) ? res.messages : []);
        })
        .catch((e) => console.error('Guest thread load error:', e))
        .finally(() => setLoading(false));
      return;
    }

    sapi('/chat/seller/thread')
      .then((res) => {
        if (!res) return;
        setConv(res.conversation || null);
        setMessages(Array.isArray(res.messages) ? res.messages : []);
        if (isOpen) {
          sapi('/chat/seller/read', { method: 'POST' }).catch(() => {});
          setUnreadCount(0);
        } else if (res.conversation?.unreadForSeller) {
          setUnreadCount(res.conversation.unreadForSeller);
        }
      })
      .catch((e) => console.error('Seller thread load error:', e))
      .finally(() => setLoading(false));
  };

  // Load admin convos
  const loadAdminConvos = () => {
    setLoading(true);
    api('/chat/admin/conversations')
      .then((data) => {
        const convList = Array.isArray(data) ? data : [];
        setAdminConvos(convList);
        const totalUnread = convList.reduce((acc, c) => acc + (c.unreadForAdmin || 0), 0);
        setUnreadCount(totalUnread);
        if (!selectedConvoId && convList.length) {
          setSelectedConvoId(convList[0]._id);
        }
      })
      .catch((e) => console.error('Admin convos load error:', e))
      .finally(() => setLoading(false));
  };

  const loadAdminMessages = (id) => {
    if (!id) return;
    api(`/chat/admin/conversations/${id}/messages`)
      .then((res) => {
        setMessages(Array.isArray(res) ? res : res?.messages || []);
        api(`/chat/admin/conversations/${id}/read`, { method: 'POST' }).catch(() => {});
      })
      .catch((e) => console.error('Admin messages load error:', e));
  };

  useEffect(() => {
    if (role === 'seller') {
      loadSellerThread();
    } else {
      loadAdminConvos();
    }

    let socket;
    try {
      socket = getSocket();
    } catch (e) {
      console.warn('Socket warning:', e);
    }

    const onNewMsg = (msg) => {
      if (!msg) return;
      if (role === 'seller') {
        setMessages((prev) => {
          if (!Array.isArray(prev)) return [msg];
          if (prev.some((m) => m?._id === msg?._id)) return prev;
          return [...prev, msg];
        });
        if (!isOpen && msg.sender === 'admin') {
          setUnreadCount((prev) => prev + 1);
        } else if (isOpen) {
          sapi('/chat/seller/read', { method: 'POST' }).catch(() => {});
        }
      } else {
        // Admin
        if (msg.conversation === selectedConvoId) {
          setMessages((prev) => {
            if (!Array.isArray(prev)) return [msg];
            if (prev.some((m) => m?._id === msg?._id)) return prev;
            return [...prev, msg];
          });
        }
        if (!isOpen && msg.sender === 'seller') {
          setUnreadCount((prev) => prev + 1);
        }
        loadAdminConvos();
      }
    };

    const onMessagesSeen = ({ conversationId, seenAt }) => {
      if (role === 'admin') {
        setMessages((prev) =>
          Array.isArray(prev)
            ? prev.map((m) =>
                m.sender === 'admin' || m.sender === 'staff'
                  ? { ...m, isSeen: true, seenAt: seenAt || new Date() }
                  : m
              )
            : prev
        );
      }
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
      socket.on('message:new', onNewMsg);
      socket.on('messages:seen', onMessagesSeen);
      socket.on('message:edit', onMessageEdit);
      socket.on('message:delete', onMessageDelete);
    }
    return () => {
      if (socket) {
        socket.off('message:new', onNewMsg);
        socket.off('messages:seen', onMessagesSeen);
        socket.off('message:edit', onMessageEdit);
        socket.off('message:delete', onMessageDelete);
      }
    };
  }, [role, isOpen, selectedConvoId]);

  useEffect(() => {
    if (role === 'admin' && selectedConvoId && isOpen) {
      loadAdminMessages(selectedConvoId);
    }
  }, [selectedConvoId, isOpen, role]);

  useEffect(() => {
    if (isOpen) {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const toggleOpen = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) {
      setUnreadCount(0);
      if (role === 'seller') {
        loadSellerThread();
      } else if (selectedConvoId) {
        loadAdminMessages(selectedConvoId);
      }
    }
  };

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
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

  const handleSend = async (e, overrideText = null) => {
    if (e?.preventDefault) e.preventDefault();
    const clean = (overrideText !== null ? overrideText : text).trim();
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

        const uploadFn = role === 'seller' ? sapi : api;
        const uploadRes = await uploadFn('/uploads', { method: 'POST', body: fd });
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
        senderName: replyingTo.sender === (role === 'seller' ? 'seller' : 'admin')
          ? 'You'
          : (replyingTo.senderName || (role === 'seller' ? 'Super Admin' : 'Seller')),
        text: replyingTo.text || (replyingTo.attachmentType === 'pdf' ? `📄 ${replyingTo.attachmentName || 'PDF Document'}` : '📷 Image Attachment'),
        attachmentType: replyingTo.attachmentType || null,
        attachmentName: replyingTo.attachmentName || '',
      } : null;

      setText('');
      removeFile();
      setReplyingTo(null);

      if (role !== 'admin') {
        const isSellerLoggedIn = Boolean(localStorage.getItem('ng_seller_token'));
        if (!isSellerLoggedIn) {
          const guestId = getGuestId();
          await api('/chat/guest/send', {
            method: 'POST',
            body: {
              guestId,
              text: clean,
              attachment: attachmentUrl,
              attachmentType,
              attachmentName,
              attachmentSize,
              replyTo: targetReply,
            },
          });
          loadSellerThread();
        } else {
          await sapi('/chat/seller/send', {
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
        }
      } else {
        if (!selectedConvoId) return;
        await api(`/chat/admin/conversations/${selectedConvoId}/reply`, {
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
        loadAdminConvos();
      }
    } catch (err) {
      setText(clean);
      alert('Failed to send message: ' + err.message);
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  // Don't render floating widget on full dedicated chat page
  if (isFullChatPage) return null;

  const currentConvo = role === 'admin' ? adminConvos.find((c) => c._id === selectedConvoId) : conv;

  return (
    <>
      {/* Floating Draggable Trigger Button (Messenger-style edge snapping) */}
      {!isOpen && btnPos.x !== null && (
        <div
          ref={buttonRef}
          className={`floating-chat-fab-wrap side-${btnPos.side} ${isDragging ? 'is-dragging' : ''}`}
          style={{
            left: `${btnPos.x}px`,
            top: `${btnPos.y}px`,
            zIndex: isDragging ? 999999 : 99998,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <button
            type="button"
            className={`floating-chat-pill-btn ${
              role === 'seller' ? 'seller-chat-pill' : role === 'admin' ? 'admin-chat-pill' : 'guest-chat-pill'
            }`}
            onClick={handleBtnClick}
            title={
              role === 'seller'
                ? 'Merchant Support (Drag anywhere to move)'
                : role === 'admin'
                ? 'Admin Support Inbox (Drag anywhere to move)'
                : 'Help & Live Support (Drag anywhere to move)'
            }
          >
            {/* Subtle Grip Drag Indicator */}
            <div className="floating-drag-grip" title="Drag to reposition">
              <span className="grip-dot" />
              <span className="grip-dot" />
              <span className="grip-dot" />
            </div>

            <div className="floating-btn-content">
              <Ic name="chat" size={19} stroke={2.2} />
              <span className="floating-btn-text">
                {role === 'seller' ? 'Support' : role === 'admin' ? 'Chat Desk' : 'Help & Chat'}
              </span>
            </div>

            {unreadCount > 0 && (
              <span className="floating-unread-badge animate-bounce">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Floating Chat Popup Dialog */}
      {isOpen && (
        <div className="floating-chat-window">
          {/* Top Bar */}
          <div className="floating-chat-header">
            <div className="floating-header-info">
              <div className="floating-avatar-dot">
                <Ic name={role === 'seller' ? 'headset' : 'package'} size={18} />
                <span className="floating-online-dot"></span>
              </div>
              <div className="floating-header-texts">
                <b className="floating-header-title">
                  {role === 'seller'
                    ? 'Admin Support Desk'
                    : currentConvo?.seller?.storeName || currentConvo?.storeName || 'Seller Support Desk'}
                </b>
                <span className="floating-header-status">
                  {role === 'seller' ? '● Online & Available' : `${adminConvos.length} active seller chats`}
                </span>
              </div>
            </div>

            <div className="floating-header-actions">
              {role === 'admin' && adminConvos.length > 1 && (
                <select
                  value={selectedConvoId || ''}
                  onChange={(e) => {
                    const cid = e.target.value;
                    setSelectedConvoId(cid);
                    setAdminConvos((prev) =>
                      Array.isArray(prev) ? prev.map((c) => (c._id === cid ? { ...c, unreadForAdmin: 0 } : c)) : []
                    );
                    api(`/chat/admin/conversations/${cid}/read`, { method: 'POST' }).catch(() => {});
                  }}
                  className="floating-admin-select"
                  title="Switch seller conversation"
                >
                  {adminConvos.map((c) => {
                    const unread = c.unreadForAdmin || 0;
                    return (
                      <option key={c._id} value={c._id}>
                        {c.seller?.storeName || c.storeName || 'Seller'} {unread > 0 ? `(${unread} NEW)` : ''}
                      </option>
                    );
                  })}
                </select>
              )}

              <button
                className="floating-action-btn"
                onClick={toggleOpen}
                title="Minimize chat"
              >
                <Ic name="minus" size={16} stroke={2.5} />
              </button>
              <button
                className="floating-action-btn"
                onClick={toggleOpen}
                title="Close chat"
              >
                <Ic name="x" size={16} stroke={2.5} />
              </button>
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div className="floating-chat-messages">
            {loading && <div className="p-6 text-center muted-sm">Loading conversation...</div>}

            {!loading && messages.length === 0 && (
              <div className="floating-empty-state">
                <div className="floating-empty-icon"><Ic name="chat" size={32} /></div>
                <h4>Start a live conversation</h4>
                <p>
                  {role === 'seller'
                    ? 'Ask questions about orders, payments, verification, or send receipts/screenshots.'
                    : 'Select a conversation and reply directly to the seller.'}
                </p>
              </div>
            )}

            {messages.map((m) => {
              const isMe = role === 'seller' ? m.sender === 'seller' : m.sender === 'admin';
              return (
                <ChatMessageBubble
                  key={m._id}
                  msg={m}
                  isMe={isMe}
                  myRole={role}
                  onReply={handleStartReply}
                />
              );
            })}
            <div ref={scrollRef} />
          </div>

          {/* Active Replying-To Bar */}
          {replyingTo && (
            <div className="chat-replying-bar floating-reply-bar">
              <div className="crb-left">
                <div className="crb-indicator"></div>
                <div className="crb-info">
                  <span className="crb-title">
                    Replying to <b>{replyingTo.sender === (role === 'seller' ? 'seller' : 'admin') ? 'You' : (replyingTo.senderName || (role === 'seller' ? 'Super Admin' : 'Seller'))}</b>
                  </span>
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

          {/* Pending Attachment Preview */}
          {file && (
            <div className="chat-attachment-preview-bar floating-preview">
              <div className="preview-file-box">
                {filePreview ? (
                  <img src={filePreview} alt="Preview" className="preview-thumb" />
                ) : (
                  <div className="preview-pdf-icon">
                    <Ic name="fileText" size={20} />
                    <span>PDF</span>
                  </div>
                )}
                <div className="preview-file-details">
                  <b className="preview-file-name">{file.name}</b>
                  <small className="muted-sm">
                    {(file.size / 1024).toFixed(1)} KB • {file.type.startsWith('image/') ? 'Image' : 'PDF'}
                  </small>
                </div>
              </div>
              <button type="button" className="btn-remove-preview" onClick={removeFile}>
                <Ic name="x" size={14} />
              </button>
            </div>
          )}

            {/* Floating Input / Reply Bar */}
          <form onSubmit={handleSend} className="floating-chat-input-bar" style={{ alignItems: 'flex-end', position: 'relative' }}>
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
              title="Attach Image or PDF document"
              disabled={sending}
              style={{ marginBottom: 4, flexShrink: 0 }}
            >
              <Ic name="paperclip" size={18} stroke={2} />
            </button>

            <div style={{ marginBottom: 4, flexShrink: 0 }}>
              <VoiceRecordButton
                compact={true}
                onTranscribed={(spokenText) => {
                  setText((prev) => (prev ? `${prev.trim()} ${spokenText}` : spokenText));
                  textInputRef.current?.focus();
                }}
                disabled={sending || uploading}
              />
            </div>

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
              placeholder={file ? 'Add a caption...' : replyingTo ? `Reply... (Enter to send)` : 'Type message...'}
              disabled={sending}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                resize: 'vertical',
                minHeight: 42,
                maxHeight: 120,
                fontFamily: 'inherit',
                fontSize: 13,
                lineHeight: 1.4,
                boxSizing: 'border-box',
              }}
            />

            {role === 'admin' && (
              <div style={{ marginBottom: 4, flexShrink: 0 }}>
                <AiRewriteBox
                  text={text}
                  compact={true}
                  onApply={(rewritten) => {
                    setText(rewritten);
                    textInputRef.current?.focus();
                  }}
                  onApplyAndSend={(rewritten) => {
                    handleSend(null, rewritten);
                  }}
                  disabled={sending || uploading}
                />
              </div>
            )}

            <button
              type="submit"
              className="floating-send-btn"
              disabled={sending || (!text.trim() && !file)}
              style={{ height: 38, marginBottom: 3, flexShrink: 0 }}
            >
              {sending ? (
                uploading ? '...' : '...'
              ) : (
                <Ic name="send" size={15} />
              )}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
