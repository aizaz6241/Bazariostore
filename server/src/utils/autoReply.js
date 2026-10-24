/**
 * Support chat auto-reply — plain rules, no AI:
 *   mode      off | on | away          (chosen by the team)
 *   schedule  Away every night between two times (India time), even when the mode is Off or On
 *   holiday   a date range (India time) with its own message, above everything else
 * Stores and guests get different messages; {name} becomes the owner's / guest's name.
 * Empty saved messages mean "use the default".
 */
export const AUTO_REPLY_MAX = 1000;

// the text every install had before; it says "away from the desk", so it is treated as not written
const OLD_DEFAULT =
  'Assalam o Alaikum! 👋 Thanks for reaching out. We are currently away from the desk, but we have received your inquiry and our support team will respond to you shortly.';

export const AUTO_REPLY_DEFAULTS = {
  sellerOn: 'Assalam o Alaikum {name}! 👋 Thanks for your message. Our support team has received it and will reply here shortly.',
  sellerAway:
    'Assalam o Alaikum {name}! 🌙 Our support team is offline right now. We will reply here as soon as we are back. Your orders and wallet keep working as normal.',
  guestOn: 'Hello {name}! 👋 Thanks for contacting Bazario. Our team has received your message and will reply here shortly.',
  guestAway: 'Hello {name}! 🌙 Thanks for contacting Bazario. Our team is offline right now and will reply here as soon as we are back.',
  holiday: 'Assalam o Alaikum {name}! 🎉 Our team is off for the holiday. We will reply here as soon as we are back.',
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const text = (v) => String(v ?? '').trim();
const own = (v) => {
  const t = text(v);
  return t && t !== OLD_DEFAULT ? t : '';
};
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** the saved settings document → one clean object (defaults filled in) */
export function autoReplyConfig(d = {}) {
  return {
    mode: d.awayMode ? 'away' : d.autoReplyEnabled ? 'on' : 'off',
    messages: {
      sellerOn: own(d.autoReplyMessage) || AUTO_REPLY_DEFAULTS.sellerOn,
      sellerAway: own(d.awayMessage) || AUTO_REPLY_DEFAULTS.sellerAway,
      guestOn: own(d.guestMessage) || AUTO_REPLY_DEFAULTS.guestOn,
      guestAway: own(d.guestAwayMessage) || AUTO_REPLY_DEFAULTS.guestAway,
    },
    schedule: {
      enabled: Boolean(d.scheduleEnabled),
      from: TIME.test(d.scheduleFrom || '') ? d.scheduleFrom : '23:00',
      to: TIME.test(d.scheduleTo || '') ? d.scheduleTo : '10:00',
    },
    holiday: {
      enabled: Boolean(d.holidayEnabled),
      name: text(d.holidayName).slice(0, 60),
      start: DAY.test(d.holidayStart || '') ? d.holidayStart : '',
      end: DAY.test(d.holidayEnd || '') ? d.holidayEnd : '',
      message: own(d.holidayMessage) || AUTO_REPLY_DEFAULTS.holiday,
    },
  };
}

/** India time now: the day (YYYY-MM-DD) and the minute of the day */
function indiaNow(now = new Date()) {
  const t = new Date(now.getTime() + 5.5 * 3600 * 1000);
  return { day: t.toISOString().slice(0, 10), min: t.getUTCHours() * 60 + t.getUTCMinutes() };
}

/** what the auto-reply does right now: off | on | away | night | holiday */
export function autoReplyNow(cfg, now = new Date()) {
  const { day, min } = indiaNow(now);
  const h = cfg.holiday;
  if (h.enabled && h.start && day >= h.start && day <= (h.end || h.start)) return { state: 'holiday', until: h.end || h.start };
  if (cfg.mode === 'away') return { state: 'away' };
  const s = cfg.schedule;
  if (s.enabled && s.from !== s.to) {
    const a = toMin(s.from);
    const b = toMin(s.to);
    const inside = a < b ? min >= a && min < b : min >= a || min < b;
    if (inside) return { state: 'night', until: s.to };
  }
  if (cfg.mode === 'on') return { state: 'on' };
  return { state: 'off' };
}

/** put the name in; with no name, "Hello {name}!" becomes "Hello!" */
export function fillName(t, name) {
  return String(t || '')
    .replace(/\{name\}/gi, text(name).slice(0, 60))
    .replace(/[ \t]+([!,.?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** the message for this state and audience ('seller' | 'guest'), name filled in */
export function autoReplyText(cfg, state, audience, name) {
  const m = cfg.messages;
  let t;
  if (state === 'holiday') t = cfg.holiday.message;
  else if (state === 'away' || state === 'night') t = audience === 'guest' ? m.guestAway : m.sellerAway;
  else t = audience === 'guest' ? m.guestOn : m.sellerOn;
  return fillName(t, name);
}

/**
 * Check a request body from the admin screen and turn it into document fields.
 * Returns { fields } or { error }.
 */
export function autoReplyFields(body = {}) {
  const fields = {};
  if (body.mode !== undefined) {
    if (!['off', 'on', 'away'].includes(body.mode)) return { error: 'Choose Off, On or Away.' };
    fields.autoReplyEnabled = body.mode === 'on';
    fields.awayMode = body.mode === 'away';
  }
  const msgMap = { sellerOn: 'autoReplyMessage', sellerAway: 'awayMessage', guestOn: 'guestMessage', guestAway: 'guestAwayMessage' };
  if (body.messages && typeof body.messages === 'object') {
    for (const [k, field] of Object.entries(msgMap)) {
      if (body.messages[k] === undefined) continue;
      const t = text(body.messages[k]);
      if (t.length > AUTO_REPLY_MAX) return { error: `A message can be at most ${AUTO_REPLY_MAX} characters.` };
      fields[field] = t === AUTO_REPLY_DEFAULTS[k] ? '' : t; // the default is not stored, so it can improve later
    }
  }
  if (body.schedule && typeof body.schedule === 'object') {
    const { enabled, from, to } = body.schedule;
    if (enabled) {
      if (!TIME.test(from || '') || !TIME.test(to || '')) return { error: 'Set both night times.' };
      if (from === to) return { error: 'The night start and end time cannot be the same.' };
    }
    fields.scheduleEnabled = Boolean(enabled);
    if (TIME.test(from || '')) fields.scheduleFrom = from;
    if (TIME.test(to || '')) fields.scheduleTo = to;
  }
  if (body.holiday && typeof body.holiday === 'object') {
    const h = body.holiday;
    const start = DAY.test(h.start || '') ? h.start : '';
    const end = DAY.test(h.end || '') ? h.end : '';
    if (h.enabled && !start) return { error: 'Set the first day of the holiday.' };
    if (start && end && end < start) return { error: 'The last holiday day cannot be before the first day.' };
    const msg = text(h.message);
    if (msg.length > AUTO_REPLY_MAX) return { error: `A message can be at most ${AUTO_REPLY_MAX} characters.` };
    Object.assign(fields, {
      holidayEnabled: Boolean(h.enabled),
      holidayName: text(h.name).slice(0, 60),
      holidayStart: start,
      holidayEnd: end || start,
      holidayMessage: msg === AUTO_REPLY_DEFAULTS.holiday ? '' : msg,
    });
  }
  return { fields };
}
