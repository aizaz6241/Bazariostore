'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

/**
 * Small hand-made SVG charts for the Analytics screen (no chart library: nothing extra to
 * download, and they look like the rest of the portal).
 *
 *   <LineChart>   one or more lines over days, with a crosshair + tooltip
 *   <DonutChart>  part-to-whole with a legend that lists every value
 */

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// Text and chart chrome (never the series colour)
const INK = '#0f172a';
const INK_2 = '#475569';
const INK_3 = '#94a3b8';
const GRID = '#eef2f6';
const AXIS = '#cbd5e1';

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      setWidth((prev) => (prev === w ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Round axis steps: 0 / 50 / 100 / 150 rather than 0 / 43.7 / 87.4 */
function niceScale(min, max, count = 4) {
  if (min === max) {
    if (max === 0) max = 1;
    else if (max > 0) min = 0;
    else max = 0;
  }
  const span = max - min;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { lo, hi, ticks };
}

export function compact(n) {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (a >= 1e4) return `${(v / 1e3).toFixed(0)}k`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  if (a >= 100 || Number.isInteger(v)) return v.toFixed(0);
  return String(Math.round(v * 100) / 100);
}

/* ───────────────────────── Line chart ───────────────────────── */

/**
 * @param labels  [{ short: '5 Oct', full: 'Mon, 5 Oct 2026' }] one per point
 * @param series  [{ key, name, color, values: number[] (null = no value that day) }]
 * @param format  value -> text, used in the tooltip
 * @param area    soft fill under the line (single series only)
 * @param extra   (index) => [{ name, value }] more rows for the tooltip
 * @param fromZero false for values that never come near zero (an exchange rate): the axis then
 *                follows the data instead of flattening the line against a far-away zero
 */
export function LineChart({ labels, series, format = (v) => String(v), height = 260, area = false, extra, ariaLabel, fromZero = true }) {
  const [wrapRef, width] = useWidth();
  const [hover, setHover] = useState(null);
  const n = labels.length;

  const M = { top: 12, right: 14, bottom: 26, left: 44 };
  const W = Math.max(width, 240);
  const plotW = W - M.left - M.right;
  const plotH = height - M.top - M.bottom;

  const scale = useMemo(() => {
    let min = fromZero ? 0 : Infinity;
    let max = fromZero ? 0 : -Infinity;
    for (const s of series) {
      for (const v of s.values) {
        if (v === null || v === undefined) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (!Number.isFinite(min)) return niceScale(0, 1, 4);
    if (!fromZero) {
      const pad = Math.max((max - min) * 0.15, Math.abs(max) * 0.005, 0.01);
      return niceScale(min - pad, max + pad, 4);
    }
    return niceScale(min, max, 4);
  }, [series, fromZero]);

  const x = (i) => M.left + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const y = (v) => M.top + plotH - ((v - scale.lo) / (scale.hi - scale.lo || 1)) * plotH;

  // Lines break where a day has no value (used by the INR-rate chart)
  const paths = series.map((s) => {
    let d = '';
    let pen = false;
    const runs = [];
    let run = [];
    s.values.forEach((v, i) => {
      if (v === null || v === undefined) {
        pen = false;
        if (run.length) runs.push(run);
        run = [];
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
      run.push(i);
    });
    if (run.length) runs.push(run);
    return { d, runs };
  });

  // Day labels: as many as fit without touching each other
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 62))));
  const xTicks = [];
  for (let i = n - 1; i >= 0; i -= every) xTicks.unshift(i);

  const showDots = n <= 16;

  const pick = (clientX) => {
    const el = wrapRef.current;
    if (!el || n === 0) return;
    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left - M.left;
    const i = n <= 1 ? 0 : Math.round((px / plotW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const onKey = (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      setHover((h) => {
        const cur = h === null ? n - 1 : h;
        return Math.max(0, Math.min(n - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)));
      });
    } else if (e.key === 'Escape') setHover(null);
  };

  const tipLeft = hover !== null ? x(hover) : 0;
  const flip = tipLeft > W * 0.58;
  const rows =
    hover !== null
      ? [
          ...series.map((s) => ({ name: s.name, color: s.color, value: s.values[hover] })),
          ...(extra ? extra(hover).map((r) => ({ ...r, color: null })) : []),
        ]
      : [];

  return (
    <div
      ref={wrapRef}
      className="relative select-none outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded-xl"
      style={{ height, touchAction: 'pan-y' }}
      tabIndex={0}
      role="img"
      aria-label={ariaLabel}
      onPointerMove={(e) => pick(e.clientX)}
      onPointerDown={(e) => pick(e.clientX)}
      onPointerLeave={() => setHover(null)}
      onKeyDown={onKey}
      onBlur={() => setHover(null)}
    >
      {width > 0 && (
        <svg width={W} height={height} className="block overflow-visible">
          {/* grid + value axis */}
          {scale.ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 && fromZero ? AXIS : GRID} strokeWidth="1" />
              <text x={M.left - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10.5" fill={INK_3} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {compact(t)}
              </text>
            </g>
          ))}

          {/* day labels */}
          {xTicks.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={height - 7}
              textAnchor={i === n - 1 && n > 1 ? 'end' : i === 0 && n > 1 ? 'start' : 'middle'}
              fontSize="10.5"
              fill={INK_3}
            >
              {labels[i].short}
            </text>
          ))}

          {/* soft fill under a single line */}
          {area &&
            series.length === 1 &&
            paths[0].runs.map((run, k) => {
              const s = series[0];
              const first = run[0];
              const last = run[run.length - 1];
              const d =
                `M${x(first).toFixed(1)},${y(0).toFixed(1)}` +
                run.map((i) => `L${x(i).toFixed(1)},${y(s.values[i]).toFixed(1)}`).join('') +
                `L${x(last).toFixed(1)},${y(0).toFixed(1)}Z`;
              return <path key={k} d={d} fill={s.color} opacity="0.1" />;
            })}

          {/* crosshair */}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + plotH} stroke={AXIS} strokeWidth="1" />}

          {/* lines */}
          {series.map((s, si) => (
            <path key={s.key} d={paths[si].d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          ))}

          {/* points: every day on short ranges, otherwise lonely days and the last day */}
          {series.map((s, si) =>
            s.values.map((v, i) => {
              if (v === null || v === undefined) return null;
              const lonely = paths[si].runs.some((run) => run.length === 1 && run[0] === i);
              const isLast = i === n - 1;
              if (!showDots && !lonely && !isLast && hover !== i) return null;
              const big = hover === i;
              return (
                <circle key={`${s.key}-${i}`} cx={x(i)} cy={y(v)} r={big ? 5 : 4} fill={s.color} stroke="#ffffff" strokeWidth="2" />
              );
            })
          )}
        </svg>
      )}

      {/* tooltip: every series for that day */}
      {hover !== null && width > 0 && (
        <div
          className="pointer-events-none absolute z-10 top-1 bg-white border border-slate-200 shadow-lg rounded-xl px-3 py-2 min-w-[150px]"
          style={flip ? { right: W - tipLeft + 10 } : { left: tipLeft + 10 }}
        >
          <p className="text-[11px] font-semibold text-slate-500 mb-1 whitespace-nowrap">{labels[hover].full}</p>
          {rows.map((r) => (
            <div key={r.name} className="flex items-center justify-between gap-4 text-xs leading-5 whitespace-nowrap">
              <span className="flex items-center gap-1.5 text-slate-500">
                {r.color ? <span className="inline-block w-3 h-0.5 rounded-full" style={{ background: r.color }} /> : <span className="inline-block w-3" />}
                {r.name}
              </span>
              <span className="font-bold text-slate-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {r.value === null || r.value === undefined ? '—' : typeof r.value === 'number' ? format(r.value) : r.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Legend row for line charts: a short stroke of the series colour, the name, and its total. */
export function LineLegend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {items.map((it) => (
        <span key={it.name} className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className="inline-block w-4 h-0.5 rounded-full" style={{ background: it.color }} />
          <span>{it.name}</span>
          {it.value !== undefined && <span className="font-bold text-slate-900">{it.value}</span>}
        </span>
      ))}
    </div>
  );
}

/* ───────────────────────── Donut chart ───────────────────────── */

/**
 * @param slices [{ id, name, value, color }] biggest first; values must be positive
 * @param format value -> text
 * @param totalLabel small text under the total in the middle
 */
export function DonutChart({ slices, format = (v) => String(v), totalLabel = 'Total', emptyText = 'Nothing in this period' }) {
  const [active, setActive] = useState(null);
  const total = slices.reduce((s, x) => s + x.value, 0);

  const SIZE = 168;
  const STROKE = 22;
  const R = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * R;
  const GAP = slices.length > 1 ? 2 : 0; // white space between slices, not a border

  if (!(total > 0)) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={GRID} strokeWidth={STROKE} />
        </svg>
        <p className="text-xs text-slate-400 mt-3">{emptyText}</p>
      </div>
    );
  }

  let offset = 0;
  const arcs = slices.map((s) => {
    const len = (s.value / total) * C;
    const arc = { ...s, len: Math.max(len - GAP, 0.5), start: offset + GAP / 2, pct: (s.value / total) * 100 };
    offset += len;
    return arc;
  });

  const shown = active !== null ? arcs.find((a) => a.id === active) : null;
  const pctText = (p) => (p >= 10 ? `${p.toFixed(0)}%` : `${p.toFixed(1)}%`);

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`${totalLabel}: ${format(total)}`}>
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {arcs.map((a) => (
              <circle
                key={a.id}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={a.color}
                strokeWidth={active === a.id ? STROKE + 4 : STROKE}
                strokeDasharray={`${a.len} ${C - a.len}`}
                strokeDashoffset={-a.start}
                opacity={active === null || active === a.id ? 1 : 0.3}
                style={{ transition: 'opacity 150ms, stroke-width 150ms', cursor: 'pointer' }}
                onPointerEnter={() => setActive(a.id)}
                onPointerLeave={() => setActive(null)}
              />
            ))}
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-7">
          <span className="text-lg font-extrabold text-slate-900 leading-tight">{format(shown ? shown.value : total)}</span>
          <span className="text-[10px] font-semibold text-slate-500 leading-tight mt-0.5 line-clamp-2">
            {shown ? `${shown.name} · ${pctText(shown.pct)}` : totalLabel}
          </span>
        </div>
      </div>

      {/* the legend doubles as the table of values */}
      <ul className="w-full min-w-0 space-y-0.5">
        {arcs.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onPointerEnter={() => setActive(a.id)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(a.id)}
              onBlur={() => setActive(null)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                active === a.id ? 'bg-slate-100' : 'hover:bg-slate-50'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: a.color }} />
              <span className="text-xs text-slate-600 truncate flex-1 min-w-0">{a.name}</span>
              <span className="text-xs font-bold text-slate-900 shrink-0" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {format(a.value)}
              </span>
              <span className="text-[11px] text-slate-400 w-10 text-right shrink-0" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {pctText(a.pct)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Fixed order, never cycled: the first five stores / people keep their colour, the rest are "Other".
export const CATEGORY_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];
export const OTHER_COLOR = '#94a3b8';
export const colorForSlot = (slot) => (slot >= 0 && slot < CATEGORY_COLORS.length ? CATEGORY_COLORS[slot] : OTHER_COLOR);

export const CHART_INK = { INK, INK_2, INK_3 };
