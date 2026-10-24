import Notification from '../models/Notification.js';
import { sendPush } from './push.js';
import { adminRoom, notificationPerms } from './permissions.js';
import { emailEnabled, sendSellerNotificationEmail } from '../services/email.service.js';

// Also email the seller (only for the important events that pass `email: true`).
// Never blocks or breaks the notification: runs in the background, errors are only logged.
// Test accounts get no emails.
async function emailSeller(sellerId, { title, body, link }) {
  try {
    const { default: Seller } = await import('../models/Seller.js');
    const s = await Seller.findById(sellerId).select('email ownerName storeName isTestAccount accountType').lean();
    if (!s?.email || s.isTestAccount || s.accountType === 'test') return;
    await sendSellerNotificationEmail({ to: s.email, name: s.ownerName || s.storeName || 'Seller', title, body, link });
  } catch (e) {
    console.error('notify email failed:', e.message);
  }
}

// `push: false` = only the bell / screen notification (for messages that already sent their own push)
// `email: true`  = seller notifications only: also send the same text to the seller's email
export async function notify(app, { recipientType = 'admin', sellerId = null, type = 'system', title, body = '', link = '', push = true, email = false }) {
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
        // Only the admins whose role covers this kind of notification
        const perms = notificationPerms(type, link);
        io.to(perms ? perms.map(adminRoom) : 'admins').emit('notify', n);
      }
    }
    // Phone push as well (admin devices, or this seller's devices)
    if (push) sendPush({
      to: recipientType === 'seller' ? 'seller' : 'admin',
      sellerId,
      title: title || 'Bazario',
      body,
      url: link || (recipientType === 'seller' ? '/seller' : '/admin'),
      tag: `n-${n._id}`,
      perms: recipientType === 'seller' ? null : notificationPerms(type, link),
      // WhatsApp-style: nothing is pushed to an admin who is using the panel right now on some
      // device — the toast and sound show there already (chat, deposits, approvals, orders…)
      skipActiveAdmins: recipientType !== 'seller',
    });
    // Email copy for the seller (new order, approval, deposit/withdrawal result, warning, freeze …)
    if (email && emailEnabled && recipientType === 'seller' && sellerId) emailSeller(sellerId, { title, body, link });
    return n;
  } catch (e) {
    console.error('notify failed:', e.message);
  }
}
