// Shared building blocks for the admin analytics pages (Dashboard, Orders, Applications,
// Targets, Complaints): page hero, KPI tiles, chart cards, segmented controls, rank lists and
// one tooltip style for every chart. Styles live in styles/admin/insights.css (`ins-` prefix).
import { money } from '../api.js';
import Ic from '../components/Icons.jsx';

// Categorical series colours, always assigned in this order (checked for colour-blind separation)
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
// Reserved for state (good / warning / serious / critical) — never used as "series 5"
export const STATUS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b', neutral: '#94a3b8' };

export const GRID = '#eef2f7';
export const AXIS = { fontSize: 11, stroke: '#94a3b8', tickLine: false, axisLine: false };
// legend text stays in ink; the swatch carries the colour
export const legendText = (v) => <span style={{ color: '#334155' }}>{v}</span>;

export const shortMoney = (v) => {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  if (abs >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
};
export const shortNum = (v) => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
};
export const pctOf = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

// Change between two periods, as shown on a KPI tile
export function delta(current, previous, { higherIsGood = true } = {}) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (!p && !c) return null;
  if (!p) return { label: 'new', good: higherIsGood, flat: false };
  const change = ((c - p) / p) * 100;
  if (Math.abs(change) < 0.5) return { label: '0%', good: true, flat: true };
  const up = change > 0;
  return { label: `${up ? '+' : ''}${change.toFixed(Math.abs(change) >= 10 ? 0 : 1)}%`, good: up === higherIsGood, flat: false, up };
}

export function Hero({ icon, title, subtitle, children, actions, tone = 'brand' }) {
  return (
    <header className={`ins-hero ins-hero-${tone}`}>
      <div className="ins-hero-main">
        {icon && (
          <span className="ins-hero-icon" aria-hidden="true">
            <Ic name={icon} size={22} />
          </span>
        )}
        <div className="ins-hero-text">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
          {children && <div className="ins-hero-meta">{children}</div>}
        </div>
      </div>
      {actions && <div className="ins-hero-actions">{actions}</div>}
    </header>
  );
}

export function MetaChip({ children, tone = 'neutral', live }) {
  return (
    <span className={`ins-chip ins-chip-${tone}`}>
      {live && <span className="ins-live-dot" />}
      {children}
    </span>
  );
}

export function Kpi({ icon, label, value, sub, tone = 'blue', change, onClick, active, title }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`ins-kpi ins-tone-${tone}${onClick ? ' ins-kpi-click' : ''}${active ? ' ins-kpi-on' : ''}`}
      onClick={onClick}
      title={title}
    >
      <div className="ins-kpi-top">
        {icon && (
          <span className="ins-kpi-icon" aria-hidden="true">
            <Ic name={icon} size={16} />
          </span>
        )}
        <span className="ins-kpi-label">{label}</span>
      </div>
      <div className="ins-kpi-mid">
        <b className="ins-kpi-value">{value}</b>
        {change && (
          <span className={`ins-delta ${change.flat ? 'flat' : change.good ? 'good' : 'bad'}`} title="Compared with the previous period of the same length">
            {change.flat ? '•' : change.up === false ? '▼' : '▲'} {change.label}
          </span>
        )}
      </div>
      {sub && <span className="ins-kpi-sub">{sub}</span>}
    </Tag>
  );
}

export function KpiGrid({ children, dim }) {
  return <div className={`ins-kpis${dim ? ' ins-dim' : ''}`}>{children}</div>;
}

export function Card({ title, hint, actions, wide, full, children, empty, className = '', pad = true }) {
  return (
    <section className={`ins-card${wide ? ' ins-wide' : ''}${full ? ' ins-full' : ''} ${className}`}>
      {(title || actions) && (
        <div className="ins-card-head">
          <div>
            {title && <h3>{title}</h3>}
            {hint && <span className="ins-card-hint">{hint}</span>}
          </div>
          {actions && <div className="ins-card-actions">{actions}</div>}
        </div>
      )}
      {empty ? <Empty text={empty} /> : <div className={pad ? 'ins-card-body' : ''}>{children}</div>}
    </section>
  );
}

export function ChartGrid({ children, dim }) {
  return <div className={`ins-grid${dim ? ' ins-dim' : ''}`}>{children}</div>;
}

export function Empty({ icon = '📭', text, children }) {
  return (
    <div className="ins-empty">
      <span className="ins-empty-icon" aria-hidden="true">{icon}</span>
      <span>{text}</span>
      {children}
    </div>
  );
}

export function Seg({ options, value, onChange, small, label }) {
  return (
    <div className={`ins-seg${small ? ' ins-seg-sm' : ''}`} role="group" aria-label={label}>
      {options.map((o) => {
        const opt = typeof o === 'object' ? o : { value: o, label: o };
        return (
          <button key={opt.value} type="button" className={value === opt.value ? 'on' : ''} onClick={() => onChange(opt.value)} title={opt.title}>
            {opt.label}
            {opt.count !== undefined && <span className="ins-seg-count">{opt.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Meter({ value, max = 100, color, height = 8, label }) {
  const pct = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0));
  return (
    <span className="ins-meter" style={{ height }} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <span style={{ width: `${pct}%`, background: color }} />
    </span>
  );
}

export function Badge({ tone = 'neutral', children, icon }) {
  return (
    <span className={`ins-badge ins-badge-${tone}`}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}

export function Avatar({ name = '', size = 34 }) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const color = SERIES[Math.abs(hash) % SERIES.length];
  return (
    <span className="ins-avatar" style={{ width: size, height: size, background: `${color}1f`, color }}>
      {(name.trim()[0] || '•').toUpperCase()}
    </span>
  );
}

// Ranked list with an inline bar: "who / what is biggest"
export function RankList({ rows, color = SERIES[0], format = money, onPick, empty = 'No data yet' }) {
  if (!rows?.length) return <Empty text={empty} />;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ol className="ins-rank">
      {rows.map((r, i) => {
        const Inner = (
          <>
            <span className="ins-rank-n">{i + 1}</span>
            <span className="ins-rank-main">
              <span className="ins-rank-row">
                <span className="ins-rank-name" title={r.label}>{r.label}</span>
                <b className="ins-rank-val">{format(r.value)}</b>
              </span>
              <span className="ins-rank-bar">
                <span style={{ width: `${Math.max(3, (r.value / max) * 100)}%`, background: color }} />
              </span>
              {r.sub && <span className="ins-rank-sub">{r.sub}</span>}
            </span>
          </>
        );
        return (
          <li key={r.key || r.label}>
            {onPick ? (
              <button type="button" onClick={() => onPick(r)}>
                {Inner}
              </button>
            ) : (
              <div>{Inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// Horizontal stacked "100%" bar with its own legend — for a part-to-whole of 2–5 states
export function SplitBar({ parts, total, height = 12 }) {
  const sum = total ?? parts.reduce((a, p) => a + p.value, 0);
  return (
    <div className="ins-split">
      <div className="ins-split-bar" style={{ height }}>
        {sum > 0 &&
          parts
            .filter((p) => p.value > 0)
            .map((p) => <span key={p.label} style={{ width: `${(p.value / sum) * 100}%`, background: p.color }} title={`${p.label}: ${p.value}`} />)}
      </div>
      <ul className="ins-split-legend">
        {parts.map((p) => (
          <li key={p.label}>
            <span className="ins-dot" style={{ background: p.color }} />
            <span>{p.label}</span>
            <b>{p.display ?? p.value}</b>
            {sum > 0 && <small>{pctOf(p.value, sum)}%</small>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// One tooltip look for every Recharts chart
export function ChartTip({ active, payload, label, fmt, labelFmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="ins-tip">
      <div className="ins-tip-label">{labelFmt ? labelFmt(label, payload) : label}</div>
      {payload.map((p) => (
        <div className="ins-tip-row" key={p.dataKey || p.name}>
          <span className="ins-dot" style={{ background: p.color || p.payload?.fill || p.fill }} />
          <span>{p.name}</span>
          <b>{fmt ? fmt(p.value, p.name, p) : p.value}</b>
        </div>
      ))}
    </div>
  );
}

export function Toolbar({ children }) {
  return <div className="ins-toolbar">{children}</div>;
}

export function SearchBox({ value, onChange, placeholder, onSubmit }) {
  return (
    <form
      className="ins-search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
    >
      <Ic name="search" size={15} />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value && (
        <button type="button" className="ins-search-clear" onClick={() => onChange('')} aria-label="Clear search">
          ✕
        </button>
      )}
    </form>
  );
}
