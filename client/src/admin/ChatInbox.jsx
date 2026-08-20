import { useEffect, useState, useRef } from 'react';
import { api, fmtDate, fmtDay, compressImage } from '../api.js';
import { getSocket } from '../socket.js';
import Ic from '../components/Icons.jsx';
import ChatAttachment from '../components/ChatAttachment.jsx';
import ChatMessageBubble from '../components/ChatMessageBubble.jsx';

export default function ChatInbox() {
  const [convos, setConvos] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const textInputRef = useRef(null);

  const loadConvos = () => {
    api('/chat/admin/conversations')
      .then((data) => {
        setConvos(data || []);
        if (!selectedId && data?.length) {
          // don't auto select on mobile screen so list view is visible
          if (typeof window !== 'undefined' && window.innerWidth > 768) {
            setSelectedId(data[0]._id);
          }
        }
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };

  const loadMessages = (cid) => {
    if (!cid) return;
    api(`/chat/admin/conversations/${cid}/messages`)
      .then((data) => {
        setMessages(data || []);
        // update unread counter locally
        setConvos((prev) =>
          prev.map((c) => (c._id === cid ? { ...c, unreadForAdmin: 0 } : c))
        );
      })
      .catch((e) => console.error(e));
  };

  useEffect(() => {
    loadConvos();

    let socket;
    try {
      socket = getSocket();
    } catch (e) {
      console.warn('Socket warning:', e);
    }

    const onNewMessage = (msg) => {
      if (!msg) return;
      if (msg.conversation === selectedId) {
        setMessages((prev) => {
          if (!Array.isArray(prev)) return [msg];
          if (prev.some((m) => m?._id === msg?._id)) return prev;
          return [...prev, msg];
        });
      }
      loadConvos();
    };

    if (socket) {
      socket.on('message:new', onNewMessage);
    }
    return () => {
      if (socket) {
        socket.off('message:new', onNewMessage);
      }
    };
  }, [selectedId]);

  useEffect(() => {
    if (selectedId) loadMessages(selectedId);
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

  const handleStartReply = (msg) => {
    setReplyingTo(msg);
    textInputRef.current?.focus();
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
        const fileToUpload = await compressImage(file);
        const fd = new FormData();
        fd.append('files', fileToUpload);

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

      const targetReply = replyingTo ? {
        messageId: replyingTo._id,
        sender: replyingTo.sender,
        senderName: replyingTo.sender === 'admin' ? 'You (Admin)' : (replyingTo.senderName || selectedConv?.storeName || 'Seller'),
        text: replyingTo.text || (replyingTo.attachmentType === 'pdf' ? `📄 ${replyingTo.attachmentName || 'PDF Document'}` : '📷 Image Attachment'),
        attachmentType: replyingTo.attachmentType || null,
        attachmentName: replyingTo.attachmentName || '',
      } : null;

      setText('');
      removeFile();
      setReplyingTo(null);

      await api(`/chat/admin/conversations/${selectedId}/reply`, {
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
            {q && <button type="button" onClick={() => setQ('')} className="btn-clear-search">✕</button>}
          </div>
        </div>

        <div className="admin-convos-list">
          {loading && <div className="p-4 text-center muted">Loading...</div>}
          {!loading && filteredConvos.length === 0 && <div className="p-6 text-center muted">No conversations.</div>}

          {filteredConvos.map((c) => {
            const isSelected = c._id === selectedId;
            const hasUnread = (c.unreadForAdmin || 0) > 0;
            return (
              <div
                key={c._id}
                className={`admin-convo-item ${isSelected ? 'selected' : ''} ${hasUnread ? 'has-unread' : ''}`}
                onClick={() => setSelectedId(c._id)}
              >
                <div className="convo-avatar">
                  <span>{(c.storeName || c.seller?.storeName || 'S')[0].toUpperCase()}</span>
                </div>
                <div className="convo-body">
                  <div className="convo-top">
                    <b className="convo-name">{c.storeName || c.seller?.storeName || 'Unknown Store'}</b>
                    <small className="convo-time">{fmtDay(c.lastAt)}</small>
                  </div>
                  <div className="convo-sub">
                    <span className="convo-last-msg">{c.lastMessage || 'No messages yet'}</span>
                    {hasUnread && <span className="convo-unread-pill">{c.unreadForAdmin}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="admin-chat-thread">
        {selectedConv ? (
          <>
            <div className="admin-thread-head">
              <div className="ath-left">
                <button
                  type="button"
                  className="mobile-back-btn"
                  onClick={() => setSelectedId(null)}
                  title="Back to seller list"
                >
                  <Ic name="arrowLeft" size={18} />
                </button>
                <div className="ath-info">
                  <b className="ath-name">{selectedConv.storeName || selectedConv.seller?.storeName}</b>
                  <div className="ath-meta">
                    <span>Owner: {selectedConv.sellerName || selectedConv.seller?.ownerName}</span>
                    <span>•</span>
                    <span>{selectedConv.sellerEmail || selectedConv.seller?.email}</span>
                  </div>
                </div>
              </div>

              <div className="ath-actions">
                <button
                  type="button"
                  className={`btn-status-toggle ${selectedConv.status === 'resolved' ? 'status-resolved' : 'status-open'}`}
                  onClick={handleToggleResolve}
                >
                  {selectedConv.status === 'resolved' ? '✅ Resolved (Reopen)' : 'Mark as Resolved'}
                </button>
              </div>
            </div>

            <div className="admin-thread-messages">
              {messages.map((m) => {
                const isAdmin = m.sender === 'admin';
                return (
                  <ChatMessageBubble
                    key={m._id}
                    msg={m}
                    isMe={isAdmin}
                    myRole="admin"
                    onReply={handleStartReply}
                  />
                );
              })}
              <div ref={scrollRef} />
            </div>

            {replyingTo && (
              <div className="chat-replying-bar">
                <div className="crb-left">
                  <div className="crb-indicator"></div>
                  <div className="crb-info">
                    <span className="crb-title">Replying to <b>{replyingTo.sender === 'admin' ? 'You' : (replyingTo.senderName || 'Seller')}</b></span>
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

            {file && (
              <div className="chat-attachment-preview-bar admin-preview-bar">
                <div className="preview-file-box">
                  {filePreview ? (
                    <img src={filePreview} alt="Upload preview" className="preview-thumb" />
                  ) : (
                    <div className="preview-pdf-icon"><Ic name="fileText" size={24} /><span>PDF</span></div>
                  )}
                  <div className="preview-file-details">
                    <b className="preview-file-name">{file.name}</b>
                    <small className="muted-sm">{(file.size / 1024).toFixed(1)} KB • {file.type.startsWith('image/') ? 'Image' : 'PDF'}</small>
                  </div>
                </div>
                <button type="button" className="btn-remove-preview" onClick={removeFile} title="Remove"><Ic name="x" size={16} /></button>
              </div>
            )}

            <form onSubmit={handleReply} className="admin-reply-bar">
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" style={{ display: 'none' }} />
              <button type="button" className="chat-attach-btn" onClick={() => fileInputRef.current?.click()} disabled={sending}><Ic name="paperclip" size={20} stroke={2} /></button>
              <input
                type="text"
                ref={textInputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={file ? 'Add a caption...' : replyingTo ? `Reply to ${replyingTo.sender === 'admin' ? 'your message' : 'Seller'}...` : `Reply to ${selectedConv.seller?.storeName || selectedConv.storeName}...`}
                disabled={sending}
              />
              <button type="submit" className="btn-primary" disabled={sending || (!text.trim() && !file)}>
                {sending ? (uploading ? 'Uploading...' : 'Sending...') : <><Ic name="send" size={16} /> Send</>}
              </button>
            </form>
          </>
        ) : (
          <div className="admin-chat-empty">
            <div className="empty-icon"><Ic name="chat" size={40} /></div>
            <h3>Select a Seller Conversation</h3>
            <p>Select a seller to review inquiries and send real-time support.</p>
          </div>
        )}
      </div>
    </div>
  );
}
