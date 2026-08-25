import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { sapi, api, fmtDate, compressImage } from '../api.js';
import { getSocket, getGuestId } from '../socket.js';
import Ic from './Icons.jsx';
import ChatAttachment from './ChatAttachment.jsx';
import ChatMessageBubble from './ChatMessageBubble.jsx';
import AiRewriteBox from './AiRewriteBox.jsx';

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
    <div className="floating-chat-container">
      {/* Floating Trigger Button */}
      {!isOpen && (
        <button
          type="button"
          className={`floating-chat-pill-btn ${role === 'seller' ? 'seller-chat-pill' : 'admin-chat-pill'}`}
          onClick={toggleOpen}
          title={role === 'seller' ? 'Chat with Admin Support' : 'Open Seller Support Inbox'}
        >
          <div className="floating-btn-content">
            <Ic name="chat" size={20} stroke={2} />
            <span className="floating-btn-text">
              {role === 'seller' ? 'Support' : 'Chat Desk'}
            </span>
          </div>
          {unreadCount > 0 && (
            <span className="floating-unread-badge animate-bounce">
              {unreadCount}
            </span>
          )}
        </button>
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
          <form onSubmit={handleSend} className="floating-chat-input-bar" style={{ alignItems: 'flex-end' }}>
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
              style={{ marginBottom: 4 }}
            >
              <Ic name="paperclip" size={18} stroke={2} />
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
              placeholder={file ? 'Add a caption...' : replyingTo ? `Reply... (Enter to send, Shift+Enter for newline)` : 'Type message... (Enter to send, Shift+Enter for newline)'}
              disabled={sending}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                resize: 'vertical',
                minHeight: 44,
                maxHeight: 120,
                fontFamily: 'inherit',
                fontSize: 13,
                lineHeight: 1.4,
              }}
            />

            {role === 'admin' && (
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
            )}

            <button
              type="submit"
              className="floating-send-btn"
              disabled={sending || (!text.trim() && !file)}
              style={{ height: 38, marginBottom: 3 }}
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
    </div>
  );
}
