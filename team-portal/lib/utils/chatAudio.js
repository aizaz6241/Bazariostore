import mongoose from 'mongoose';
import ChatUpload from '@/lib/models/ChatUpload';
import { chatStorageOn, storeChatFile } from '@/lib/utils/chatMedia';

/**
 * LONG VOICE NOTES.
 *
 * A short voice note travels inside its message, as always. A long one cannot (the hosting
 * refuses a request above a few MB), so the browser sends it in pieces:
 *   1. saveVoicePiece()    one piece per request
 *   2. finishVoiceUpload() when the message is sent: checks the pieces and decides where the
 *                          recording lives — on the file storage when possible, otherwise it
 *                          stays in the database and is played piece by piece
 *   3. readVoiceRange()    playing a recording kept in the database
 */

export const PIECE_BYTES = 2 * 1024 * 1024; // the browser cuts the recording at exactly this size
export const MAX_PDF_BYTES = 25 * 1024 * 1024; // documents (PDF) sent in the chat
export const MAX_VOICE_BYTES = 300 * 1024 * 1024; // about 20 hours at the recording quality used
const MAX_PIECES = Math.ceil(MAX_VOICE_BYTES / PIECE_BYTES);
const TO_STORAGE_MAX_BYTES = 40 * 1024 * 1024; // above this the recording stays in the database
const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;

export const validUploadId = (id) => typeof id === 'string' && /^[a-f0-9]{24,64}$/.test(id);

// A PDF starts with "%PDF-" (a few bytes of junk before it are allowed by the PDF rules)
export function sniffPdf(b) {
  if (!b || b.length < 8) return null;
  const head = b.subarray(0, 1024).toString('latin1');
  return head.includes('%PDF-') ? { mime: 'application/pdf', ext: 'pdf' } : null;
}

const KINDS = {
  voice: { sniff: (b) => sniffAudio(b), max: MAX_VOICE_BYTES, what: 'voice recording', tooBig: 'This voice note is too long to send' },
  pdf: { sniff: (b) => sniffPdf(b), max: MAX_PDF_BYTES, what: 'PDF file', tooBig: 'This PDF is larger than 25 MB' },
};
const kindOf = (k) => KINDS[k] || KINDS.voice;

// What the bytes really are (never the type the browser claims)
export function sniffAudio(b) {
  if (!b || b.length < 12) return null;
  const ascii = (from, to) => b.subarray(from, to).toString('latin1');
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { mime: 'audio/webm', ext: 'webm' };
  if (ascii(4, 8) === 'ftyp') return { mime: 'audio/mp4', ext: 'm4a' };
  if (ascii(0, 4) === 'OggS') return { mime: 'audio/ogg', ext: 'ogg' };
  return null;
}

const asBuffer = (v) => (Buffer.isBuffer(v) ? v : v?.buffer ? Buffer.from(v.buffer) : Buffer.from(v || []));

/** One piece of a recording that is being sent. Sending the same piece again replaces it. */
export async function saveVoicePiece({ userId, uploadId, index, bytes, kind = 'voice' }) {
  const K = kindOf(kind);
  if (!validUploadId(uploadId)) throw new Error('Upload not recognised');
  if (!Number.isInteger(index) || index < 0 || index >= Math.ceil(K.max / PIECE_BYTES)) throw new Error(K.tooBig);
  if (!bytes || bytes.length === 0) throw new Error('Empty piece');
  if (bytes.length > PIECE_BYTES) throw new Error('Piece is too large');
  if (index === 0 && !K.sniff(bytes)) throw new Error(`This is not a ${K.what}`);

  // an upload id belongs to whoever started it, and to one kind of file
  const other = await ChatUpload.findOne({ uploadId, $or: [{ userId: { $ne: userId } }, { kind: { $nin: kind === 'voice' ? ['voice', null] : [kind] } }] }).select('_id').lean();
  if (other) throw new Error('Upload not recognised');

  if (index === 0) {
    // recordings that were started and never sent: tidy up now and then
    ChatUpload.deleteMany({ messageId: null, createdAt: { $lt: new Date(Date.now() - ABANDONED_AFTER_MS) } }).catch(() => {});
  }

  await ChatUpload.updateOne(
    { uploadId, index },
    { $set: { userId, size: bytes.length, data: bytes, messageId: null, kind } },
    { upsert: true }
  );
}

/**
 * All pieces have arrived and the message is about to be created.
 * @returns {{ size, mime, mediaLink, mediaKey, attach(messageId), discard() }}
 */
export async function finishVoiceUpload({ userId, uploadId, kind = 'voice', fileName = '' }) {
  const K = kindOf(kind);
  const label = kind === 'pdf' ? 'file' : 'voice note';
  if (!validUploadId(uploadId)) throw new Error('Upload not recognised');
  const pieces = await ChatUpload.find({ uploadId, userId, messageId: null, ...(kind === 'voice' ? { kind: { $in: ['voice', null] } } : { kind }) })
    .select('index size')
    .sort({ index: 1 })
    .lean();
  if (pieces.length === 0) throw new Error(`The ${label} did not arrive. Please send it again.`);

  let size = 0;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    const last = i === pieces.length - 1;
    if (p.index !== i || (!last && p.size !== PIECE_BYTES) || !(p.size > 0)) {
      throw new Error(`A part of the ${label} is missing. Please send it again.`);
    }
    size += p.size;
  }
  if (size > K.max) throw new Error(K.tooBig);

  const first = await ChatUpload.findOne({ uploadId, index: 0 }).select('data').lean();
  const type = K.sniff(asBuffer(first?.data));
  if (!type) throw new Error(`This is not a ${K.what}`);

  // On the file storage when possible: the database stays small
  let stored = null;
  if (chatStorageOn() && size <= TO_STORAGE_MAX_BYTES) {
    try {
      const all = await ChatUpload.find({ uploadId, userId }).select('data').sort({ index: 1 }).lean();
      const bytes = Buffer.concat(all.map((p) => asBuffer(p.data)));
      const base = kind === 'pdf' ? safeFileBase(fileName) || 'document' : 'voice';
      stored = await storeChatFile(bytes, `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${type.ext}`, type.mime, 40000);
    } catch (e) {
      console.error(`[chat] ${label} stays in the database:`, e.message);
      stored = null;
    }
  }

  return {
    size,
    mime: type.mime,
    mediaLink: stored ? stored.url : '',
    mediaKey: stored ? stored.key : '',
    // call once the message exists
    async attach(messageId) {
      if (stored) await ChatUpload.deleteMany({ uploadId, userId });
      else await ChatUpload.updateMany({ uploadId, userId }, { $set: { messageId } });
    },
  };
}

/** A file name made safe to show and to store: no folders, no odd characters, ends in .pdf */
export function safeFileBase(name) {
  return String(name || '')
    .split(/[\\/]/)
    .pop()
    .replace(/\.pdf$/i, '')
    .replace(/[^\p{L}\p{N} ._()-]+/gu, '')
    .trim()
    .slice(0, 100);
}
export const safePdfName = (name) => `${safeFileBase(name) || 'document'}.pdf`;

/** The link of a document kept in the database (the browser downloads it piece by piece) */
export const fileLinkOf = (messageId) => `/api/chat/file/${String(messageId)}`;

/** The link under which a recording kept in the database is played */
export const voiceLinkOf = (messageId) => `/api/chat/audio/${String(messageId)}`;

/**
 * A slice of a recording kept in the database: the bytes from `start`, up to the end of the
 * piece they are in (or `end`, when that comes first). The player asks for the next slice itself.
 */
export async function readVoiceRange(messageId, start, end) {
  const index = Math.floor(start / PIECE_BYTES);
  const piece = await ChatUpload.findOne({ messageId, index }).select('data').lean();
  if (!piece) return null;
  const data = asBuffer(piece.data);
  const from = start - index * PIECE_BYTES;
  if (from >= data.length) return null;
  const to = Math.min(data.length, end - index * PIECE_BYTES + 1);
  return data.subarray(from, to);
}

export async function readVoicePiece(messageId, index) {
  const piece = await ChatUpload.findOne({ messageId, index }).select('data').lean();
  return piece ? asBuffer(piece.data) : null;
}

/** The messages were deleted: their recordings leave the database too. Never throws. */
export async function deleteVoiceOf(messageIds) {
  const ids = (messageIds || []).filter((id) => id && mongoose.Types.ObjectId.isValid(String(id)));
  if (ids.length === 0) return;
  try {
    await ChatUpload.deleteMany({ messageId: { $in: ids } });
  } catch (e) {
    console.error('[chat] could not delete voice note pieces:', e.message);
  }
}
