import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

/**
 * Support chat auto-reply settings, in plain words.
 *   Mode      Off / On / Away (chosen by the team)
 *   Night     Away every night between two times (India time), even when the mode is Off or On
 *   Holiday   dates with one message for everyone; above everything else
 * Stores and guests get their own messages; {name} becomes the owner's / guest's name.
 * The server: at most one auto-reply per chat every 30 minutes, and none while someone from the
 * team replied in that chat in the last 30 minutes.
 */
const MAX = 1000;

const FALLBACK_DEFAULTS = {
  sellerOn: 'Assalam o Alaikum {name}! 👋 Thanks for your message. Our support team has received it and will reply here shortly.',
  sellerAway: 'Assalam o Alaikum {name}! 🌙 Our support team is offline right now. We will reply here as soon as we are back. Your orders and wallet keep working as normal.',
  guestOn: 'Hello {name}! 👋 Thanks for contacting Bazario. Our team has received your message and will reply here shortly.',
  guestAway: 'Hello {name}! 🌙 Thanks for contacting Bazario. Our team is offline right now and will reply here as soon as we are back.',
  holiday: 'Assalam o Alaikum {name}! 🎉 Our team is off for the holiday. We will reply here as soon as we are back.',
};

const MODES = [
  { id: 'off', icon: '🔕', title: 'Off', text: 'Only the team replies.' },
  { id: 'on', icon: '⚡', title: 'On', text: 'Instant “we got your message”.' },
  { id: 'away', icon: '🌙', title: 'Away', text: 'Team is offline right now.' },
];

const SAMPLE = { seller: 'Ravi Kumar', guest: 'Priya' };

/* ── same rules as the server (utils/autoReply.js) ── */
const toMin = (t) => Number(String(t).slice(0, 2)) * 60 + Number(String(t).slice(3, 5));
function indiaNow(now = new Date()) {
  const t = new Date(now.getTime() + 5.5 * 3600 * 1000);
  return { day: t.toISOString().slice(0, 10), min: t.getUTCHours() * 60 + t.getUTCMinutes() };
}
export function autoReplyState(cfg, now = new Date()) {
  if (!cfg) return { state: 'off' };
  const { day, min } = indiaNow(now);
  const h = cfg.holiday || {};
  if (h.enabled && h.start && day >= h.start && day <= (h.end || h.start)) return { state: 'holiday', until: h.end || h.start };
  if (cfg.mode === 'away') return { state: 'away' };
  const s = cfg.schedule || {};
  if (s.enabled && s.from && s.to && s.from !== s.to) {
    const a = toMin(s.from);
    const b = toMin(s.to);
    if (a < b ? min >= a && min < b : min >= a || min < b) return { state: 'night', until: s.to };
  }
  return { state: cfg.mode === 'on' ? 'on' : 'off' };
}
export const fillName = (t, name) =>
  String(t || '')
    .replace(/\{name\}/gi, name || '')
    .replace(/[ \t]+([!,.?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

const clock = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const day = (s) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');

/** what the auto-reply is doing right now, in words */
export function autoReplyStatus(cfg, now = new Date()) {
  const st = autoReplyState(cfg, now);
  switch (st.state) {
    case 'holiday':
      return { ...st, tone: 'away', short: 'Holiday', long: `${cfg.holiday.name || 'Holiday'} — holiday message until ${day(st.until)}` };
    case 'away':
      return { ...st, tone: 'away', short: 'Away', long: 'Away — everyone gets the Away message' };
    case 'night':
      return { ...st, tone: 'away', short: 'Away · night', long: `Night time — Away message until ${clock(st.until)} (India time)` };
    case 'on':
      return { ...st, tone: 'on', short: 'Auto-reply on', long: 'On — instant reply to every new message' };
    default:
      return { ...st, tone: 'off', short: 'Auto-reply off', long: 'Off — only the team replies' };
  }
}

/** the inbox button: refreshes itself every minute, so the night schedule shows when it starts */
export function AutoReplyPill({ config, onClick }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60 * 1000);
    return () => clearInterval(t);
  }, []);
  const st = autoReplyStatus(config);
  return (
    <button type="button" className={`sci-auto ${st.tone === 'off' ? '' : st.tone}`} onClick={onClick} title={`Auto-reply: ${st.long}`}>
      <i />
      {st.short}
    </button>
  );
}

function Switch({ checked, onChange, label }) {
  return (
    <label className="arx-switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span aria-hidden="true" />
    </label>
  );
}

/** a message box with "Add name", "Use default" and a counter; reports focus for the preview */
function MessageBox({ id, label, hint, value, def, onChange, onFocus }) {
  const ref = useRef(null);
  const addName = () => {
    const el = ref.current;
    const at = el && typeof el.selectionStart === 'number' ? el.selectionStart : value.length;
    const end = el && typeof el.selectionEnd === 'number' ? el.selectionEnd : at;
    onChange(`${value.slice(0, at)}{name}${value.slice(end)}`.slice(0, MAX));
    onFocus();
    setTimeout(() => el?.focus(), 0);
  };
  return (
    <div className="arx-msg">
      <div className="arx-msg-top">
        <label htmlFor={id}>
          {label}
          {hint && <small>{hint}</small>}
        </label>
        <span className="arx-msg-tools">
          <button type="button" onClick={addName}>+ Name</button>
          {value !== def && (
            <button type="button" onClick={() => { onChange(def); onFocus(); }}>Use default</button>
          )}
        </span>
      </div>
      <textarea ref={ref} id={id} rows={3} maxLength={MAX} value={value} onFocus={onFocus} onChange={(e) => onChange(e.target.value)} />
      <span className="arx-count">{value.length} / {MAX}</span>
    </div>
  );
}

export default function ChatAutoReply({ value, defaults, onSaved, onClose }) {
  const D = { ...FALLBACK_DEFAULTS, ...(defaults || {}) };
  const [f, setF] = useState(() => JSON.parse(JSON.stringify(value)));
  const [who, setWho] = useState('seller'); // which messages are shown: seller | guest
  const [focus, setFocus] = useState('on'); // which message the preview shows: on | away | holiday
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setMsg = (k, v) => setF((x) => ({ ...x, messages: { ...x.messages, [k]: v } }));
  const setSchedule = (p) => setF((x) => ({ ...x, schedule: { ...x.schedule, ...p } }));
  const setHoliday = (p) => setF((x) => ({ ...x, holiday: { ...x.holiday, ...p } }));

  const status = autoReplyStatus(f);
  const onKey = `${who}On`;
  const awayKey = `${who}Away`;
  const previewText = focus === 'holiday' ? f.holiday.message : focus === 'away' ? f.messages[awayKey] : f.messages[onKey];
  const previewWho = focus === 'holiday' ? 'a store' : who === 'seller' ? 'a store' : 'a guest';
  const previewName = focus === 'holiday' || who === 'seller' ? SAMPLE.seller : SAMPLE.guest;

  const save = async () => {
    setErr('');
    if (f.schedule.enabled && f.schedule.from === f.schedule.to) return setErr('The night start and end time cannot be the same.');
    if (f.holiday.enabled && !f.holiday.start) return setErr('Set the first day of the holiday.');
    if (f.holiday.enabled && f.holiday.end && f.holiday.end < f.holiday.start) return setErr('The last holiday day cannot be before the first day.');
    setSaving(true);
    try {
      const res = await api('/chat/settings/auto-reply', {
        method: 'POST',
        body: {
          mode: f.mode,
          messages: Object.fromEntries(Object.entries(f.messages).map(([k, v]) => [k, String(v || '').trim() || D[k]])),
          schedule: f.schedule,
          holiday: { ...f.holiday, message: String(f.holiday.message || '').trim() || D.holiday },
        },
      });
      onSaved(res?.settings || null);
      onClose();
    } catch (e) {
      setErr(e.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="arx" role="dialog" aria-modal="true" aria-labelledby="arx-title" onClick={(e) => e.stopPropagation()}>
        <header className="arx-head">
          <div>
            <h3 id="arx-title">Auto-reply</h3>
            <p>An automatic first answer in Support chat, so nobody waits without a reply.</p>
          </div>
          <button type="button" className="arx-close" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="arx-body">
          <div className={`arx-now ${status.tone}`} role="status">
            <i aria-hidden="true" />
            <span><b>Right now:</b> {status.long}</span>
          </div>

          {/* 1. mode */}
          <section className="arx-sec">
            <h4>Mode</h4>
            <div className="arx-modes" role="radiogroup" aria-label="Auto-reply mode">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={f.mode === m.id}
                  className={`arx-mode is-${m.id} ${f.mode === m.id ? 'is-sel' : ''}`}
                  onClick={() => {
                    setF({ ...f, mode: m.id });
                    if (m.id !== 'off') setFocus(m.id);
                  }}
                >
                  <span className="arx-mode-top">
                    <span aria-hidden="true">{m.icon}</span>
                    <b>{m.title}</b>
                    <i aria-hidden="true" />
                  </span>
                  <span className="arx-mode-text">{m.text}</span>
                </button>
              ))}
            </div>
          </section>

          {/* 2. messages */}
          <section className="arx-sec">
            <div className="arx-sec-head">
              <div>
                <h4>Messages</h4>
                <p>Stores and guests get their own message. <code>{'{name}'}</code> becomes their name.</p>
              </div>
              <div className="arx-who" role="tablist" aria-label="Messages for">
                <button type="button" role="tab" aria-selected={who === 'seller'} className={who === 'seller' ? 'on' : ''} onClick={() => setWho('seller')}>🏪 Stores</button>
                <button type="button" role="tab" aria-selected={who === 'guest'} className={who === 'guest' ? 'on' : ''} onClick={() => setWho('guest')}>👤 Guests</button>
              </div>
            </div>
            <div className="arx-msgs">
              <MessageBox
                id={`arx-${onKey}`}
                label="When On"
                value={f.messages[onKey]}
                def={D[onKey]}
                onChange={(v) => setMsg(onKey, v)}
                onFocus={() => setFocus('on')}
              />
              <MessageBox
                id={`arx-${awayKey}`}
                label="When Away"
                hint="and at night"
                value={f.messages[awayKey]}
                def={D[awayKey]}
                onChange={(v) => setMsg(awayKey, v)}
                onFocus={() => setFocus('away')}
              />
            </div>
            <div className="arx-preview">
              <span className="arx-label">Preview — {focus === 'holiday' ? 'holiday message' : focus === 'away' ? 'Away message' : 'On message'} to {previewWho}</span>
              <div className="arx-bubble">
                <span className="arx-bubble-from">Bazario Support (auto-reply)</span>
                <p>{fillName(previewText, previewName) || '…'}</p>
              </div>
            </div>
          </section>

          {/* 3. night schedule */}
          <section className="arx-sec">
            <div className="arx-row">
              <div>
                <h4>🌙 Away every night</h4>
                <p>Switches to the Away message by itself, even when the mode is Off or On.</p>
              </div>
              <Switch checked={f.schedule.enabled} onChange={(v) => { setSchedule({ enabled: v }); if (v) setFocus('away'); }} label="Away every night" />
            </div>
            {f.schedule.enabled && (
              <div className="arx-times">
                <label>
                  <span>From</span>
                  <input type="time" value={f.schedule.from} onChange={(e) => setSchedule({ from: e.target.value })} />
                </label>
                <label>
                  <span>Until</span>
                  <input type="time" value={f.schedule.to} onChange={(e) => setSchedule({ to: e.target.value })} />
                </label>
                <em>India time · {clock(f.schedule.from)} to {clock(f.schedule.to)}</em>
              </div>
            )}
          </section>

          {/* 4. holiday */}
          <section className="arx-sec">
            <div className="arx-row">
              <div>
                <h4>🎉 Holiday</h4>
                <p>On these days everyone gets the holiday message, whatever the mode.</p>
              </div>
              <Switch checked={f.holiday.enabled} onChange={(v) => { setHoliday({ enabled: v }); if (v) setFocus('holiday'); }} label="Holiday" />
            </div>
            {f.holiday.enabled && (
              <div className="arx-holiday">
                <div className="arx-hol-fields">
                  <label className="arx-hol-name">
                    <span>Holiday name</span>
                    <input value={f.holiday.name} maxLength={60} placeholder="e.g. Diwali" onChange={(e) => setHoliday({ name: e.target.value })} />
                  </label>
                  <label>
                    <span>First day</span>
                    <input type="date" value={f.holiday.start} onChange={(e) => setHoliday({ start: e.target.value, end: f.holiday.end && f.holiday.end >= e.target.value ? f.holiday.end : e.target.value })} />
                  </label>
                  <label>
                    <span>Last day</span>
                    <input type="date" value={f.holiday.end} min={f.holiday.start || undefined} onChange={(e) => setHoliday({ end: e.target.value })} />
                  </label>
                </div>
                <MessageBox
                  id="arx-holiday"
                  label="Holiday message"
                  hint="for stores and guests"
                  value={f.holiday.message}
                  def={D.holiday}
                  onChange={(v) => setHoliday({ message: v })}
                  onFocus={() => setFocus('holiday')}
                />
              </div>
            )}
          </section>

          <ul className="arx-rules">
            <li>Only when nobody from the team replied in that chat in the last 30 minutes.</li>
            <li>At most one auto-reply per chat every 30 minutes — it never spams.</li>
            <li>Stores see “Bazario Support”, never an admin's name. Nothing is emailed.</li>
          </ul>

          {err && <p className="arx-err" role="alert">{err}</p>}
        </div>

        <footer className="arx-foot">
          <button type="button" className="arx-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="arx-btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </footer>
      </div>
    </div>
  );
}
