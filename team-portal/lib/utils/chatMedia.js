import { UTApi, UTFile } from 'uploadthing/server';

/**
 * CHAT PICTURES ON THE FILE STORAGE (UploadThing)
 *
 * A picture sent in the chat arrives from the browser already made small (JPEG, longest side
 * 1280px). When UPLOADTHING_TOKEN is set (the same token the store server uses), the picture is
 * saved on UploadThing and the message keeps only its link. Without the token, or if the storage
 * is having a bad moment, the picture stays inside the message as before, so sending a picture
 * never fails because of the storage.
 *
 * Voice notes are small and stay inside the message.
 */

const UPLOAD_TIMEOUT_MS = 12000;

let utapi = null;
function storage() {
  const token = (process.env.UPLOADTHING_TOKEN || '').trim();
  if (!token) return null;
  if (!utapi) utapi = new UTApi({ token });
  return utapi;
}

export const chatStorageOn = () => !!(process.env.UPLOADTHING_TOKEN || '').trim();

// What the bytes really are (never the name or type the browser claims)
function sniffImage(b) {
  if (!b || b.length < 12) return null;
  const ascii = (from, to) => b.subarray(from, to).toString('latin1');
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return { mime: 'image/png', ext: 'png' };
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return { mime: 'image/gif', ext: 'gif' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/**
 * Saves a chat picture (a `data:image/...;base64,...` text) on the file storage.
 * @returns {Promise<{ url: string, key: string } | null>} null = keep it inside the message
 */
export async function storeChatPicture(dataUrl) {
  const ut = storage();
  if (!ut || typeof dataUrl !== 'string') return null;
  const m = dataUrl.match(/^data:image\/[a-z0-9.+-]+(?:;[^;,]+)*;base64,/i);
  if (!m) return null;

  try {
    const bytes = Buffer.from(dataUrl.slice(m[0].length), 'base64');
    const kind = sniffImage(bytes);
    if (!kind) return null;

    const name = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${kind.ext}`;
    const file = new UTFile([bytes], name, { type: kind.mime });
    // never keep the sender waiting on a slow storage: after a while the picture goes the old way
    const [res] = await Promise.race([
      ut.uploadFiles([file]),
      new Promise((_, reject) => setTimeout(() => reject(new Error('storage took too long')), UPLOAD_TIMEOUT_MS)),
    ]);
    if (!res || res.error || !res.data) throw new Error(res?.error?.message || 'Upload failed');
    const url = res.data.ufsUrl || res.data.url;
    if (!url || !res.data.key) throw new Error('Upload gave no link');
    return { url, key: res.data.key };
  } catch (err) {
    console.error('[chat] picture could not be saved on the file storage (kept in the message):', err.message);
    return null;
  }
}

/** Frees the storage of deleted pictures. Never throws: deleting a message must still work. */
export async function deleteChatPictures(keys) {
  const list = [...new Set((keys || []).filter(Boolean))];
  const ut = storage();
  if (!ut || list.length === 0) return;
  for (let i = 0; i < list.length; i += 100) {
    try {
      await ut.deleteFiles(list.slice(i, i + 100));
    } catch (err) {
      console.error('[chat] could not delete pictures from the file storage:', err.message);
    }
  }
}
