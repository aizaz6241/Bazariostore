import { adminRoom } from './permissions.js';

/**
 * Live "something changed" signals for screens that show lists (applications, complaints,
 * refunds, payout limit requests, a seller's products). They carry only ids: the screen reloads
 * its own data, with its own permissions, so no record is ever pushed to someone who may not
 * see it.
 */
let io = null;
export const setRealtimeIo = (server) => {
  io = server;
};

/** To every admin whose permissions include `permission` (they are in that room). */
export function toAdmins(permission, event, payload = {}) {
  try {
    io?.to(adminRoom(permission)).emit(event, payload);
  } catch (e) {
    console.error(`[realtime] ${event}:`, e.message);
  }
}

/** To these sellers' own rooms. */
export function toSellers(sellerIds, event, payload = {}) {
  try {
    for (const id of new Set((sellerIds || []).map(String).filter(Boolean))) io?.to(`seller:${id}`).emit(event, payload);
  } catch (e) {
    console.error(`[realtime] ${event}:`, e.message);
  }
}

/**
 * Route middleware: when the request ends successfully (2xx), tell the admins with `permission`
 * that `event` happened. `extra(req)` adds ids to the signal.
 */
export function announceToAdmins(permission, event, extra = (req) => ({ sellerId: req.params?.id || '' })) {
  return (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) toAdmins(permission, event, extra(req));
    });
    next();
  };
}
