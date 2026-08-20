import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { sapi, fmtDate } from '../api.js';
import { getSocket } from '../socket.js';
import Ic from '../components/Icons.jsx';
import ChatAttachment from '../components/ChatAttachment.jsx';

export default function SellerSupport() {
  const { seller, setUnreadChat } = useOutletContext();
  const [conv, setConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  const loadThread = () => {
    sapi('/chat/seller/thread')
      .then((res) => {
        setConv(res.conversation);
        setMessages(res.messages || []);
        // Mark read
        sapi('/chat/seller/read', { method: 'POST' }).catch(() => {});
        if (setUnreadChat) setUnreadChat(0);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadThread();

    const socket = getSocket();
    const onNewMessage = (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m._id === msg._id)) return prev;
        return [...prev, msg];
      });
      // Mark read if seller has open chat window
      sapi('/chat/seller/read', { method: 'POST' }).catch(() => {});
      if (setUnreadChat) setUnreadChat(0);
    };

    socket.on('message:new', onNewMessage);
    return () => {
      socket.off('message:new', onNewMessage);
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      // If file selected, upload first
      if (file) {
        setUploading(true);
        const fd = new FormData();
        fd.append('files', file);

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

      // Clear input immediately for snappy UX
      setText('');
      removeFile();

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
    } catch (err) {
      setText(clean); // restore on error
      alert('Failed to send message: ' + err.message);
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  return (
    <div className="seller-support-page">
      <div className="seller-page-header">
        <div>
          <h2>💬 Admin & Platform Support Desk</h2>
          <p>Chat directly with Super Admin and official platform staff. Send text, screenshots, receipts, or PDF documents.</p>
        </div>
      </div>

      <div className="seller-chat-container">
        {/* Chat Header */}
        <div className="seller-chat-head">
          <div className="admin-status-indicator">
            <span className="online-beacon"></span>
            <div>
              <b>Bazario Official Support Desk</b>
              <small className="muted block">
                {conv?.assignedStaffName ? `Assigned agent: ${conv.assignedStaffName}` : 'Available 24/7 • Avg reply time: ~2 mins'}
              </small>
            </div>
          </div>
          <div className="ticket-status-pill">
            Status: <span className="status-open">Open Ticket</span>
          </div>
        </div>

        {/* Messages Feed */}
        <div className="seller-chat-messages">
          {loading && <div className="text-center py-10 muted">Loading support conversation...</div>}

          {!loading && messages.length === 0 && (
            <div className="chat-empty-state">
              <div className="empty-icon"><Ic name="chat" size={32} /></div>
              <h4>Start a conversation with Super Admin</h4>
              <p>Type your inquiry below regarding vendor payouts, product listing approval, account verification, or send documents/receipts.</p>
            </div>
          )}

          {messages.map((m) => {
            const isMe = m.sender === 'seller';
            return (
              <div key={m._id} className={`chat-bubble-wrap ${isMe ? 'msg-me' : 'msg-them'}`}>
                <div className="chat-bubble-sender">
                  {isMe ? 'You (Store)' : m.senderName || 'Super Admin'}
                </div>
                <div className="chat-bubble-body">
                  {/* Attachment if present */}
                  {m.attachment && <ChatAttachment msg={m} />}
                  {/* Message Text */}
                  {m.text && <div className="chat-text-content">{m.text}</div>}
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
                  {(file.size / 1024).toFixed(1)} KB • {file.type.startsWith('image/') ? 'Image' : 'PDF Document'}
                </small>
              </div>
            </div>
            <button type="button" className="btn-remove-preview" onClick={removeFile} title="Remove attachment">
              <Ic name="x" size={16} />
            </button>
          </div>
        )}

        {/* Chat Input */}
        <form onSubmit={handleSend} className="seller-chat-input-bar">
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
            placeholder={file ? 'Add a caption or message...' : 'Type message or attach Image / PDF...'}
            disabled={sending}
          />

          <button
            type="submit"
            className="seller-send-btn"
            disabled={sending || (!text.trim() && !file)}
          >
            {sending ? (uploading ? 'Uploading...' : 'Sending...') : <><Ic name="send" size={17} /> Send</>}
          </button>
        </form>
      </div>
    </div>
  );
}
