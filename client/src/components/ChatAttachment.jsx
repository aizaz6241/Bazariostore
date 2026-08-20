import React, { useState } from 'react';
import Ic from './Icons.jsx';
import { resolveMediaUrl, downloadAttachment } from '../api.js';

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function ChatAttachment({ msg, url: directUrl, type: directType, name: directName, size: directSize }) {
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [imgError, setImgError] = useState(false);

  const rawUrl =
    directUrl ||
    msg?.attachment ||
    (typeof msg?.text === 'string' &&
    (msg.text.startsWith('http') || msg.text.startsWith('/uploads/') || msg.text.startsWith('uploads/') || msg.text.startsWith('img/') || msg.text.startsWith('/img/')) &&
    msg.text.match(/\.(jpeg|jpg|png|gif|webp|svg|pdf)(\?.*)?$/i)
      ? msg.text
      : null);

  if (!rawUrl) return null;

  const fullUrl = resolveMediaUrl(rawUrl);

  const isPdf =
    directType === 'pdf' ||
    msg?.attachmentType === 'pdf' ||
    rawUrl.toLowerCase().endsWith('.pdf') ||
    rawUrl.toLowerCase().includes('.pdf?') ||
    (msg?.attachmentName && msg.attachmentName.toLowerCase().endsWith('.pdf')) ||
    (directName && directName.toLowerCase().endsWith('.pdf'));

  const filename =
    directName ||
    msg?.attachmentName ||
    rawUrl.split('/').pop().split('?')[0] ||
    (isPdf ? 'Document.pdf' : 'Image.jpg');

  const fileSize = directSize || msg?.attachmentSize || 0;

  const handleDownload = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
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
              {fileSize ? <span>{formatBytes(fileSize)} &bull; </span> : null}
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
                  {fileSize ? <span className="pdf-modal-size">({formatBytes(fileSize)})</span> : null}
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
          <div className="chat-img-container" onClick={() => setImageModalOpen(true)}>
            <img
              src={fullUrl}
              alt={filename}
              className="chat-img-thumb"
              onError={() => setImgError(true)}
              loading="lazy"
            />
            <div className="chat-img-overlay">
              <div className="cio-btn"><Ic name="eye" size={15} /> <span>Zoom</span></div>
              <button
                type="button"
                className="cio-dl-btn"
                onClick={handleDownload}
                title="Download image"
              >
                <Ic name="download" size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div className="chat-img-fallback" onClick={() => setImageModalOpen(true)}>
            <Ic name="image" size={24} />
            <div className="cif-info">
              <span className="cif-name">{filename}</span>
              <small className="cif-hint">Click to open or download</small>
            </div>
            <button type="button" className="cif-dl" onClick={handleDownload} title="Download">
              <Ic name="download" size={15} />
            </button>
          </div>
        )}
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
