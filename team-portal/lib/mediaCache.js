// Pictures and voice notes of the chat, kept on this device (IndexedDB) so a chat that was
// opened before shows its media at once instead of downloading it again. Nothing here is a
// source of truth, and every call is safe to fail (private window, storage full or blocked).

const DB_NAME = 'bzp_media';
const STORE = 'media';
const MAX_ITEMS = 400;

let dbPromise = null;

function openDb() {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('at', 'at');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
  return dbPromise;
}

/** @returns {Promise<Record<string, string>>} the media we have for these message ids */
export async function getSavedMedia(ids) {
  const out = {};
  const db = await openDb();
  if (!db || !ids || ids.length === 0) return out;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      ids.forEach((id) => {
        const req = store.get(id);
        req.onsuccess = () => {
          if (req.result?.data) out[id] = req.result.data;
        };
      });
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => resolve(out);
      tx.onabort = () => resolve(out);
    } catch (e) {
      resolve(out);
    }
  });
}

export async function saveMedia(id, data) {
  if (!id || !data || String(id).startsWith('tmp_')) return;
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.put({ id, data, at: Date.now() });
    // keep the newest MAX_ITEMS
    const countReq = store.count();
    countReq.onsuccess = () => {
      let extra = countReq.result - MAX_ITEMS;
      if (extra <= 0) return;
      const cursorReq = store.index('at').openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || extra <= 0) return;
        cursor.delete();
        extra -= 1;
        cursor.continue();
      };
    };
  } catch (e) {}
}

export async function dropSavedMedia(id) {
  const db = await openDb();
  if (!db || !id) return;
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
  } catch (e) {}
}

// Logout: nothing of the previous account stays on the device
export async function clearSavedMedia() {
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
  } catch (e) {}
}
