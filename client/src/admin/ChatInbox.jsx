import { useEffect, useRef, useState } from 'react';
import { api, fmtDate } from '../api.js';
import { getSocket } from '../socket.js';
import Ic from '../components/Icons.jsx';
import ChatAttachment from '../components/ChatAttachment.jsx';

export default function ChatInbox() {
  const [convos, setConvos] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  const loadConvos = () => {
    setLoading(true);
    api('/chat/admin/conversations')
      .then((data) => {
        setConvos(data);
        if (!selectedId && data.length && window.innerWidth > 900) {
          setSelectedId(data[0]._id);
        }
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };

  const loadMessages = (id) => {
    if (!id) return;
    api(`/chat/admin/conversations/${id}/messages`)
      .then((res) => {
        setMessages(res.messages || []);
        // mark read
        api(`/chat/admin/conversations/${id}/read`, { method: 'POST' }).catch(() => {});
      })
      .catch((e) => console.error(e));
  };

  useEffect(() => {
    loadConvos();
  }, []);

  useEffect(() => {
    if (selectedId) loadMessages(selectedId);
  }, [selectedId]);

  useEffect(() => {
    const socket = getSocket();
    const token = localStorage.getItem('ng_admin_token');
    socket.emit('admin:join', { token });

    const onNewMsg = (msg) => {
      if (msg.conversation === selectedId) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === msg._id)) return prev;
          return [...prev, msg];
        });
      }
      loadConvos();
    };

    socket.on('message:new', onNewMsg);
    return () => {
      socket.off('message:new', onNewMsg);
    };
  }, [selectedId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  const handleReply = async (e) => {
    e.preventDefault();
    const clean = text.trim();
    if ((!clean && !file) || !selectedId) return;

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

        const uploadRes = await api('/uploads', {
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

      setText('');
      removeFile();

      await api(`/chat/admin/conversations/${selectedId}/reply`, {
        method: 'POST',
        body: {
          text: clean,
          attachment: attachmentUrl,
          attachmentType,
          attachmentName,
          attachmentSize,
        },
      });
      loadConvos();
    } catch (err) {
      setText(clean);
      alert('Failed to send reply: ' + err.message);
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  const handleToggleResolve = async () => {
    if (!selectedConv) return;
    const next = selectedConv.status === 'resolved' ? 'open' : 'resolved';
    try {
      await api(`/chat/admin/conversations/${selectedId}/status`, {
        method: 'POST',
        body: { status: next },
      });
      loadConvos();
    } catch (err) {
      alert(err.message);
    }
  };

  const selectedConv = convos.find((c) => c._id === selectedId);

  const filteredConvos = convos.filter((c) => {
    if (!q) return true;
    const name = (c.seller?.storeName || c.storeName || '').toLowerCase();
    const sub = (c.subject || '').toLowerCase();
    return name.includes(q.toLowerCase()) || sub.includes(q.toLowerCase());
  });

  return (
    <div className={`admin-chat-layout ${selectedId ? 'mobile-thread-view' : 'mobile-list-view'}`}>
      {/* Sidebar with seller conversations */}
      <div className="admin-chat-sidebar">
        <div className="admin-chat-sidebar-head">
          <div className="flex justify-between items-center mb-2">
            <b style={{ fontSize: 14 }}>Seller Support Inquiries</b>
            <span className="badge-pill">{convos.length} sellers</span>
          </div>
          <div className="admin-search-box search-field-sm">
            <Ic name="search" size={15} />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by store or subject..."
            />
            {q && (
              <button type="button" onClick={() => setQ('')} className="btn-clear-search">✕</button>
            )}
          </div>
        </div>

        <div className="admin-convos-list">
          {loading && <div className="p-4 text-center muted">Loading conversations...</div>}

          {!loading && filteredConvos.length === 0 && (
            <div className="p-6 text-center muted">No matching conversations found.</div>
          )}

          {filteredConvos.map((c) => {
            const isSelected = c._id === selectedId;
            const hasUnread = (c.unreadForAdmin || 0) > 0;
            return (
              <div
                key={c._id}
                onClick={() => setSelectedId(c._id)}
                className={`admin-convo-item ${isSelected ? 'active' : ''} ${hasUnread ? 'unread' : ''}`}
              >
                <div className="avatar-chip">{c.seller?.storeName?.[0] || c.storeName?.[0] || 'S'}</div>
                <div className="convo-info">
                  <div className="convo-top-row">
                    <b className="convo-name">{c.seller?.storeName || c.storeName}</b>
                    <span className="convo-time">{fmtDate(c.lastAt)}</span>
                  </div>
                  <div className="convo-last-msg">{c.lastMessage || 'No messages yet'}</div>
                  <div className="convo-bottom-row">
                    <span className={`convo-tag-status ${c.status}`}>
                      {c.status === 'resolved' ? '✓ Resolved' : '● Open'}
                    </span>
                    {hasUnread && <span className="convo-unread-bubble">{c.unreadForAdmin} new</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chat Thread Panel */}
      <div className="admin-chat-thread">
        {selectedConv ? (
          <>
            {/* Header */}
            <div className="admin-thread-head">
              <button
                type="button"
                className="chat-mobile-back-btn"
                onClick={() => setSelectedId(null)}
                title="Back to conversations list"
              >
                <Ic name="arrowLeft" size={16} /> <span>Back</span>
              </button>
              <div className="thread-store-info">
                <h3>🏬 {selectedConv.seller?.storeName || selectedConv.storeName}</h3>
                <small className="muted">
                  Owner: {selectedConv.seller?.ownerName || selectedConv.sellerName} • 📞 {selectedConv.seller?.phone || selectedConv.sellerPhone || 'N/A'} • {selectedConv.seller?.email}
                </small>
              </div>

              <div className="thread-head-actions">
                <button
                  onClick={handleToggleResolve}
                  className={`btn-toggle-resolve ${selectedConv.status === 'resolved' ? 'resolved' : ''}`}
                >
                  {selectedConv.status === 'resolved' ? '✓ Resolved (Re-open)' : 'Mark as Resolved'}
                </button>
              </div>
            </div>

            {/* Messages Feed */}
            <div className="admin-thread-messages">
              {messages.map((m) => {
                const isAdmin = m.sender === 'admin';
                return (
                  <div key={m._id} className={`chat-bubble-wrap ${isAdmin ? 'msg-me' : 'msg-them'}`}>
                    <div className="chat-bubble-sender">
                      {isAdmin ? m.senderName || 'You (Admin)' : `${selectedConv.storeName || 'Seller'}`}
                    </div>
                    <div className="chat-bubble-body">
                      {/* Attachment if present or text contains image/pdf url */}
                      {m.attachment ? (
                        <ChatAttachment msg={m} />
                      ) : (typeof m.text === 'string' && (m.text.startsWith('http') || m.text.startsWith('/uploads/') || m.text.startsWith('img/') || m.text.startsWith('/img/')) && m.text.match(/\.(jpeg|jpg|png|gif|webp|svg|pdf)(\?.*)?$/i)) ? (
                        <ChatAttachment url={m.text} />
                      ) : null}

                      {/* Text */}
                      {m.text && (!m.text.match(/\.(jpeg|jpg|png|gif|webp|svg|pdf)(\?.*)?$/i) || m.attachment) && (
                        <div className="chat-text-content">{m.text}</div>
                      )}
                    </div>
                    <div className="chat-bubble-time">
                      {fmtDate(m.createdAt)}
                    </div>
                  </div>
                );
              })}
              <div ref={scrollRef} />
            </div>

            {/* Pending Attachment Preview Bar */}
            {file && (
              <div className="chat-attachment-preview-bar admin-preview-bar">
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
                      {(file.size / 1024).toFixed(1)} KB • {file.type.startsWith('image/') ? 'Image' : 'PDF Document'}
                    </small>
                  </div>
                </div>
                <button type="button" className="btn-remove-preview" onClick={removeFile} title="Remove attachment">
                  <Ic name="x" size={16} />
                </button>
              </div>
            )}

            {/* Reply Bar */}
            <form onSubmit={handleReply} className="admin-reply-bar">
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
                title="Attach Image or PDF"
                disabled={sending}
              >
                <Ic name="paperclip" size={20} stroke={2} />
              </button>

              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={file ? 'Add a caption to attachment...' : `Reply to ${selectedConv.seller?.storeName || selectedConv.storeName}...`}
                disabled={sending}
              />
              <button type="submit" className="btn-primary" disabled={sending || (!text.trim() && !file)}>
                {sending ? (uploading ? 'Uploading...' : 'Sending...') : <><Ic name="send" size={16} /> Send Reply</>}
              </button>
            </form>
          </>
        ) : (
          <div className="admin-chat-empty">
            <div className="empty-icon"><Ic name="chat" size={40} /></div>
            <h3>Select a Seller Conversation</h3>
            <p>Select a seller from the left panel to review inquiries and send real-time support assistance with Image/PDF sharing.</p>
          </div>
        )}
      </div>
    </div>
  );
}
