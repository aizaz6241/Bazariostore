import { useEffect, useMemo, useState } from 'react';
import { api, fmtDate } from '../api.js';
import Ic from '../components/Icons.jsx';
import { Modal, Toggle } from './ui.jsx';
import { Avatar } from './insights.jsx';
import { Nick, useNicknames } from './nicknames.jsx';

/**
 * STAFF → TEAM MEMBERS
 * Give a team portal member a login to this admin panel that sees ONLY the stores assigned to him
 * (server: routes/admins.js "TEAM STAFF" + utils/staffScope.js, deny by default).
 * He logs in on the normal login page with his team portal username (or email) and password.
 */
const TEAM_ROLES = ['order_manager', 'support', 'manager'];
const SCOPABLE = [
  { key: 'orders', label: 'Orders', desc: 'See his stores’ orders and change their status' },
  { key: 'chat', label: 'Support chat', desc: 'Read and answer his stores’ support chats' },
  { key: 'sellers', label: 'Store details', desc: 'His stores’ health, waiting orders and wallet (read only)' },
];
const defaultsFor = (meta, role) => (meta?.roleDefaults?.[role] || []).filter((p) => SCOPABLE.some((s) => s.key === p));
const ago = (d) => {
  if (!d) return 'Never';
  const ms = Date.now() - new Date(d).getTime();
  if (ms < 3600000) return `${Math.max(1, Math.floor(ms / 60000))}m ago`;
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`;
  if (ms < 30 * 86400000) return `${Math.floor(ms / 86400000)}d ago`;
  return fmtDate(d);
};

/* ───────────── store picker (several stores, search by name / nickname / owner) ───────────── */
function StorePicker({ sellers, value, onChange, memberId }) {
  const nickMap = useNicknames();
  const [q, setQ] = useState('');
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  const picked = useMemo(() => new Set(value), [value]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (sellers || []).filter((s) => {
      const id = String(s._id);
      if (onlyPicked && !picked.has(id)) return false;
      if (!t) return true;
      return `${s.storeName} ${nickMap[id] || ''} ${s.ownerName || ''} ${s.email || ''} ${s.phone || ''}`.toLowerCase().includes(t);
    });
  }, [sellers, q, onlyPicked, picked, nickMap]);
  const shown = list.slice(0, 200);
  const toggle = (id) => onChange(picked.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  const allShownOn = shown.length > 0 && shown.every((s) => picked.has(String(s._id)));

  const useTeamStores = async () => {
    if (!memberId) return;
    setBusy(true);
    setHint('');
    try {
      const r = await api(`/admins/team/members/${memberId}/sellers`);
      const known = new Set((sellers || []).map((s) => String(s._id)));
      const ids = (r?.sellerIds || []).filter((id) => known.has(id));
      onChange([...new Set([...value, ...ids])]);
      setHint(ids.length ? `${ids.length} store${ids.length === 1 ? '' : 's'} from his team portal list added.` : 'No store is linked to him on the team portal.');
    } catch (e) {
      setHint(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tsp">
      <div className="tsp-tools">
        <label className="tsp-search">
          <Ic name="search" size={14} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Store, nickname, owner, email" aria-label="Search stores" />
        </label>
        {memberId && (
          <button type="button" className="tsp-btn" onClick={useTeamStores} disabled={busy} title="The stores this member brought (team portal → My sellers)">
            {busy ? '…' : '🤝 Add his team portal stores'}
          </button>
        )}
      </div>
      <div className="tsp-bar">
        <b>{value.length} selected</b>
        <button type="button" onClick={() => setOnlyPicked((v) => !v)} className={onlyPicked ? 'on' : ''}>
          {onlyPicked ? 'Show all' : 'Show selected'}
        </button>
        <button
          type="button"
          onClick={() => {
            const ids = shown.map((s) => String(s._id));
            onChange(allShownOn ? value.filter((x) => !ids.includes(x)) : [...new Set([...value, ...ids])]);
          }}
          disabled={!shown.length}
        >
          {allShownOn ? 'Unselect shown' : `Select shown (${shown.length})`}
        </button>
        {value.length > 0 && (
          <button type="button" className="danger" onClick={() => onChange([])}>
            Clear
          </button>
        )}
      </div>
      {hint && <small className="tsp-hint">{hint}</small>}
      <ul className="tsp-list" role="listbox" aria-multiselectable="true">
        {!sellers && <li className="tsp-empty">Loading stores…</li>}
        {sellers && shown.length === 0 && <li className="tsp-empty">No store found.</li>}
        {shown.map((s) => {
          const id = String(s._id);
          const on = picked.has(id);
          return (
            <li key={id}>
              <label className={`tsp-row${on ? ' on' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(id)} />
                <Avatar name={s.storeName} size={28} />
                <span className="tsp-main">
                  <b>
                    {s.storeName}
                    <Nick id={id} compact />
                  </b>
                  <small>
                    {s.ownerName || s.email || '—'}
                    {s.isTestAccount ? ' · test' : ''}
                    {s.status && s.status !== 'active' ? ` · ${s.status}` : ''}
                  </small>
                </span>
              </label>
            </li>
          );
        })}
        {list.length > shown.length && <li className="tsp-empty">{list.length - shown.length} more — search to narrow down.</li>}
      </ul>
    </div>
  );
}

/* ───────────── role + permissions ───────────── */
function AccessFields({ meta, role, permissions, onChange }) {
  return (
    <div className="tsf-access">
      <label className="tsf-label">Role</label>
      <div className="tsf-roles">
        {TEAM_ROLES.map((r) => (
          <button key={r} type="button" className={role === r ? 'on' : ''} onClick={() => onChange({ role: r, permissions: defaultsFor(meta, r) })}>
            {meta?.roleLabels?.[r] || r}
          </button>
        ))}
      </div>
      <label className="tsf-label">What he can do (only for his stores)</label>
      <div className="tsf-perms">
        {SCOPABLE.map((p) => {
          const on = permissions.includes(p.key);
          return (
            <label key={p.key} className={`tsf-perm${on ? ' on' : ''}`}>
              <input type="checkbox" checked={on} onChange={() => onChange({ role, permissions: on ? permissions.filter((x) => x !== p.key) : [...permissions, p.key] })} />
              <span>
                <b>{p.label}</b>
                <small>{p.desc}</small>
              </span>
            </label>
          );
        })}
      </div>
      <p className="tsf-safe">🔒 Never: finance &amp; payouts, other stores, settings, staff, products, refunds, deleting chats.</p>
    </div>
  );
}

/* ═══════════════════════════ the tab ═══════════════════════════ */
export default function TeamStaff({ admins, meta, onChanged, setNotice, setError }) {
  const [members, setMembers] = useState(null);
  const [sellers, setSellers] = useState(null);
  const [sellersErr, setSellersErr] = useState('');
  const [add, setAdd] = useState(null); // { memberId, role, permissions, sellerIds, q }
  const [stores, setStores] = useState(null); // { admin, sellerIds }
  const [access, setAccess] = useState(null); // { admin, role, permissions }
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  const team = useMemo(() => admins.filter((a) => a.teamMemberId), [admins]);
  const storeName = useMemo(() => new Map((sellers || []).map((s) => [String(s._id), s.storeName])), [sellers]);

  const loadMembers = () => api('/admins/team/members').then(setMembers).catch((e) => setError(e.message));
  const loadSellers = () => {
    if (sellers) return;
    api('/sellers')
      .then((list) => setSellers(Array.isArray(list) ? list : []))
      .catch((e) => setSellersErr(e.status === 403 ? 'Your account needs the Sellers permission to pick stores.' : e.message));
  };
  useEffect(() => {
    loadMembers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const memberOf = useMemo(() => new Map((members || []).map((m) => [m.id, m])), [members]);
  const free = (members || []).filter((m) => !m.adminId && m.active);

  const done = (res, fallback) => {
    setNotice(res?.pendingApproval ? `🔐 ${res.message}` : res?.message || fallback);
    onChanged();
    loadMembers();
  };

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api('/admins/team', { method: 'POST', body: { memberId: add.memberId, role: add.role, permissions: add.permissions, sellerIds: add.sellerIds } });
      setAdd(null);
      done(res, 'Team login made.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const saveStores = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api(`/admins/team/${stores.admin._id}/sellers`, { method: 'PUT', body: { sellerIds: stores.sellerIds } });
      setStores(null);
      done(res, 'Saved.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const saveAccess = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api(`/admins/${access.admin._id}`, { method: 'PUT', body: { role: access.role, permissions: access.permissions } });
      setAccess(null);
      done(res, 'Saved.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (a) => {
    setError('');
    try {
      const res = await api(`/admins/${a._id}`, { method: 'PUT', body: { active: !a.active } });
      done(res, a.active ? 'Switched off.' : 'Switched on.');
    } catch (e) {
      setError(e.message);
    }
  };
  const remove = async (a) => {
    if (!window.confirm(`Remove the admin login of “${a.name}”?\n\nHis team portal account stays as it is.`)) return;
    setError('');
    try {
      const res = await api(`/admins/${a._id}`, { method: 'DELETE' });
      done(res, 'Login removed.');
    } catch (e) {
      setError(e.message);
    }
  };

  const shownTeam = team.filter((a) => {
    const t = q.trim().toLowerCase();
    return !t || `${a.name} ${(a.teamLogins || []).join(' ')}`.toLowerCase().includes(t);
  });
  const addMember = add ? memberOf.get(add.memberId) : null;
  const addFree = add
    ? free.filter((m) => {
        const t = (add.q || '').trim().toLowerCase();
        return !t || `${m.name} ${m.username} ${m.email}`.toLowerCase().includes(t);
      })
    : [];

  return (
    <div className="tst">
      <div className="tst-intro">
        <div className="tst-intro-ic">🤝</div>
        <div>
          <b>Team members in the admin panel</b>
          <p>
            Give a team portal member a login here. He signs in on the normal login page with his <b>team portal username (or email) and password</b> — when he changes it on the team portal, it changes here
            too. He sees <b>only the stores you assign</b>: their orders, their support chat and their store details. Nothing else.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            loadSellers();
            setAdd({ memberId: '', role: 'order_manager', permissions: defaultsFor(meta, 'order_manager'), sellerIds: [], q: '' });
          }}
        >
          <Ic name="plus" size={16} /> Give a team member access
        </button>
      </div>

      {team.length > 3 && (
        <div className="search-field stf-search tst-search">
          <Ic name="search" size={16} />
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search team logins…" />
        </div>
      )}

      {team.length === 0 ? (
        <div className="tst-empty">No team member has an admin login yet.</div>
      ) : (
        <div className="tst-grid">
          {shownTeam.map((a) => {
            const m = memberOf.get(String(a.teamMemberId));
            const perms = a.effectivePermissions || [];
            const count = (a.sellerScope || []).length;
            const memberOff = m && !m.active;
            return (
              <article key={a._id} className={`tst-card${a.active ? '' : ' is-off'}`}>
                <div className="tst-top">
                  <Avatar name={a.name} size={38} />
                  <div className="tst-who">
                    <b>{a.name.replace(/\s*·\s*Team$/, '')}</b>
                    <small>Login: {(a.teamLogins || []).join(' / ') || '—'}</small>
                  </div>
                  <div className="tst-status" title={a.active ? 'Switch off' : 'Switch on'}>
                    <Toggle small on={a.active} onChange={() => toggle(a)} />
                  </div>
                </div>
                <div className="tst-tags">
                  <span className="tst-tag">{meta?.roleLabels?.[a.role] || a.role}</span>
                  {perms.map((p) => (
                    <span key={p} className="tst-tag soft">
                      {SCOPABLE.find((s) => s.key === p)?.label || p}
                    </span>
                  ))}
                  {!a.active && <span className="tst-tag warn">Off{memberOff ? ' (team portal account off)' : ' / waiting approval'}</span>}
                </div>
                <div className="tst-stores">
                  <span>
                    <b>{count}</b> store{count === 1 ? '' : 's'} assigned
                  </span>
                  {sellers && count > 0 && (
                    <small>
                      {(a.sellerScope || [])
                        .slice(0, 4)
                        .map((id) => storeName.get(String(id)) || 'Removed store')
                        .join(', ')}
                      {count > 4 ? ` +${count - 4}` : ''}
                    </small>
                  )}
                </div>
                <small className="tst-last">Last login: {ago(a.lastLoginAt)}</small>
                <div className="tst-actions">
                  <button
                    type="button"
                    className="tst-btn primary"
                    onClick={() => {
                      loadSellers();
                      setStores({ admin: a, sellerIds: (a.sellerScope || []).map(String) });
                    }}
                  >
                    <Ic name="users" size={14} /> Stores
                  </button>
                  <button type="button" className="tst-btn" onClick={() => setAccess({ admin: a, role: a.role, permissions: (a.effectivePermissions || []).filter((p) => SCOPABLE.some((s) => s.key === p)) })}>
                    <Ic name="shield" size={14} /> Access
                  </button>
                  <button type="button" className="tst-btn danger" onClick={() => remove(a)}>
                    <Ic name="trash" size={14} /> Remove
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ── new team login ── */}
      {add && (
        <Modal title="Give a team member access" onClose={() => setAdd(null)} wide>
          <div className="tsf">
            <label className="tsf-label">1. Team member</label>
            {addMember ? (
              <div className="tsf-chosen">
                <Avatar name={addMember.name} size={34} />
                <span>
                  <b>{addMember.name}</b>
                  <small>
                    Logs in with: {[addMember.username, addMember.email].filter(Boolean).join(' / ')} · {addMember.teamSellers} store{addMember.teamSellers === 1 ? '' : 's'} on the team portal
                  </small>
                </span>
                <button type="button" className="tsp-btn" onClick={() => setAdd((x) => ({ ...x, memberId: '', sellerIds: [] }))}>
                  Change
                </button>
              </div>
            ) : (
              <div className="tsf-members">
                <label className="tsp-search">
                  <Ic name="search" size={14} />
                  <input type="search" value={add.q} onChange={(e) => setAdd((x) => ({ ...x, q: e.target.value }))} placeholder="Name, username or email" autoFocus />
                </label>
                <ul>
                  {!members && <li className="tsp-empty">Loading team members…</li>}
                  {members && addFree.length === 0 && <li className="tsp-empty">{free.length ? 'Nobody matches.' : 'Every active team member already has a login.'}</li>}
                  {addFree.slice(0, 100).map((m) => (
                    <li key={m.id}>
                      <button type="button" onClick={() => setAdd((x) => ({ ...x, memberId: m.id }))}>
                        <Avatar name={m.name} size={30} />
                        <span>
                          <b>{m.name}</b>
                          <small>
                            @{m.username}
                            {m.email ? ` · ${m.email}` : ''} · {m.teamSellers} store{m.teamSellers === 1 ? '' : 's'}
                          </small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {addMember && (
              <>
                <label className="tsf-label">2. Access</label>
                <AccessFields meta={meta} role={add.role} permissions={add.permissions} onChange={(v) => setAdd((x) => ({ ...x, ...v }))} />
                <label className="tsf-label">3. His stores</label>
                {sellersErr ? (
                  <div className="alert-error">{sellersErr}</div>
                ) : (
                  <StorePicker sellers={sellers} value={add.sellerIds} memberId={add.memberId} onChange={(ids) => setAdd((x) => ({ ...x, sellerIds: ids }))} />
                )}
              </>
            )}
          </div>
          <div className="modal-bottom-actions tsf-foot">
            <small className="muted-sm">A new login needs the other finance partner&apos;s approval (team portal → Finance) before it works.</small>
            <button type="button" className="btn-cancel" onClick={() => setAdd(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={busy || !addMember || !add.permissions.length} onClick={create}>
              {busy ? 'Saving…' : `Give access${add.sellerIds.length ? ` · ${add.sellerIds.length} store${add.sellerIds.length === 1 ? '' : 's'}` : ''}`}
            </button>
          </div>
        </Modal>
      )}

      {/* ── his stores ── */}
      {stores && (
        <Modal title={`Stores of ${stores.admin.name.replace(/\s*·\s*Team$/, '')}`} onClose={() => setStores(null)} wide>
          <div className="tsf">
            <p className="muted-sm" style={{ margin: 0 }}>He sees only the ticked stores. Saved at once; his open panel follows within seconds.</p>
            {sellersErr ? (
              <div className="alert-error">{sellersErr}</div>
            ) : (
              <StorePicker sellers={sellers} value={stores.sellerIds} memberId={String(stores.admin.teamMemberId)} onChange={(ids) => setStores((x) => ({ ...x, sellerIds: ids }))} />
            )}
          </div>
          <div className="modal-bottom-actions tsf-foot">
            <button type="button" className="btn-cancel" onClick={() => setStores(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={busy || !!sellersErr} onClick={saveStores}>
              {busy ? 'Saving…' : `Save · ${stores.sellerIds.length} store${stores.sellerIds.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </Modal>
      )}

      {/* ── role / permissions ── */}
      {access && (
        <Modal title={`Access of ${access.admin.name.replace(/\s*·\s*Team$/, '')}`} onClose={() => setAccess(null)}>
          <div className="tsf">
            <AccessFields meta={meta} role={access.role} permissions={access.permissions} onChange={(v) => setAccess((x) => ({ ...x, ...v }))} />
          </div>
          <div className="modal-bottom-actions tsf-foot">
            <small className="muted-sm">A change of role or permissions needs the other finance partner&apos;s approval.</small>
            <button type="button" className="btn-cancel" onClick={() => setAccess(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={busy || !access.permissions.length} onClick={saveAccess}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
