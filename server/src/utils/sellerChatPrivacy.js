/**
 * Stores never see which admin wrote to them: every support / platform message reaches a store
 * as "Bazario Support". The real admin name stays in the database and in the admin panel.
 * Used for everything a store's screen receives (thread loads and live socket messages).
 */
export const SUPPORT_NAME = 'Bazario Support';
const FROM_TEAM = ['admin', 'staff'];

const plain = (m) => (m && typeof m.toObject === 'function' ? m.toObject() : { ...(m || {}) });

export function sellerSafeMessage(msg) {
  if (!msg) return msg;
  const m = plain(msg);
  if (FROM_TEAM.includes(m.sender)) m.senderName = m.isAutoReply ? `${SUPPORT_NAME} (auto-reply)` : SUPPORT_NAME;
  if (m.replyTo && FROM_TEAM.includes(m.replyTo.sender)) m.replyTo = { ...m.replyTo, senderName: SUPPORT_NAME };
  delete m.seenByAdmin;
  delete m.adminId;
  return m;
}

export function sellerSafeConversation(conv) {
  if (!conv) return conv;
  const c = plain(conv);
  delete c.assignedStaff;
  delete c.assignedStaffName;
  delete c.internalNote;
  delete c.notes;
  return c;
}
