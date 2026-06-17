import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useNavigate } from 'react-router-dom';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export default function JumpMap({ jumps, theme }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const navigateRef = useRef(null);
  const navigate = useNavigate();
  navigateRef.current = navigate;

  useEffect(() => {
    if (!containerRef.current || !TOKEN) return;

    mapboxgl.accessToken = TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: theme === 'dark'
        ? 'mapbox://styles/mapbox/dark-v11'
        : 'mapbox://styles/mapbox/streets-v12',
      center: [0, 20],
      zoom: 1.5,
    });

    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('load', () => {
      const features = jumps
        .filter((j) => j.exit_lat && j.exit_lon)
        .map((j) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [j.exit_lon, j.exit_lat] },
          properties: {
            id: j.id,
            date: j.jumped_at,
            exit_alt: j.exit_altitude_m,
            ff: j.freefall_duration_s,
          },
        }));

      map.addSource('jumps', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
        cluster: true,
        clusterMaxZoom: 11,
        clusterRadius: 45,
      });

      // Cluster circle
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'jumps',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#10b981',
          'circle-radius': ['step', ['get', 'point_count'], 16, 5, 22, 20, 28],
          'circle-opacity': 0.88,
        },
      });

      // Cluster count label
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'jumps',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12,
        },
        paint: { 'text-color': '#ffffff' },
      });

      // Individual point
      map.addLayer({
        id: 'point',
        type: 'circle',
        source: 'jumps',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#10b981',
          'circle-radius': 7,
          'circle-stroke-width': 2,
          'circle-stroke-color': theme === 'dark' ? '#0d1117' : '#ffffff',
          'circle-opacity': 0.9,
        },
      });

      // Fit map to jump locations
      if (features.length === 1) {
        map.setCenter(features[0].geometry.coordinates);
        map.setZoom(10);
      } else if (features.length > 1) {
        const bounds = features.reduce(
          (b, f) => b.extend(f.geometry.coordinates),
          new mapboxgl.LngLatBounds(features[0].geometry.coordinates, features[0].geometry.coordinates)
        );
        map.fitBounds(bounds, { padding: 60, maxZoom: 12 });
      }

      // Cluster click → zoom in
      map.on('click', 'clusters', (e) => {
        const [feature] = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
        map.getSource('jumps').getClusterExpansionZoom(
          feature.properties.cluster_id,
          (err, zoom) => {
            if (!err) map.easeTo({ center: feature.geometry.coordinates, zoom });
          }
        );
      });

      // Point click → popup
      map.on('click', 'point', (e) => {
        const { id, date, exit_alt, ff } = e.features[0].properties;
        const coords = [...e.features[0].geometry.coordinates];

        const dateStr = date
          ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : 'Unknown date';

        const altStr = exit_alt ? `${Math.round(exit_alt)} m exit` : '';
        const ffStr = ff ? `${Math.round(ff)}s FF` : '';
        const meta = [altStr, ffStr].filter(Boolean).join(' · ');

        const uid = `popup-${id}`;
        const popup = new mapboxgl.Popup({ offset: 10, maxWidth: '180px' })
          .setLngLat(coords)
          .setHTML(`
            <div style="font-family:system-ui;font-size:13px;line-height:1.5">
              <p style="font-weight:600;margin:0 0 2px">${dateStr}</p>
              ${meta ? `<p style="color:#6b7280;font-size:11px;margin:0 0 6px">${meta}</p>` : ''}
              <button id="${uid}" style="color:#10b981;font-size:12px;background:none;border:none;padding:0;cursor:pointer;font-weight:500">
                View jump →
              </button>
            </div>
          `)
          .addTo(map);

        setTimeout(() => {
          document.getElementById(uid)?.addEventListener('click', () => {
            popup.remove();
            navigateRef.current(`/jumps/${id}`);
          });
        }, 0);
      });

      // Cursors
      ['clusters', 'point'].forEach((layer) => {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [jumps, theme]);

  if (!TOKEN) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        VITE_MAPBOX_TOKEN not set
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full" />;
}
