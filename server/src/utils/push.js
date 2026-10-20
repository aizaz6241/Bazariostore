import webpush from 'web-push';
import mongoose from 'mongoose';
import PushSub from '../models/PushSub.js';
import { permsFor } from './permissions.js';
import { isAdminActive } from './adminPresence.js';

// Phone / desktop push for the store app. Needs VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY in the env;
// without them push is simply switched off (nothing else breaks).
// (read lazily: index.js loads .env after the imports have run)
let ready = null;
function init() {
  if (ready !== null) return ready;
  const PUB = process.env.VAPID_PUBLIC_KEY || '';
  const PRIV = process.env.VAPID_PRIVATE_KEY || '';
  ready = false;
  if (PUB && PRIV) {
    try {
      webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@bazariostore.com', PUB, PRIV);
      ready = true;
    } catch (e) {
      console.error('web-push setup failed:', e.message);
    }
  }
  return ready;
}

export const vapidPublicKey = () => (init() ? process.env.VAPID_PUBLIC_KEY : '');

async function sendTo(subs, payload) {
  const body = JSON.stringify(payload);
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 60 * 60 * 24, urgency: 'high' });
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) await PushSub.deleteOne({ _id: s._id }).catch(() => {});
        else console.error('push send failed:', err.statusCode || '', err.message);
      }
    })
  );
}

/** Keep only the admin devices whose (active) account holds one of `perms`. */
async function allowedAdminSubs(subs, perms) {
  const ids = [...new Set(subs.map((s) => s.admin && String(s.admin)).filter((id) => id && mongoose.Types.ObjectId.isValid(id)))];
  const admins = ids.length
    ? await mongoose.connection
        .collection('admins')
        .find({ _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } }, { projection: { role: 1, permissions: 1, active: 1 } })
        .toArray()
    : [];
  const ok = new Set(admins.filter((a) => a.active !== false && permsFor(a).some((p) => perms.includes(p))).map((a) => String(a._id)));
  return subs.filter((s) => s.admin && ok.has(String(s.admin)));
}

/**
 * Push to every admin device, or to one seller's devices.
 * `perms` (admin only): send only to admins who hold one of these permissions.
 * `skipActiveAdmins` (admin only): leave out the devices of an admin who is using the panel
 * right now on some device (chat pushes, WhatsApp-style).
 * @param {{ to: 'admin'|'seller', sellerId?: any, title: string, body?: string, url?: string, tag?: string, perms?: string[]|null, skipActiveAdmins?: boolean }} p
 */
export async function sendPush({ to, sellerId = null, title, body = '', url = '/', tag = '', perms = null, skipActiveAdmins = false }) {
  if (!init()) return;
  try {
    const q = to === 'seller' ? { kind: 'seller', seller: sellerId } : { kind: 'admin' };
    if (to === 'seller' && !sellerId) return;
    let subs = await PushSub.find(q).lean();
    if (to === 'admin' && perms?.length) subs = await allowedAdminSubs(subs, perms);
    if (to === 'admin' && skipActiveAdmins) subs = subs.filter((s) => !(s.admin && isAdminActive(s.admin)));
    if (!subs.length) return;
    await sendTo(subs, { title, body, url, tag: tag || undefined, icon: '/icon-192.svg' });
  } catch (e) {
    console.error('sendPush error:', e.message);
  }
}
