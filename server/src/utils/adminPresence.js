/**
 * Which admin is using the admin panel right now (on any device), WhatsApp-style: while an admin
 * is active on one device (panel on screen, used in the last couple of minutes), chat pushes are
 * not sent to that admin's other devices. The browser reports activity over its socket every
 * ~20 seconds; nothing is stored in the database (one server, in memory).
 */
const lastActive = new Map(); // adminId -> time of the last "I am here" signal
const ACTIVE_MS = 60 * 1000;

export function markAdminActive(adminId) {
  if (adminId) lastActive.set(String(adminId), Date.now());
}
export function markAdminIdle(adminId) {
  if (adminId) lastActive.delete(String(adminId));
}
export function isAdminActive(adminId) {
  const t = lastActive.get(String(adminId || ''));
  return Boolean(t && Date.now() - t < ACTIVE_MS);
}
