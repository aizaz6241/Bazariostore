import Notification from '../models/Notification.js';
import { sendPush } from './push.js';

export async function notify(app, { recipientType = 'admin', sellerId = null, type = 'system', title, body = '', link = '' }) {
  try {
    const n = await Notification.create({
      recipientType,
      seller: sellerId || null,
      type,
      title,
      body,
      link,
    });

    const io = app.get('io');
    if (io) {
      if (recipientType === 'seller' && sellerId) {
        // Send to specific seller room
        io.to(`seller:${sellerId}`).emit('notify', n);
        io.to(`seller:${sellerId}`).emit('wallet:update', { type, title, body, link, notification: n });
      } else {
        // Send to all admin/staff listeners
        io.to('admins').emit('notify', n);
      }
    }
    // Phone push as well (admin devices, or this seller's devices)
    sendPush({
      to: recipientType === 'seller' ? 'seller' : 'admin',
      sellerId,
      title: title || 'Bazario',
      body,
      url: link || (recipientType === 'seller' ? '/seller' : '/admin'),
      tag: `n-${n._id}`,
    });
    return n;
  } catch (e) {
    console.error('notify failed:', e.message);
  }
}
