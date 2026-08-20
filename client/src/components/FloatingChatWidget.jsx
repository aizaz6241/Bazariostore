import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { sapi, api, fmtDate } from '../api.js';
import { getSocket } from '../socket.js';
import Ic from './Icons.jsx';
import ChatAttachment from './ChatAttachment.jsx';

export default function FloatingChatWidget({ role = 'seller', currentSeller = null }) {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [conv, setConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);

  // Admin specific state
  const [adminConvos, setAdminConvos] = useState([]);
  const [selectedConvoId, setSelectedConvoId] = useState(null);

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  // Hide floating widget if user is already on the full support/chat page
  const isFullChatPage =
    location.pathname === '/seller/support' ||
    location.pathname === '/admin/chat';

  // Load seller thread
  const loadSellerThread = () => {
    setLoading(true);
    sapi('/chat/seller/thread')
      .then((res) => {
        setConv(res.conversation);
        setMessages(res.messages || []);
        if (isOpen) {
          sapi('/chat/seller/read', { method: 'POST' }).catch(() => {});
          setUnreadCount(0);
        } else if (res.conversation?.unreadForSeller) {
          setUnreadCount(res.conversation.unreadForSeller);
        }
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };

  // Load admin convos
  const loadAdminConvos = () => {
    setLoading(true);
    api('/chat/admin/conversations')
      .then((data) => {
        setAdminConvos(data || []);
        const totalUnread = (data || []).reduce((acc, c) => acc + (c.unreadForAdmin || 0), 0);
        setUnreadCount(totalUnread);
        if (!selectedConvoId && data?.length) {
          setSelectedConvoId(data[0]._id);
        }
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };

  const loadAdminMessages = (id) => {
    if (!id) return;
    api(`/chat/admin/conversations/${id}/messages`)
      .then((res) => {
        setMessages(res.messages || []);
        api(`/chat/admin/conversations/${id}/read`, { method: 'POST' }).catch(() => {});
      })
      .catch((e) => console.error(e));
  };

  useEffect(() => {
    if (role === 'seller') {
      loadSellerThread();
    } else {
      loadAdminConvos();
    }

    const socket = getSocket();
    const onNewMsg = (msg) => {
      if (role === 'seller') {
        setMessages((prev) => {
          if (prev.some((m) => m._id === msg._id)) return prev;
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
            if (prev.some((m) => m._id === msg._id)) return prev;
            return [...prev, msg];
          });
        }
        if (!isOpen && msg.sender === 'seller') {
          setUnreadCount((prev) => prev + 1);
        }
        loadAdminConvos();
      }
    };

    socket.on('message:new', onNewMsg);
    return () => {
      socket.off('message:new', onNewMsg);
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
        const fd = new FormData();
        fd.append('files', file);

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

      setText('');
      removeFile();

      if (role === 'seller') {
        await sapi('/chat/seller/send', {
          method: 'POST',
          body: {
            text: clean,
            attachment: attachmentUrl,
            attachmentType,
            attachmentName,
            attachmentSize,
          },
        });
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
          },
        });
        loadAdminConvos();
      }
    } catch (err) {
      setText(clean);
      alert('Failed to send: ' + err.message);
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  // Don't render floating widget on full dedicated chat page
  if (isFullChatPage) return null;

  const currentConvo = role === 'admin' ? adminConvos.find((c) => c._id === selectedConvoId) : conv;

  return (
    <div className="floating-chat-root">
      {/* Floating Trigger Button */}
      {!isOpen && (
        <button
          className="floating-chat-trigger"
          onClick={toggleOpen}
          title={role === 'seller' ? 'Chat with Admin Support' : 'Open Seller Support Inbox'}
        >
          <div className="floating-btn-content">
            <Ic name="chat" size={24} stroke={2} />
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
                  onChange={(e) => setSelectedConvoId(e.target.value)}
                  className="floating-admin-select"
                  title="Switch seller"
                >
                  {adminConvos.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.seller?.storeName || c.storeName} {c.unreadForAdmin ? `(${c.unreadForAdmin} new)` : ''}
                    </option>
                  ))}
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
                <div key={m._id} className={`floating-msg-bubble-wrap ${isMe ? 'msg-me' : 'msg-them'}`}>
                  <div className="floating-msg-sender">
                    {isMe ? 'You' : m.senderName || (role === 'seller' ? 'Super Admin' : 'Seller')}
                  </div>
                  <div className="floating-msg-body">
                    {m.attachment && <ChatAttachment msg={m} />}
                    {m.text && <div className="floating-msg-text">{m.text}</div>}
                  </div>
                  <div className="floating-msg-time">
                    {fmtDate(m.createdAt)}
                  </div>
                </div>
              );
            })}
            <div ref={scrollRef} />
          </div>

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
          <form onSubmit={handleSend} className="floating-chat-input-bar">
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
            >
              <Ic name="paperclip" size={18} stroke={2} />
            </button>

            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={file ? 'Add a caption...' : 'Type message...'}
              disabled={sending}
            />

            <button
              type="submit"
              className="floating-send-btn"
              disabled={sending || (!text.trim() && !file)}
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
