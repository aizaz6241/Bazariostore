import mongoose from 'mongoose';

/**
 * One line in a person's notification list (the bell in the top bar).
 *
 * Every phone / desktop push that is sent also leaves a line here, so the person can see
 * afterwards what the alert was about and open exactly that screen.
 *
 * Chat messages do not make a new line each: one line per chat (`groupKey`) is kept up to date
 * ("Bilal · 3 new messages"), otherwise a busy group would bury everything else.
 */
const notificationSchema = new mongoose.Schema(
  {
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'PortalMember', required: true, index: true },
    type: { type: String, default: 'general' }, // 'chat' | 'finance' | 'general' | ...
    title: { type: String, default: '' },
    body: { type: String, default: '' },
    url: { type: String, default: '/dashboard' }, // where a tap takes the person
    groupKey: { type: String, default: '' }, // set for lines that are updated in place (one per chat)
    count: { type: Number, default: 1 }, // unread items behind a grouped line
    readAt: { type: Date, default: null },
    lastAt: { type: Date, default: Date.now }, // when it last happened (the list is sorted by this)
    expiresAt: { type: Date, default: null }, // removed by the database after this
  },
  { timestamps: true }
);

notificationSchema.index({ memberId: 1, lastAt: -1 });
notificationSchema.index({ memberId: 1, groupKey: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.PortalNotification || mongoose.model('PortalNotification', notificationSchema);
