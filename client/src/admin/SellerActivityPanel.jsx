import { useCallback, useEffect, useRef, useState } from 'react';
import { api, fmtDate } from '../api.js';

/**
 * Sellers → profile → Dashboard → "Activity & Devices" (admin only; the seller never sees it).
 * Shows: online now / last seen, the page the seller is on, every device signed in (browser,
 * system, phone model, IP, place, network, VPN signs), warning signs, and the activity log
 * (logins, wrong passwords, pages, confirmed orders, deposits, withdrawals …).
 */

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'login', label: 'Logins & devices' },
  { key: 'action', label: 'Actions' },
  { key: 'page', label: 'Pages' },
  { key: 'risk', label: '⚠ Warnings' },
];

const ICON = {
  login: '🔓',
  login_failed: '❌',
  login_pending: '⏳',
  logout: '🚪',
  page: '📄',
  action: '✅',
  blocked: '⛔',
  device: '🆕',
  ip: '🌐',
  burst: '🚨',
  admin: '🛡️',
};

function ago(d) {
  if (!d) return '—';
  const s = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  return days < 30 ? `${days} day${days > 1 ? 's' : ''} ago` : fmtDate(d);
}

const flagOf = (cc) =>
  /^[A-Z]{2}$/.test(cc || '') ? String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '🌐';

const devIcon = (s) => (/Mobile/.test(s.device) ? '📱' : /Tablet/.test(s.device) ? '📲' : '💻');

export default function SellerActivityPanel({ sellerId, storeName }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [events, setEvents] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [openDev, setOpenDev] = useState('');
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  const req = useRef(0);

  const load = useCallback(
    async (quiet = false) => {
      if (!sellerId) return;
      const my = ++req.current;
      if (!quiet) setLoading(true);
      try {
        const d = await api(`/seller-activity/admin/${sellerId}?type=${filter}`);
        if (my !== req.current) return;
        setData(d);
        setEvents(d.events || []);
        setHasMore(Boolean(d.hasMore));
        setErr('');
      } catch (e) {
        if (my === req.current) setErr(e.message || 'Could not load the activity log.');
      } finally {
        if (my === req.current) setLoading(false);
      }
    },
    [sellerId, filter]
  );

  useEffect(() => {
    load();
  }, [load]);

  // live-ish: refresh every 30 s while open, and keep "x min ago" fresh
  useEffect(() => {
    const iv = setInterval(() => {
      if (document.visibilityState !== 'hidden') load(true);
    }, 30000);
    const t = setInterval(() => tick((n) => n + 1), 15000);
    return () => {
      clearInterval(iv);
      clearInterval(t);
    };
  }, [load]);

  const loadMore = async () => {
    const last = events[events.length - 1];
    if (!last) return;
    setMoreLoading(true);
    try {
      const d = await api(`/seller-activity/admin/${sellerId}?type=${filter}&before=${encodeURIComponent(last.at)}`);
      setEvents((old) => [...old, ...(d.events || [])]);
      setHasMore(Boolean(d.hasMore));
    } catch (e) {
      setErr(e.message);
    } finally {
      setMoreLoading(false);
    }
  };

  const signOutAll = async () => {
    if (
      !window.confirm(
        `Sign out "${storeName || 'this store'}" from EVERY device?\n\nAll its open logins (phones, laptops, the app) end now and the seller has to log in again. The password stays the same.\n\nTip: if someone else knows the password, also change the password.`
      )
    )
      return;
    setBusy(true);
    try {
      const r = await api(`/seller-activity/admin/${sellerId}/sign-out-all`, { method: 'POST' });
      window.alert(r.message || 'Done.');
      load(true);
    } catch (e) {
      window.alert(e.message || 'Could not sign out the devices.');
    } finally {
      setBusy(false);
    }
  };

  if (!data && loading) return <div className="sap-empty">Loading activity…</div>;
  if (!data && err)
    return (
      <div className="sap-empty">
        {err}{' '}
        <button type="button" className="sap-btn" onClick={() => load()}>
          Retry
        </button>
      </div>
    );
  if (!data) return null;

  const sum = data.summary || {};
  const sessions = data.sessions || [];
  const live = sessions.filter((s) => s.signedIn);
  const past = sessions.filter((s) => !s.signedIn);
  const onlineDev = sessions.find((s) => s.online);
  const lastSeen = sessions[0]?.lastSeenAt;

  const renderDevice = (s) => {
    const open = openDev === s.id;
    return (
      <div key={s.id} className={`sap-dev ${s.online ? 'on' : ''} ${!s.signedIn ? 'off' : ''}`}>
        <button type="button" className="sap-dev-head" onClick={() => setOpenDev(open ? '' : s.id)}>
          <span className="sap-dev-ic">{devIcon(s)}</span>
          <span className="sap-dev-main">
            <b>
              {s.browser} · {s.os}
            </b>
            <small>
              {s.device}
              {s.app === 'Android app' ? ' · Bazario app' : ''}
            </small>
          </span>
          <span className="sap-badges">
            {s.online ? (
              <span className="sap-b green">● Online</span>
            ) : s.signedIn ? (
              <span className="sap-b gray">Signed in</span>
            ) : (
              <span className="sap-b red">{s.loggedOutBy === 'admin' ? 'Signed out by team' : 'Logged out'}</span>
            )}
            {s.proxy && <span className="sap-b red">VPN / proxy</span>}
            {s.tzMismatch && <span className="sap-b amber">Time zone ≠ IP</span>}
          </span>
        </button>

        <div className="sap-dev-body">
          {s.signedIn && s.currentPage && (
            <div className="sap-now">
              {s.online ? (s.visible ? '👁 Now on' : '💤 App in background, last on') : 'Last page'}: <b>{s.currentPageName || s.currentPage}</b>
              {s.pageSince && <span className="muted"> · since {ago(s.pageSince)}</span>}
            </div>
          )}
          <div className="sap-grid">
            <span>
              <i>IP</i>
              {s.ip || '—'}
            </span>
            <span>
              <i>Location</i>
              {flagOf(s.countryCode)} {s.place || 'Unknown'}
            </span>
            <span>
              <i>Network</i>
              {s.isp || '—'}
            </span>
            <span>
              <i>Last seen</i>
              {ago(s.lastSeenAt)}
            </span>
            <span>
              <i>Login made</i>
              {s.loginAt ? fmtDate(s.loginAt) : '—'}
            </span>
            <span>
              <i>First seen</i>
              {fmtDate(s.firstSeenAt)}
            </span>
          </div>
          {open && (
            <div className="sap-more">
              <div className="sap-grid">
                <span>
                  <i>Device time zone</i>
                  {s.tz || '—'}
                </span>
                <span>
                  <i>IP time zone</i>
                  {s.ipTz || '—'}
                </span>
                <span>
                  <i>Language</i>
                  {s.lang || '—'}
                </span>
                <span>
                  <i>Screen</i>
                  {s.screen || '—'}
                </span>
                {s.loggedOutAt && (
                  <span>
                    <i>Logged out</i>
                    {fmtDate(s.loggedOutAt)}
                  </span>
                )}
              </div>
              {s.ips?.length > 0 && (
                <div className="sap-ips">
                  <i>IP history (this device)</i>
                  {s.ips.map((x, i) => (
                    <div key={i}>
                      {x.ip} — {x.place || 'Unknown place'} <span className="muted">· {x.at ? fmtDate(x.at) : ''}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="sap-ua">{s.ua}</div>
            </div>
          )}
          <button type="button" className="sap-link" onClick={() => setOpenDev(open ? '' : s.id)}>
            {open ? 'Less ▲' : 'More details ▼'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="sap">
      <style>{CSS}</style>

      {/* status line */}
      <div className="sap-top">
        <div className={`sap-status ${data.online ? 'on' : ''}`}>
          {data.online ? (
            <>
              <span className="dot" /> Online now
              {onlineDev?.currentPageName ? (
                <>
                  {' '}
                  — on <b>{onlineDev.currentPageName}</b>
                </>
              ) : null}
            </>
          ) : (
            <>
              <span className="dot" /> Offline {lastSeen ? `· last seen ${ago(lastSeen)}` : '· no activity recorded yet'}
            </>
          )}
        </div>
        <div className="sap-actions">
          <button type="button" className="sap-btn" onClick={() => load()} disabled={loading}>
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
          <button type="button" className="sap-btn danger" onClick={signOutAll} disabled={busy || live.length === 0}>
            {busy ? 'Signing out…' : '⏻ Sign out all devices'}
          </button>
        </div>
      </div>

      {/* warning signs */}
      {data.flags?.length ? (
        <div className="sap-flags">
          <b>⚠ Warning signs</b>
          {data.flags.map((f, i) => (
            <div key={i} className={`sap-flag ${f.level}`}>
              {f.level === 'danger' ? '🔴' : '🟠'} {f.text}
            </div>
          ))}
        </div>
      ) : (
        <div className="sap-ok">✅ No warning signs (devices, places, passwords and traffic look normal)</div>
      )}

      {/* numbers */}
      <div className="sap-kpis">
        <div>
          <i>Signed-in devices</i>
          <b>{sum.signedInDevices || 0}</b>
        </div>
        <div>
          <i>Online now</i>
          <b style={{ color: sum.onlineDevices ? '#16a34a' : undefined }}>{sum.onlineDevices || 0}</b>
        </div>
        <div>
          <i>Last login</i>
          <b className="sm">{sum.lastLoginAt ? ago(sum.lastLoginAt) : '—'}</b>
          {sum.lastLoginPlace && <small>{sum.lastLoginPlace}</small>}
        </div>
        <div>
          <i>Wrong passwords (24h)</i>
          <b style={{ color: sum.failedLogins24h ? '#dc2626' : undefined }}>{sum.failedLogins24h || 0}</b>
        </div>
        <div>
          <i>IPs (30 days)</i>
          <b>{sum.ips30d || 0}</b>
          {sum.countries30d?.length ? <small>{sum.countries30d.join(', ')}</small> : null}
        </div>
        <div>
          <i>Requests / min</i>
          <b className="sm">
            {sum.requests?.lastMinute || 0} now · {sum.requests?.peakMinute || 0} peak
          </b>
          <small>last 10 min</small>
        </div>
      </div>

      {/* devices */}
      <h5 className="sap-h">
        Devices signed in <span className="muted">({live.length})</span>
      </h5>
      {live.length ? live.map((s) => renderDevice(s)) : <div className="sap-empty">Not signed in on any device right now.</div>}
      {past.length > 0 && (
        <details className="sap-past">
          <summary>Older / logged-out devices ({past.length})</summary>
          {past.map((s) => renderDevice(s))}
        </details>
      )}

      {/* activity log */}
      <h5 className="sap-h">Activity log</h5>
      <div className="sap-chips">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className={`sap-chip ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>
      {err && <div className="sap-err">{err}</div>}
      {events.length === 0 ? (
        <div className="sap-empty">No activity recorded yet. (Recording starts from this update — older activity was not saved.)</div>
      ) : (
        <div className="sap-log">
          {events.map((e) => (
            <div key={e.id} className={`sap-row ${e.ok ? '' : 'bad'}`}>
              <span className="sap-ic">{ICON[e.type] || '•'}</span>
              <div className="sap-row-main">
                <div className="sap-row-top">
                  <b>{e.label}</b>
                  <span className="sap-time" title={fmtDate(e.at)}>
                    {fmtDate(e.at)}
                  </span>
                </div>
                {e.detail && <div className="sap-detail">{e.detail}</div>}
                <div className="sap-meta">
                  {[e.place, e.ip, [e.browser, e.os].filter(Boolean).join(' · '), e.device].filter(Boolean).join('  ·  ')}
                </div>
              </div>
            </div>
          ))}
          {hasMore && (
            <button type="button" className="sap-btn wide" onClick={loadMore} disabled={moreLoading}>
              {moreLoading ? 'Loading…' : 'Show older activity'}
            </button>
          )}
        </div>
      )}
      <p className="sap-note">Only the team sees this. Activity is kept 90 days. Location comes from the IP address, so it is approximate (city level).</p>
    </div>
  );
}

const CSS = `
.sap{display:flex;flex-direction:column;gap:12px}
.sap .muted{color:#64748b;font-weight:400}
.sap-top{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
.sap-status{display:flex;align-items:center;gap:6px;font-size:14px;color:#475569;background:#f1f5f9;border-radius:999px;padding:6px 12px}
.sap-status .dot{width:9px;height:9px;border-radius:50%;background:#94a3b8;display:inline-block}
.sap-status.on{background:#dcfce7;color:#166534}
.sap-status.on .dot{background:#16a34a;box-shadow:0 0 0 3px #bbf7d0}
.sap-actions{display:flex;gap:6px;flex-wrap:wrap}
.sap-btn{border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:6px 12px;font-size:13px;cursor:pointer;color:#0f172a}
.sap-btn:disabled{opacity:.55;cursor:default}
.sap-btn.danger{border-color:#fecaca;color:#b91c1c;background:#fef2f2}
.sap-btn.wide{width:100%;margin-top:6px}
.sap-flags{border:1px solid #fed7aa;background:#fff7ed;border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:4px;font-size:13px}
.sap-flag.danger{color:#b91c1c;font-weight:600}
.sap-flag.warn{color:#9a3412}
.sap-ok{border:1px solid #bbf7d0;background:#f0fdf4;color:#166534;border-radius:10px;padding:8px 12px;font-size:13px}
.sap-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}
.sap-kpis>div{border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:2px;background:#fff}
.sap-kpis i{font-style:normal;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.02em}
.sap-kpis b{font-size:18px;color:#0f172a}
.sap-kpis b.sm{font-size:14px}
.sap-kpis small{font-size:11px;color:#64748b}
.sap-h{margin:6px 0 0;font-size:14px;color:#0f172a}
.sap-dev{border:1px solid #e2e8f0;border-radius:12px;background:#fff;overflow:hidden}
.sap-dev.on{border-color:#86efac}
.sap-dev.off{opacity:.8}
.sap-dev-head{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:none;border:0;padding:10px 12px;cursor:pointer}
.sap-dev-ic{font-size:22px}
.sap-dev-main{display:flex;flex-direction:column;flex:1;min-width:0}
.sap-dev-main b{font-size:14px;color:#0f172a}
.sap-dev-main small{font-size:12px;color:#64748b}
.sap-badges{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.sap-b{font-size:11px;padding:2px 8px;border-radius:999px;white-space:nowrap;font-weight:600}
.sap-b.green{background:#dcfce7;color:#166534}
.sap-b.gray{background:#f1f5f9;color:#475569}
.sap-b.red{background:#fee2e2;color:#b91c1c}
.sap-b.amber{background:#fef3c7;color:#92400e}
.sap-dev-body{padding:0 12px 10px;display:flex;flex-direction:column;gap:8px}
.sap-now{font-size:13px;background:#eff6ff;color:#1e3a8a;border-radius:8px;padding:6px 10px}
.sap-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px 12px;font-size:13px;color:#0f172a;word-break:break-word}
.sap-grid i,.sap-ips i{display:block;font-style:normal;font-size:11px;color:#64748b}
.sap-more{display:flex;flex-direction:column;gap:8px;border-top:1px dashed #e2e8f0;padding-top:8px}
.sap-ips{font-size:12px;color:#334155;display:flex;flex-direction:column;gap:2px}
.sap-ua{font-size:11px;color:#94a3b8;word-break:break-all;font-family:monospace}
.sap-link{align-self:flex-start;background:none;border:0;color:#2563eb;font-size:12px;cursor:pointer;padding:0}
.sap-past summary{cursor:pointer;font-size:13px;color:#475569;margin-bottom:6px}
.sap-past .sap-dev{margin-bottom:8px}
.sap-chips{display:flex;gap:6px;flex-wrap:wrap}
.sap-chip{border:1px solid #e2e8f0;background:#fff;border-radius:999px;padding:4px 12px;font-size:12px;cursor:pointer;color:#334155}
.sap-chip.active{background:#0f172a;color:#fff;border-color:#0f172a}
.sap-log{display:flex;flex-direction:column;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#fff}
.sap-row{display:flex;gap:10px;padding:9px 12px;border-bottom:1px solid #f1f5f9}
.sap-row:last-of-type{border-bottom:0}
.sap-row.bad{background:#fef2f2}
.sap-ic{font-size:16px;line-height:20px}
.sap-row-main{flex:1;min-width:0}
.sap-row-top{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
.sap-row-top b{font-size:13px;color:#0f172a;font-weight:600}
.sap-time{font-size:11px;color:#64748b;white-space:nowrap}
.sap-detail{font-size:12px;color:#b91c1c;margin-top:2px}
.sap-meta{font-size:11px;color:#64748b;margin-top:2px;word-break:break-word}
.sap-empty{padding:16px;text-align:center;color:#64748b;background:#f8fafc;border-radius:10px;font-size:13px}
.sap-err{color:#b91c1c;font-size:13px}
.sap-note{font-size:11px;color:#94a3b8;margin:0}
`;
