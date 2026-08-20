import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useContent } from '../content.jsx';
import { getSocket, getGuestId } from '../socket.js';
import Ic from './Icons.jsx';

export default function ChatWidget() {
  const { user } = useAuth();
  const { content } = useContent();
  const cw = content.chatWidget || {};
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [unread, setUnread] = useState(0);
  const openRef = useRef(false);
  const listRef = useRef(null);
  const guestId = getGuestId();

  useEffect(() => {
    openRef.current = open;
    if (open) {
      api(`/chat/messages/${guestId}`).then(setMessages).catch(() => {});
      api(`/chat/read/${guestId}`, { method: 'POST' }).catch(() => {});
      setUnread(0);
    }
  }, [open, guestId]);

  useEffect(() => {
    const socket = getSocket();
    const join = () =>
      socket.emit('customer:join', {
        guestId,
        user: user ? { name: user.name, email: user.email, phone: user.phone } : null,
      });
    join();
    const onMsg = (m) => {
      if (m.guestId !== guestId) return;
      setMessages((prev) => (prev.some((x) => x._id === m._id) ? prev : [...prev, m]));
      if (m.sender === 'admin' && !openRef.current) setUnread((u) => u + 1);
      if (openRef.current) api(`/chat/read/${guestId}`, { method: 'POST' }).catch(() => {});
    };
    socket.on('connect', join);
    socket.on('message:new', onMsg);
    return () => {
      socket.off('connect', join);
      socket.off('message:new', onMsg);
    };
  }, [guestId, user]);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [messages, open]);

  const send = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    getSocket().emit('message:send', { guestId, sender: 'customer', text: t });
    setText('');
  };

  return (
    <div className="chatw">
      {open && (
        <div className="chatw-panel">
          <div className="chatw-head">
            <div className="chatw-avatar">B</div>
            <div>
              <b>{cw.title || 'Bazario Customer Support'}</b>
              <small>{cw.subtitle || 'We usually reply within a few minutes'}</small>
            </div>
            <button className="chatw-close" onClick={() => setOpen(false)} aria-label="Close chat"><Ic name="x" size={16} /></button>
          </div>
          <div className="chatw-body" ref={listRef}>
            <div className="chatw-msg chatw-admin">
              <p>{cw.welcome || 'Assalam o Alaikum! 👋 Welcome to Bazario. How can we help you today?'}</p>
            </div>
            {messages.map((m) => (
              <div key={m._id} className={'chatw-msg ' + (m.sender === 'customer' ? 'chatw-mine' : 'chatw-admin')}>
                <p>{m.text}</p>
              </div>
            ))}
          </div>
          <form className="chatw-input" onSubmit={send}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your message..." />
            <button type="submit" aria-label="Send"><Ic name="send" size={17} /></button>
          </form>
        </div>
      )}
      <button className="chatw-fab" onClick={() => setOpen(!open)}>
        <span className="chatw-fab-label">Chat with us</span>
        <span className="chatw-fab-icon">
          <Ic name="whatsapp" size={22} />
          {unread > 0 && <span className="chatw-unread">{unread}</span>}
        </span>
      </button>
    </div>
  );
}
