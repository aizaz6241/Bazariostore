// Small "show the last known data at once, refresh in the background" helper for the browser.
// Values live in memory (instant when moving between tabs) and in localStorage (instant when the
// app is opened again). Nothing here is a source of truth: every screen still reloads from the server.

const memory = new Map();
const PREFIX = 'bzp_';

export function readCache(key) {
  if (memory.has(key)) return memory.get(key);
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    memory.set(key, value);
    return value;
  } catch (err) {
    return null;
  }
}

// `persist` is what goes to localStorage (defaults to the value itself). Pass a lighter copy for
// big values, or `false` to keep the value in memory only.
export function writeCache(key, value, persist) {
  memory.set(key, value);
  if (typeof window === 'undefined' || persist === false) return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(persist === undefined ? value : persist));
  } catch (err) {
    // storage full or blocked: the in-memory copy is still there
    try {
      window.localStorage.removeItem(PREFIX + key);
    } catch (e) {}
  }
}

export function dropCache(key) {
  memory.delete(key);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch (err) {}
}

// Used on logout: nothing of the previous account may be shown to the next one.
export function clearAllCache() {
  memory.clear();
  if (typeof window === 'undefined') return;
  try {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch (err) {}
}
