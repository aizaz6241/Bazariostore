import React, { useState } from 'react';
import Ic from './Icons.jsx';
import { resolveMediaUrl, downloadAttachment } from '../api.js';

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function ChatAttachment({ msg }) {
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [imgError, setImgError] = useState(false);

  if (!msg.attachment) return null;

  const rawUrl = msg.attachment;
  const fullUrl = resolveMediaUrl(rawUrl);

  const isPdf =
    msg.attachmentType === 'pdf' ||
    rawUrl.toLowerCase().endsWith('.pdf') ||
    rawUrl.toLowerCase().includes('.pdf?') ||
    (msg.attachmentName && msg.attachmentName.toLowerCase().endsWith('.pdf'));

  const filename = msg.attachmentName || rawUrl.split('/').pop().split('?')[0] || (isPdf ? 'Document.pdf' : 'Attachment.png');

  const handleDownload = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDownloading(true);
    try {
      await downloadAttachment(fullUrl, filename);
    } catch (err) {
      window.open(fullUrl, '_blank');
    } finally {
      setDownloading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 1. PDF ATTACHMENT CARD & IN-CHAT VIEWER
  // ─────────────────────────────────────────────────────────────
  if (isPdf) {
    return (
      <>
        <div className="chat-pdf-card" onClick={() => setPdfModalOpen(true)}>
          <div className="pdf-icon-wrap">
            <Ic name="fileText" size={26} stroke={1.8} />
            <span className="pdf-badge-label">PDF</span>
          </div>

          <div className="pdf-info-wrap">
            <div className="pdf-filename" title={filename}>{filename}</div>
            <div className="pdf-meta">
              {msg.attachmentSize ? <span>{formatBytes(msg.attachmentSize)} &bull; </span> : null}
              <span>PDF Document</span>
            </div>
          </div>

          <div className="pdf-card-actions" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="pdf-action-btn btn-view-pdf"
              onClick={() => setPdfModalOpen(true)}
              title="Preview PDF inside chat"
            >
              <Ic name="eye" size={15} /> <span>View</span>
            </button>

            <button
              type="button"
              className="pdf-action-btn btn-download-pdf"
              onClick={handleDownload}
              title="Download PDF to device"
              disabled={downloading}
            >
              <Ic name="download" size={15} /> <span>{downloading ? '...' : 'Download'}</span>
            </button>
          </div>
        </div>

        {/* In-Chat PDF Viewer Modal */}
        {pdfModalOpen && (
          <div className="chat-modal-overlay" onClick={() => setPdfModalOpen(false)}>
            <div className="pdf-viewer-modal" onClick={(e) => e.stopPropagation()}>
              <div className="pdf-modal-header">
                <div className="pdf-modal-title">
                  <span className="pdf-badge">PDF</span>
                  <span className="pdf-modal-name" title={filename}>{filename}</span>
                  {msg.attachmentSize ? <span className="pdf-modal-size">({formatBytes(msg.attachmentSize)})</span> : null}
                </div>

                <div className="pdf-modal-actions">
                  <button
                    type="button"
                    className="pdf-modal-btn btn-download"
                    onClick={handleDownload}
                    disabled={downloading}
                  >
                    <Ic name="download" size={15} />
                    <span>{downloading ? 'Downloading...' : 'Download PDF'}</span>
                  </button>

                  <a
                    href={fullUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pdf-modal-btn btn-new-tab"
                    title="Open in new browser tab"
                  >
                    <Ic name="externalLink" size={15} />
                    <span>New Tab</span>
                  </a>

                  <button
                    type="button"
                    className="pdf-modal-btn btn-close"
                    onClick={() => setPdfModalOpen(false)}
                    title="Close preview"
                  >
                    <Ic name="x" size={18} />
                  </button>
                </div>
              </div>

              <div className="pdf-modal-body">
                <iframe
                  src={`${fullUrl}#toolbar=1&navpanes=0`}
                  title={filename}
                  className="pdf-iframe"
                />
              </div>

              <div className="pdf-modal-footer">
                <span>💡 Having trouble viewing? You can also <a href={fullUrl} target="_blank" rel="noopener noreferrer">open in a new tab</a> or click Download.</span>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 2. IMAGE ATTACHMENT CARD & LIGHTBOX
  // ─────────────────────────────────────────────────────────────
  return (
    <>
      <div className="chat-image-wrap">
        {!imgError ? (
          <img
            src={fullUrl}
            alt={filename}
            className="chat-img-thumb"
            onClick={() => setImageModalOpen(true)}
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="chat-img-fallback" onClick={() => setImageModalOpen(true)}>
            <Ic name="image" size={24} />
            <span>{filename}</span>
          </div>
        )}
        <div className="chat-img-overlay" onClick={() => setImageModalOpen(true)}>
          <Ic name="eye" size={16} /> <span>View Full</span>
        </div>
      </div>

      {/* Lightbox Modal */}
      {imageModalOpen && (
        <div className="image-lightbox-overlay" onClick={() => setImageModalOpen(false)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-top">
              <span className="lightbox-title">{filename}</span>
              <div className="lightbox-actions">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="btn-icon"
                  title="Download image"
                  disabled={downloading}
                >
                  <Ic name="download" size={18} />
                </button>
                <a
                  href={fullUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-icon"
                  title="Open original in new tab"
                >
                  <Ic name="externalLink" size={17} />
                </a>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setImageModalOpen(false)}
                  title="Close"
                >
                  <Ic name="x" size={20} />
                </button>
              </div>
            </div>
            <div className="lightbox-body">
              <img src={fullUrl} alt={filename} className="lightbox-img" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
