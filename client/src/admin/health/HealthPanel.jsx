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
  policy: { label: 'Policy violation', min: -40, max: -5, def: -15 },
  order_issue: { label: 'Order cancelled / refunded because of the store', min: -20, max: -2, def: -5 },
  manual: { label: 'Account review (up or down)', min: -50, max: 50, def: -5 },
};
// quick "Adjust health" (admin's own increase / decrease)
const ADJ_STEPS = [5, 10, 15, 20];
const ADJ_EMPTY = { mode: 'by', dir: 1, amount: 10, target: '', days: 14, note: '', notify: true };
const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
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
  const [adj, setAdj] = useState(null);
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

  const submitAdjust = async (e) => {
    e.preventDefault();
    const note = adj.note.trim();
    if (!note) {
      setErr('Write the reason (only admins see it).');
      return;
    }
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      if (adj.mode === 'to') {
        const res = await api(`/sellers/${sellerId}/health`, {
          method: 'POST',
          body: { score: clamp100(adj.target), reason: note, days: Number(adj.days) || 14, notifySeller: adj.notify },
        });
        setMsg(res.message || 'Saved.');
      } else {
        const points = adj.dir * Math.max(1, Math.min(50, Math.round(Number(adj.amount) || 0)));
        const res = await api(`/sellers/${sellerId}/health/entries`, {
          method: 'POST',
          body: {
            category: 'manual',
            points,
            days: Number(adj.days) || 14,
            title: points > 0 ? 'Account review — score improved' : 'Account review',
            detail: '',
            note,
            notifySeller: adj.notify,
          },
        });
        setMsg(`Saved. Score is now ${res.score}/100.`);
      }
      setAdj(null);
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
          <button
            type="button"
            className="hp-btn primary"
            onClick={() => {
              setForm(null);
              setAdj(adj ? null : { ...ADJ_EMPTY, target: String(data.score) });
            }}
          >
            {adj ? 'Close' : '± Adjust health'}
          </button>
          <button
            type="button"
            className="hp-btn"
            onClick={() => {
              setAdj(null);
              setForm(form ? null : { category: 'policy', points: CATS.policy.def, days: 21, title: '', detail: '', note: '', notify: true });
            }}
          >
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

      {adj && (() => {
        const delta = adj.mode === 'to' ? clamp100(adj.target) - data.score : adj.dir * Math.max(0, Math.min(50, Math.round(Number(adj.amount) || 0)));
        const after = adj.mode === 'to' ? clamp100(adj.target) : clamp100(data.score + delta);
        const afterBand = bandOf(after);
        return (
          <form className="hp-adj" onSubmit={submitAdjust}>
            <div className="hp-adj-top">
              <div className="hp-seg" role="tablist" aria-label="How to change the score">
                <button type="button" className={adj.mode === 'by' && adj.dir > 0 ? 'on up' : ''} onClick={() => setAdj((a) => ({ ...a, mode: 'by', dir: 1 }))}>
                  ▲ Increase
                </button>
                <button type="button" className={adj.mode === 'by' && adj.dir < 0 ? 'on down' : ''} onClick={() => setAdj((a) => ({ ...a, mode: 'by', dir: -1 }))}>
                  ▼ Decrease
                </button>
                <button type="button" className={adj.mode === 'to' ? 'on' : ''} onClick={() => setAdj((a) => ({ ...a, mode: 'to' }))}>
                  Set exact score
                </button>
              </div>
              <div className="hp-adj-preview" aria-live="polite">
                <span>{data.score}</span>
                <i>→</i>
                <b style={{ color: afterBand.color }}>{after}</b>
                <small className={`hp-band tone-${afterBand.tone}`}>{afterBand.label}</small>
              </div>
            </div>

            {adj.mode === 'by' ? (
              <div className="hp-adj-row">
                <span className="hp-adj-lbl">Points</span>
                <div className="hp-chips">
                  {ADJ_STEPS.map((n) => (
                    <button key={n} type="button" className={Number(adj.amount) === n ? 'on' : ''} onClick={() => setAdj((a) => ({ ...a, amount: n }))}>
                      {adj.dir > 0 ? '+' : '−'}{n}
                    </button>
                  ))}
                  <input type="number" min="1" max="50" value={adj.amount} onChange={(e) => setAdj((a) => ({ ...a, amount: e.target.value }))} aria-label="Custom points" />
                </div>
              </div>
            ) : (
              <div className="hp-adj-row">
                <span className="hp-adj-lbl">New score</span>
                <div className="hp-chips">
                  <input type="number" min="0" max="100" value={adj.target} onChange={(e) => setAdj((a) => ({ ...a, target: e.target.value }))} aria-label="New score (0–100)" />
                  <small className="hp-faint">0 – 100</small>
                </div>
              </div>
            )}

            <div className="hp-adj-row">
              <span className="hp-adj-lbl">Lasts</span>
              <div className="hp-chips">
                {[7, 14, 30].map((d) => (
                  <button key={d} type="button" className={Number(adj.days) === d ? 'on' : ''} onClick={() => setAdj((a) => ({ ...a, days: d }))}>
                    {d} days
                  </button>
                ))}
                <input type="number" min="1" max="90" value={adj.days} onChange={(e) => setAdj((a) => ({ ...a, days: e.target.value }))} aria-label="Days" />
              </div>
            </div>

            <label className="hp-adj-note">
              Reason (only admins see it) *
              <textarea rows={2} maxLength={500} value={adj.note} onChange={(e) => setAdj((a) => ({ ...a, note: e.target.value }))} placeholder={delta >= 0 ? 'e.g. Delay was caused by courier, not the store' : 'e.g. Repeated late replies to customers'} required />
            </label>

            <div className="hp-adj-foot">
              <label className="hp-check">
                <input type="checkbox" checked={adj.notify} onChange={(e) => setAdj((a) => ({ ...a, notify: e.target.checked }))} /> Notify the store
              </label>
              <small className="hp-faint">The change ends by itself after {Number(adj.days) || 14} days. The store sees it as “{MONITOR_NAME}”.</small>
              <button type="submit" className={`hp-btn primary${delta < 0 ? ' danger' : ''}`} disabled={busy || !delta}>
                {busy ? 'Saving…' : !delta ? 'No change' : `${delta > 0 ? 'Increase' : 'Decrease'} by ${Math.abs(delta)} → ${after}/100`}
              </button>
            </div>
          </form>
        );
      })()}

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
                <td>Daily limit for automatic penalties (points in 24 hours) — automatic rules also never go below 0</td>
                <td colSpan={2}>
                  <input type="number" value={rules.settings.dailyPenaltyCap ?? 15} disabled={!rules.canEdit} onChange={(e) => setRules((x) => ({ ...x, settings: { ...x.settings, dailyPenaltyCap: Number(e.target.value) } }))} />
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
