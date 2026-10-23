import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { sapi } from '../api.js';
import { levelByKey } from '../utils/healthLevels.js';

/**
 * Celebration after a Perfect Health Bonus or a new level: a short confetti moment, shown once.
 * Reads seller.accountHealth.pendingCelebration (set by the server, live through
 * 'seller:health_update'); closing it tells the server (POST /api/sellers/health/celebrated).
 */
const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#a855f7', '#eab308'];
const seenKey = (c) => `bz_celebrated_${c?.at || ''}`;

export default function CelebrationHost({ seller, setSeller }) {
  const c = seller?.accountHealth?.pendingCelebration || null;
  const [hidden, setHidden] = useState(false);

  useEffect(() => setHidden(false), [c?.at]);

  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }).map((_, i) => ({
        left: `${(i * 97) % 100}%`,
        delay: `${(i % 9) * 0.12}s`,
        dur: `${2.2 + (i % 5) * 0.35}s`,
        bg: COLORS[i % COLORS.length],
        rot: `${(i * 47) % 360}deg`,
      })),
    [c?.at]
  );

  let seen = false;
  try {
    seen = Boolean(c && sessionStorage.getItem(seenKey(c)));
  } catch {}
  if (!c || hidden || seen || seller?.status === 'suspended') return null;

  const close = () => {
    setHidden(true);
    try {
      sessionStorage.setItem(seenKey(c), '1');
    } catch {}
    sapi('/sellers/health/celebrated', { method: 'POST' }).catch(() => {});
    setSeller?.((prev) => {
      if (!prev?.accountHealth) return prev;
      const updated = { ...prev, accountHealth: { ...prev.accountHealth, pendingCelebration: null } };
      try {
        localStorage.setItem('ng_seller', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const lv = levelByKey(c.level);
  const isLevel = c.kind === 'level';
  const amount = Number(c.amount) || 0;

  return (
    <div className="cel-back" role="dialog" aria-modal="true" aria-label="Celebration" onClick={close}>
      <div className="cel-confetti" aria-hidden="true">
        {pieces.map((p, i) => (
          <i key={i} style={{ left: p.left, animationDelay: p.delay, animationDuration: p.dur, background: p.bg, transform: `rotate(${p.rot})` }} />
        ))}
      </div>
      <div className="cel-card" onClick={(e) => e.stopPropagation()}>
        <div className="cel-icon">{isLevel ? lv.icon : '🏆'}</div>
        <p className="cel-kicker">{isLevel ? (c.since ? 'Your store level' : 'New level unlocked') : 'Perfect Health Bonus'}</p>
        <h2>{isLevel ? `${lv.label}` : `+$${amount} added to your wallet`}</h2>
        <p className="cel-text">
          {isLevel
            ? `${c.weeks} perfect week${c.weeks === 1 ? '' : 's'} in a row${c.since ? ' on your record since 1 October' : ''}.`
            : 'Your account health stayed 100/100 for the whole week.'}
          {isLevel && amount > 0 && <b> +${amount} bonus added to your wallet.</b>}
        </p>
        <p className="cel-sub">Keep every order on time — any penalty drops you one level.</p>
        <div className="cel-actions">
          <Link to="/seller/health" className="cel-btn primary" onClick={close}>
            See my progress
          </Link>
          <button type="button" className="cel-btn" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
