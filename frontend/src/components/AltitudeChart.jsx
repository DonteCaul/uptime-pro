import React from 'react';

export default function AltitudeChart({ points }) {
  if (!points || points.length === 0) return null;

  const alts = points.map((p) => p.altitude_above_ground_m ?? p.altitude_m ?? 0);
  const maxAlt = Math.max(...alts);
  const W = 600;
  const H = 180;
  const pad = 8;

  const coords = alts.map((a, i) => {
    const x = pad + (i / (alts.length - 1)) * (W - pad * 2);
    const y = pad + (1 - a / maxAlt) * (H - pad * 2);
    return `${x},${y}`;
  });

  const polyline = coords.join(' ');
  // Fill to bottom
  const fill = `${pad},${H - pad} ${polyline} ${W - pad},${H - pad}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl" preserveAspectRatio="none">
      <defs>
        <linearGradient id="altGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00FFAA" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#00FFAA" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={fill} fill="url(#altGrad)" />
      <polyline points={polyline} fill="none" stroke="#00FFAA" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
