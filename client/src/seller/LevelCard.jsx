import { Link } from 'react-router-dom';
import { LEVELS, levelByKey } from '../utils/healthLevels.js';

/**
 * Store level (perfect weeks in a row) and the anonymous standing ("top X% of stores").
 * `level` / `standing` come from GET /api/sellers/health. Full card on the Account Health page,
 * `mini` in the dashboard's health card.
 */
export function StandingLine({ standing, score }) {
  if (!standing) return null;
  if (standing.topPct <= 50) {
    return (
      <p className="lv-stand good">
        📈 Your store is in the <b>top {standing.topPct}%</b> of Bazario stores.
      </p>
    );
  }
  return (
    <p className="lv-stand">
      📊 <b>{standing.pctAt100}%</b> of Bazario stores are at 100/100{score === 100 ? ' — you are one of them.' : ' — you can be too.'}
    </p>
  );
}

export default function LevelCard({ level, standing, score, since, mini = false }) {
  if (!level) return null;
  const cur = levelByKey(level.key);
  const next = level.next;
  const base = cur.weeks;
  const pct = next ? Math.round(((level.weeks - base) / Math.max(1, next.weeks - base)) * 100) : 100;

  if (mini) {
    return (
      <div className="lv-mini">
        <Link to="/seller/health" className={`lv-pill lv-${cur.key}`}>
          <span>{cur.icon}</span> {cur.label}
        </Link>
        <small>
          {level.weeks} perfect week{level.weeks === 1 ? '' : 's'} in a row
          {next ? ` · ${next.need} more to ${next.icon} ${next.label}` : ' · top level'}
        </small>
        <StandingLine standing={standing} score={score} />
      </div>
    );
  }

  return (
    <section className={`sh-card lv lv-${cur.key}`}>
      <div className="lv-head">
        <div className="lv-badge" aria-hidden="true">
          {cur.icon}
        </div>
        <div className="lv-title">
          <span>Store level</span>
          <h3>{cur.label}</h3>
          <p>
            <b>{level.weeks}</b> perfect week{level.weeks === 1 ? '' : 's'} in a row
            {level.best > level.weeks ? ` · best run ${level.best}` : ''}
          </p>
        </div>
        {next && (
          <div className="lv-next">
            <span>Next</span>
            <b>
              {next.icon} {next.label}
            </b>
            <small>
              {next.need} more week{next.need > 1 ? 's' : ''}
            </small>
          </div>
        )}
      </div>

      {next && (
        <div className="lv-bar">
          <i style={{ width: `${Math.max(4, pct)}%` }} />
        </div>
      )}

      <ol className="lv-ladder">
        {LEVELS.map((l) => (
          <li key={l.key} className={`${level.weeks >= l.weeks ? 'done' : ''} ${l.key === cur.key ? 'now' : ''}`}>
            <span>{l.icon}</span>
            <b>{l.label}</b>
            <small>{l.weeks ? `${l.weeks} weeks` : 'start'}</small>
          </li>
        ))}
      </ol>

      <ul className="lv-rules">
        <li>A perfect week = your bonus week at 100/100 with at least one confirmed order.</li>
        <li>A week without orders does not count, but does not break your run.</li>
        <li className="warn">
          {level.dropTo ? (
            <>
              Any penalty drops you to{' '}
              <b>
                {level.dropTo.icon} {level.dropTo.label}
              </b>
              .
            </>
          ) : (
            <>Any penalty restarts your run.</>
          )}
        </li>
      </ul>
      <StandingLine standing={standing} score={score} />
      {since && <p className="lv-foot">Counted from 1 October 2026.</p>}
    </section>
  );
}
