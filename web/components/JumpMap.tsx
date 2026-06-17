"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

type MapInstance = InstanceType<typeof mapboxgl.Map>;

// The bundled @types/mapbox-gl has a known quirk where queryRenderedFeatures
// returns a GeoJSONFeature type that's missing properties/geometry accessors
// at the TS level (they exist at runtime). Cast through this minimal shape.
interface RenderedFeature {
  properties: Record<string, unknown>;
  geometry: { coordinates: [number, number] };
}

function asFeature(x: unknown): RenderedFeature {
  return x as RenderedFeature;
}

interface JumpFeature {
  id: number;
  jumped_at: string | null;
  exit_altitude_m: number | null;
  freefall_duration_s: number | null;
  exit_lat: number | null;
  exit_lon: number | null;
}

interface JumpMapProps {
  jumps: JumpFeature[];
  theme: "light" | "dark";
}

/**
 * Mapbox cluster map of all jumps. Client-only (mapbox-gl touches window).
 * Rendered via next/dynamic with ssr:false in the parent.
 */
export default function JumpMap({ jumps, theme }: JumpMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const router = useRouter();
  const routerRef = useRef(router);

  // Keep the ref in sync inside an effect (not during render — that's a lint
  // violation in React 19).
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!containerRef.current || !token) return;

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
        container: containerRef.current,
        style:
          theme === "dark"
            ? "mapbox://styles/mapbox/dark-v11"
            : "mapbox://styles/mapbox/streets-v12",
        center: [0, 20],
        zoom: 1.5,
      });
      mapRef.current = map;

      map.addControl(new mapboxgl.NavigationControl(), "top-right");

      map.on("load", () => {
        const features = jumps
          .filter((j) => j.exit_lat && j.exit_lon)
          .map((j) => ({
            type: "Feature" as const,
            geometry: {
              type: "Point" as const,
              coordinates: [j.exit_lon, j.exit_lat],
            },
            properties: {
              id: j.id,
              date: j.jumped_at,
              exit_alt: j.exit_altitude_m,
              ff: j.freefall_duration_s,
            },
          }));

        map.addSource("jumps", {
          type: "geojson",
          data: { type: "FeatureCollection", features },
          cluster: true,
          clusterMaxZoom: 11,
          clusterRadius: 45,
        });

        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "jumps",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#10b981",
            "circle-radius": [
              "step",
              ["get", "point_count"],
              16,
              5,
              22,
              20,
              28,
            ],
            "circle-opacity": 0.88,
          },
        });

        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "jumps",
          filter: ["has", "point_count"],
          layout: {
            "text-field": "{point_count_abbreviated}",
            "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
            "text-size": 12,
          },
          paint: { "text-color": "#ffffff" },
        });

        map.addLayer({
          id: "point",
          type: "circle",
          source: "jumps",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": "#10b981",
            "circle-radius": 7,
            "circle-stroke-width": 2,
            "circle-stroke-color":
              theme === "dark" ? "#0d1117" : "#ffffff",
            "circle-opacity": 0.9,
          },
        });

        // Fit map to jump locations.
        if (features.length === 1) {
          map.setCenter(features[0].geometry.coordinates as [number, number]);
          map.setZoom(10);
        } else if (features.length > 1) {
          const bounds = features.reduce(
            (b, f) =>
              b.extend(f.geometry.coordinates as [number, number]),
            new mapboxgl.LngLatBounds(
              features[0].geometry.coordinates as [number, number],
              features[0].geometry.coordinates as [number, number],
            ),
          );
          map.fitBounds(bounds, { padding: 60, maxZoom: 12 });
        }

        map.on("click", "clusters", (e) => {
          const [rawFeature] = map.queryRenderedFeatures(e.point, {
            layers: ["clusters"],
          });
          if (!rawFeature) return;
          const feature = asFeature(rawFeature);
          (map.getSource("jumps") as mapboxgl.GeoJSONSource)?.getClusterExpansionZoom(
            feature.properties.cluster_id as number,
            (err, zoom) => {
              if (!err && zoom != null)
                map.easeTo({
                  center: feature.geometry.coordinates,
                  zoom,
                });
            },
          );
        });

        map.on("click", "point", (e) => {
          const rawFeature = e.features?.[0];
          if (!rawFeature) return;
          const feature = asFeature(rawFeature);
          const props = feature.properties as {
            id: number;
            date: string | null;
            exit_alt: number | null;
            ff: number | null;
          };
          const { id, date, exit_alt, ff } = props;
          const coords = feature.geometry.coordinates;

          const dateStr = date
            ? new Date(date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "Unknown date";
          const altStr = exit_alt ? `${Math.round(exit_alt)} m exit` : "";
          const ffStr = ff ? `${Math.round(ff)}s FF` : "";
          const meta = [altStr, ffStr].filter(Boolean).join(" · ");
          const uid = `popup-${id}`;

          const popup = new mapboxgl.Popup({ offset: 10, maxWidth: "180px" })
            .setLngLat(coords)
            .setHTML(
              `<div style="font-family:system-ui;font-size:13px;line-height:1.5">
                <p style="font-weight:600;margin:0 0 2px">${dateStr}</p>
                ${meta ? `<p style="color:#6b7280;font-size:11px;margin:0 0 6px">${meta}</p>` : ""}
                <button id="${uid}" style="color:#10b981;font-size:12px;background:none;border:none;padding:0;cursor:pointer;font-weight:500">
                  View jump →
                </button>
              </div>`,
            )
            .addTo(map);

          setTimeout(() => {
            document
              .getElementById(uid)
              ?.addEventListener("click", () => {
                popup.remove();
                routerRef.current.push(`/jumps/${id}`);
              });
          }, 0);
        });

        ["clusters", "point"].forEach((layer) => {
          map.on("mouseenter", layer, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layer, () => {
            map.getCanvas().style.cursor = "";
          });
        });
      });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [jumps, theme]);

  if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        NEXT_PUBLIC_MAPBOX_TOKEN not set
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full" />;
}
