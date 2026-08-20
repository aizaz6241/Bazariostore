import Notification from '../models/Notification.js';

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
    return n;
  } catch (e) {
    console.error('notify failed:', e.message);
  }
}
