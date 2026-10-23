import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sapi, fmtDate } from '../api.js';
import { getSocket } from '../socket.js';
import Ic from '../components/Icons.jsx';
import { HEALTH_BANDS, bandOf, MONITOR_NAME } from '../utils/healthBands.js';
import PerfectBonus from './PerfectBonus.jsx';
import LevelCard from './LevelCard.jsx';

/**
 * ACCOUNT HEALTH — the store's own view of the account monitoring: score, band, every entry
 * (what happened, points, when it ends), when the score comes back, and the rules.
 * Every entry is shown as "Bazario Account Monitoring".
 */
const daysLeft = (d) => {
  const ms = new Date(d).getTime() - Date.now();
  if (ms <= 0) return 'ended';
  const days = Math.ceil(ms / 86400000);
  return days <= 1 ? 'ends within a day' : `ends in ${days} days`;
};
const pts = (n) => (n > 0 ? `+${n}` : `${n}`);
const RULE_ICONS = {
  late_confirm: 'clock',
  deadline_miss: 'alert',
  deadline_repeat: 'alert',
  wallet_short: 'wallet',
  deadline_third: 'alert',
  extra_order: 'alert',
  overdue_daily: 'clock',
  order_issue: 'package',
  deposit_rejected: 'banknote',
  duplicate_proof: 'lock',
  policy: 'shield',
  streak_bonus: 'checkCircle',
  clean_week: 'sparkle',
};

export default function SellerHealth() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('active');

  const load = useCallback(() => {
    sapi('/sellers/health')
      .then((d) => {
        setData(d);
        setErr('');
      })
      .catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    load();
    const socket = getSocket();
    socket?.on('seller:health_update', load);
    return () => socket?.off('seller:health_update', load);
  }, [load]);

  if (err && !data) {
    return (
      <div className="sh">
        <div className="sh-card sh-err">
          <Ic name="alert" size={18} /> {err} <button type="button" onClick={load}>Try again</button>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="sh">
        <div className="sh-card sh-muted">Loading your account health…</div>
      </div>
    );
  }

  const band = bandOf(data.score);
  const activeLines = data.lines.filter((l) => l.state === 'active');
  const pastLines = data.lines.filter((l) => l.state !== 'active');
  const shown = tab === 'active' ? activeLines : pastLines;
  const minus = activeLines.filter((l) => l.points < 0).reduce((t, l) => t + l.points, 0);
  const plus = activeLines.filter((l) => l.points > 0).reduce((t, l) => t + l.points, 0);
  const pct = Math.max(0, Math.min(100, data.score));

  return (
    <div className="sh">
      <header className="sh-head">
        <div>
          <h1>
            <Ic name="shield" size={22} /> Account Health
          </h1>
          <p>
            Your store is checked all the time by <b>{MONITOR_NAME}</b>. Every entry ends by itself after a few days, so your score comes back when your orders stay on time.
          </p>
        </div>
      </header>

      <div className="sh-top">
        <section className={`sh-card sh-score tone-${band.tone}`}>
          <div className="sh-ring" style={{ '--p': pct, '--c': band.color }}>
            <div>
              <b>{data.score}</b>
              <span>/ 100</span>
            </div>
          </div>
          <div className="sh-score-txt">
            <span className={`sh-band tone-${band.tone}`}>{band.label}</span>
            <p>{band.desc}</p>
            {data.nextBand && data.nextBand.need > 0 && (
              <p className="sh-need">
                <b>{data.nextBand.need} points</b> to reach <b>{data.nextBand.label}</b>.
              </p>
            )}
            {data.upcoming?.length > 0 && (
              <p className="sh-next">
                <Ic name="clock" size={14} /> +{data.upcoming[0].points} back {daysLeft(data.upcoming[0].at).replace('ends ', '')} ({fmtDate(data.upcoming[0].at)})
              </p>
            )}
          </div>
        </section>

        <section className="sh-card sh-stats">
          <div>
            <span>Active penalties</span>
            <b className={minus < 0 ? 't-red' : ''}>{minus || 0}</b>
          </div>
          <div>
            <span>Active rewards</span>
            <b className={plus > 0 ? 't-green' : ''}>{plus ? `+${plus}` : 0}</b>
          </div>
          <div>
            <span>On-time streak</span>
            <b>
              {data.onTimeStreak % data.streakSize}/{data.streakSize}
            </b>
            <small>next reward at {data.streakSize}</small>
          </div>
          <div>
            <span>Payout limit increase</span>
            <b className={data.score >= data.limitMinScore ? 't-green' : 't-red'}>{data.score >= data.limitMinScore ? 'Allowed' : `From ${data.limitMinScore}`}</b>
          </div>
        </section>
      </div>

      <PerfectBonus bonus={data.perfectBonus} score={data.score} nextBack={data.upcoming?.[0]?.at} />

      <LevelCard level={data.level} standing={data.standing} score={data.score} since={data.levelsSince} />

      <section className="sh-card sh-bands">
        {HEALTH_BANDS.slice()
          .reverse()
          .map((b) => (
            <div key={b.key} className={`sh-band-cell ${b.key === band.key ? 'on' : ''}`} style={{ '--c': b.color }}>
              <i />
              <b>{b.label}</b>
              <span>{b.key === 'critical' ? 'below 40' : `${b.min}+`}</span>
            </div>
          ))}
      </section>

      <section className="sh-card">
        <div className="sh-tabs" role="tablist">
          <button type="button" className={tab === 'active' ? 'on' : ''} onClick={() => setTab('active')}>
            Active entries <em>{activeLines.length}</em>
          </button>
          <button type="button" className={tab === 'past' ? 'on' : ''} onClick={() => setTab('past')}>
            Ended <em>{pastLines.length}</em>
          </button>
        </div>
        {shown.length === 0 ? (
          <p className="sh-empty">{tab === 'active' ? '✓ Nothing active. Keep confirming your orders on time.' : 'No ended entries yet.'}</p>
        ) : (
          <ul className="sh-lines">
            {shown.map((l) => (
              <li key={l.id} className={`${l.points < 0 ? 'neg' : 'pos'} ${l.state}`}>
                <span className="sh-ico">
                  <Ic name={RULE_ICONS[l.code] || (l.points < 0 ? 'alert' : 'checkCircle')} size={16} />
                </span>
                <div className="sh-line-main">
                  <b>{l.title}</b>
                  {l.detail && <p>{l.detail}</p>}
                  <small>
                    {MONITOR_NAME} · {fmtDate(l.createdAt)} ·{' '}
                    {l.state === 'active' ? daysLeft(l.expiresAt) : l.state === 'removed' ? 'removed after review' : 'ended'}
                    {l.orderNumbers?.length > 0 && ` · #${l.orderNumbers.join(', #')}`}
                  </small>
                </div>
                <span className="sh-pts">{pts(l.points)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="sh-card">
        <h3 className="sh-h">How the score works</h3>
        <ul className="sh-rules">
          {data.rules.map((r) => (
            <li key={r.code}>
              <span className="sh-ico sm">
                <Ic name={RULE_ICONS[r.code] || 'shield'} size={14} />
              </span>
              <div>
                <b>{r.title}</b>
                <small>{r.help}</small>
              </div>
              <span className={`sh-rule-pts ${r.points < 0 ? 'neg' : 'pos'}`}>{pts(r.points)}</span>
              <span className="sh-rule-days">{r.days} days</span>
            </li>
          ))}
        </ul>
        <p className="sh-foot">
          A missed deadline also freezes your store, and an order left unconfirmed keeps costing points every day. Rewards count up to +{data.settings?.bonusCap ?? 10} at a time. Need help?{' '}
          <Link to="/seller/support">Contact support</Link>.
        </p>
      </section>
    </div>
  );
}
