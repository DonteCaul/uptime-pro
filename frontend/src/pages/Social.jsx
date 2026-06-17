import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const PERIODS = [
  { value: 'day',   label: 'Today' },
  { value: 'month', label: 'Month' },
  { value: 'year',  label: 'Year' },
  { value: 'all',   label: 'All Time' },
];

function Avatar({ user, size = 8 }) {
  const px = size * 4;
  if (user.avatar_path) {
    return (
      <img
        src={user.avatar_path}
        alt={user.full_name}
        className={`w-${size} h-${size} rounded-full object-cover border border-border`}
        style={{ width: px, height: px }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold shrink-0"
      style={{ width: px, height: px, fontSize: px * 0.4 }}
    >
      {(user.full_name || '?')[0].toUpperCase()}
    </div>
  );
}

function LeaderRow({ rank, user, stat, label }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      <span className={`w-6 text-center text-sm font-bold shrink-0 ${rank <= 3 ? 'text-primary' : 'text-muted-foreground'}`}>
        {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
      </span>
      <Avatar user={user} size={8} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{user.full_name || 'Anonymous'}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-foreground">{stat}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function HomeDzMap({ users }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const usersRef = useRef(users);
  usersRef.current = users;

  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapRef.current || mapInstance.current) return;
    import('mapbox-gl').then((mb) => {
      mb.default.accessToken = MAPBOX_TOKEN;
      const map = new mb.default.Map({
        container: mapRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        projection: 'globe',
        zoom: 1.5,
        center: [0, 20],
      });
      mapInstance.current = map;

      map.on('load', () => {
        map.setFog({});

        const toGeojson = (list) => ({
          type: 'FeatureCollection',
          features: list
            .filter((u) => u.home_dz_lat && u.home_dz_lon)
            .map((u) => ({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [parseFloat(u.home_dz_lon), parseFloat(u.home_dz_lat)] },
              properties: { name: u.full_name, dz: u.home_dz || '' },
            })),
        });

        const initialData = toGeojson(usersRef.current);
        map.addSource('home-dzs', { type: 'geojson', data: initialData });

        // fly to first pin if any
        if (initialData.features.length === 1) {
          map.flyTo({ center: initialData.features[0].geometry.coordinates, zoom: 9, speed: 1.2 });
        } else if (initialData.features.length > 1) {
          const lngs = initialData.features.map(f => f.geometry.coordinates[0]);
          const lats = initialData.features.map(f => f.geometry.coordinates[1]);
          map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 80, maxZoom: 8 });
        }
        map.addLayer({
          id: 'home-dzs-points',
          type: 'circle',
          source: 'home-dzs',
          paint: { 'circle-radius': 7, 'circle-color': '#3b82f6', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' },
        });

        map.on('click', 'home-dzs-points', (e) => {
          const { name, dz } = e.features[0].properties;
          new mb.default.Popup()
            .setLngLat(e.features[0].geometry.coordinates)
            .setHTML(`<strong>${name}</strong>${dz ? `<br/>${dz}` : ''}`)
            .addTo(map);
        });

        map.on('mouseenter', 'home-dzs-points', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'home-dzs-points', () => { map.getCanvas().style.cursor = ''; });
      });
    });

    return () => { mapInstance.current?.remove(); mapInstance.current = null; };
  }, []);

  // update pins when users list changes after map is loaded
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource('home-dzs');
    if (!src) return;
    src.setData({
      type: 'FeatureCollection',
      features: users
        .filter((u) => u.home_dz_lat && u.home_dz_lon)
        .map((u) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [parseFloat(u.home_dz_lon), parseFloat(u.home_dz_lat)] },
          properties: { name: u.full_name, dz: u.home_dz || '' },
        })),
    });
  }, [users]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 h-48 flex items-center justify-center text-sm text-muted-foreground">
        Set VITE_MAPBOX_TOKEN to enable the map
      </div>
    );
  }

  return <div ref={mapRef} className="rounded-lg border border-border overflow-hidden" style={{ height: 360 }} />;
}

export default function Social() {
  const [period, setPeriod] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.socialLeaderboard(period)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [period]);

  const jumpLeaders = data?.jumps || [];
  const dzLeaders = data?.dzs || [];
  const discLeaders = data?.disciplines || [];
  const homeDzUsers = data?.homeDzs || [];

  // group discipline leaders: for each discipline show top user
  const discMap = {};
  discLeaders.forEach((r) => {
    if (!discMap[r.discipline_id]) discMap[r.discipline_id] = [];
    discMap[r.discipline_id].push(r);
  });

  return (
    <div className="flex flex-col gap-6 pb-4 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-foreground">Social</h2>
        <p className="text-muted-foreground text-sm">Community leaderboards</p>
      </div>

      {/* Period selector */}
      <div className="flex gap-2">
        {PERIODS.map((p) => (
          <Button
            key={p.value}
            size="sm"
            variant={period === p.value ? 'default' : 'outline'}
            onClick={() => setPeriod(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-12">Loading…</div>
      ) : (
        <>
          {/* Jump leaderboard */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Most Jumps</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {jumpLeaders.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No public data yet</p>
              ) : (
                jumpLeaders.map((u, i) => (
                  <LeaderRow key={u.id} rank={i + 1} user={u} stat={u.jump_count} label="jumps" />
                ))
              )}
            </CardContent>
          </Card>

          {/* DZ leaderboard */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Most Dropzones Visited</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {dzLeaders.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No public data yet</p>
              ) : (
                dzLeaders.map((u, i) => (
                  <LeaderRow key={u.id} rank={i + 1} user={u} stat={u.dz_count} label="DZs" />
                ))
              )}
            </CardContent>
          </Card>

          {/* Discipline leaderboards */}
          {Object.keys(discMap).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Most Jumps by Discipline</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {Object.entries(discMap).map(([disc, leaders]) => (
                  <div key={disc} className="mb-4 last:mb-0">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                      {disc || 'Unknown'}
                    </p>
                    {leaders.slice(0, 3).map((u, i) => (
                      <LeaderRow key={`${disc}-${u.id}`} rank={i + 1} user={u} stat={u.jump_count} label="jumps" />
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Home DZ map */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Home Dropzones</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <HomeDzMap users={homeDzUsers} />
              {homeDzUsers.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  No public home DZs yet — set yours in Profile
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  {homeDzUsers.length} jumper{homeDzUsers.length !== 1 ? 's' : ''} sharing their home DZ
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
