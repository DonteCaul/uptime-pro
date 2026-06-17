import React, { useMemo, useRef, useCallback, useEffect } from 'react';
import { useUnits } from '../App';

const ACCEL_SCALE = 7500; // counts per G (calibrated from ground vector magnitude)

const W = 1000;
const H = 68;
const PAD_Y = 4;
const CHART_H = H - PAD_Y * 2;

const PHASE_BG = { 2: '#00cc55', 3: '#ff3333', 4: '#3399ff' };

const CHANNELS = [
  {
    key: 'agl',
    label: 'ALT AGL',
    color: '#00FFAA',
    getValue: (p, units) =>
      (p.altitude_above_ground_m ?? p.altitude_m ?? 0) * (units === 'imperial' ? 3.281 : 1),
    unit: u => (u === 'imperial' ? 'ft' : 'm'),
    fmt: v => Math.round(v).toLocaleString(),
    minFloor: 0,
  },
  {
    key: 'vspd',
    label: 'VERT SPD',
    color: '#FF6B35',
    getValue: (p, units) =>
      (p.inst_vert_speed_ms ?? 0) * (units === 'imperial' ? 2.237 : 1),
    unit: u => (u === 'imperial' ? 'mph' : 'm/s'),
    fmt: v => v.toFixed(1),
    minFloor: null,
  },
  {
    key: 'hspd',
    label: 'GPS SPEED',
    color: '#FFD700',
    getValue: (p, units) =>
      (p.gps_speed_knot ?? 0) * (units === 'imperial' ? 1.151 : 1.852),
    unit: u => (u === 'imperial' ? 'mph' : 'km/h'),
    fmt: v => Math.round(v).toLocaleString(),
    minFloor: 0,
  },
  {
    key: 'gforce',
    label: 'G-FORCE',
    color: '#C084FC',
    getValue: p =>
      Math.sqrt(((+p.accel_x || 0) ** 2 + (+p.accel_y || 0) ** 2 + (+p.accel_z || 0) ** 2)) /
      ACCEL_SCALE,
    unit: () => 'G',
    fmt: v => v.toFixed(2),
    minFloor: 0,
  },
];

function toNorm(v, min, max) {
  const range = max - min || 1;
  return 1 - (v - min) / range;
}

export default function TelemetryChart({ points, cursor, onCursor }) {
  const { units } = useUnits();
  const cursorLineRef = useRef(null);
  const containerRef  = useRef(null);

  // Pre-compute all channel data (only changes when points or units change)
  const channelData = useMemo(() => {
    if (!points.length) return [];
    return CHANNELS.map(ch => {
      const vals = points.map(p => ch.getValue(p, units));
      let min = Math.min(...vals);
      let max = Math.max(...vals);
      if (ch.minFloor !== null) min = Math.min(min, ch.minFloor);
      if (min === max) { min -= 1; max += 1; }
      const polyPts = vals
        .map((v, i) => {
          const x = (i / Math.max(points.length - 1, 1)) * W;
          const y = PAD_Y + toNorm(v, min, max) * CHART_H;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
      const lastX = W.toFixed(1);
      const bottomY = (PAD_Y + CHART_H).toFixed(1);
      const fillPts = `0,${bottomY} ${polyPts} ${lastX},${bottomY}`;
      return { vals, min, max, polyPts, fillPts, ch };
    });
  }, [points, units]);

  // Phase background regions
  const phaseRegions = useMemo(() => {
    if (!points.length) return [];
    const regions = [];
    let start = 0, mode = points[0].device_mode;
    for (let i = 1; i <= points.length; i++) {
      const m = i < points.length ? points[i].device_mode : -1;
      if (m !== mode) {
        regions.push({ start, end: i - 1, mode });
        start = i; mode = m;
      }
    }
    return regions;
  }, [points]);

  // Update cursor line via DOM ref — no React re-render on every frame
  useEffect(() => {
    if (!cursorLineRef.current || !points.length) return;
    const pct = (cursor / Math.max(points.length - 1, 1)) * 100;
    cursorLineRef.current.style.left = `${pct}%`;
  }, [cursor, points.length]);

  // Pointer scrubbing
  const handlePointer = useCallback((e) => {
    if (!(e.buttons & 1) && e.type === 'pointermove') return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !points.length) return;
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const idx  = Math.round(pct * (points.length - 1));
    onCursor(idx);
  }, [points.length, onCursor]);

  const handlePointerDown = useCallback((e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    handlePointer(e);
  }, [handlePointer]);

  if (!channelData.length) return null;

  const n = points.length;

  return (
    <div className="flex flex-col border border-border rounded-lg overflow-hidden">
      {channelData.map(({ vals, min, max, polyPts, fillPts, ch }, ci) => {
        const curVal = vals[cursor];
        const gradId = `grad-${ch.key}`;
        return (
          <div
            key={ch.key}
            className="relative"
            style={{ borderTop: ci === 0 ? 'none' : '1px solid hsl(var(--border))' }}
          >
            {/* Header row */}
            <div className="absolute top-0 left-0 right-0 flex items-start justify-between px-2 pt-1 pointer-events-none z-10">
              <span
                className="text-[9px] font-bold uppercase tracking-widest leading-none"
                style={{ color: ch.color, textShadow: '0 0 6px rgba(0,0,0,0.7)' }}
              >
                {ch.label} <span className="opacity-60">{ch.unit(units)}</span>
              </span>
              <span
                className="text-sm font-mono font-bold leading-none tabular-nums"
                style={{ color: ch.color, textShadow: '0 0 6px rgba(0,0,0,0.8)' }}
              >
                {curVal != null ? ch.fmt(curVal) : '—'}
              </span>
            </div>

            {/* SVG chart */}
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              style={{ display: 'block', width: '100%', height: H }}
            >
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ch.color} stopOpacity="0.25" />
                  <stop offset="100%" stopColor={ch.color} stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Phase background bands */}
              {phaseRegions.map((r, ri) => {
                const x1 = (r.start / Math.max(n - 1, 1)) * W;
                const x2 = (r.end   / Math.max(n - 1, 1)) * W;
                const bg = PHASE_BG[r.mode];
                return bg ? (
                  <rect key={ri} x={x1} y={0} width={x2 - x1} height={H} fill={bg} opacity={0.07} />
                ) : null;
              })}

              {/* Y-axis range labels */}
              <text x={3} y={PAD_Y + 6} fontSize={7} fill="currentColor" opacity={0.35} fontFamily="monospace">
                {CHANNELS[ci].fmt(max)}
              </text>
              <text x={3} y={H - PAD_Y - 1} fontSize={7} fill="currentColor" opacity={0.35} fontFamily="monospace">
                {CHANNELS[ci].fmt(min)}
              </text>

              {/* Fill */}
              <polygon points={fillPts} fill={`url(#${gradId})`} />

              {/* Trace */}
              <polyline
                points={polyPts}
                fill="none"
                stroke={ch.color}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </div>
        );
      })}

      {/* Cursor overlay — single div spanning all channel rows, updated via ref */}
      <div
        ref={containerRef}
        className="absolute inset-0 cursor-crosshair"
        style={{ pointerEvents: 'all' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointer}
      />

      {/* Cursor line — positioned via ref, no React re-render */}
      <div
        ref={cursorLineRef}
        className="absolute top-0 bottom-0 pointer-events-none"
        style={{
          left: 0,
          width: 1,
          background: 'rgba(255,221,0,0.85)',
          boxShadow: '0 0 4px rgba(255,221,0,0.5)',
        }}
      />
    </div>
  );
}
