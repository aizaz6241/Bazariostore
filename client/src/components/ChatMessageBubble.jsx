import { useState, useRef } from 'react';
import Ic from './Icons.jsx';
import ChatAttachment from './ChatAttachment.jsx';
import { fmtDate } from '../api.js';

export default function ChatMessageBubble({ msg, isMe, myRole = 'seller', onReply }) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartRef = useRef({ x: 0, y: 0 });

  const handleTouchStart = (e) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    setIsSwiping(false);
  };

  const handleTouchMove = (e) => {
    const deltaX = e.touches[0].clientX - touchStartRef.current.x;
    const deltaY = e.touches[0].clientY - touchStartRef.current.y;

    // Check if horizontal swipe is intentional
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      setIsSwiping(true);
      // Swipe left-to-right or right-to-left
      const offset = Math.max(-65, Math.min(65, deltaX));
      setDragOffset(offset);
    }
  };

  const handleTouchEnd = () => {
    if (Math.abs(dragOffset) >= 35) {
      onReply(msg);
    }
    setDragOffset(0);
    setIsSwiping(false);
  };

  const isTriggered = Math.abs(dragOffset) >= 35;

  const senderLabel = isMe
    ? myRole === 'admin'
      ? 'You (Admin)'
      : 'You (Store)'
    : msg.senderName || (myRole === 'seller' ? 'Super Admin' : 'Seller');

  return (
    <div
      className={`chat-bubble-wrap ${isMe ? 'msg-me' : 'msg-them'}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Swipe-to-Reply Background Pop Indicator */}
      {isSwiping && (
        <div
          className={`swipe-reply-indicator ${dragOffset > 0 ? 'swipe-ltr' : 'swipe-rtl'} ${isTriggered ? 'triggered' : ''}`}
        >
          <div className="sri-circle">
            <Ic name="cornerDownRight" size={16} />
          </div>
        </div>
      )}

      <div
        className="chat-bubble-inner"
        style={{
          transform: `translateX(${dragOffset}px)`,
          transition: isSwiping ? 'none' : 'transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        }}
      >
        {/* Bubble Header with Sender Name & Always-Visible Clear Reply Action */}
        <div className="chat-bubble-sender">
          <span className="cbs-name">{senderLabel}</span>
          <button
            type="button"
            className="bubble-reply-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onReply(msg);
            }}
            title="Reply to this message"
            aria-label="Reply to message"
          >
            <Ic name="cornerDownRight" size={13} />
            <span>Reply</span>
          </button>
        </div>

        {/* Bubble Body */}
        <div className="chat-bubble-body">
          {/* Quoted Message if this message is a reply to an earlier message */}
          {msg.replyTo && (
            <div className="chat-quoted-msg">
              <div className="cqm-header">
                <Ic name="cornerDownRight" size={11} />
                <b className="cqm-author">
                  {msg.replyTo.sender === (myRole === 'seller' ? 'seller' : 'admin')
                    ? 'You'
                    : msg.replyTo.senderName || (myRole === 'seller' ? 'Super Admin' : 'Seller')}
                </b>
              </div>
              <span className="cqm-text">
                {msg.replyTo.text ||
                  (msg.replyTo.attachmentType === 'pdf'
                    ? `📄 ${msg.replyTo.attachmentName || 'PDF Document'}`
                    : '📷 Image Attachment')}
              </span>
            </div>
          )}

          {/* Attachment Card / Image / PDF */}
          {msg.attachment ? (
            <ChatAttachment msg={msg} />
          ) : typeof msg.text === 'string' &&
            (msg.text.startsWith('http') ||
              msg.text.startsWith('/uploads/') ||
              msg.text.startsWith('img/') ||
              msg.text.startsWith('/img/')) &&
            msg.text.match(/\.(jpeg|jpg|png|gif|webp|svg|pdf)(\?.*)?$/i) ? (
            <ChatAttachment url={msg.text} />
          ) : null}

          {/* Message Text (if not redundant with standalone attachment url) */}
          {msg.text && (!msg.text.match(/\.(jpeg|jpg|png|gif|webp|svg|pdf)(\?.*)?$/i) || msg.attachment) && (
            <div className="chat-text-content">{msg.text}</div>
          )}
        </div>

        {/* Bubble Footer */}
        <div className="chat-bubble-footer">
          <span className="chat-bubble-time">{fmtDate(msg.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}
