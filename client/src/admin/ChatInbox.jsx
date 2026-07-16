import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate } from '../api.js';
import { getSocket } from '../socket.js';
import Ic from '../components/Icons.jsx';

export default function ChatInbox() {
  const [convos, setConvos] = useState([]);
  const [active, setActive] = useState(null); // guestId
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const activeRef = useRef(null);
  const listRef = useRef(null);

  const loadConvos = () => api('/chat/conversations').then(setConvos).catch((e) => setError(e.message));

  useEffect(() => {
    loadConvos();
  }, []);

  useEffect(() => {
    activeRef.current = active;
    if (!active) return;
    api(`/chat/conversations/${active}/messages`).then(setMessages).catch(() => {});
    api(`/chat/conversations/${active}/read`, { method: 'POST' })
      .then(() => setConvos((prev) => prev.map((c) => (c.guestId === active ? { ...c, unreadForAdmin: 0 } : c))))
      .catch(() => {});
  }, [active]);

  useEffect(() => {
    const socket = getSocket();
    const onMsg = (m) => {
      if (m.guestId === activeRef.current) {
        setMessages((prev) => (prev.some((x) => x._id === m._id) ? prev : [...prev, m]));
        if (m.sender === 'customer') api(`/chat/conversations/${m.guestId}/read`, { method: 'POST' }).catch(() => {});
      }
      loadConvos();
    };
    socket.on('message:new', onMsg);
    return () => socket.off('message:new', onMsg);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [messages]);

  const send = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || !active) return;
    getSocket().emit('message:send', { guestId: active, sender: 'admin', text: t });
    setText('');
  };

  const activeConvo = convos.find((c) => c.guestId === active);

  return (
    <>
      <h1 className="admin-h1">Support Chat</h1>
      {error && <div className="alert-error"><Ic name="x" size={14} /> {error}</div>}
      <div className="inbox card">
        <div className="inbox-list">
          {convos.length === 0 && <p className="muted inbox-empty">Abhi koi conversation nahi. Jab customer website par "Chat with us" se message karega, yahan show hoga.</p>}
          {convos.map((c) => (
            <button
              key={c.guestId}
              className={'inbox-item' + (active === c.guestId ? ' on' : '')}
              onClick={() => setActive(c.guestId)}
            >
              <span className="inbox-av">{(c.displayName || 'G')[0].toUpperCase()}</span>
              <span className="inbox-meta">
                <b>
                  {c.displayName}
                  {c.orderNumber && <small className="linked-order"> · {c.orderNumber}</small>}
                </b>
                <small className="inbox-last">{c.lastMessage}</small>
              </span>
              <span className="inbox-right">
                <small>{c.lastAt ? new Date(c.lastAt).toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' }) : ''}</small>
                {c.unreadForAdmin > 0 && <span className="inbox-unread">{c.unreadForAdmin}</span>}
              </span>
            </button>
          ))}
        </div>
        <div className="inbox-thread">
          {!active ? (
            <div className="inbox-placeholder">
              <Ic name="chat" size={40} stroke={1.2} />
              <p>Select a conversation to reply</p>
            </div>
          ) : (
            <>
              <div className="thread-head">
                <div>
                  <b>{activeConvo?.displayName}</b>
                  <small className="muted"> {activeConvo?.lastAt ? '· last message ' + fmtDate(activeConvo.lastAt) : ''}</small>
                </div>
                <div className="thread-meta">
                  {activeConvo?.phone && <span><Ic name="phone" size={12} /> {activeConvo.phone}</span>}
                  {activeConvo?.email && <span><Ic name="mail" size={12} /> {activeConvo.email}</span>}
                  {activeConvo?.orderNumber && (
                    <span className="pay-chip">Order: {activeConvo.orderNumber}</span>
                  )}
                </div>
              </div>
              <div className="thread-body" ref={listRef}>
                {messages.map((m) => (
                  <div key={m._id} className={'chatw-msg ' + (m.sender === 'admin' ? 'chatw-mine' : 'chatw-admin')}>
                    <p>{m.text}</p>
                    <small className="msg-time">{new Date(m.createdAt).toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' })}</small>
                  </div>
                ))}
              </div>
              <form className="chatw-input thread-input" onSubmit={send}>
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your reply..." />
                <button type="submit" aria-label="Send"><Ic name="send" size={17} /></button>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
}
