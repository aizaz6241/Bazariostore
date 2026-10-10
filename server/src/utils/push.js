import webpush from 'web-push';
import PushSub from '../models/PushSub.js';

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

/**
 * Push to every admin device, or to one seller's devices.
 * @param {{ to: 'admin'|'seller', sellerId?: any, title: string, body?: string, url?: string, tag?: string }} p
 */
export async function sendPush({ to, sellerId = null, title, body = '', url = '/', tag = '' }) {
  if (!init()) return;
  try {
    const q = to === 'seller' ? { kind: 'seller', seller: sellerId } : { kind: 'admin' };
    if (to === 'seller' && !sellerId) return;
    const subs = await PushSub.find(q).lean();
    if (!subs.length) return;
    await sendTo(subs, { title, body, url, tag: tag || undefined, icon: '/icon-192.svg' });
  } catch (e) {
    console.error('sendPush error:', e.message);
  }
}
