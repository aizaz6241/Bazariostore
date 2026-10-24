import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Ic from '../components/Icons.jsx';
import { Hero, MetaChip, Card, Badge } from './insights.jsx';

/**
 * 💎 Diamond offers — discounts with a real deadline that make the upgrade attractive:
 *   reward for good work (automatic), milestones (once each), festival calendar (India).
 * A seller always sees ONE offer: their own reward first, a festival when they have none.
 * The price is locked on the seller's request; the upgrade form uses it. Finance is unchanged.
 */
const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const priceOf = (d, regular) => {
  const v = Number(d.discountValue) || 0;
  const off = d.discountType === 'percent' ? (regular * v) / 100 : v;
  return Math.max(1, Math.min(regular, Math.round((regular - off) * 100) / 100));
};
const todayStr = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const festState = (f) => {
  if (!f.enabled || !f.start) return { tone: 'neutral', label: 'Off' };
  const t = todayStr();
  if (t < f.start) return { tone: 'warning', label: 'Upcoming' };
  if (t > (f.end || f.start)) return { tone: 'neutral', label: 'Ended' };
  return { tone: 'good', label: 'Live now' };
};

function Discount({ value, onChange, regular }) {
  return (
    <div className="do-discount">
      <select value={value.discountType} onChange={(e) => onChange({ ...value, discountType: e.target.value })}>
        <option value="amount">$ off</option>
        <option value="percent">% off</option>
      </select>
      <input type="number" min="1" value={value.discountValue} onChange={(e) => onChange({ ...value, discountValue: e.target.value })} />
      <span className="do-price">= {money(priceOf(value, regular))}</span>
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

  const load = async () => {
    try {
      const [a, r] = await Promise.all([api('/sellers/tier/offers/settings'), api('/sellers/tier/offers/results').catch(() => null)]);
      setS(a.settings);
      setRegular(a.regular || 1500);
      setResults(r);
      setDirty(false);
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
      setMsg({ ok: true, text: 'Saved. New rules apply from the next check (within 30 minutes).' });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const live = useMemo(() => (s ? s.festivals.filter((f) => festState(f).label === 'Live now') : []), [s]);
  const totals = useMemo(() => {
    if (!results) return null;
    const k = ['earned', 'milestone', 'festival'];
    return k.reduce((t, x) => ({ given: t.given + (results[x]?.given || 0), claimed: t.claimed + (results[x]?.claimed || 0), upgraded: t.upgraded + (results[x]?.upgraded || 0) }), { given: 0, claimed: 0, upgraded: 0 });
  }, [results]);

  if (!s) {
    return (
      <div className="ins-page">
        <Hero icon="sparkle" tone="brand" title="Diamond offers" subtitle="Loading…" />
        {msg && !msg.ok && <div className="do-msg err">{msg.text}</div>}
      </div>
    );
  }

  return (
    <div className="ins-page do-page">
      <Hero
        icon="sparkle"
        tone="brand"
        title="Diamond offers"
        subtitle={`Normal price ${money(regular)}. A seller always sees ONE offer: their own reward first, a festival when they have none. The price is locked when the seller sends the request; the upgrade form uses it automatically.`}
        actions={
          <>
            <button type="button" className="ins-btn" onClick={load} disabled={saving}>
              <Ic name="refresh" size={14} /> Reload
            </button>
            <button type="button" className="ins-btn ins-btn-primary" onClick={save} disabled={saving || !dirty}>
              <Ic name="check" size={15} /> {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
            </button>
          </>
        }
      >
        <MetaChip>{s.enabled ? 'Offers on' : 'Offers off'}</MetaChip>
        {live.map((f) => (
          <MetaChip key={f.key} live>
            {f.emoji} {f.name} live
          </MetaChip>
        ))}
      </Hero>

      {msg && <div className={`do-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}

      {totals && (
        <div className="do-results">
          <div><small>Offers given · 90 days</small><b>{totals.given}</b></div>
          <div><small>Upgrade requests with an offer</small><b>{totals.claimed}</b></div>
          <div><small>Became Diamond</small><b className="g">{totals.upgraded}</b></div>
        </div>
      )}

      <Card title="All offers" hint="Switch every offer on or off at once">
        <div className="do-grid">
          <label className="do-switch">
            <input type="checkbox" checked={s.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
            <span>Diamond offers are {s.enabled ? 'ON' : 'OFF'}</span>
          </label>
          <label className="do-field">
            <span>Locked price stays valid after the request</span>
            <div className="do-inline"><input type="number" min="1" max="30" value={s.lockDays} onChange={(e) => set({ lockDays: e.target.value })} /> days</div>
          </label>
        </div>
      </Card>

      <Card title="Reward for good work (automatic)" hint="Given by itself when a store reaches it — the seller gets a popup, a notification and an email">
        <div className="do-grid">
          <label className="do-switch">
            <input type="checkbox" checked={s.earned.enabled} onChange={(e) => setEarned({ enabled: e.target.checked })} />
            <span>{s.earned.enabled ? 'On' : 'Off'}</span>
          </label>
          <label className="do-field">
            <span>Account health at least</span>
            <div className="do-inline"><input type="number" min="50" max="100" value={s.earned.healthMin} onChange={(e) => setEarned({ healthMin: e.target.value })} /> / 100</div>
          </label>
          <label className="do-field">
            <span>For (days in a row, no penalty, never frozen)</span>
            <div className="do-inline"><input type="number" min="3" max="60" value={s.earned.days} onChange={(e) => setEarned({ days: e.target.value })} /> days</div>
          </label>
          <label className="do-field">
            <span>Orders confirmed in those days</span>
            <div className="do-inline"><input type="number" min="1" value={s.earned.orders} onChange={(e) => setEarned({ orders: e.target.value })} /> orders</div>
          </label>
          <label className="do-field">
            <span>Discount</span>
            <Discount value={s.earned} onChange={(v) => setEarned(v)} regular={regular} />
          </label>
          <label className="do-field">
            <span>Offer runs for</span>
            <div className="do-inline"><input type="number" min="1" value={s.earned.hours} onChange={(e) => setEarned({ hours: e.target.value })} /> hours</div>
          </label>
          <label className="do-field">
            <span>Next reward at the earliest</span>
            <div className="do-inline"><input type="number" min="1" max="90" value={s.earned.cooldownDays} onChange={(e) => setEarned({ cooldownDays: e.target.value })} /> days after the last one ended</div>
          </label>
        </div>
      </Card>

      <Card
        title="Milestones"
        hint="Once per store. A store that already passed several gets only the highest one."
        actions={
          <button type="button" className="ins-btn ins-btn-sm" onClick={() => set({ milestones: [...s.milestones, { key: `m${Date.now() % 100000}`, enabled: true, orders: 200, discountType: 'amount', discountValue: 500, hours: 72 }] })}>
            <Ic name="plus" size={13} /> Add
          </button>
        }
      >
        <div className="do-table">
          <div className="do-tr do-th"><span>On</span><span>Orders confirmed (total)</span><span>Discount</span><span>Runs for</span><span /></div>
          {s.milestones.map((m, i) => (
            <div className="do-tr" key={m.key}>
              <span><input type="checkbox" checked={m.enabled} onChange={(e) => setMilestone(i, { enabled: e.target.checked })} /></span>
              <span><input type="number" min="1" value={m.orders} onChange={(e) => setMilestone(i, { orders: e.target.value })} /></span>
              <span><Discount value={m} onChange={(v) => setMilestone(i, v)} regular={regular} /></span>
              <span className="do-inline"><input type="number" min="1" value={m.hours} onChange={(e) => setMilestone(i, { hours: e.target.value })} /> h</span>
              <span><button type="button" className="do-x" title="Remove" onClick={() => set({ milestones: s.milestones.filter((_, j) => j !== i) })}><Ic name="trash" size={14} /></button></span>
            </div>
          ))}
          {!s.milestones.length && <p className="do-empty">No milestones.</p>}
        </div>
      </Card>

      <Card
        title="Festival calendar (India)"
        hint="Dates in India time. Every Basic store sees the banner and gets one notification (no email, to keep the daily email limit). Diwali / Holi / Navratri dates change every year — set them before the day."
        actions={
          <button type="button" className="ins-btn ins-btn-sm" onClick={() => set({ festivals: [...s.festivals, { key: `f${Date.now() % 100000}`, name: 'Special day', emoji: '🎉', enabled: false, start: '', end: '', discountType: 'percent', discountValue: 20 }] })}>
            <Ic name="plus" size={13} /> Add day
          </button>
        }
      >
        <div className="do-table do-fest">
          <div className="do-tr do-th"><span>On</span><span>Festival</span><span>From</span><span>To</span><span>Discount</span><span>Status</span><span /></div>
          {s.festivals.map((f, i) => {
            const st = festState(f);
            return (
              <div className="do-tr" key={f.key}>
                <span><input type="checkbox" checked={f.enabled} disabled={!f.start} title={f.start ? '' : 'Set the dates first'} onChange={(e) => setFestival(i, { enabled: e.target.checked })} /></span>
                <span className="do-name">
                  <input className="do-emoji" value={f.emoji} onChange={(e) => setFestival(i, { emoji: e.target.value })} />
                  <input value={f.name} onChange={(e) => setFestival(i, { name: e.target.value })} />
                </span>
                <span><input type="date" value={f.start} onChange={(e) => setFestival(i, { start: e.target.value, end: f.end && f.end >= e.target.value ? f.end : e.target.value })} /></span>
                <span><input type="date" value={f.end} min={f.start || undefined} onChange={(e) => setFestival(i, { end: e.target.value })} /></span>
                <span><Discount value={f} onChange={(v) => setFestival(i, v)} regular={regular} /></span>
                <span><Badge tone={st.tone}>{st.label}</Badge></span>
                <span><button type="button" className="do-x" title="Remove" onClick={() => set({ festivals: s.festivals.filter((_, j) => j !== i) })}><Ic name="trash" size={14} /></button></span>
              </div>
            );
          })}
        </div>
      </Card>

      {dirty && (
        <div className="do-savebar">
          <span>You have unsaved changes</span>
          <button type="button" className="ins-btn ins-btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      )}
    </div>
  );
}
