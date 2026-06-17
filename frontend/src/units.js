// Conversion helpers — all functions accept metric values and return display strings

export function alt(meters, units) {
  if (meters == null) return '—';
  if (units === 'imperial') return `${Math.round(meters * 3.281).toLocaleString()} ft`;
  return `${Math.round(meters).toLocaleString()} m`;
}

export function speed(ms, units) {
  if (ms == null) return '—';
  if (units === 'imperial') return `${(ms * 2.237).toFixed(1)} mph`;
  return `${Number(ms).toFixed(1)} m/s`;
}

export function temp(celsius, units) {
  if (celsius == null) return '—';
  if (units === 'imperial') return `${((celsius * 9) / 5 + 32).toFixed(1)}°F`;
  return `${Number(celsius).toFixed(1)}°C`;
}

export function gpsSpeed(knots, units) {
  if (knots == null) return '—';
  if (units === 'imperial') return `${(knots * 1.151).toFixed(0)} mph`;
  return `${(knots * 1.852).toFixed(1)} km/h`;
}
