import mongoose from 'mongoose';

/**
 * TEAM STAFF — "assigned stores only" admin accounts (Staff screen → Team member).
 *
 * A team portal member can be given an admin login (the SAME username / email and password as on
 * the team portal) that only sees the stores the Super Admin assigned to him. Security works
 * DENY BY DEFAULT:
 *   - such an account may only use the requests listed in SCOPED_ROUTES below; every other admin
 *     request is refused (403) before it reaches its route, so a new admin feature can never leak
 *     other stores by accident;
 *   - a request about ONE store / order / chat / message is checked here (the record is loaded and
 *     its store must be one of his);
 *   - a request that LISTS things (orders, counts, the store board, sellers, chats) is filtered by
 *     its route with scopeIds(req);
 *   - its permissions are cut to SCOPABLE_PERMISSIONS (no finance, no settings, no staff …);
 *   - live updates: its socket joins only its own room and the rooms of its stores.
 */
export const SCOPABLE_PERMISSIONS = ['orders', 'chat', 'sellers'];
export const MAX_SCOPE_SELLERS = 500;

const isId = (v) => !!v && /^[a-f0-9]{24}$/i.test(String(v));
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const idOf = (v) => {
  const x = v && typeof v === 'object' && v._id ? v._id : v;
  return x ? String(x) : '';
};

/** null = this admin sees every store; otherwise the list of store ids (strings). */
export const scopeOf = (req) => (Array.isArray(req?.admin?.scope) ? req.admin.scope : null);
/** The same as ObjectIds (for database filters), or null. */
export const scopeIds = (req) => {
  const s = scopeOf(req);
  return s ? s.filter(isId).map(oid) : null;
};
export const inScope = (req, sellerId) => {
  const s = scopeOf(req);
  if (!s) return true;
  const id = idOf(sellerId);
  return Boolean(id) && s.includes(id);
};
/** Orders that belong to one of these stores (single- or multi-store order). */
export const orderScopeMatch = (ids) => ({ $or: [{ seller: { $in: ids } }, { 'items.seller': { $in: ids } }] });

// ─── the record behind a request, and whether it belongs to one of his stores ───
const col = (name) => mongoose.connection.collection(name);

async function orderInScope(scope, id) {
  const o = await col('orders').findOne({ _id: oid(id) }, { projection: { seller: 1, 'items.seller': 1 } });
  if (!o) return false;
  const ids = [o.seller, ...(o.items || []).map((i) => i.seller)].map(idOf).filter(Boolean);
  return ids.some((x) => scope.includes(x));
}
async function conversationInScope(scope, id) {
  const c = await col('conversations').findOne({ _id: oid(id) }, { projection: { seller: 1, type: 1 } });
  return Boolean(c && c.type !== 'internal' && c.seller && scope.includes(idOf(c.seller)));
}
async function messageInScope(scope, id) {
  const m = await col('messages').findOne({ _id: oid(id) }, { projection: { seller: 1, conversation: 1 } });
  if (!m) return false;
  if (m.seller) return scope.includes(idOf(m.seller));
  return m.conversation ? conversationInScope(scope, m.conversation) : false;
}

const ID = '([a-f0-9]{24})';
const rx = (s) => new RegExp(`^${s}$`, 'i');
/**
 * What an assigned-stores account may do. m = methods, p = path (without /api), check = the kind of
 * record in the path that must belong to one of his stores, reply = answered here (no data).
 */
const SCOPED_ROUTES = [
  // his own session
  { m: ['GET'], p: rx('/auth/me') },
  // the bell and the menu badges are about every store: empty for him
  { m: ['GET'], p: rx('/notifications'), reply: { items: [], unread: 0 } },
  { m: ['POST'], p: rx(`/notifications/(read-all|${ID}/read)`), reply: { ok: true, unread: 0 } },
  { m: ['GET'], p: rx('/admin-hub/counts'), reply: { counts: {}, at: null } },
  // the store quick-view panel
  { m: ['GET'], p: rx(`/admin-hub/seller/${ID}`), check: 'seller' },
  // orders (lists are filtered by their routes)
  { m: ['GET'], p: rx('/orders') },
  { m: ['GET'], p: rx('/orders/counts') },
  { m: ['GET'], p: rx('/orders/analytics/stores') },
  { m: ['GET'], p: rx(`/orders/${ID}`), check: 'order' },
  { m: ['PATCH', 'PUT', 'POST'], p: rx(`/orders/${ID}/status`), check: 'order' },
  { m: ['PATCH'], p: rx(`/orders/${ID}/payment`), check: 'order' },
  // stores (read only)
  { m: ['GET'], p: rx('/sellers') },
  { m: ['GET'], p: rx('/sellers/nicknames') },
  { m: ['GET'], p: rx(`/sellers/${ID}`), check: 'seller' },
  { m: ['GET'], p: rx(`/sellers/${ID}/health/ledger`), check: 'seller' },
  // support chat with his stores (no guest chats, no team chat, no broadcasts)
  { m: ['GET'], p: rx('/chat/admin/conversations') },
  { m: ['GET'], p: rx(`/chat/admin/conversations/${ID}/(messages|seller-info|shortcuts)`), check: 'conversation' },
  { m: ['POST'], p: rx(`/chat/admin/conversations/${ID}/(reply|read|status)`), check: 'conversation' },
  { m: ['PUT', 'DELETE'], p: rx(`/chat/messages/${ID}`), check: 'message' },
  { m: ['GET'], p: rx('/chat/admin/shortcut-pages') },
  { m: ['GET'], p: rx('/chat/admin/quick-replies') },
  { m: ['GET'], p: rx('/chat/settings/auto-reply') },
  { m: ['GET'], p: rx('/chat/admin/team'), reply: [] },
  // a picture / file for a chat message
  { m: ['POST'], p: rx('/uploads') },
];

/** The request path without /api, lower case, no trailing slash. */
export function requestPath(req) {
  return (`${req.baseUrl || ''}${req.path || ''}`.toLowerCase().replace(/\/+$/, '') || '/').replace(/^\/api(?=\/)/, '');
}

/**
 * May this assigned-stores admin make this request? Returns
 *   { ok: true }                      go on to the route
 *   { ok: true, reply }               answer `reply` here (nothing of other stores is read)
 *   { ok: false, status, message }    refuse
 */
export async function scopedRequestCheck(req) {
  const scope = scopeOf(req) || [];
  const path = requestPath(req);
  const method = String(req.method || 'GET').toUpperCase();
  const rule = SCOPED_ROUTES.find((r) => (r.m.includes(method) || (method === 'HEAD' && r.m.includes('GET'))) && r.p.test(path));
  if (!rule) return { ok: false, status: 403, message: 'Your account can only work with the stores assigned to you.' };
  if (rule.reply !== undefined) return { ok: true, reply: rule.reply };
  if (rule.check) {
    const id = path.match(rule.p)?.[1];
    if (!isId(id)) return { ok: false, status: 404, message: 'Not found' };
    let ok = false;
    if (rule.check === 'seller') ok = scope.includes(id);
    else if (rule.check === 'order') ok = await orderInScope(scope, id);
    else if (rule.check === 'conversation') ok = await conversationInScope(scope, id);
    else if (rule.check === 'message') ok = await messageInScope(scope, id);
    // "not found", so nobody can find out which ids exist outside his stores
    if (!ok) return { ok: false, status: 404, message: 'Not found' };
  }
  return { ok: true };
}
