import { useState, useRef } from 'react';
import Ic from './Icons.jsx';
import ChatAttachment from './ChatAttachment.jsx';
import { fmtDate, sapi } from '../api.js';
import { useNavigate } from 'react-router-dom';
import { shortcutPath, adminShortcutPath, messageActions } from '../utils/chatShortcuts.js';

export function scrollToQuotedMessage(messageId) {
  if (!messageId) return;
  const target = document.getElementById(`chat-msg-${messageId}`);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('msg-highlight-flash');
    // trigger reflow to restart animation
    void target.offsetWidth;
    target.classList.add('msg-highlight-flash');
    setTimeout(() => {
      target.classList.remove('msg-highlight-flash');
    }, 2000);
  }
}

export default function ChatMessageBubble({ msg, isMe, myRole = 'seller', onReply, onEdit, onDelete }) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const navigate = useNavigate();

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
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 15) {
      setIsSwiping(true);
      const offset = Math.max(-60, Math.min(60, deltaX));
      setDragOffset(offset);
    }
  };

  const handleTouchEnd = () => {
    if (Math.abs(dragOffset) >= 32 && onReply && !msg.isDeleted) {
      onReply(msg);
    }
    setDragOffset(0);
    setIsSwiping(false);
  };

  if (!msg || msg.isDeleted) return null;

  const isTriggered = Math.abs(dragOffset) >= 32;

  // Determine quoted author name
  const isReply = !msg.isDeleted && !!(msg.replyTo && (msg.replyTo.text || msg.replyTo.attachmentName || msg.replyTo.attachmentType));
  const quotedSenderIsMe = msg.replyTo?.sender === (myRole === 'seller' ? 'seller' : 'admin');
  const quotedAuthor = quotedSenderIsMe
    ? 'You'
    : myRole === 'seller' ? 'Bazario Support' : (msg.replyTo?.senderName || 'Seller');

  // Sender label for incoming messages only
  // a store never sees which admin wrote: every team message shows as Bazario Support
  const incomingSenderLabel = !isMe ? (myRole === 'seller' ? (msg.isAutoReply ? 'Bazario Support (auto-reply)' : 'Bazario Support') : (msg.senderName || 'Seller Store')) : null;

  return (
    <div
      id={`chat-msg-${msg._id}`}
      className={`chat-bubble-wrap ${isMe ? 'msg-me' : 'msg-them'}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Swipe-to-Reply Background Pop Indicator on Mobile */}
      {isSwiping && !msg.isDeleted && (
        <div
          className={`swipe-reply-indicator ${dragOffset > 0 ? 'swipe-ltr' : 'swipe-rtl'} ${isTriggered ? 'triggered' : ''}`}
        >
          <div className="sri-circle">
            <Ic name="cornerDownRight" size={16} />
          </div>
        </div>
      )}

      {/* Bubble Row with adjacent Hover Reply & Action Buttons */}
      <div className="chat-bubble-row">
        {isMe && !msg.isDeleted && (
          <div className="chat-bubble-actions-hover">
            {onReply && (
              <button
                type="button"
                className="chat-hover-reply-btn"
                onClick={(e) => { e.stopPropagation(); onReply(msg); }}
                title="Reply"
              >
                <Ic name="cornerDownRight" size={13} />
              </button>
            )}
            {myRole === 'admin' && onEdit && (
              <button
                type="button"
                className="chat-hover-reply-btn"
                onClick={(e) => { e.stopPropagation(); onEdit(msg); }}
                title="Edit message"
              >
                <Ic name="edit" size={13} />
              </button>
            )}
            {/* an admin deletes their own messages here; a seller too (e.g. wrong bank details sent) */}
            {(myRole === 'admin' || myRole === 'seller') && onDelete && (
              <button
                type="button"
                className="chat-hover-reply-btn"
                onClick={(e) => { e.stopPropagation(); onDelete(msg); }}
                title="Delete message"
                style={{ color: '#dc2626' }}
              >
                <Ic name="trash" size={13} />
              </button>
            )}
          </div>
        )}

        {/* Main Message Bubble */}
        <div
          className={`chat-bubble-inner ${msg.isDeleted ? 'msg-deleted-bubble' : ''}`}
          style={{
            transform: `translateX(${dragOffset}px)`,
            transition: isSwiping ? 'none' : 'transform 0.22s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          }}
        >
          {/* Incoming sender label */}
          {incomingSenderLabel && (
            <div className="chat-bubble-author-title">
              <span>{incomingSenderLabel}</span>
              {msg.isAutoReply && <span style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', padding: '1px 5px', borderRadius: 4, marginLeft: 5 }}>🤖 Auto-Reply</span>}
            </div>
          )}

          {/* Quoted Preview */}
          {isReply && (
            <div
              className="chat-quoted-msg clickable"
              onClick={() => scrollToQuotedMessage(msg.replyTo.messageId)}
              title="Click to view quoted message"
              role="button"
              tabIndex={0}
            >
              <div className="cqm-left-bar" />
              <div className="cqm-content">
                <div className="cqm-header">
                  <span className="cqm-reply-icon">↩</span>
                  <b className="cqm-author">{quotedAuthor}</b>
                </div>
                <span className="cqm-text">
                  {msg.replyTo.text ||
                    (msg.replyTo.attachmentType === 'pdf'
                      ? `📄 ${msg.replyTo.attachmentName || 'PDF Document'}`
                      : '📷 Photo Attachment')}
                </span>
              </div>
            </div>
          )}

          {/* Attachment (Image or PDF) */}
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

          {/* Message Text Content */}
          {msg.text && (!msg.text.match(/\.(jpeg|jpg|png|gif|webp|svg|pdf)(\?.*)?$/i) || msg.attachment) && (
            <div className="chat-text-content">{msg.text}</div>
          )}

          {/* Shortcut buttons from support (one or several): the seller taps one and lands on that
              page / order / product; support can open the same order / product in the admin panel */}
          {(() => {
            const list = messageActions(msg);
            if (!list.length) return null;
            const supportView = myRole !== 'seller' && myRole !== 'guest' && myRole !== 'customer';
            return (
              <div className={`chat-action-list ${list.length > 1 ? 'is-multi' : ''}`}>
                {list.map((act, i) => {
                  const path = myRole === 'seller' ? shortcutPath(act) : supportView ? adminShortcutPath(act) : '';
                  const canOpen = !!path;
                  const Tag = canOpen ? 'button' : 'div';
                  const open = () => {
                    // the seller's first tap is shown to support as "Opened" (never blocks the page from opening)
                    if (myRole === 'seller' && !act.openedAt && msg._id) sapi('/chat/seller/action-opened', { method: 'POST', body: { messageId: msg._id, index: i } }).catch(() => {});
                    navigate(path);
                  };
                  return (
                    <Tag
                      key={`${act.kind}-${act.key || act.refId}-${i}`}
                      {...(canOpen ? { type: 'button', onClick: open } : {})}
                      className={`chat-action-card ${canOpen ? 'is-link' : ''}`}
                      title={myRole === 'seller' ? 'Open' : canOpen ? (act.kind === 'order' ? 'Open this order in the admin panel' : 'Open this product in the admin panel') : 'The seller sees this as a button'}
                    >
                      <span className="cac-txt">
                        <b>{act.label}</b>
                        {act.sub && <small>{act.sub}</small>}
                        {supportView && (
                          <small className={`cac-opened ${act.openedAt ? 'yes' : ''}`}>
                            {act.openedAt ? `✓ Opened by the seller · ${fmtDate(act.openedAt)}` : 'Not opened yet'}
                          </small>
                        )}
                        {supportView && act.doneAt && <small className="cac-opened cac-done">✅ Done: {act.doneText || 'Done'} · {fmtDate(act.doneAt)}</small>}
                      </span>
                      {myRole === 'seller' && canOpen ? <span className="cac-go">Open →</span> : canOpen ? <span className="cac-go cac-admin">Open ↗</span> : <span className="cac-note">Button</span>}
                    </Tag>
                  );
                })}
              </div>
            );
          })()}

          {/* Timestamp & Edited Indicator & Seen Checkmarks */}
          <div className="chat-bubble-footer">
            <span className="chat-bubble-time">{fmtDate(msg.createdAt)}</span>
            {/* support's own corrections are not marked: only a seller's / customer's edit shows "(edited)" */}
            {msg.isEdited && !msg.isDeleted && !['admin', 'staff'].includes(msg.sender) && (
              <span className="chat-bubble-edited-tag" style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', marginLeft: 4 }}>
                (edited)
              </span>
            )}
            {/* WhatsApp-style Double Check Tick Mark for Admin */}
            {myRole === 'admin' && isMe && !msg.isDeleted && (
              <span
                className={`chat-seen-ticks ${msg.isSeen ? 'seen-blue' : 'sent-grey'}`}
                title={msg.isSeen ? `Seen ${msg.seenAt ? `(${fmtDate(msg.seenAt)})` : ''}` : 'Sent / Delivered'}
                aria-label={msg.isSeen ? 'Seen' : 'Delivered'}
              >
                <svg viewBox="0 0 16 11" width="14" height="10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 5.5L4.5 9L11 1.5" />
                  <path d="M5 5.5L8.5 9L15 1.5" />
                </svg>
              </span>
            )}
          </div>
        </div>

        {!isMe && !msg.isDeleted && (
          <div className="chat-bubble-actions-hover">
            {onReply && (
              <button
                type="button"
                className="chat-hover-reply-btn"
                onClick={(e) => { e.stopPropagation(); onReply(msg); }}
                title="Reply"
              >
                <Ic name="cornerDownRight" size={13} />
              </button>
            )}
            {myRole === 'admin' && onEdit && (
              <button
                type="button"
                className="chat-hover-reply-btn"
                onClick={(e) => { e.stopPropagation(); onEdit(msg); }}
                title="Edit message"
              >
                <Ic name="edit" size={13} />
              </button>
            )}
            {myRole === 'admin' && onDelete && (
              <button
                type="button"
                className="chat-hover-reply-btn"
                onClick={(e) => { e.stopPropagation(); onDelete(msg); }}
                title="Delete message"
                style={{ color: '#dc2626' }}
              >
                <Ic name="trash" size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
