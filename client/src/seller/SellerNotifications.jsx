import { useCallback, useEffect, useRef, useState } from 'react';
import Ic from '../components/Icons.jsx';
import { disablePush, enablePush, getPushStatus, isIOS, isInstalledApp, testPush } from '../utils/push.js';

/**
 * Seller push notifications — one place to turn them on / off.
 *  - <NotifBell />: always in the top bar ("Alerts On / Off"), opens a small panel with the switch.
 *  - <NotifPrompt />: comes up by itself while notifications are not on for this device.
 * The setting is per device (phone / computer), like WhatsApp.
 */
const EVT = 'bz-seller-push';
const SNOOZE_KEY = 'bz_push_prompt_until';

function usePushStatus() {
  const [status, setStatus] = useState('loading');
  const refresh = useCallback(async () => setStatus(await getPushStatus('seller')), []);
  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    const onVisible = () => document.visibilityState === 'visible' && refresh(); // back from phone settings
    window.addEventListener(EVT, onChange);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(EVT, onChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);
  return [status, refresh];
}
const announce = () => window.dispatchEvent(new Event(EVT));

async function turnOn() {
  const r = await enablePush('seller', { ask: true });
  announce();
  return r;
}
async function turnOff() {
  await disablePush('seller');
  try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + 3 * 24 * 3600 * 1000)); } catch { /* ignore */ }
  announce();
}

// How to allow notifications again after "Block"
function BlockedHelp() {
  const ios = isIOS();
  const app = isInstalledApp();
  return (
    <div className="nt-help">
      <b>Notifications are blocked on this {ios ? 'iPhone' : 'device'}</b>
      <p>Please allow them once in the settings:</p>
      {ios ? (
        <ol>
          <li>Open the iPhone <b>Settings</b></li>
          <li>Tap <b>Notifications</b> → <b>Bazario</b></li>
          <li>Turn on <b>Allow Notifications</b>, then come back here</li>
        </ol>
      ) : app ? (
        <ol>
          <li>Press and hold the <b>Bazario</b> app icon → <b>App info</b></li>
          <li>Tap <b>Notifications</b> and turn them <b>on</b></li>
          <li>Come back here and tap <b>Turn on</b></li>
        </ol>
      ) : (
        <ol>
          <li>Tap the <b>🔒 lock</b> (or <b>ⓘ</b>) next to the website address</li>
          <li>Tap <b>Permissions</b> / <b>Site settings</b> → <b>Notifications</b> → <b>Allow</b></li>
          <li>Reload this page</li>
        </ol>
      )}
    </div>
  );
}

function IosInstallHelp({ onInstall }) {
  return (
    <div className="nt-help">
      <b>On iPhone, first add Bazario to your Home Screen</b>
      <ol>
        <li>In Safari tap <b>Share</b> (square with arrow) → <b>Add to Home Screen</b></li>
        <li>Open <b>Bazario</b> from the Home Screen and log in</li>
        <li>Tap the 🔔 bell at the top and turn notifications <b>On</b></li>
      </ol>
      {onInstall && (
        <button type="button" className="nt-btn ghost" onClick={onInstall}>
          <Ic name="download" size={15} /> Show me how
        </button>
      )}
    </div>
  );
}

const LABEL = { on: 'On', off: 'Off', denied: 'Blocked', 'ios-install': 'Off', unsupported: 'Off', loading: '' };

export function NotifBell({ onInstallApp }) {
  const [status, refresh] = usePushStatus();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null); // { ok, text }
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    refresh();
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, refresh]);
  // the prompt steps aside while this panel is open (same thing twice on the screen)
  useEffect(() => {
    if (open) window.dispatchEvent(new Event('bz-notif-panel-open'));
  }, [open]);

  const toggle = async () => {
    setBusy(true);
    setNote(null);
    try {
      if (status === 'on') {
        await turnOff();
        setNote({ ok: true, text: 'Notifications are off on this device.' });
      } else {
        const r = await turnOn();
        if (r === 'granted') setNote({ ok: true, text: 'Done! Notifications are on ✓' });
        else if (r === 'denied') setNote(null); // the "blocked" help shows below
        else if (r === 'default') setNote({ ok: false, text: 'Please tap "Allow" when your phone asks.' });
        else setNote({ ok: false, text: 'Could not turn on right now. Please try again.' });
      }
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setNote(null);
    try {
      await testPush();
      setNote({ ok: true, text: 'Test sent. It should appear in a few seconds.' });
    } catch (e) {
      setNote({ ok: false, text: e.message || 'Could not send the test.' });
    } finally {
      setBusy(false);
    }
  };

  const on = status === 'on';
  const canSwitch = status === 'on' || status === 'off';

  return (
    <div className="nt-wrap" ref={ref}>
      <button
        type="button"
        className={`nt-bell is-${status}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Notifications: ${LABEL[status] || ''}`}
        title="Notifications on / off"
        data-tour="topbar-notifications"
      >
        <Ic name="bell" size={17} />
        <span className="nt-bell-txt">Alerts <b>{LABEL[status]}</b></span>
        <span className="nt-dot" aria-hidden="true" />
      </button>

      {open && (
        <div className="nt-panel" role="dialog" aria-label="Notification settings">
          <div className="nt-head">
            <span className="nt-head-ic"><Ic name="bell" size={18} /></span>
            <div>
              <b>Notifications</b>
              <small>New orders, deposits, withdrawals and support replies</small>
            </div>
          </div>

          {canSwitch && (
            <button type="button" className={`nt-switch-row ${on ? 'on' : ''}`} onClick={toggle} disabled={busy} role="switch" aria-checked={on}>
              <span className="nt-switch-txt">
                <b>Push notifications</b>
                <small>{busy ? 'Please wait…' : on ? 'On for this device' : 'Off — you may miss new orders'}</small>
              </span>
              <span className="nt-switch" aria-hidden="true"><span /></span>
            </button>
          )}

          {status === 'denied' && (
            <>
              <BlockedHelp />
              <button type="button" className="nt-btn" onClick={toggle} disabled={busy}>
                {busy ? 'Checking…' : 'I allowed it — turn on'}
              </button>
            </>
          )}
          {status === 'ios-install' && <IosInstallHelp onInstall={onInstallApp ? () => { setOpen(false); onInstallApp(); } : null} />}
          {status === 'unsupported' && (
            <div className="nt-help">
              <b>This browser can't show notifications</b>
              <p>Please open Seller Central in <b>Google Chrome</b> or install the Bazario app.</p>
            </div>
          )}

          {note && <p className={`nt-note ${note.ok ? 'ok' : 'err'}`} role="status">{note.text}</p>}

          {on && (
            <button type="button" className="nt-btn ghost" onClick={sendTest} disabled={busy}>
              <Ic name="send" size={15} /> Send a test notification
            </button>
          )}
          <p className="nt-fine">This setting is for this phone / computer. Turn it on on every device you use.</p>
        </div>
      )}
    </div>
  );
}

/** Comes up by itself when notifications are not on for this device ("Later" hides it for a day). */
export function NotifPrompt({ onInstallApp }) {
  const [status, refresh] = usePushStatus();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === 'loading' || status === 'on' || status === 'unsupported') {
      setShow(false);
      return undefined;
    }
    let until = 0;
    try { until = Number(localStorage.getItem(SNOOZE_KEY) || 0); } catch { /* ignore */ }
    if (until > Date.now()) return undefined;
    // a little after the page opens, and never on top of the guided tour
    const t = setTimeout(function tryShow() {
      if (document.querySelector('.tour-root')) return; // the tour is running: next page open
      setShow(true);
    }, 2500);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    const hide = () => setShow(false);
    window.addEventListener('bz-notif-panel-open', hide);
    return () => window.removeEventListener('bz-notif-panel-open', hide);
  }, []);

  if (!show) return null;

  const later = () => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + 24 * 3600 * 1000)); } catch { /* ignore */ }
    setShow(false);
  };
  const on = async () => {
    setBusy(true);
    try {
      const r = await turnOn();
      if (r === 'granted') setShow(false);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <div className="nt-prompt" role="dialog" aria-labelledby="nt-prompt-title">
      <button type="button" className="nt-prompt-x" onClick={later} aria-label="Close">
        <Ic name="x" size={16} />
      </button>
      <div className="nt-prompt-top">
        <span className="nt-prompt-ic"><Ic name="bell" size={22} /></span>
        <div>
          <b id="nt-prompt-title">Turn on notifications</b>
          <p>Get an alert the moment a new order arrives, so you can confirm it on time and keep your account health high.</p>
        </div>
      </div>

      {status === 'off' && (
        <div className="nt-prompt-btns">
          <button type="button" className="nt-btn" onClick={on} disabled={busy}>
            <Ic name="bell" size={15} /> {busy ? 'Turning on…' : 'Turn on'}
          </button>
          <button type="button" className="nt-btn ghost" onClick={later}>Later</button>
        </div>
      )}
      {status === 'denied' && (
        <>
          <BlockedHelp />
          <div className="nt-prompt-btns">
            <button type="button" className="nt-btn" onClick={on} disabled={busy}>{busy ? 'Checking…' : 'I allowed it — turn on'}</button>
            <button type="button" className="nt-btn ghost" onClick={later}>Later</button>
          </div>
        </>
      )}
      {status === 'ios-install' && (
        <>
          <IosInstallHelp onInstall={onInstallApp ? () => { setShow(false); onInstallApp(); } : null} />
          <div className="nt-prompt-btns">
            <button type="button" className="nt-btn ghost" onClick={later}>Later</button>
          </div>
        </>
      )}
    </div>
  );
}
