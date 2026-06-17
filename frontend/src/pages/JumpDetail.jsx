import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Play, Pause, RotateCcw, Layers, SkipBack, SkipForward } from 'lucide-react';
import { api } from '../api';
import { useUnits } from '../App';
import * as U from '../units';
import { Button }   from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { cn } from '../lib/utils';
import TelemetryChart from '../components/TelemetryChart';
import WeatherCard from '../components/WeatherCard';
import { fetchWeather } from '../lib/weather';

// DeviceMode: 2=climb, 3=freefall, 4=canopy, 5=ground
const PHASE_COLOR = { 2: '#00cc55', 3: '#ff3333', 4: '#3399ff', 5: '#888888' };
const PHASE_LABEL = { 2: 'Climbing', 3: 'Freefall', 4: 'Under Canopy', 5: 'Ground' };

function getPhase(pt) { return pt?.device_mode ?? 5; }

function fmtDuration(s) {
  if (s == null || s <= 0) return '—';
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function fmtTime(ms) {
  if (!ms && ms !== 0) return '0:00.0';
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = (total % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

function StatChip({ label, value, accent }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-md px-3 py-2 min-w-[80px] shrink-0 border border-border"
      style={accent ? { borderColor: `${accent}40`, background: `${accent}0a` } : undefined}
    >
      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground leading-none mb-1">
        {label}
      </span>
      <span
        className="text-sm font-bold font-mono tabular-nums leading-none"
        style={accent ? { color: accent } : undefined}
      >
        {value ?? '—'}
      </span>
    </div>
  );
}

const PLAYBACK_SPEEDS = [1, 5, 10, 30, 100];

export default function JumpDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { units } = useUnits();

  const [jump,      setJump]      = useState(null);
  const [track,     setTrack]     = useState([]);
  const [cursor,    setCursor]    = useState(0);
  const [playing,   setPlaying]   = useState(false);
  const [speed,     setSpeed]     = useState(30);
  const [notes,          setNotes]          = useState('');
  const [discipline,     setDiscipline]     = useState('');
  const [jumpRunBearing, setJumpRunBearing] = useState(null);
  const [saving,         setSaving]         = useState(false);
  const [mapReady,  setMapReady]  = useState(false);
  const [terrain3d, setTerrain3d] = useState(false);
  const [weather,   setWeather]   = useState(null);
  const [wxLoading, setWxLoading] = useState(false);

  const mapContainerRef = useRef(null);
  const mapRef          = useRef(null);
  const markerRef       = useRef(null);
  const rafRef          = useRef(null);
  const lastRafTime     = useRef(null);

  // Fetch jump metadata
  useEffect(() => {
    api.jump(id).then(j => { setJump(j); setNotes(j.notes || ''); setDiscipline(j.discipline_id || ''); });
  }, [id]);

  // Fetch track + apply median filter
  useEffect(() => {
    api.jumpTrack(id).then(t => {
      const pts = t.points || [];
      const smoothed = pts.map((pt, i) => {
        const win = pts.slice(Math.max(0, i - 2), i + 3).map(p => p.inst_vert_speed_ms ?? 0);
        win.sort((a, b) => a - b);
        return { ...pt, inst_vert_speed_ms: win[Math.floor(win.length / 2)] };
      });
      setTrack(smoothed);
    }).catch(() => {});
  }, [id]);

  // Fetch weather once jump is loaded
  useEffect(() => {
    if (!jump?.exit_lat || !jump?.exit_lon || !jump?.jumped_at) return;
    setWxLoading(true);
    fetchWeather(jump.exit_lat, jump.exit_lon, jump.jumped_at)
      .then(w => { setWeather(w); setWxLoading(false); })
      .catch(() => setWxLoading(false));
  }, [jump?.exit_lat, jump?.exit_lon, jump?.jumped_at]);

  // Build Mapbox once track is ready — lazy-load mapbox-gl to avoid bundling it eagerly
  useEffect(() => {
    if (!track.length || !mapContainerRef.current || mapRef.current) return;
    const valid = track.filter(p => p.gps_lat && p.gps_lon && Math.abs(p.gps_lat) > 1);
    if (!valid.length) return;

    let destroyed = false;

    (async () => {
      const [{ default: mapboxgl }] = await Promise.all([
        import('mapbox-gl'),
        import('mapbox-gl/dist/mapbox-gl.css'),
      ]);

      if (destroyed || !mapContainerRef.current) return;

      mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

      const features = [];
      for (let i = 1; i < valid.length; i++) {
        const a = valid[i - 1], b = valid[i];
        features.push({
          type: 'Feature',
          properties: { color: PHASE_COLOR[getPhase(a)] ?? '#888' },
          geometry: { type: 'LineString', coordinates: [[a.gps_lon, a.gps_lat], [b.gps_lon, b.gps_lat]] },
        });
      }

      const bounds = valid.reduce(
        (b, p) => b.extend([p.gps_lon, p.gps_lat]),
        new mapboxgl.LngLatBounds([valid[0].gps_lon, valid[0].gps_lat], [valid[0].gps_lon, valid[0].gps_lat])
      );

      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        bounds,
        fitBoundsOptions: { padding: 40 },
        attributionControl: false,
      });
      mapRef.current = map;

      map.on('load', () => {
        if (destroyed) { map.remove(); return; }

        map.addSource('mapbox-dem', {
          type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512, maxzoom: 14,
        });

        map.addSource('track', { type: 'geojson', data: { type: 'FeatureCollection', features } });
        map.addLayer({
          id: 'track-line', type: 'line', source: 'track',
          paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-opacity': 0.9 },
        });

        // ── Jump run heading indicator (dashed white line + arrowhead) ───────
        try {
          const climbPts = valid.filter(p => p.device_mode === 2);
          if (climbPts.length >= 2) {
            const tail   = climbPts.slice(-20);
            const exitPt = tail[tail.length - 1];
            const refPt  = tail[0];

            const lat1 = +refPt.gps_lat,  lon1 = +refPt.gps_lon;
            const lat2 = +exitPt.gps_lat, lon2 = +exitPt.gps_lon;

            if (!isNaN(lat1) && !isNaN(lon1) && !isNaN(lat2) && !isNaN(lon2)) {
              const dLon = (lon2 - lon1) * Math.cos(lat2 * Math.PI / 180);
              const dLat = lat2 - lat1;
              const bearingDeg = ((Math.atan2(dLon, dLat) * 180 / Math.PI) + 360) % 360;

              const RAD = Math.PI / 180;
              const len = 0.036; // ~2.5 miles forward
              const endLat = lat2 + len * Math.cos(bearingDeg * RAD);
              const endLon = lon2 + len * Math.sin(bearingDeg * RAD);

              map.addSource('jump-run', {
                type: 'geojson',
                data: {
                  type: 'Feature',
                  geometry: { type: 'LineString', coordinates: [[lon2, lat2], [endLon, endLat]] },
                },
              });
              map.addLayer({
                id: 'jump-run-line', type: 'line', source: 'jump-run',
                paint: {
                  'line-color': '#facc15',
                  'line-width': 2.5,
                  'line-opacity': 0.95,
                },
              });

              // ▼ triangle (border-top) — tip points DOWN by default (180°).
              // Rotate by (bearingDeg - 180) so the tip points in bearingDeg direction.
              // anchor:'top' puts the base of ▼ at [endLon,endLat]; tip extends outward along bearing.
              const arrowEl = document.createElement('div');
              arrowEl.style.cssText = [
                'width:0;height:0',
                'border-left:7px solid transparent',
                'border-right:7px solid transparent',
                'border-top:16px solid #facc15',
                'filter:drop-shadow(0 0 3px rgba(0,0,0,0.7))',
                `transform:rotate(${bearingDeg - 180}deg)`,
                'transform-origin:center top',
              ].join(';');
              new mapboxgl.Marker({ element: arrowEl, anchor: 'top' })
                .setLngLat([endLon, endLat])
                .addTo(map);

              const dot = document.createElement('div');
              dot.style.cssText = 'width:10px;height:10px;border-radius:50%;background:#fff;border:2px solid rgba(0,0,0,0.5);box-shadow:0 0 4px rgba(0,0,0,0.6)';
              new mapboxgl.Marker({ element: dot, anchor: 'center' })
                .setLngLat([lon2, lat2])
                .addTo(map);

              setJumpRunBearing(Math.round(bearingDeg));
            }
          }
        } catch (err) {
          console.error('Jump run indicator error:', err);
        }

        try {
          map.addLayer({
            id: 'sky', type: 'sky',
            paint: { 'sky-type': 'atmosphere', 'sky-atmosphere-sun': [0, 90], 'sky-atmosphere-sun-intensity': 15 },
          });
        } catch (err) {
          console.warn('Sky layer not supported:', err.message);
        }

        new mapboxgl.Marker({ color: '#00cc55' }).setLngLat([valid[0].gps_lon, valid[0].gps_lat]).addTo(map);
        new mapboxgl.Marker({ color: '#3399ff' }).setLngLat([valid[valid.length-1].gps_lon, valid[valid.length-1].gps_lat]).addTo(map);

        const el = document.createElement('div');
        el.style.cssText = 'width:14px;height:14px;border-radius:50%;background:#FFDD00;border:2px solid #fff;box-shadow:0 0 8px rgba(0,0,0,.7)';
        markerRef.current = new mapboxgl.Marker({ element: el })
          .setLngLat([valid[0].gps_lon, valid[0].gps_lat]).addTo(map);

        setMapReady(true);
      });
    })();

    return () => {
      destroyed = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      markerRef.current = null;
    };
  }, [track]);

  // 3D terrain toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (terrain3d) {
      map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
      map.easeTo({ pitch: 60, bearing: -20, duration: 800 });
    } else {
      map.setTerrain(null);
      map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
    }
  }, [terrain3d, mapReady]);

  // Move map marker on cursor change
  useEffect(() => {
    if (!markerRef.current || !track.length) return;
    const pt = track[cursor];
    if (pt?.gps_lat && pt?.gps_lon && Math.abs(pt.gps_lat) > 1) {
      markerRef.current.setLngLat([pt.gps_lon, pt.gps_lat]);
    }
  }, [cursor, track]);

  // Time-based RAF playback
  const animate = useCallback((now) => {
    if (lastRafTime.current === null) lastRafTime.current = now;
    const realDelta = now - lastRafTime.current;
    lastRafTime.current = now;

    setCursor(c => {
      if (c >= track.length - 1) {
        setPlaying(false);
        cancelAnimationFrame(rafRef.current);
        return c;
      }
      const dataDelta = realDelta * speed;
      const targetMs  = track[c].sample_ms + dataDelta;
      let next = c;
      while (next < track.length - 1 && track[next].sample_ms < targetMs) next++;
      return next;
    });

    rafRef.current = requestAnimationFrame(animate);
  }, [track, speed]);

  useEffect(() => {
    if (playing) {
      lastRafTime.current = null;
      rafRef.current = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(rafRef.current);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, animate]);

  // Analysis (canopy, freefall, swoop) — derived from track
  const analysis = useMemo(() => {
    if (!track.length) return null;

    const ffPts     = track.filter(p => p.device_mode === 3);
    const canopyPts = track.filter(p => p.device_mode === 4);

    // Coerce string DB values to numbers
    const n = v => (v == null ? null : +v);

    // Avg glide ratio during canopy
    const glides = canopyPts
      .filter(p => Math.abs(n(p.inst_vert_speed_ms) ?? 0) > 0.5)
      .map(p => ((n(p.gps_speed_knot) ?? 0) * 0.514) / Math.abs(n(p.inst_vert_speed_ms)));
    const avgGlide = glides.length
      ? glides.reduce((s, v) => s + v, 0) / glides.length
      : null;

    // Landing speed (avg GPS of last 10 canopy points with valid GPS)
    const last10 = canopyPts.slice(-10).filter(p => n(p.gps_speed_knot) != null && isFinite(n(p.gps_speed_knot)));
    const landingKt = last10.length
      ? last10.reduce((s, p) => s + n(p.gps_speed_knot), 0) / last10.length
      : null;

    // Swoop: sustained GPS speed > 40 kt (74 km/h) under 30m AGL (true low-altitude swoop)
    const veryLowAlt = canopyPts.filter(p => (n(p.altitude_above_ground_m) ?? 0) < 30);
    const swoopKt = veryLowAlt.length ? Math.max(...veryLowAlt.map(p => n(p.gps_speed_knot) ?? 0)) : 0;
    const isSwoop = swoopKt > 40;

    // Peak G at deployment (first 30 canopy points)
    const deployIdx  = track.findIndex(p => p.device_mode === 4);
    const openWindow = 30;
    const openPts    = deployIdx >= 0 ? track.slice(deployIdx, deployIdx + openWindow) : [];
    const gMag       = p => Math.sqrt(((n(p.accel_x)||0)**2 + (n(p.accel_y)||0)**2 + (n(p.accel_z)||0)**2)) / 7500;
    const peakG      = openPts.length ? Math.max(...openPts.map(gMag)) : null;

    // Avg G-force throughout freefall + canopy, excluding the opening window
    const jumpPts = track.filter((p, i) => {
      const inJump = p.device_mode === 3 || p.device_mode === 4;
      const inOpenWindow = deployIdx >= 0 && i >= deployIdx && i < deployIdx + openWindow;
      return inJump && !inOpenWindow;
    });
    const avgG = jumpPts.length
      ? jumpPts.reduce((s, p) => s + gMag(p), 0) / jumpPts.length
      : null;

    // Avg freefall vert speed
    const avgFF = ffPts.length
      ? ffPts.reduce((s, p) => s + Math.abs(n(p.inst_vert_speed_ms) ?? 0), 0) / ffPts.length
      : null;

    return { avgGlide, landingKt, isSwoop, swoopKt, peakG, avgG, avgFF };
  }, [track]);

  const currentPt  = track[cursor] ?? null;
  const phase      = getPhase(currentPt);
  const phaseColor = PHASE_COLOR[phase] ?? '#888';

  const relMs   = track.length > 1 ? (track[cursor]?.sample_ms ?? 0) - track[0].sample_ms : 0;
  const totalMs = track.length > 1 ? track[track.length - 1].sample_ms - track[0].sample_ms : 0;
  const pct     = totalMs ? (relMs / totalMs) * 100 : 0;

  // Phase-colored segments for the scrubber progress bar
  const scrubberPhaseSegments = useMemo(() => {
    if (!track.length) return [];
    const regions = [];
    let start = 0, mode = track[0].device_mode;
    for (let i = 1; i <= track.length; i++) {
      const m = i < track.length ? track[i].device_mode : -1;
      if (m !== mode) {
        const x1 = (start / Math.max(track.length - 1, 1)) * 100;
        const x2 = ((i - 1) / Math.max(track.length - 1, 1)) * 100;
        regions.push({ x1, width: x2 - x1, color: PHASE_COLOR[mode] });
        start = i; mode = m;
      }
    }
    return regions;
  }, [track]);

  if (!jump) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
      Loading…
    </div>
  );

  const date = jump.jumped_at
    ? new Date(jump.jumped_at).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      })
    : null;

  return (
    <div className="flex flex-col min-h-screen bg-background pb-16">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-primary text-sm hover:underline shrink-0"
        >
          <ChevronLeft size={16} /> Back
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{date || jump.filename}</p>
          <p className="text-[10px] text-muted-foreground truncate leading-none mt-0.5">{jump.filename}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => jump.prev_id && navigate(`/jumps/${jump.prev_id}`)}
            disabled={!jump.prev_id}
            className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Previous jump"
          >
            <ChevronLeft size={16} className="text-foreground" />
          </button>
          <button
            onClick={() => jump.next_id && navigate(`/jumps/${jump.next_id}`)}
            disabled={!jump.next_id}
            className="p-1.5 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Next jump"
          >
            <ChevronRight size={16} className="text-foreground" />
          </button>
        </div>
      </div>

      {/* ── Stats strip ─────────────────────────────────────────── */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar">
        <StatChip label="Exit Alt"   value={U.alt(jump.exit_altitude_m, units)}        accent="#00cc55" />
        <StatChip label="FF Time"    value={fmtDuration(jump.freefall_duration_s)}     accent="#ff3333" />
        <StatChip label="Max Speed"  value={U.speed(jump.max_freefall_speed_ms, units)} accent="#ff3333" />
        <StatChip label="Deploy Alt" value={U.alt(jump.deployment_altitude_m, units)}  accent="#3399ff" />
        <StatChip label="Canopy"     value={fmtDuration(jump.canopy_duration_s)}       accent="#3399ff" />
        {analysis?.avgGlide != null && (
          <StatChip label="Glide" value={`${analysis.avgGlide.toFixed(1)}:1`} accent="#3399ff" />
        )}
        {analysis?.isSwoop && (
          <StatChip label="Peak Swoop" value={U.gpsSpeed(analysis.swoopKt, units)} accent="#FFD700" />
        )}
        {analysis?.peakG != null && (
          <StatChip label="Open G" value={`${analysis.peakG.toFixed(1)}G`} accent="#C084FC" />
        )}
        {analysis?.avgG != null && (
          <StatChip label="Avg G" value={`${analysis.avgG.toFixed(2)}G`} accent="#C084FC" />
        )}
      </div>

      {/* ── Map ─────────────────────────────────────────────────── */}
      <div className="relative mx-4 rounded-lg overflow-hidden border border-border" style={{ height: 280 }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

        {/* Compass rose */}
        {mapReady && (
          <div className="absolute top-2 left-2 z-10 pointer-events-none" style={{ width: 48, height: 48 }}>
            <svg viewBox="0 0 48 48" width="48" height="48">
              {/* N needle */}
              <polygon points="24,4 20,24 24,20 28,24" fill="#ef4444" />
              {/* S needle */}
              <polygon points="24,44 20,24 24,28 28,24" fill="white" />
              {/* E needle */}
              <polygon points="44,24 24,20 28,24 24,28" fill="white" />
              {/* W needle */}
              <polygon points="4,24 24,20 20,24 24,28" fill="white" />
              {/* Center dot */}
              <circle cx="24" cy="24" r="3" fill="#1a1a1a" />
              {/* Labels */}
              <text x="24" y="3" textAnchor="middle" fill="#ef4444" fontSize="7" fontWeight="bold" fontFamily="sans-serif">N</text>
              <text x="24" y="48" textAnchor="middle" fill="white" fontSize="7" fontWeight="bold" fontFamily="sans-serif">S</text>
              <text x="47" y="26" textAnchor="middle" fill="white" fontSize="7" fontWeight="bold" fontFamily="sans-serif">E</text>
              <text x="1" y="26" textAnchor="middle" fill="white" fontSize="7" fontWeight="bold" fontFamily="sans-serif">W</text>
            </svg>
          </div>
        )}

        {mapReady && (
          <button
            onClick={() => setTerrain3d(v => !v)}
            className={cn(
              'absolute top-2 right-2 z-10 flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold shadow-lg transition-colors',
              terrain3d
                ? 'bg-primary text-primary-foreground'
                : 'bg-black/60 text-white border border-white/20 hover:bg-black/80'
            )}
          >
            <Layers size={12} /> {terrain3d ? '3D' : '2D'}
          </button>
        )}

        {/* Phase legend */}
        {mapReady && (
          <div className="absolute bottom-2 left-2 flex gap-2 flex-wrap bg-black/60 rounded px-2 py-1">
            {Object.entries(PHASE_LABEL).filter(([m]) => m !== '5').map(([m, label]) => (
              <div key={m} className="flex items-center gap-1 text-[9px] text-white/80">
                <span className="w-2 h-2 rounded-full" style={{ background: PHASE_COLOR[m] }} />
                {label}
              </div>
            ))}
            {jumpRunBearing !== null && (
              <div className="flex items-center gap-1 text-[9px] text-white/80">
                <span className="inline-block w-4 border-t-2 border-yellow-400" />
                Jump Run {jumpRunBearing}°
              </div>
            )}
          </div>
        )}

        {!track.length && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm bg-background/80">
            {jump.row_count ? 'Loading track…' : 'No GPS data'}
          </div>
        )}
      </div>

      {/* ── Telemetry chart strip ───────────────────────────────── */}
      {track.length > 0 && (
        <div className="mx-4 mt-3 relative">
          <TelemetryChart
            points={track}
            cursor={cursor}
            onCursor={idx => { setPlaying(false); setCursor(idx); }}
          />
        </div>
      )}

      {/* ── Scrubber / playback ─────────────────────────────────── */}
      {track.length > 0 && (
        <div className="mx-4 mt-3 border border-border rounded-lg overflow-hidden">

          {/* Phase-banded progress bar */}
          <div className="relative h-1.5 bg-muted">
            {/* Phase segments */}
            {scrubberPhaseSegments.map((r, i) => (
              <div
                key={i}
                className="absolute inset-y-0 opacity-60"
                style={{ left: `${r.x1}%`, width: `${r.width}%`, background: r.color }}
              />
            ))}

            {/* Playhead — thin vertical line */}
            <div
              className="absolute inset-y-0 w-0.5 bg-white shadow-md"
              style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
            />
          </div>

          <div className="flex items-center gap-2 px-3 py-2">
            {/* Play/pause controls */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => { setCursor(0); setPlaying(false); }}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <SkipBack size={14} />
              </button>
              <button
                onClick={() => setPlaying(p => !p)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-primary-foreground transition-colors shrink-0"
                style={{ background: phaseColor }}
              >
                {playing ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
              </button>
              <button
                onClick={() => { setCursor(track.length - 1); setPlaying(false); }}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <SkipForward size={14} />
              </button>
            </div>

            {/* Phase + time */}
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[9px] font-bold uppercase tracking-wider leading-none" style={{ color: phaseColor }}>
                {PHASE_LABEL[phase] ?? 'Ground'}
              </span>
              <span className="text-[10px] font-mono tabular-nums text-muted-foreground leading-tight whitespace-nowrap">
                {fmtTime(relMs)} / {fmtTime(totalMs)}
              </span>
            </div>

            {/* Speed selector */}
            <div className="flex gap-0.5 shrink-0">
              {PLAYBACK_SPEEDS.map(s => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={cn(
                    'text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors',
                    speed === s
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>

          {/* Scrubber input */}
          <div className="px-3 pb-2">
            <input
              type="range"
              min={0}
              max={track.length - 1}
              value={cursor}
              onChange={e => { setPlaying(false); setCursor(Number(e.target.value)); }}
              className="w-full accent-primary h-1"
            />
          </div>

          {/* Live readout */}
          <div className="grid grid-cols-4 divide-x divide-border border-t border-border">
            {[
              { label: 'Alt AGL',   val: U.alt(currentPt?.altitude_above_ground_m ?? currentPt?.altitude_m, units) },
              { label: 'Vert Spd',  val: U.speed(currentPt?.inst_vert_speed_ms, units) },
              { label: 'GPS Spd',   val: U.gpsSpeed(currentPt?.gps_speed_knot, units) },
              { label: 'Heading',   val: currentPt?.gps_angle_deg != null ? `${Math.round(currentPt.gps_angle_deg)}°` : '—' },
            ].map(({ label, val }) => (
              <div key={label} className="flex flex-col items-center py-2">
                <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</span>
                <span className="text-xs font-bold font-mono tabular-nums text-foreground">{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Analysis ────────────────────────────────────────────── */}
      {analysis && (
        <div className="mx-4 mt-3 border border-border rounded-lg p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Jump Analysis
          </h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            {analysis.avgFF != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg Freefall Spd</span>
                <span className="font-mono font-bold text-foreground">
                  {U.speed(analysis.avgFF, units)}
                </span>
              </div>
            )}
            {analysis.avgGlide != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg Glide Ratio</span>
                <span className="font-mono font-bold text-foreground">
                  {analysis.avgGlide.toFixed(1)}:1
                </span>
              </div>
            )}
            {analysis.landingKt != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Landing Speed</span>
                <span className="font-mono font-bold text-foreground">
                  {U.gpsSpeed(analysis.landingKt, units)}
                </span>
              </div>
            )}
            {analysis.peakG != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Opening G-force</span>
                <span className="font-mono font-bold" style={{ color: '#C084FC' }}>
                  {analysis.peakG.toFixed(2)}G
                </span>
              </div>
            )}
            {analysis.avgG != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg G-force</span>
                <span className="font-mono font-bold" style={{ color: '#C084FC' }}>
                  {analysis.avgG.toFixed(2)}G
                </span>
              </div>
            )}
            {analysis.isSwoop && (
              <div className="col-span-2 flex items-center gap-2 mt-1 pt-2 border-t border-border">
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider"
                  style={{ background: '#FFD70020', color: '#FFD700', border: '1px solid #FFD70040' }}
                >
                  Swoop Detected
                </span>
                <span className="text-muted-foreground">
                  Peak {U.gpsSpeed(analysis.swoopKt, units)} under 100m AGL
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Weather ─────────────────────────────────────────────── */}
      <div className="mx-4 mt-3">
        <WeatherCard weather={weather} loading={wxLoading} />
      </div>

      {/* ── Discipline & Notes ──────────────────────────────────── */}
      <div className="mx-4 mt-3 border border-border rounded-lg p-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Discipline</label>
          <select
            value={discipline}
            onChange={e => setDiscipline(e.target.value)}
            className="w-full rounded-md border border-border bg-input text-foreground text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">— Select discipline —</option>
            {[
              'Belly / RW',
              'Freefly',
              'Wingsuit',
              'Canopy Piloting / Swooping',
              'Tracking',
              'Angle',
              'Sit Flying',
              'Head Down',
              'Tandem',
              'AFF / Student',
              'HALO / HAHO',
              'BASE',
              'Hop & Pop',
              'Demo',
              'Paragliding',
              'Rode the plane down',
              'Other',
            ].map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Notes</label>
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Add notes about this jump…"
          />
        </div>

        <Button
          variant="secondary"
          size="sm"
          className="self-end"
          onClick={async () => {
            setSaving(true);
            await api.updateJump(id, { notes, discipline_id: discipline || null });
            setSaving(false);
          }}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>

      {/* ── Delete ──────────────────────────────────────────────── */}
      <div className="mx-4 mt-3">
        <Button
          variant="ghost"
          className="w-full text-destructive hover:bg-destructive/10"
          onClick={async () => {
            if (!confirm('Delete this jump and all its sensor data?')) return;
            await api.deleteJump(id);
            navigate('/jumps');
          }}
        >
          Delete this jump
        </Button>
      </div>
    </div>
  );
}
