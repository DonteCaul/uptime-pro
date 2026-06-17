import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ChevronDown, ChevronUp, MapPin, Pencil, Check, X } from 'lucide-react';
import { api } from '../api';
import { useUnits, useTheme } from '../App';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import * as U from '../units';
import JumpMap from '../components/JumpMap';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

function fmtDuration(s) {
  if (!s) return null;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function clusterJumps(jumps, radiusKm = 5) {
  const withGps = jumps.filter((j) => (j.dz_lat || j.exit_lat) && (j.dz_lon || j.exit_lon));
  const noGps = jumps.filter((j) => !j.dz_lat && !j.exit_lat);
  const clusters = [];
  for (const jump of withGps) {
    const lat = parseFloat(jump.dz_lat || jump.exit_lat);
    const lon = parseFloat(jump.dz_lon || jump.exit_lon);
    let added = false;
    for (const c of clusters) {
      if (haversineKm(lat, lon, c.lat, c.lon) <= radiusKm) {
        c.jumps.push(jump);
        added = true;
        break;
      }
    }
    if (!added) clusters.push({ lat, lon, jumps: [jump], name: null });
  }
  if (noGps.length) clusters.push({ lat: null, lon: null, jumps: noGps, name: 'No GPS Data' });
  return clusters.sort((a, b) => b.jumps.length - a.jumps.length);
}

// Google Places (New) search via backend proxy — one call per unique cluster
async function fetchDropzonesInBbox(clusters) {
  const gps = clusters.filter((c) => c.lat);
  if (!gps.length) return [];

  const seen = new Set();
  const results = [];

  await Promise.all(
    gps.map(async (c) => {
      try {
        const places = await api.placesNearby(c.lat, c.lon, 16093);
        for (const p of places) {
          const key = `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          results.push({ lat: p.lat, lon: p.lon, name: p.name });
        }
      } catch {}
    })
  );

  return results;
}

async function reverseGeocode(lat, lon) {
  if (!MAPBOX_TOKEN) return null;
  try {
    const r = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?types=place,locality&limit=1&access_token=${MAPBOX_TOKEN}`
    );
    const d = await r.json();
    const name = d.features?.[0]?.place_name;
    return name ? name.split(',').slice(0, 2).join(',').trim() : null;
  } catch {
    return null;
  }
}

// ── Jump row shared between views ─────────────────────────────────────────────
function JumpRow({ jump, index, units, className }) {
  return (
    <Link
      to={`/jumps/${jump.id}`}
      className={cn(
        'flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors border-b border-border last:border-0',
        className
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {index != null && (
          <span className="text-sm font-bold text-muted-foreground/60 w-6 text-right shrink-0 tabular-nums">
            {index}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {jump.jumped_at
              ? new Date(jump.jumped_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })
              : (jump.filename?.replace('.csv', '') || 'Unknown')}
          </p>
          <div className="flex gap-2 mt-0.5 flex-wrap">
            {jump.exit_altitude_m && (
              <span className="text-xs text-muted-foreground">↑ {U.alt(jump.exit_altitude_m, units)}</span>
            )}
            {jump.freefall_duration_s && (
              <span className="text-xs text-muted-foreground">FF {fmtDuration(jump.freefall_duration_s)}</span>
            )}
            {jump.max_freefall_speed_ms && (
              <span className="text-xs text-primary">{U.speed(jump.max_freefall_speed_ms, units)}</span>
            )}
          </div>
        </div>
      </div>
      <ChevronRight size={16} className="text-muted-foreground shrink-0 ml-2" />
    </Link>
  );
}

// ── All Jumps tab ─────────────────────────────────────────────────────────────
function AllJumps({ units }) {
  const [jumps, setJumps] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = 20;

  const load = useCallback((off) => {
    setLoading(true);
    api.jumps(limit, off)
      .then((res) => { setJumps(res.jumps || []); setTotal(res.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(offset); }, [offset, load]);

  if (loading) return <div className="text-center text-muted-foreground py-10">Loading…</div>;
  if (!jumps.length) return (
    <div className="text-center text-muted-foreground py-10">
      No jumps yet.{' '}
      <Link to="/upload" className="text-primary hover:underline">Upload logs</Link>
    </div>
  );

  return (
    <>
      <Card>
        <CardContent className="p-0">
          {jumps.map((j, i) => (
            <JumpRow key={j.id} jump={j} index={offset + i + 1} units={units}
              className={i === 0 ? 'first:rounded-t-lg' : i === jumps.length - 1 ? 'last:rounded-b-lg' : ''}
            />
          ))}
        </CardContent>
      </Card>
      {total > limit && (
        <div className="flex justify-between items-center pt-2">
          <Button variant="secondary" size="sm"
            onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}>
            ← Prev
          </Button>
          <span className="text-xs text-muted-foreground">
            {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
          <Button variant="secondary" size="sm"
            onClick={() => setOffset(offset + limit)} disabled={offset + limit >= total}>
            Next →
          </Button>
        </div>
      )}
    </>
  );
}

// ── Dropzone card ─────────────────────────────────────────────────────────────
const dzKey = (c) => c.lat ? `dz:${c.lat.toFixed(3)},${c.lon.toFixed(3)}` : 'dz:nogps';

function DropzoneCard({ cluster, units }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [customName, setCustomName] = useState(() => localStorage.getItem(dzKey(cluster)) || '');
  const inputRef = useRef(null);

  const displayName = customName || cluster.name || `${cluster.lat?.toFixed(2)}°, ${cluster.lon?.toFixed(2)}°`;

  function startEdit(e) {
    e.stopPropagation();
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function save(e) {
    e?.stopPropagation();
    const val = inputRef.current?.value.trim() || '';
    setCustomName(val);
    if (val) localStorage.setItem(dzKey(cluster), val);
    else localStorage.removeItem(dzKey(cluster));
    setEditing(false);
  }

  function cancel(e) {
    e?.stopPropagation();
    setEditing(false);
  }

  return (
    <Card className="group">
      <div className="flex items-center justify-between px-4 py-3">
        <button className="flex items-center gap-3 min-w-0 flex-1 text-left" onClick={() => !editing && setOpen((o) => !o)}>
          <MapPin size={15} className={cn('shrink-0', cluster.lat ? 'text-primary' : 'text-muted-foreground')} />
          <div className="min-w-0 flex-1">
            {editing ? (
              <input
                ref={inputRef}
                defaultValue={displayName}
                className="text-sm font-semibold bg-input border border-border rounded px-2 py-0.5 w-full text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              {cluster.jumps.length} jump{cluster.jumps.length !== 1 ? 's' : ''}
            </p>
          </div>
        </button>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {editing ? (
            <>
              <button onClick={save} className="p-1 text-primary hover:text-primary/80"><Check size={14} /></button>
              <button onClick={cancel} className="p-1 text-muted-foreground hover:text-foreground"><X size={14} /></button>
            </>
          ) : (
            <>
              <button onClick={startEdit} className="p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"><Pencil size={13} /></button>
              <button onClick={() => setOpen((o) => !o)} className="p-1 text-muted-foreground">
                {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            </>
          )}
        </div>
      </div>
      {open && (
        <CardContent className="p-0 border-t border-border">
          {cluster.jumps.map((j) => (
            <JumpRow key={j.id} jump={j} units={units} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

// ── By Dropzone tab ───────────────────────────────────────────────────────────
function ByDropzone({ jumps, units }) {
  const [clusters, setClusters] = useState(() => clusterJumps(jumps));
  const [geocoding, setGeocoding] = useState(true);

  useEffect(() => {
    const cs = clusterJumps(jumps);
    setClusters(cs);
    let cancelled = false;

    fetchDropzonesInBbox(cs).then(async (dzList) => {
      if (cancelled) return;
      const radiusKm10 = 19.312;
      const names = await Promise.all(
        cs.map((c) => {
          if (!c.lat) return Promise.resolve('No GPS Data');
          // Find nearest DZ within 10 miles
          let best = null;
          for (const dz of dzList) {
            const dist = haversineKm(c.lat, c.lon, dz.lat, dz.lon);
            if (dist <= radiusKm10 && (!best || dist < best.dist)) best = { name: dz.name, dist };
          }
          if (best) return Promise.resolve(best.name);
          return reverseGeocode(c.lat, c.lon);
        })
      );
      if (cancelled) return;
      setClusters(cs.map((c, i) => ({
        ...c,
        name: names[i] || (c.lat ? `${c.lat.toFixed(2)}°, ${c.lon.toFixed(2)}°` : 'No GPS Data'),
      })));
      setGeocoding(false);
    });

    return () => { cancelled = true; };
  }, [jumps]);

  if (!clusters.length) {
    return <div className="text-center text-muted-foreground py-10">No jumps found.</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {geocoding && (
        <p className="text-xs text-center text-muted-foreground">Locating dropzones…</p>
      )}
      {clusters.map((c, i) => (
        <DropzoneCard key={i} cluster={c} units={units} />
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Jumps() {
  const { units } = useUnits();
  const { theme } = useTheme();
  const [tab, setTab] = useState('all');
  const [total, setTotal] = useState(null);
  const [allJumps, setAllJumps] = useState(null);
  const [loadingAll, setLoadingAll] = useState(false);

  useEffect(() => {
    api.jumps(1, 0).then((r) => setTotal(r.total || 0)).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab !== 'all' && allJumps === null && !loadingAll) {
      setLoadingAll(true);
      api.jumps(1000, 0)
        .then((r) => setAllJumps(r.jumps || []))
        .catch(() => setAllJumps([]))
        .finally(() => setLoadingAll(false));
    }
  }, [tab, allJumps, loadingAll]);

  const tabs = [
    { id: 'all', label: 'All Jumps' },
    { id: 'dropzone', label: 'By Dropzone' },
    { id: 'map', label: 'Map' },
  ];

  return (
    <div className="flex flex-col gap-4 pb-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Jump Log</h2>
        {total !== null && (
          <span className="text-sm text-muted-foreground">{total} jumps</span>
        )}
      </div>

      <div className="flex bg-muted rounded-md p-1 gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 py-1.5 rounded text-xs font-medium transition-colors',
              tab === t.id
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'all' && <AllJumps units={units} />}

      {tab === 'dropzone' && (
        loadingAll
          ? <div className="text-center text-muted-foreground py-10">Loading…</div>
          : <ByDropzone jumps={allJumps || []} units={units} />
      )}

      {tab === 'map' && (
        loadingAll
          ? <div className="text-center text-muted-foreground py-10">Loading…</div>
          : (
            <div
              className="-mx-4 -mb-4 overflow-hidden"
              style={{ height: 'calc(100vh - 176px)' }}
            >
              <JumpMap jumps={allJumps || []} theme={theme} />
            </div>
          )
      )}
    </div>
  );
}
