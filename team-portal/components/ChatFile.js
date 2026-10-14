'use client';

import React, { useState } from 'react';
import { FileText, Download, Loader2, ExternalLink } from 'lucide-react';

export const PDF_MAX_BYTES = 25 * 1024 * 1024; // must match MAX_PDF_BYTES in lib/utils/chatAudio.js

export const isPdfFile = (file) => !!file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''));

export function fileSizeText(bytes) {
  const b = Number(bytes) || 0;
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(b >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${b} B`;
}

/**
 * A PDF kept in the database (only when the file storage was not available) is fetched piece by
 * piece and saved on the device. A PDF on the file storage is a normal link.
 */
async function saveFromDatabase(link, name) {
  const token = localStorage.getItem('portal_token');
  const headers = { Authorization: `Bearer ${token}` };
  const meta = await fetch(link, { headers, cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('File not available'))));
  const parts = [];
  for (let i = 0; i < meta.pieces; i++) {
    const r = await fetch(`${link}?piece=${i}`, { headers, cache: 'no-store' });
    if (!r.ok) throw new Error('File not available');
    parts.push(await r.blob());
  }
  const url = URL.createObjectURL(new Blob(parts, { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name || meta.name || 'document.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** A document in a chat bubble: name, size, open / download. */
export default function ChatFile({ msg, isMe }) {
  const [busy, setBusy] = useState(false);
  const name = msg.fileName || 'document.pdf';
  const link = msg.mediaUrl || msg.mediaLink || '';
  const fromDb = /^\/api\/chat\/file\//.test(link);
  const ready = !!link && !msg.failed;

  const open = async (e) => {
    if (!fromDb) return; // a normal link: the browser opens it
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await saveFromDatabase(link, name);
    } catch (err) {
      alert(err.message || 'Could not open the file');
    } finally {
      setBusy(false);
    }
  };

  const box = `flex items-center gap-3 rounded-2xl px-3 py-2.5 min-w-[200px] max-w-[280px] ${
    isMe ? 'bg-emerald-700/40' : 'bg-slate-50 border border-slate-200'
  }`;
  const inner = (
    <>
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isMe ? 'bg-white/15 text-white' : 'bg-red-50 text-red-600'}`}>
        <FileText className="w-5 h-5" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-xs font-semibold truncate" title={name}>
          {name}
        </span>
        <span className={`block text-[10px] mt-0.5 ${isMe ? 'text-emerald-100' : 'text-slate-500'}`}>
          PDF · {fileSizeText(msg.mediaSize)}
          {msg.pending && !msg.failed ? ` · sending${msg.progress != null ? ` ${msg.progress}%` : '…'}` : ''}
        </span>
      </span>
      {ready && (
        <span className={`shrink-0 ${isMe ? 'text-white' : 'text-slate-500'}`} aria-hidden="true">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : fromDb ? <Download className="w-4 h-4" /> : <ExternalLink className="w-4 h-4" />}
        </span>
      )}
    </>
  );

  return (
    <div className="space-y-1.5">
      {ready ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={open}
          className={`${box} hover:opacity-90 transition`}
          title={fromDb ? 'Download' : 'Open'}
        >
          {inner}
        </a>
      ) : (
        <div className={box}>{inner}</div>
      )}
      {msg.text && <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed break-words">{msg.text}</p>}
    </div>
  );
}
