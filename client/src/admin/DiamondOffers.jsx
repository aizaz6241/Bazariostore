import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Ic from '../components/Icons.jsx';
import { Hero } from './insights.jsx';

/**
 * 💎 Diamond offers — discounts with a real deadline that make the upgrade attractive:
 *   reward for good work (automatic), milestones (once each), festival calendar (India).
 * A seller always sees ONE offer: their own reward first, a festival when they have none.
 * The price is locked on the seller's request; the upgrade form uses it. Finance is unchanged.
 * Layout: one tab per offer type; each tab has a plain-language summary, the settings,
 * and on the right a live preview of what the seller sees plus that type's results.
 */
const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const priceOf = (d, regular) => {
  const v = Number(d.discountValue) || 0;
  const off = d.discountType === 'percent' ? (regular * v) / 100 : v;
  return Math.max(1, Math.min(regular, Math.round((regular - off) * 100) / 100));
};
const offLabel = (d) => (d.discountType === 'percent' ? `${Number(d.discountValue) || 0}% off` : `${money(d.discountValue)} off`);
const duration = (hours) => {
  const h = Number(hours) || 0;
  if (h >= 24 && h % 24 === 0) return `${h / 24} ${h === 24 ? 'day' : 'days'}`;
  return `${h} ${h === 1 ? 'hour' : 'hours'}`;
};
const todayIndia = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const festState = (f) => {
  if (!f.start) return { tone: 'warn', label: 'Needs dates' };
  if (!f.enabled) return { tone: 'idle', label: 'Off' };
  const t = todayIndia();
  if (t < f.start) return { tone: 'soon', label: 'Scheduled' };
  if (t > (f.end || f.start)) return { tone: 'idle', label: 'Ended' };
  return { tone: 'live', label: 'Live now' };
};
const fmtDay = (s, year = true) =>
  s ? new Date(`${s}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) }) : '';
const fmtRange = (a, b) => {
  if (!a) return '';
  if (!b || b === a) return fmtDay(a);
  return a.slice(0, 4) === b.slice(0, 4) ? `${fmtDay(a, false)} – ${fmtDay(b)}` : `${fmtDay(a)} – ${fmtDay(b)}`;
};

function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className={`dox-toggle ${disabled ? 'is-disabled' : ''}`} title={disabled ? 'Set the dates first' : undefined}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span aria-hidden="true" />
    </label>
  );
}

/** a number box with its unit inside the box */
function Num({ value, onChange, min, max, unit, label }) {
  return (
    <span className="dox-in">
      <input type="number" min={min} max={max} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      {unit && <em>{unit}</em>}
    </span>
  );
}

function Discount({ value, onChange, label = 'Discount' }) {
  const pct = value.discountType === 'percent';
  return (
    <span className="dox-disc">
      <span className="dox-seg" role="group" aria-label={`${label} type`}>
        <button type="button" className={!pct ? 'on' : ''} aria-pressed={!pct} onClick={() => onChange({ ...value, discountType: 'amount' })}>$</button>
        <button type="button" className={pct ? 'on' : ''} aria-pressed={pct} onClick={() => onChange({ ...value, discountType: 'percent' })}>%</button>
      </span>
      <span className="dox-in">
        <input type="number" min="1" max={pct ? 90 : undefined} value={value.discountValue} onChange={(e) => onChange({ ...value, discountValue: e.target.value })} aria-label={label} />
        <em>off</em>
      </span>
    </span>
  );
}

function Field({ label, help, children, wide }) {
  return (
    <div className={`dox-field ${wide ? 'is-wide' : ''}`}>
      <span className="dox-field-label">{label}</span>
      {children}
      {help && <span className="dox-field-help">{help}</span>}
    </div>
  );
}

function PanelHead({ title, help, children }) {
  return (
    <header className="dox-panel-head">
      <div>
        <h2>{title}</h2>
        {help && <p>{help}</p>}
      </div>
      {children}
    </header>
  );
}

/** the offer card exactly as a seller sees it */
function Voucher({ tag, title, price, regular, foot }) {
  return (
    <div className="dox-voucher" aria-hidden="true">
      <div className="dox-voucher-main">
        <span className="dox-voucher-tag">{tag}</span>
        <b>{title}</b>
      </div>
      <div className="dox-voucher-stub">
        <s>{money(regular)}</s>
        <strong>{money(price)}</strong>
        <span>{foot}</span>
      </div>
    </div>
  );
}

const TABS = [
  { id: 'earned', label: 'Reward', icon: 'star' },
  { id: 'milestone', label: 'Milestones', icon: 'trend' },
  { id: 'festival', label: 'Festivals', icon: 'gift' },
  { id: 'lock', label: 'Price lock', icon: 'lock' },
];

export default function DiamondOffers() {
  const [s, setS] = useState(null);
  const [regular, setRegular] = useState(1500);
  const [results, setResults] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState('earned');
  const [open, setOpen] = useState(() => new Set()); // festival rows being edited

  const load = async () => {
    try {
      const [a, r] = await Promise.all([api('/sellers/tier/offers/settings'), api('/sellers/tier/offers/results').catch(() => null)]);
      setS(a.settings);
      setRegular(a.regular || 1500);
      setResults(r);
      setDirty(false);
      setMsg(null);
      setOpen(new Set());
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
  };
  useEffect(() => {
    load();
  }, []);

  const set = (patch) => {
    setS((v) => ({ ...v, ...patch }));
    setDirty(true);
    setMsg(null);
  };
  const setEarned = (patch) => set({ earned: { ...s.earned, ...patch } });
  const setMilestone = (i, patch) => set({ milestones: s.milestones.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const setFestival = (i, patch) => set({ festivals: s.festivals.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const toggleOpen = (key, on) =>
    setOpen((o) => {
      const n = new Set(o);
      if (on ?? !n.has(key)) n.add(key);
      else n.delete(key);
      return n;
    });

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const r = await api('/sellers/tier/offers/settings', { method: 'PUT', body: { settings: s } });
      setS(r.settings);
      setDirty(false);
      setMsg({ ok: true, text: 'Saved. Stores are checked again within 30 minutes.' });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const totals = useMemo(() => {
    if (!results) return null;
    return ['earned', 'milestone', 'festival'].reduce(
      (t, x) => ({ given: t.given + (results[x]?.given || 0), claimed: t.claimed + (results[x]?.claimed || 0), upgraded: t.upgraded + (results[x]?.upgraded || 0) }),
      { given: 0, claimed: 0, upgraded: 0 }
    );
  }, [results]);
  const liveFest = useMemo(() => (s ? s.festivals.find((f) => festState(f).tone === 'live') : null), [s]);
  const nextFest = useMemo(() => {
    if (!s) return null;
    return liveFest || [...s.festivals].filter((f) => festState(f).tone === 'soon').sort((a, b) => a.start.localeCompare(b.start))[0] || null;
  }, [s, liveFest]);

  if (!s) {
    return (
      <div className="ins-page dox">
        <Hero icon="sparkle" tone="brand" title="Diamond offers" subtitle="Loading the offer settings…" />
        {msg && !msg.ok && <div className="dox-msg err">{msg.text}</div>}
      </div>
    );
  }

  const e = s.earned;
  const earnedPrice = priceOf(e, regular);
  const activeMilestones = s.milestones.filter((m) => m.enabled);
  const firstMilestone = [...activeMilestones].sort((a, b) => Number(a.orders) - Number(b.orders))[0];
  const festOn = s.festivals.filter((f) => f.enabled && f.start).length;
  const festMissing = s.festivals.filter((f) => !f.start).length;
  const counts = { earned: e.enabled ? 'On' : 'Off', milestone: activeMilestones.length, festival: festOn, lock: `${s.lockDays}d` };
  const stats = tab === 'lock' ? totals : results?.[tab];
  const rate = (x) => (x && x.given ? Math.round((x.upgraded / x.given) * 100) : 0);

  return (
    <div className="ins-page dox">
      <Hero
        icon="sparkle"
        tone="brand"
        title="Diamond offers"
        subtitle={`Time-limited discounts on the ${money(regular)} Diamond upgrade. Each seller sees one offer at a time.`}
        actions={
          <>
            <button type="button" className="ins-btn" onClick={load} disabled={saving}>
              <Ic name="refresh" size={14} /> Reload
            </button>
            <button type="button" className="ins-btn ins-btn-primary" onClick={save} disabled={saving || !dirty}>
              {saving ? 'Saving…' : dirty ? 'Save changes' : 'All saved'}
            </button>
          </>
        }
      />

      {msg && <div className={`dox-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}

      {/* master switch + headline numbers */}
      <section className={`dox-bar ${s.enabled ? '' : 'is-off'}`}>
        <div className="dox-bar-status">
          <Toggle checked={s.enabled} onChange={(v) => set({ enabled: v })} label="Diamond offers on or off" />
          <div>
            <b>{s.enabled ? 'Offers are running' : 'Offers are paused'}</b>
            <span>
              {s.enabled
                ? liveFest
                  ? `${liveFest.emoji} ${liveFest.name} is live until ${fmtDay(liveFest.end || liveFest.start)}`
                  : 'Rewards and milestones are given automatically'
                : 'No seller sees an offer until you turn this on'}
            </span>
          </div>
        </div>
        {totals && (
          <dl className="dox-kpis" aria-label="Last 90 days">
            <div><dt>Offers given</dt><dd>{totals.given}</dd></div>
            <div><dt>Upgrade requests</dt><dd>{totals.claimed}</dd></div>
            <div><dt>Became Diamond</dt><dd className="t">{totals.upgraded}</dd></div>
            <div><dt>Conversion</dt><dd>{rate(totals)}%</dd></div>
          </dl>
        )}
      </section>

      <nav className="dox-tabs" role="tablist" aria-label="Offer types">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <Ic name={t.icon} size={15} />
            {t.label}
            <span className="dox-count">{counts[t.id]}</span>
          </button>
        ))}
      </nav>

      <div className={`dox-layout ${s.enabled ? '' : 'is-off'}`}>
        <div className="dox-main" role="tabpanel">
          {tab === 'earned' && (
            <section className="dox-panel">
              <PanelHead title="Reward for good work" help="Automatic. The seller gets a popup, a notification and an email.">
                <Toggle checked={e.enabled} onChange={(v) => setEarned({ enabled: v })} label="Reward on or off" />
              </PanelHead>
              <p className={`dox-sum ${e.enabled ? '' : 'is-off'}`}>
                {e.enabled ? (
                  <>
                    A store with health <b>{e.healthMin}+</b> for <b>{e.days} days</b> in a row and <b>{e.orders} confirmed orders</b> gets{' '}
                    <b>{offLabel(e)}</b> — Diamond for <b>{money(earnedPrice)}</b> — for <b>{duration(e.hours)}</b>. It can earn the next one{' '}
                    <b>{e.cooldownDays} days</b> later.
                  </>
                ) : (
                  'The reward is off. No store earns it until you turn it on.'
                )}
              </p>
              <div className="dox-group">
                <h3><span>1</span> When a store earns it</h3>
                <div className="dox-fields">
                  <Field label="Account health" help="Lowest score that counts">
                    <Num value={e.healthMin} min={50} max={100} unit="/ 100" label="Account health" onChange={(v) => setEarned({ healthMin: v })} />
                  </Field>
                  <Field label="Days in a row" help="No penalty or freeze">
                    <Num value={e.days} min={3} max={60} unit="days" label="Days in a row" onChange={(v) => setEarned({ days: v })} />
                  </Field>
                  <Field label="Confirmed orders" help="Within those days">
                    <Num value={e.orders} min={1} unit="orders" label="Confirmed orders" onChange={(v) => setEarned({ orders: v })} />
                  </Field>
                </div>
              </div>
              <div className="dox-group">
                <h3><span>2</span> What the store gets</h3>
                <div className="dox-fields">
                  <Field label="Discount" help={<>Pays <b>{money(earnedPrice)}</b> instead of {money(regular)}</>}>
                    <Discount value={e} onChange={(v) => setEarned(v)} />
                  </Field>
                  <Field label="Offer lasts" help="A real countdown">
                    <Num value={e.hours} min={1} unit="hours" label="Offer lasts" onChange={(v) => setEarned({ hours: v })} />
                  </Field>
                  <Field label="Next reward after" help="After the last one ended">
                    <Num value={e.cooldownDays} min={1} max={90} unit="days" label="Next reward after" onChange={(v) => setEarned({ cooldownDays: v })} />
                  </Field>
                </div>
              </div>
            </section>
          )}

          {tab === 'milestone' && (
            <section className="dox-panel">
              <PanelHead title="Milestones" help="A one-time reward when a store reaches an order count. A store that passed several gets only the highest.">
                <button type="button" className="ins-btn ins-btn-sm" onClick={() => set({ milestones: [...s.milestones, { key: `m${Date.now() % 100000}`, enabled: true, orders: 200, discountType: 'amount', discountValue: 500, hours: 72 }] })}>
                  <Ic name="plus" size={13} /> Add milestone
                </button>
              </PanelHead>
              {s.milestones.length ? (
                <div className="dox-table" role="table" aria-label="Milestones">
                  <div className="dox-tr dox-th" role="row">
                    <span role="columnheader">On</span>
                    <span role="columnheader">Orders reached</span>
                    <span role="columnheader">Discount</span>
                    <span role="columnheader">Seller pays</span>
                    <span role="columnheader">Offer lasts</span>
                    <span role="columnheader"><span className="sr-only">Remove</span></span>
                  </div>
                  {s.milestones.map((m, i) => (
                    <div className={`dox-tr ${m.enabled ? '' : 'is-off'}`} role="row" key={m.key}>
                      <span role="cell" className="dox-td-on"><Toggle checked={m.enabled} onChange={(v) => setMilestone(i, { enabled: v })} label={`Milestone ${m.orders} orders on or off`} /></span>
                      <span role="cell" data-l="Orders reached"><Num value={m.orders} min={1} unit="orders" label="Orders reached" onChange={(v) => setMilestone(i, { orders: v })} /></span>
                      <span role="cell" data-l="Discount"><Discount value={m} onChange={(v) => setMilestone(i, v)} /></span>
                      <span role="cell" data-l="Seller pays" className="dox-pay"><s>{money(regular)}</s> {money(priceOf(m, regular))}</span>
                      <span role="cell" data-l="Offer lasts"><Num value={m.hours} min={1} unit="hours" label="Offer lasts" onChange={(v) => setMilestone(i, { hours: v })} /></span>
                      <span role="cell" className="dox-td-x">
                        <button type="button" className="dox-x" title="Remove milestone" aria-label={`Remove ${m.orders} orders milestone`} onClick={() => set({ milestones: s.milestones.filter((_, j) => j !== i) })}><Ic name="trash" size={15} /></button>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="dox-empty">No milestones yet. Add one to reward stores that reach a number of orders.</p>
              )}
            </section>
          )}

          {tab === 'festival' && (
            <section className="dox-panel">
              <PanelHead title="Festival calendar" help="Every Basic store sees a banner and gets one notification (no email). Dates are India time.">
                <button
                  type="button"
                  className="ins-btn ins-btn-sm"
                  onClick={() => {
                    const key = `f${Date.now() % 100000}`;
                    set({ festivals: [...s.festivals, { key, name: 'Special day', emoji: '🎉', enabled: false, start: '', end: '', discountType: 'percent', discountValue: 20 }] });
                    toggleOpen(key, true);
                  }}
                >
                  <Ic name="plus" size={13} /> Add a day
                </button>
              </PanelHead>
              {festMissing > 0 && (
                <p className="dox-note">
                  <Ic name="clock" size={14} /> {festMissing} {festMissing === 1 ? 'day needs' : 'days need'} dates. Diwali, Holi and Navratri move every year — set them before the day.
                </p>
              )}
              <div className="dox-flist">
                {s.festivals.map((f, i) => {
                  const st = festState(f);
                  const isOpen = open.has(f.key);
                  return (
                    <div className={`dox-frow ${isOpen ? 'is-open' : ''} is-${st.tone}`} key={f.key}>
                      <div className="dox-frow-sum">
                        <Toggle checked={f.enabled} disabled={!f.start} onChange={(v) => setFestival(i, { enabled: v })} label={`${f.name} on or off`} />
                        <span className="dox-femoji" aria-hidden="true">{f.emoji}</span>
                        <span className="dox-fname">
                          <b>{f.name || 'Untitled day'}</b>
                          <span>{f.start ? fmtRange(f.start, f.end) : 'No dates yet'}</span>
                        </span>
                        <span className="dox-fdeal">
                          <b>{offLabel(f)}</b>
                          <span>{money(priceOf(f, regular))}</span>
                        </span>
                        <span className={`dox-pill ${st.tone}`}>{st.label}</span>
                        <button type="button" className="dox-edit" aria-expanded={isOpen} onClick={() => toggleOpen(f.key)}>
                          {isOpen ? 'Done' : f.start ? 'Edit' : 'Set dates'}
                        </button>
                      </div>
                      {isOpen && (
                        <div className="dox-frow-edit">
                          <Field label="Name">
                            <span className="dox-fname-in">
                              <input className="dox-emoji" value={f.emoji} onChange={(ev) => setFestival(i, { emoji: ev.target.value })} aria-label="Emoji" />
                              <input value={f.name} onChange={(ev) => setFestival(i, { name: ev.target.value })} aria-label="Festival name" />
                            </span>
                          </Field>
                          <Field label="Dates (India time)">
                            <span className="dox-dates">
                              <input type="date" value={f.start} onChange={(ev) => setFestival(i, { start: ev.target.value, end: f.end && f.end >= ev.target.value ? f.end : ev.target.value })} aria-label="First day" />
                              <em>to</em>
                              <input type="date" value={f.end} min={f.start || undefined} onChange={(ev) => setFestival(i, { end: ev.target.value })} aria-label="Last day" />
                            </span>
                          </Field>
                          <Field label="Discount" help={<>Pays <b>{money(priceOf(f, regular))}</b> instead of {money(regular)}</>}>
                            <Discount value={f} onChange={(v) => setFestival(i, v)} />
                          </Field>
                          <button
                            type="button"
                            className="dox-remove"
                            onClick={() => {
                              set({ festivals: s.festivals.filter((_, j) => j !== i) });
                              toggleOpen(f.key, false);
                            }}
                          >
                            <Ic name="trash" size={14} /> Remove this day
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {tab === 'lock' && (
            <section className="dox-panel">
              <PanelHead title="Price lock" help="So a seller never loses the offer while finishing the upgrade." />
              <ol className="dox-steps">
                <li><span>1</span><div><b>Seller sees an offer</b><p>The countdown is running.</p></div></li>
                <li><span>2</span><div><b>Sends the upgrade request</b><p>The offer price is locked now.</p></div></li>
                <li><span>3</span><div><b>Has {s.lockDays} {Number(s.lockDays) === 1 ? 'day' : 'days'} to finish</b><p>At the locked price, even after the countdown ends. Then the normal price.</p></div></li>
              </ol>
              <div className="dox-group">
                <div className="dox-fields">
                  <Field label="Keep the locked price for" help={`After that the upgrade costs ${money(regular)} again`}>
                    <Num value={s.lockDays} min={1} max={30} unit="days" label="Keep the locked price for" onChange={(v) => set({ lockDays: v })} />
                  </Field>
                </div>
              </div>
            </section>
          )}
        </div>

        <aside className="dox-aside" aria-label="Seller preview and results">
          <div className="dox-card">
            <p className="dox-card-title">What the seller sees</p>
            {tab === 'earned' &&
              (e.enabled ? (
                <>
                  <Voucher tag="🏆 Your reward" title={`You earned ${money(regular - earnedPrice)} off Diamond`} price={earnedPrice} regular={regular} foot={`${duration(e.hours)} to use it`} />
                  <p className="dox-card-note">Shown as a popup, in notifications and by email.</p>
                </>
              ) : (
                <p className="dox-card-empty">Nothing — the reward is off.</p>
              ))}
            {tab === 'milestone' &&
              (firstMilestone ? (
                <>
                  <Voucher tag="🏆 Milestone reward" title={`${firstMilestone.orders} orders milestone`} price={priceOf(firstMilestone, regular)} regular={regular} foot={`${duration(firstMilestone.hours)} to use it`} />
                  <p className="dox-card-note">Example: the first milestone a store reaches.</p>
                </>
              ) : (
                <p className="dox-card-empty">No milestone is on.</p>
              ))}
            {tab === 'festival' &&
              (nextFest ? (
                <>
                  <Voucher tag={`${nextFest.emoji} ${nextFest.name} special`} title={`${offLabel(nextFest)} Diamond`} price={priceOf(nextFest, regular)} regular={regular} foot={`Ends ${fmtDay(nextFest.end || nextFest.start, false)}`} />
                  <p className="dox-card-note">{festState(nextFest).tone === 'live' ? 'Live now for every Basic store.' : `Next up — starts ${fmtDay(nextFest.start)}.`}</p>
                </>
              ) : (
                <p className="dox-card-empty">No festival is scheduled. Turn one on with dates.</p>
              ))}
            {tab === 'lock' && (
              <>
                <div className="dox-lockcard" aria-hidden="true">
                  <Ic name="lock" size={16} />
                  <div>
                    <b>Your price is locked: {money(earnedPrice)}</b>
                    <span>Kept for {s.lockDays} days while you finish the upgrade</span>
                  </div>
                </div>
                <p className="dox-card-note">Shown on the Diamond page after the request.</p>
              </>
            )}
          </div>

          {stats && (
            <div className="dox-card">
              <p className="dox-card-title">
                Last 90 days <span>· {tab === 'lock' ? 'all offers' : TABS.find((t) => t.id === tab).label.toLowerCase()}</span>
              </p>
              <dl className="dox-stats">
                <div><dt>Offers given</dt><dd>{stats.given || 0}</dd></div>
                <div><dt>Upgrade requests</dt><dd>{stats.claimed || 0}</dd></div>
                <div><dt>Became Diamond</dt><dd className="t">{stats.upgraded || 0}</dd></div>
              </dl>
              <div className="dox-meter" aria-label={`${rate(stats)}% became Diamond`}>
                <span style={{ width: `${Math.min(100, rate(stats))}%` }} />
              </div>
              <p className="dox-card-note">{rate(stats)}% of offers given ended in a Diamond upgrade.</p>
            </div>
          )}
        </aside>
      </div>

      {dirty && (
        <div className="dox-savebar" role="status">
          <span>You have changes that are not saved yet.</span>
          <div>
            <button type="button" className="dox-discard" onClick={load} disabled={saving}>Discard</button>
            <button type="button" className="ins-btn ins-btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
