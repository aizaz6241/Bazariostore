import Notification from '../models/Notification.js';

export async function notify(app, { type = 'system', title, body = '', link = '' }) {
  try {
    const n = await Notification.create({ type, title, body, link });
    app.get('io')?.to('admins').emit('notify', n);
    return n;
  } catch (e) {
    console.error('notify failed:', e.message);
  }
}
