import { useCallback, useEffect, useState } from 'react';
import { api, fmtDate } from '../../api.js';
import { bandOf, MONITOR_NAME } from '../../utils/healthBands.js';

/**
 * Admin view of a store's account health (account monitoring ledger):
 * every entry with who really added it (system / admin + reason), remove an entry after review,
 * add an entry (policy / order issue / account review), and — Super Admin — the rules.
 * The store only ever sees "Bazario Account Monitoring".
 */
const CATS = {
  policy: { label: 'Policy violation', min: -40, max: -10, def: -20 },
  order_issue: { label: 'Order cancelled / refunded because of the store', min: -20, max: -5, def: -10 },
  manual: { label: 'Account review (up or down)', min: -30, max: 20, def: -10 },
};
const pts = (n) => (n > 0 ? `+${n}` : `${n}`);
const left = (d) => {
  const ms = new Date(d).getTime() - Date.now();
  if (ms <= 0) return 'ended';
  const days = Math.ceil(ms / 86400000);
  return `${days}d left`;
};

export default function HealthPanel({ sellerId, onChanged }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null);
  const [rules, setRules] = useState(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [filter, setFilter] = useState('active');

  const load = useCallback(() => {
    api(`/sellers/${sellerId}/health/ledger`)
      .then((d) => {
        setData(d);
        setErr('');
      })
      .catch((e) => setErr(e.message));
  }, [sellerId]);
  useEffect(() => {
    load();
  }, [load]);

  const changed = () => {
    load();
    onChanged?.();
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const res = await api(`/sellers/${sellerId}/health/entries`, {
        method: 'POST',
        body: {
          category: form.category,
          points: Number(form.points),
          days: Number(form.days),
          title: form.title,
          detail: form.detail,
          note: form.note,
          notifySeller: form.notify,
        },
      });
      setMsg(`Saved. Score is now ${res.score}/100.`);
      setForm(null);
      changed();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  const waive = async (line) => {
    const reason = window.prompt(`Remove “${line.title}” (${pts(line.points)})?\n\nWhy? (only admins see this)`);
    if (!reason || !reason.trim()) return;
    setBusy(true);
    setErr('');
    try {
      const res = await api(`/sellers/health/entries/${line.id}/waive`, { method: 'POST', body: { reason: reason.trim() } });
      setMsg(`Entry removed. Score is now ${res.score}/100.`);
      changed();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const openRules = async () => {
    setRulesOpen((v) => !v);
    if (rules) return;
    try {
      const r = await api('/sellers/health/rules');
      setRules({
        canEdit: r.canEdit,
        settings: { ...r.settings },
        rules: Object.fromEntries(
          Object.entries(r.rules)
            .filter(([code]) => !['manual', 'opening'].includes(code))
            .map(([code, v]) => [code, { points: v.points, days: v.days, title: v.title }])
        ),
        updatedBy: r.updatedBy,
        updatedAt: r.updatedAt,
      });
    } catch (e) {
      setErr(e.message);
    }
  };

  const saveRules = async () => {
    setBusy(true);
    setErr('');
    try {
      await api('/sellers/health/rules', { method: 'PUT', body: { rules: rules.rules, settings: rules.settings } });
      setMsg('Rules saved. New entries use them from now on.');
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div className="hp-box hp-muted">{err || 'Loading account health…'}</div>;

  const band = bandOf(data.score);
  const lines = data.lines.filter((l) => (filter === 'all' ? true : filter === 'active' ? l.state === 'active' : l.state !== 'active'));

  return (
    <div className="hp-box">
      <div className="hp-head">
        <div className="hp-score" style={{ '--c': band.color }}>
          <b>{data.score}</b>
          <span>/100</span>
        </div>
        <div className="hp-head-txt">
          <span className={`hp-band tone-${band.tone}`}>{band.label}</span>
          <small>
            {data.nextChangeAt ? `Next entry ends ${fmtDate(data.nextChangeAt)}` : 'No active entries'} · on-time streak {data.onTimeStreak}
          </small>
          <small className="hp-faint">The store sees every entry as “{MONITOR_NAME}”.</small>
        </div>
        <div className="hp-head-btns">
          <button type="button" className="hp-btn primary" onClick={() => setForm(form ? null : { category: 'policy', points: CATS.policy.def, days: 21, title: '', detail: '', note: '', notify: true })}>
            {form ? 'Close' : '+ Add entry'}
          </button>
          <button type="button" className="hp-btn" onClick={openRules}>
            Rules
          </button>
        </div>
      </div>

      {data.perfectBonus?.enabled && (
        <div className={`hp-bonus ${data.perfectBonus.running ? 'on' : ''}`}>
          <span>🏆 Perfect health bonus</span>
          <b>
            {data.perfectBonus.running
              ? `Day ${Math.min(data.perfectBonus.days, Math.floor((Date.now() - new Date(data.perfectBonus.since).getTime()) / 86400000) + 1)} of ${data.perfectBonus.days} · $${data.perfectBonus.amount} on ${fmtDate(data.perfectBonus.endsAt)} · ${data.perfectBonus.ordersInWeek}/${data.perfectBonus.minOrders} orders`
              : 'Paused (score below 100)'}
          </b>
          <small>
            Paid so far: ${Number(data.perfectBonus.totalEarned || 0).toLocaleString('en-US')} ({data.perfectBonus.count})
          </small>
        </div>
      )}

      {data.level && (
        <div className="hp-bonus hp-level">
          <span>
            {data.level.icon} {data.level.label} level
          </span>
          <b>
            {data.level.weeks} perfect week{data.level.weeks === 1 ? '' : 's'} in a row
            {data.level.next ? ` · ${data.level.next.need} more to ${data.level.next.icon} ${data.level.next.label}` : ' · top level'}
          </b>
          <small>
            Best run {data.level.best} · {data.level.total} perfect week{data.level.total === 1 ? '' : 's'} in total
          </small>
        </div>
      )}

      {err && <div className="hp-err">{err}</div>}
      {msg && <div className="hp-ok">{msg}</div>}

      {form && (
        <form className="hp-form" onSubmit={submit}>
          <label className="wide">
            Kind
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value, points: CATS[e.target.value].def }))}
            >
              {Object.entries(CATS).map(([k, c]) => (
                <option key={k} value={k}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Points ({CATS[form.category].min} to {CATS[form.category].max})
            <input type="number" min={CATS[form.category].min} max={CATS[form.category].max} value={form.points} onChange={(e) => setForm((f) => ({ ...f, points: e.target.value }))} required />
          </label>
          <label>
            Ends after (days)
            <input type="number" min="1" max="90" value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))} required />
          </label>
          <label className="wide">
            Title the store sees (optional)
            <input value={form.title} maxLength={160} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={CATS[form.category].label} />
          </label>
          <label className="wide">
            Explanation the store sees (optional)
            <input value={form.detail} maxLength={400} onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))} placeholder="e.g. Order #182 was cancelled because the store did not confirm stock." />
          </label>
          <label className="wide">
            Internal reason (only admins see it) *
            <textarea value={form.note} maxLength={500} rows={2} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} required />
          </label>
          <label className="hp-check wide">
            <input type="checkbox" checked={form.notify} onChange={(e) => setForm((f) => ({ ...f, notify: e.target.checked }))} /> Notify the store
          </label>
          <div className="wide">
            <button type="submit" className="hp-btn primary" disabled={busy}>
              {busy ? 'Saving…' : `Add ${pts(Number(form.points) || 0)} for ${form.days} days`}
            </button>
          </div>
        </form>
      )}

      {rulesOpen && rules && (
        <div className="hp-rules">
          <div className="hp-rules-head">
            <b>Health rules</b>
            <small>{rules.updatedBy ? `Last changed by ${rules.updatedBy}${rules.updatedAt ? ` · ${fmtDate(rules.updatedAt)}` : ''}` : 'Default rules'}</small>
          </div>
          <table>
            <thead>
              <tr>
                <th>Rule</th>
                <th>Points</th>
                <th>Days</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(rules.rules).map(([code, r]) => (
                <tr key={code}>
                  <td>{r.title}</td>
                  <td>
                    <input
                      type="number"
                      value={r.points}
                      disabled={!rules.canEdit}
                      onChange={(e) => setRules((x) => ({ ...x, rules: { ...x.rules, [code]: { ...x.rules[code], points: Number(e.target.value) } } }))}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={r.days}
                      disabled={!rules.canEdit}
                      onChange={(e) => setRules((x) => ({ ...x, rules: { ...x.rules, [code]: { ...x.rules[code], days: Number(e.target.value) } } }))}
                    />
                  </td>
                </tr>
              ))}
              <tr>
                <td>Repeat window (days) — a second missed deadline within it costs more</td>
                <td colSpan={2}>
                  <input type="number" value={rules.settings.repeatWindowDays} disabled={!rules.canEdit} onChange={(e) => setRules((x) => ({ ...x, settings: { ...x.settings, repeatWindowDays: Number(e.target.value) } }))} />
                </td>
              </tr>
              <tr>
                <td>Same-incident window (hours) — extra misses within it cost the “another order” points</td>
                <td colSpan={2}>
                  <input type="number" value={rules.settings.incidentWindowHours} disabled={!rules.canEdit} onChange={(e) => setRules((x) => ({ ...x, settings: { ...x.settings, incidentWindowHours: Number(e.target.value) } }))} />
                </td>
              </tr>
              <tr>
                <td>Most reward points that count at the same time</td>
                <td colSpan={2}>
                  <input type="number" value={rules.settings.bonusCap} disabled={!rules.canEdit} onChange={(e) => setRules((x) => ({ ...x, settings: { ...x.settings, bonusCap: Number(e.target.value) } }))} />
                </td>
              </tr>
              <tr>
                <td>Perfect health bonus — $ per week at 100/100 (0 = off)</td>
                <td colSpan={2}>
                  <input type="number" value={rules.settings.perfectBonusAmount} disabled={!rules.canEdit} onChange={(e) => setRules((x) => ({ ...x, settings: { ...x.settings, perfectBonusAmount: Number(e.target.value) } }))} />
                </td>
              </tr>
              <tr>
                <td>Perfect health bonus — days at 100/100</td>
                <td colSpan={2}>
                  <input type="number" value={rules.settings.perfectBonusDays} disabled={!rules.canEdit} onChange={(e) => setRules((x) => ({ ...x, settings: { ...x.settings, perfectBonusDays: Number(e.target.value) } }))} />
                </td>
              </tr>
              <tr>
                <td>Perfect health bonus — confirmed orders needed in the week</td>
                <td colSpan={2}>
                  <input type="number" value={rules.settings.perfectBonusMinOrders} disabled={!rules.canEdit} onChange={(e) => setRules((x) => ({ ...x, settings: { ...x.settings, perfectBonusMinOrders: Number(e.target.value) } }))} />
                </td>
              </tr>
              <tr>
                <td>On-time streak size (orders)</td>
                <td colSpan={2}>
                  <input type="number" value={rules.settings.streakSize} disabled={!rules.canEdit} onChange={(e) => setRules((x) => ({ ...x, settings: { ...x.settings, streakSize: Number(e.target.value) } }))} />
                </td>
              </tr>
            </tbody>
          </table>
          {rules.canEdit ? (
            <button type="button" className="hp-btn primary" onClick={saveRules} disabled={busy}>
              {busy ? 'Saving…' : 'Save rules'}
            </button>
          ) : (
            <small className="hp-faint">Only the Super Admin can change the rules.</small>
          )}
        </div>
      )}

      <div className="hp-filter">
        {[
          ['active', 'Active'],
          ['past', 'Ended / removed'],
          ['all', 'All'],
        ].map(([k, l]) => (
          <button key={k} type="button" className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
            {l}
          </button>
        ))}
      </div>

      {lines.length === 0 ? (
        <p className="hp-muted">{filter === 'active' ? 'No active entries — the score is 100 unless rewards are pending.' : 'Nothing here.'}</p>
      ) : (
        <ul className="hp-lines">
          {lines.map((l) => (
            <li key={l.id} className={`${l.points < 0 ? 'neg' : 'pos'} ${l.state}`}>
              <span className="hp-pts">{pts(l.points)}</span>
              <div className="hp-line-main">
                <b>{l.title}</b>
                {l.detail && <p>{l.detail}</p>}
                <small>
                  {fmtDate(l.createdAt)} · {l.state === 'active' ? left(l.expiresAt) : l.state}
                  {l.orderNumbers?.length > 0 && ` · #${l.orderNumbers.join(', #')}`} ·{' '}
                  <span className={`hp-src ${l.source}`}>{l.source === 'admin' ? `Admin: ${l.adminName || '—'}` : 'System'}</span>
                </small>
                {l.note && <small className="hp-note">Reason: {l.note}</small>}
                {l.waived && (
                  <small className="hp-note">
                    Removed by {l.waived.by} · {fmtDate(l.waived.at)} — {l.waived.reason}
                  </small>
                )}
              </div>
              {l.state === 'active' && (
                <button type="button" className="hp-btn sm" onClick={() => waive(l)} disabled={busy}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
