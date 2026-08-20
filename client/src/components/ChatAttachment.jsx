import React, { useState } from 'react';
import Ic from './Icons.jsx';

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function ChatAttachment({ msg }) {
  const [modalOpen, setModalOpen] = useState(false);
  if (!msg.attachment) return null;

  const url = msg.attachment;
  const isPdf =
    msg.attachmentType === 'pdf' ||
    url.toLowerCase().endsWith('.pdf') ||
    url.toLowerCase().includes('.pdf?') ||
    (msg.attachmentName && msg.attachmentName.toLowerCase().endsWith('.pdf'));

  if (isPdf) {
    const filename = msg.attachmentName || url.split('/').pop().split('?')[0] || 'Document.pdf';
    return (
      <div className="chat-pdf-card">
        <div className="pdf-icon-wrap">
          <Ic name="fileText" size={26} stroke={1.8} />
          <span className="pdf-badge-label">PDF</span>
        </div>
        <div className="pdf-info-wrap">
          <div className="pdf-filename" title={filename}>{filename}</div>
          <div className="pdf-meta">
            {msg.attachmentSize ? <span>{formatBytes(msg.attachmentSize)} • </span> : null}
            <span>PDF Document</span>
          </div>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          download={filename}
          className="pdf-download-btn"
          title="Open or download PDF"
        >
          <Ic name="download" size={16} stroke={2} />
        </a>
      </div>
    );
  }

  // Image attachment
  return (
    <>
      <div className="chat-image-wrap">
        <img
          src={url}
          alt={msg.attachmentName || 'Image attachment'}
          className="chat-img-thumb"
          onClick={() => setModalOpen(true)}
          loading="lazy"
        />
        <div className="chat-img-overlay" onClick={() => setModalOpen(true)}>
          <Ic name="eye" size={16} /> <span>View Full</span>
        </div>
      </div>

      {/* Lightbox Modal */}
      {modalOpen && (
        <div className="image-lightbox-overlay" onClick={() => setModalOpen(false)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-top">
              <span className="lightbox-title">{msg.attachmentName || 'Image Preview'}</span>
              <div className="lightbox-actions">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="btn-icon"
                  title="Open original in new tab"
                >
                  <Ic name="download" size={18} />
                </a>
                <button className="btn-icon" onClick={() => setModalOpen(false)} title="Close">
                  <Ic name="x" size={20} />
                </button>
              </div>
            </div>
            <img src={url} alt="Full view" className="lightbox-img" />
          </div>
        </div>
      )}
    </>
  );
}
