import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Ic from '../components/Icons.jsx';
import { Hero } from './insights.jsx';

/**
 * 💎 Diamond offers — discounts with a real deadline that make the upgrade attractive:
 *   reward for good work (automatic), milestones (once each), festival calendar (India).
 * A seller always sees ONE offer: their own reward first, a festival when they have none.
 * The price is locked on the seller's request; the upgrade form uses it. Finance is unchanged.
 * Layout: a settings page — each row explains the rule on the left and holds the control on the right.
 */
const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const priceOf = (d, regular) => {
  const v = Number(d.discountValue) || 0;
  const off = d.discountType === 'percent' ? (regular * v) / 100 : v;
  return Math.max(1, Math.min(regular, Math.round((regular - off) * 100) / 100));
};
const todayIndia = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const festState = (f) => {
  if (!f.start) return { tone: 'idle', label: 'Needs dates' };
  if (!f.enabled) return { tone: 'idle', label: 'Off' };
  const t = todayIndia();
  if (t < f.start) return { tone: 'soon', label: 'Scheduled' };
  if (t > (f.end || f.start)) return { tone: 'idle', label: 'Ended' };
  return { tone: 'live', label: 'Live now' };
};
const fmtDay = (s) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className={`dox-toggle ${disabled ? 'is-disabled' : ''}`}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span aria-hidden="true" />
    </label>
  );
}

function Num({ value, onChange, min, max, unit, width = 76 }) {
  return (
    <span className="dox-num">
      <input type="number" min={min} max={max} value={value} onChange={(e) => onChange(e.target.value)} style={{ width }} />
      {unit && <em>{unit}</em>}
    </span>
  );
}

function Discount({ value, onChange, regular }) {
  return (
    <span className="dox-discount">
      <span className="dox-seg" role="group" aria-label="Discount type">
        <button type="button" className={value.discountType === 'amount' ? 'on' : ''} onClick={() => onChange({ ...value, discountType: 'amount' })}>$ off</button>
        <button type="button" className={value.discountType === 'percent' ? 'on' : ''} onClick={() => onChange({ ...value, discountType: 'percent' })}>% off</button>
      </span>
      <input type="number" min="1" value={value.discountValue} onChange={(e) => onChange({ ...value, discountValue: e.target.value })} />
      <span className="dox-price">
        <s>{money(regular)}</s> {money(priceOf(value, regular))}
      </span>
    </span>
  );
}

function Row({ title, help, children }) {
  return (
    <div className="dox-row">
      <div className="dox-row-text">
        <b>{title}</b>
        {help && <p>{help}</p>}
      </div>
      <div className="dox-row-ctrl">{children}</div>
    </div>
  );
}

function Section({ title, help, aside, children }) {
  return (
    <section className="dox-sec">
      <header className="dox-sec-head">
        <div>
          <h2>{title}</h2>
          {help && <p>{help}</p>}
        </div>
        {aside}
      </header>
      <div className="dox-sec-body">{children}</div>
    </section>
  );
}

export default function DiamondOffers() {
  const [s, setS] = useState(null);
  const [regular, setRegular] = useState(1500);
  const [results, setResults] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const [dirty, setDirty] = useState(false);

  const load = async () => {
    try {
      const [a, r] = await Promise.all([api('/sellers/tier/offers/settings'), api('/sellers/tier/offers/results').catch(() => null)]);
      setS(a.settings);
      setRegular(a.regular || 1500);
      setResults(r);
      setDirty(false);
      setMsg(null);
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

  const actions = (
    <>
      <button type="button" className="ins-btn" onClick={load} disabled={saving}>
        <Ic name="refresh" size={14} /> Reload
      </button>
      <button type="button" className="ins-btn ins-btn-primary" onClick={save} disabled={saving || !dirty}>
        {saving ? 'Saving…' : dirty ? 'Save changes' : 'All saved'}
      </button>
    </>
  );

  if (!s) {
    return (
      <div className="ins-page dox">
        <Hero icon="sparkle" tone="brand" title="Diamond offers" subtitle="Loading the offer settings…" />
        {msg && !msg.ok && <div className="dox-msg err">{msg.text}</div>}
      </div>
    );
  }

  return (
    <div className="ins-page dox">
      <Hero
        icon="sparkle"
        tone="brand"
        title="Diamond offers"
        subtitle={`Discounts with a deadline on the ${money(regular)} Diamond upgrade. A seller sees one offer at a time, and the price is locked when they send the request.`}
        actions={actions}
      />

      {msg && <div className={`dox-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}

      <div className="dox-layout">
      <aside className="dox-aside" aria-label="Status and preview">
        <div className="dox-card dox-status">
          <div className="dox-status-top">
            <div>
              <b>{s.enabled ? 'Offers are on' : 'Offers are off'}</b>
              <span>{s.enabled ? (liveFest ? `${liveFest.emoji} ${liveFest.name} is live until ${fmtDay(liveFest.end)}` : 'Rewards and milestones are given automatically') : 'No seller sees an offer right now'}</span>
            </div>
            <Toggle checked={s.enabled} onChange={(v) => set({ enabled: v })} label="Diamond offers on or off" />
          </div>
        </div>

        {s.earned.enabled && (
          <div className="dox-card">
            <p className="dox-card-title">What a seller sees</p>
            <div className="dox-voucher" aria-hidden="true">
              <div className="dox-voucher-main">
                <span className="dox-voucher-tag">Your reward</span>
                <b>You earned {money(regular - priceOf(s.earned, regular))} off Diamond</b>
              </div>
              <div className="dox-voucher-stub">
                <s>{money(regular)}</s>
                <strong>{money(priceOf(s.earned, regular))}</strong>
                <span>{Number(s.earned.hours) >= 24 ? `${Math.round(Number(s.earned.hours) / 24)} days` : `${s.earned.hours} hours`} to use it</span>
              </div>
            </div>
            <p className="dox-card-note">
              After {s.earned.days} days with health {s.earned.healthMin}+ and {s.earned.orders} confirmed orders.
            </p>
          </div>
        )}

        {totals && (
          <div className="dox-card">
            <p className="dox-card-title">Last 90 days</p>
            <dl className="dox-stats">
              <div><dt>Offers given</dt><dd>{totals.given}</dd></div>
              <div><dt>Upgrade requests</dt><dd>{totals.claimed}</dd></div>
              <div><dt>Became Diamond</dt><dd className="t">{totals.upgraded}</dd></div>
            </dl>
          </div>
        )}
      </aside>

      <div className="dox-main">
      <Section
        title="Reward for good work"
        help="Given automatically. The seller gets a popup, a notification and an email."
        aside={<Toggle checked={s.earned.enabled} onChange={(v) => setEarned({ enabled: v })} label="Reward on or off" />}
      >
        <Row title="Account health" help="The lowest score that still counts as great health.">
          <Num value={s.earned.healthMin} min={50} max={100} unit="out of 100" onChange={(v) => setEarned({ healthMin: v })} />
        </Row>
        <Row title="Days in a row" help="Days without a penalty or a freeze, at that health or better.">
          <Num value={s.earned.days} min={3} max={60} unit="days" onChange={(v) => setEarned({ days: v })} />
        </Row>
        <Row title="Orders confirmed" help="Orders the store confirmed within those days.">
          <Num value={s.earned.orders} min={1} unit="orders" onChange={(v) => setEarned({ orders: v })} />
        </Row>
        <Row title="Discount" help="What the seller pays instead of the normal price.">
          <Discount value={s.earned} onChange={(v) => setEarned(v)} regular={regular} />
        </Row>
        <Row title="Offer lasts" help="A real countdown. The offer ends when it runs out.">
          <Num value={s.earned.hours} min={1} unit="hours" onChange={(v) => setEarned({ hours: v })} />
        </Row>
        <Row title="Next reward" help="The earliest a store can earn the reward again.">
          <Num value={s.earned.cooldownDays} min={1} max={90} unit="days after the last one ended" onChange={(v) => setEarned({ cooldownDays: v })} />
        </Row>
      </Section>

      <Section
        title="Milestones"
        help="Given once per store. A store that already passed several gets only the highest one."
        aside={
          <button type="button" className="ins-btn ins-btn-sm" onClick={() => set({ milestones: [...s.milestones, { key: `m${Date.now() % 100000}`, enabled: true, orders: 200, discountType: 'amount', discountValue: 500, hours: 72 }] })}>
            <Ic name="plus" size={13} /> Add milestone
          </button>
        }
      >
        {s.milestones.length ? (
          <div className="dox-list">
            {s.milestones.map((m, i) => (
              <div className="dox-item" key={m.key}>
                <Toggle checked={m.enabled} onChange={(v) => setMilestone(i, { enabled: v })} label={`Milestone ${m.orders} orders on or off`} />
                <span className="dox-item-what">
                  At <Num value={m.orders} min={1} unit="orders" onChange={(v) => setMilestone(i, { orders: v })} />
                </span>
                <Discount value={m} onChange={(v) => setMilestone(i, v)} regular={regular} />
                <span className="dox-item-time">for <Num value={m.hours} min={1} unit="hours" width={64} onChange={(v) => setMilestone(i, { hours: v })} /></span>
                <button type="button" className="dox-x" title="Remove milestone" onClick={() => set({ milestones: s.milestones.filter((_, j) => j !== i) })}><Ic name="trash" size={15} /></button>
              </div>
            ))}
          </div>
        ) : (
          <p className="dox-empty">No milestones yet. Add one to reward stores that reach a number of orders.</p>
        )}
      </Section>

      <Section
        title="Festival calendar"
        help="Dates are India time. Every Basic store sees a banner and gets one notification (no email). Diwali, Holi and Navratri move every year, so set their dates before the day."
        aside={
          <button type="button" className="ins-btn ins-btn-sm" onClick={() => set({ festivals: [...s.festivals, { key: `f${Date.now() % 100000}`, name: 'Special day', emoji: '🎉', enabled: false, start: '', end: '', discountType: 'percent', discountValue: 20 }] })}>
            <Ic name="plus" size={13} /> Add a day
          </button>
        }
      >
        <div className="dox-list">
          {s.festivals.map((f, i) => {
            const st = festState(f);
            return (
              <div className={`dox-fest ${st.tone === 'live' ? 'is-live' : ''}`} key={f.key}>
                <Toggle checked={f.enabled} disabled={!f.start} onChange={(v) => setFestival(i, { enabled: v })} label={`${f.name} on or off`} />
                <span className="dox-fest-name">
                  <input className="dox-emoji" value={f.emoji} onChange={(e) => setFestival(i, { emoji: e.target.value })} aria-label="Emoji" />
                  <input value={f.name} onChange={(e) => setFestival(i, { name: e.target.value })} aria-label="Festival name" />
                </span>
                <span className={`dox-state ${st.tone}`}>{st.label}</span>
                <div className="dox-fest-when">
                  <span className="dox-dates">
                    <input type="date" value={f.start} onChange={(e) => setFestival(i, { start: e.target.value, end: f.end && f.end >= e.target.value ? f.end : e.target.value })} aria-label="First day" />
                    <em>to</em>
                    <input type="date" value={f.end} min={f.start || undefined} onChange={(e) => setFestival(i, { end: e.target.value })} aria-label="Last day" />
                  </span>
                  <Discount value={f} onChange={(v) => setFestival(i, v)} regular={regular} />
                </div>
                <button type="button" className="dox-x" title="Remove day" onClick={() => set({ festivals: s.festivals.filter((_, j) => j !== i) })}><Ic name="trash" size={15} /></button>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Locked price" help="After a seller sends the upgrade request, the offer price stays for this long, even when the countdown ends.">
        <Row title="Keep the price for" help="The upgrade form uses the locked price until then, then the normal price.">
          <Num value={s.lockDays} min={1} max={30} unit="days" onChange={(v) => set({ lockDays: v })} />
        </Row>
      </Section>

      </div>
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
