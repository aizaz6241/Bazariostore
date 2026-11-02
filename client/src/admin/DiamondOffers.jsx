import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Ic from '../components/Icons.jsx';
import { Hero } from './insights.jsx';

/**
 * 💎 Diamond offers — discounts with a real deadline that make the upgrade attractive:
 *   reward for good work (automatic), milestones (once each), festival calendar (India).
 * A seller always sees ONE offer: their own reward first, a festival when they have none.
 * The price is locked on the seller's request; the upgrade form uses it. Finance is unchanged.
 * Layout: a master ON/OFF switch, then one card per offer type saying in plain words whether it
 * is on and what it gives, with its results; "Change" opens its settings and a seller preview.
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


export default function DiamondOffers() {
  const [s, setS] = useState(null);
  const [regular, setRegular] = useState(1500);
  const [results, setResults] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState(''); // which offer card is open for editing ('' = none)
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
  const rate = (x) => (x && x.given ? Math.round((x.upgraded / x.given) * 100) : 0);
  const paused = !s.enabled;
  const sortedMilestones = [...activeMilestones].sort((a, b) => Number(a.orders) - Number(b.orders));
  const nextIsLive = nextFest && festState(nextFest).tone === 'live';

  // one card per offer type: is it on, what exactly it gives, its results, and its settings
  const TYPES = [
    {
      id: 'earned',
      icon: 'star',
      title: 'Reward for good work',
      who: 'Automatic · one store at a time',
      state: e.enabled ? { tone: 'on', label: 'On' } : { tone: 'off', label: 'Off' },
      rule: e.enabled ? (
        <>
          Health <b>{e.healthMin}+</b> for <b>{e.days} days</b> and <b>{e.orders} confirmed orders</b> → <b>{offLabel(e)}</b> (pays <b>{money(earnedPrice)}</b>) for{' '}
          <b>{duration(e.hours)}</b>. Can be earned again after <b>{e.cooldownDays} days</b>.
        </>
      ) : (
        'Off — no store earns this reward.'
      ),
      results: results?.earned,
    },
    {
      id: 'milestone',
      icon: 'trend',
      title: 'Milestones',
      who: 'Automatic · once per milestone',
      state: activeMilestones.length ? { tone: 'on', label: `${activeMilestones.length} on` } : { tone: 'off', label: 'Off' },
      rule: activeMilestones.length ? (
        <span className="dx2-rule-list">
          {sortedMilestones.map((m) => (
            <span key={m.key}>
              <b>{m.orders} orders</b> → {offLabel(m)} · pays {money(priceOf(m, regular))} · {duration(m.hours)}
            </span>
          ))}
        </span>
      ) : (
        'Off — no milestone is switched on.'
      ),
      results: results?.milestone,
    },
    {
      id: 'festival',
      icon: 'gift',
      title: 'Festival offers',
      who: 'Every Basic store · India dates',
      state: liveFest ? { tone: 'live', label: 'Live now' } : festOn ? { tone: 'on', label: 'Scheduled' } : { tone: 'off', label: 'Off' },
      rule: nextFest ? (
        <>
          {nextIsLive ? 'Live now: ' : 'Next: '}
          <b>
            {nextFest.emoji} {nextFest.name}
          </b>{' '}
          · {offLabel(nextFest)} (pays <b>{money(priceOf(nextFest, regular))}</b>) · {fmtRange(nextFest.start, nextFest.end)}
          {festOn > 1 && <> · {festOn} days switched on in total</>}
        </>
      ) : (
        'No festival is switched on with dates.'
      ),
      warn: festMissing > 0 ? `${festMissing} ${festMissing === 1 ? 'day needs' : 'days need'} dates` : '',
      results: results?.festival,
    },
    {
      id: 'lock',
      icon: 'lock',
      title: 'Price lock',
      who: 'Applies to every offer',
      state: { tone: 'on', label: 'Always on' },
      rule: (
        <>
          When a seller sends the upgrade request, the offer price is kept for <b>{s.lockDays} {Number(s.lockDays) === 1 ? 'day' : 'days'}</b> — even after the countdown
          ends.
        </>
      ),
      results: null,
    },
  ];

  const preview = (id) => {
    if (id === 'earned')
      return e.enabled ? (
        <Voucher tag="🏆 Your reward" title={`You earned ${money(regular - earnedPrice)} off Diamond`} price={earnedPrice} regular={regular} foot={`${duration(e.hours)} to use it`} />
      ) : (
        <p className="dox-card-empty">Nothing — the reward is off.</p>
      );
    if (id === 'milestone')
      return firstMilestone ? (
        <Voucher tag="🏆 Milestone reward" title={`${firstMilestone.orders} orders milestone`} price={priceOf(firstMilestone, regular)} regular={regular} foot={`${duration(firstMilestone.hours)} to use it`} />
      ) : (
        <p className="dox-card-empty">No milestone is on.</p>
      );
    if (id === 'festival')
      return nextFest ? (
        <Voucher tag={`${nextFest.emoji} ${nextFest.name} special`} title={`${offLabel(nextFest)} Diamond`} price={priceOf(nextFest, regular)} regular={regular} foot={`Ends ${fmtDay(nextFest.end || nextFest.start, false)}`} />
      ) : (
        <p className="dox-card-empty">No festival is scheduled.</p>
      );
    return (
      <div className="dox-lockcard" aria-hidden="true">
        <Ic name="lock" size={16} />
        <div>
          <b>Your price is locked: {money(earnedPrice)}</b>
          <span>Kept for {s.lockDays} days while you finish the upgrade</span>
        </div>
      </div>
    );
  };

  const editor = (id) => {
    if (id === 'earned')
      return (
        <>
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
          <p className="dx2-hint">The seller gets a popup, a notification and an email.</p>
        </>
      );
    if (id === 'milestone')
      return (
        <>
          <p className="dx2-hint">A one-time reward when a store reaches an order count. A store that passed several gets only the highest.</p>
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
          <button type="button" className="ins-btn ins-btn-sm dx2-add" onClick={() => set({ milestones: [...s.milestones, { key: `m${Date.now() % 100000}`, enabled: true, orders: 200, discountType: 'amount', discountValue: 500, hours: 72 }] })}>
            <Ic name="plus" size={13} /> Add milestone
          </button>
        </>
      );
    if (id === 'festival')
      return (
        <>
          <p className="dx2-hint">Every Basic store sees a banner and gets one notification (no email). Switch a day on only after its dates are set. Dates are India time.</p>
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
          <button
            type="button"
            className="ins-btn ins-btn-sm dx2-add"
            onClick={() => {
              const key = `f${Date.now() % 100000}`;
              set({ festivals: [...s.festivals, { key, name: 'Special day', emoji: '🎉', enabled: false, start: '', end: '', discountType: 'percent', discountValue: 20 }] });
              toggleOpen(key, true);
            }}
          >
            <Ic name="plus" size={13} /> Add a day
          </button>
        </>
      );
    return (
      <>
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
      </>
    );
  };

  return (
    <div className="ins-page dox dx2">
      <Hero
        icon="sparkle"
        tone="brand"
        title="Diamond offers"
        subtitle={`Discounts on the ${money(regular)} Diamond upgrade, for a limited time. Each seller sees only one offer at a time.`}
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

      {/* 1 · the master switch, in plain words */}
      <section className={`dx2-master ${paused ? 'is-off' : 'is-on'}`} aria-label="Diamond offers on or off">
        <Toggle checked={s.enabled} onChange={(v) => set({ enabled: v })} label="Diamond offers on or off" />
        <div className="dx2-master-txt">
          <b>{paused ? 'Diamond offers are OFF' : 'Diamond offers are ON'}</b>
          <span>
            {paused
              ? 'No seller sees any offer. Turn this on to start the offers that are switched on below.'
              : liveFest
              ? `Sellers can get the offers switched on below. ${liveFest.emoji} ${liveFest.name} is live until ${fmtDay(liveFest.end || liveFest.start)}.`
              : 'Sellers can get the offers switched on below.'}
          </span>
        </div>
        {totals && (
          <dl className="dx2-kpis" aria-label="Results of the last 90 days">
            <div><dt>Offers given</dt><dd>{totals.given}</dd></div>
            <div><dt>Upgrade requests</dt><dd>{totals.claimed}</dd></div>
            <div><dt>Became Diamond</dt><dd className="t">{totals.upgraded}</dd></div>
            <div><dt>Conversion</dt><dd>{rate(totals)}%</dd></div>
            <p className="dx2-kpis-note">Last 90 days, all offers</p>
          </dl>
        )}
      </section>

      {/* 2 · which offer a seller sees */}
      <p className="dx2-order">
        <Ic name="alert" size={14} /> <b>Which offer does a seller see?</b> Their own <b>reward</b> or <b>milestone</b> first. If they have none, the live <b>festival</b> offer.
        The <b>price lock</b> keeps that price after they request the upgrade.
      </p>

      {/* 3 · one card per offer type */}
      <div className="dx2-list">
        {TYPES.map((t) => {
          const isOpen = tab === t.id;
          const st = paused && t.id !== 'lock' && t.state.tone !== 'off' ? { tone: 'paused', label: `${t.state.label} · paused` } : t.state;
          return (
            <section key={t.id} className={`dx2-type is-${st.tone}${isOpen ? ' is-open' : ''}`} aria-labelledby={`dx2-${t.id}`}>
              <div className="dx2-type-main">
                <span className="dx2-type-ic" aria-hidden="true"><Ic name={t.icon} size={18} /></span>
                <div className="dx2-type-txt">
                  <div className="dx2-type-title">
                    <h3 id={`dx2-${t.id}`}>{t.title}</h3>
                    <span className={`dx2-state s-${st.tone}`}>{st.label}</span>
                    {t.warn && <span className="dx2-state s-warn">{t.warn}</span>}
                  </div>
                  <small className="dx2-who">{t.who}</small>
                  <p className="dx2-rule">{t.rule}</p>
                </div>
                <div className="dx2-type-side">
                  {t.id === 'earned' && (
                    <span className="dx2-tg">
                      <Toggle checked={e.enabled} onChange={(v) => setEarned({ enabled: v })} label="Reward on or off" />
                      <span aria-hidden="true">{e.enabled ? 'On' : 'Off'}</span>
                    </span>
                  )}
                  <button type="button" className={`dx2-edit${isOpen ? ' on' : ''}`} aria-expanded={isOpen} aria-controls={`dx2-ed-${t.id}`} onClick={() => setTab(isOpen ? '' : t.id)}>
                    {isOpen ? 'Close' : 'Change'}
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6 1.4-1.4Z" fill="currentColor" /></svg>
                  </button>
                </div>
              </div>
              {t.results && (
                <dl className="dx2-res">
                  <div><dt>Given</dt><dd>{t.results.given || 0}</dd></div>
                  <div><dt>Requests</dt><dd>{t.results.claimed || 0}</dd></div>
                  <div><dt>Became Diamond</dt><dd className="t">{t.results.upgraded || 0}</dd></div>
                  <div className="dx2-res-bar" aria-label={`${rate(t.results)}% became Diamond`}>
                    <span><i style={{ width: `${Math.min(100, rate(t.results))}%` }} /></span>
                    <em>{rate(t.results)}% became Diamond · last 90 days</em>
                  </div>
                </dl>
              )}
              {isOpen && (
                <div id={`dx2-ed-${t.id}`} className="dx2-editor">
                  <div className="dx2-editor-main">{editor(t.id)}</div>
                  <aside className="dx2-editor-aside" aria-label="What the seller sees">
                    <p className="dox-card-title">What the seller sees</p>
                    {preview(t.id)}
                  </aside>
                </div>
              )}
            </section>
          );
        })}
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
