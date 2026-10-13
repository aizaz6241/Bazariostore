// Names and colours for lead statuses / sources, shared by every leads screen.
// Colours come from the portal chart palette (components/Charts.js), so a status looks the same
// in a pill, a filter chip and a chart.

export const STATUS = {
  new: { label: 'New', color: '#94a3b8' },
  contacted: { label: 'Contacted', color: '#2a78d6' },
  interested: { label: 'Interested', color: '#eda100' },
  converted: { label: 'Store registered', color: '#1baf7a' },
  not_converted: { label: 'Not converted', color: '#eb6834' },
};

export const STATUS_ORDER = ['new', 'contacted', 'interested', 'converted', 'not_converted'];

export const LOST_REASONS = {
  no_response: 'No response',
  not_interested: 'Not interested',
  fake: 'Fake / wrong number',
  other_platform: 'Went to another platform',
  other: 'Other reason',
};

export const SOURCES = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp group',
  google: 'Google / Maps',
  telegram: 'Telegram',
  referral: 'Referral',
  self: 'Found by member',
  other: 'Other',
};

export const sourceName = (s) => SOURCES[s] || (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Other');

/** "Given, not contacted yet" reads better than "New" for a lead that is with someone. */
export const statusLabel = (lead) => (lead.status === 'new' && lead.memberId ? 'Not contacted yet' : STATUS[lead.status]?.label || lead.status);

export const waLink = (phone) => {
  const d = String(phone || '').replace(/\D+/g, '');
  return d.length >= 7 ? `https://wa.me/${d}` : null;
};
