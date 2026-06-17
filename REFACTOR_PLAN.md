# UpTime.Pro → Next.js 16 + Supabase Refactor Plan

**Scope:** Greenfield full-stack rewrite. New Next.js 16 app lives in `web/`, built alongside the current stack until cutover. Current app keeps running until data is migrated.

> **Note:** Despite the directory name, this is a **skydiving jump-log + telemetry app** (Dekunu hardware sync), not an uptime monitor. The plan reflects that.

---

## Decisions locked
- **Auth:** Supabase Auth (cookie-based sessions via `@supabase/ssr`)
- **DB:** Full Supabase hosted Postgres + Row-Level Security + Supabase Storage
- **Dekunu `/v1/*`:** Port to Next.js Route Handlers (preserve exact response shapes)
- **Migration:** Greenfield rewrite, parallel until cutover

## Assumptions (flag to override)
- **Login identifier = email** (Supabase default). Keep `uptime_user_id` (numeric) as a profile column for device sync.
- **ORM = Drizzle** for server data access (type-safe, raw-SQL-friendly for bulk insert / aggregations). Supabase JS client used for auth + cookie-bound RLS reads.
- **Caching store = Postgres cache tables + Next.js Data Cache.** No Redis (single-vendor Supabase story). Redis can slot in later.
- **Mapbox = scoped public token** exposed only to map client components (`NEXT_PUBLIC_MAPBOX_TOKEN`), plus an optional `/api/mapbox-token` route for short-lived scoped tokens.

---

## 1. Target Architecture

```
Next.js 16 (App Router, React 19, TypeScript, Turbopack)
├── Server Components by default → fetch data with Supabase server client (RLS-enforced)
├── Client Components only for: Mapbox maps, telemetry chart/replay, file upload, theme toggle
├── Route Handlers (/app/api/*) → proxy external APIs server-side with caching
├── Route Handlers (/app/v1/*) → Dekunu device-compat emulator
├── middleware.ts → Supabase session refresh + protected-route guard (httpOnly cookies)
└── Supabase (hosted) → Postgres (RLS) + Auth + Storage
```

**External API calls move server-side:** Google Places (already server-side, add cache), Open-Meteo (browser-direct → server), Mapbox geocoding (browser-direct → server proxy). Mapbox *tiles* stay client-side (inherent), but only a scoped public token reaches the client.

---

## 2. New Repo Structure

```
web/                                  # new Next.js 16 app
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── callback/route.ts         # Supabase email/OAuth callback
│   ├── (app)/                         # protected route group
│   │   ├── layout.tsx                 # session check + nav shell
│   │   ├── page.tsx                   # Dashboard
│   │   ├── jumps/
│   │   │   ├── page.tsx               # All / By-Dropzone / Map tabs
│   │   │   └── [id]/page.tsx          # JumpDetail (replay)
│   │   ├── upload/page.tsx
│   │   ├── social/page.tsx
│   │   ├── profile/page.tsx
│   │   └── settings/page.tsx
│   ├── api/
│   │   ├── places/nearby/route.ts     # Google Places proxy (cached)
│   │   ├── geocode/route.ts           # Mapbox geocode proxy (cached)
│   │   ├── weather/route.ts           # Open-Meteo proxy (cached)
│   │   ├── jumps/upload/route.ts      # CSV upload
│   │   └── mapbox-token/route.ts      # optional scoped-token endpoint
│   └── v1/                            # Dekunu compat (see §5)
│       ├── getSecurityToken2/[userId]/[hwCode]/[hwSerial]/route.ts
│       ├── getUserProfile/[token]/route.ts
│       ├── actionTypes/[token]/route.ts
│       ├── getJumpLogStatus/[userId]/[filename]/[token]/route.ts
│       ├── getDzWeather/[dzId]/[token]/route.ts
│       ├── addDeviceStatus/[flag]/[deviceId]/route.ts
│       ├── checkDeviceStatus/[token]/route.ts
│       ├── addJumpLog/[flag]/[deviceId]/[token]/route.ts
│       ├── uploadFile/[filename]/[flag]/[token]/route.ts
│       └── [[...catchall]]/route.ts   # catch-all → {success:true}
├── components/
│   ├── ui/                            # shadcn primitives (port + TS)
│   ├── Nav.tsx
│   ├── JumpMap.tsx                    # 'use client', dynamic import, ssr:false
│   ├── TelemetryChart.tsx             # 'use client'
│   ├── AltitudeChart.tsx
│   ├── WeatherCard.tsx
│   └── StatCard.tsx
├── lib/
│   ├── supabase/{client,server,middleware,admin}.ts
│   ├── db/{schema.ts, index.ts}       # Drizzle
│   ├── cache/{places,geocode,weather}.ts
│   ├── dekunu/{jwt,ingest}.ts         # shared device-token + CSV-ingest logic
│   ├── csvParser.ts                   # port from backend/src/utils/csvParser.js
│   └── utils.ts
├── supabase/
│   ├── migrations/
│   │   ├── 0001_initial_schema.sql
│   │   ├── 0002_rls_policies.sql
│   │   ├── 0003_legacy_auth_import.sql
│   │   └── 0004_storage_buckets.sql
│   ├── config.toml
│   └── seed.sql
├── middleware.ts
├── next.config.ts  tailwind.config.ts  drizzle.config.ts
└── .env.example
```

---

## 3. Schema & Data Migration

### Fix the schema gaps first
Current `schema.sql` is missing 14 profile columns the code actually reads/writes (`bio, home_dz, home_dz_lat, home_dz_lon, avatar_path, uspa_license, uspa_member_number, burble_name, ratings, canopy_size, wing_load, rig_type, canopy_type, reserve_repack_date, is_public`). The new schema includes all of them.

### New schema (`supabase/migrations/0001_initial_schema.sql`)
- `profiles` table linked 1:1 to `auth.users(id)` via Supabase trigger (id, user_id→auth.users, uptime_user_id UNIQUE, full_name, email, bio, home_dz, home_dz_lat, home_dz_lon, avatar_url, uspa_license, uspa_member_number, burble_name, ratings, canopy_size, wing_load, rig_type, canopy_type, reserve_repack_date, is_public, next_jump_number, units, theme, created_at, updated_at)
- `devices` (same shape, `current_user_id → auth.users(id)`)
- `jumps` (same shape; `raw_file_path` → `raw_file_storage_key` pointing to Supabase Storage; `discipline_id` renamed to `discipline TEXT` since it holds strings like "Belly / RW" — keep current semantics, normalize the misnomer)
- `jump_data_points` (same 26 sensor columns, `ON DELETE CASCADE`, indexed)
- `system_logs` (same)
- `places_cache` (lat_bucket, lon_bucket, query, response_json, fetched_at) — for Google Places results
- `geocode_cache` (query_or_coords, response_json, fetched_at) — for Mapbox geocoding

### RLS policies (`0002_rls_policies.sql`)
- `profiles`: user can read/update own row; `is_public` rows readable by anyone for leaderboard
- `devices`, `jumps`, `jump_data_points`, `system_logs`: full access where `user_id = auth.uid()`; cascade-protected children inherit via join
- `places_cache`, `geocode_cache`: readable by all authenticated users (write only via service role, server-side)
- Drop-in replacement for the current hand-written `WHERE user_id = $1` scoping — enforced at the DB now.

### Data migration
- Export current Postgres with `pg_dump`, transform user records to Supabase `auth.users` import format.
- **Legacy password migration:** Supabase supports importing users with their existing bcrypt hashes via a custom bcrypt-compare function (`0003_legacy_auth_import.sql`), so existing users keep their passwords.
- Re-key `raw_file_path` absolute paths → Storage keys; upload the existing CSV files to a `jump-csv` bucket.
- Avatars → `avatars` bucket (public-read).

### Storage buckets (`0004_storage_buckets.sql`)
- `avatars` (public-read)
- `jump-csv` (private, RLS: user reads/writes own `user_id/` prefix)
- `system-logs` (private, same pattern)

---

## 4. Auth Migration

- **Supabase Auth** with email/password (replaces the numeric-ID login). Magic-link + OAuth providers are free wins to enable later.
- **Session transport:** `@supabase/ssr` httpOnly cookies (replaces `localStorage` JWT — fixes the XSS exposure). `middleware.ts` refreshes the session on every request and guards `(app)/*` routes, redirecting to `/login`.
- **Server data access:** server Supabase client forwards the user's cookies → RLS automatically scopes every query to the signed-in user. No more manual `user_id` filtering in route handlers.
- **Admin operations** (CSV bulk insert bypassing RLS, places-cache writes): service-role admin client, server-only, never imported in client code.
- **Device tokens (Dekunu):** unchanged scheme — separate HS256 JWTs `{ userId: uptime_user_id, deviceId }` signed with a server secret, verified in `/v1/*` route handlers. Independent from user auth (hardware protocol can't change).

---

## 5. Dekunu Compat Layer Port (highest-risk area)

Each Express route → one Next.js Route Handler under `app/v1/`. Preserve **exact** response shapes the device firmware depends on: `{message:"Success",token}`, `{success:true,message:"Log received for user X. Checksum match success.",checksum}`, the `actionTypes` array, the `checkDeviceStatus` firmware object.

- **Feature flag:** `DEKUNU_COMPAT` env var checked in each handler (return 404 when off). Can't use `global.*` in serverless — read from `process.env` each request.
- **Multipart uploads:** use `Request.formData()` (native in Route Handlers) instead of multer.
- **gzip:** `zlib.gunzipSync` works in Node runtime route handlers (set `export const runtime = 'nodejs'`).
- **CSV ingest:** shared `lib/dekunu/ingest.ts` used by both the `/v1/addJumpLog` device route and the `/api/jumps/upload` manual-upload route — single source of truth for parse + dedupe + bulk insert.
- **File storage:** Supabase Storage `jump-csv` bucket instead of local disk.
- **Catch-all:** `app/v1/[[...catchall]]/route.ts` returns `{success:true,message:"ok"}` and logs, mirroring current behavior.

Verification: before cutover, point one physical device at the new server and confirm a full sync cycle (getSecurityToken2 → getUserProfile → actionTypes → getJumpLogStatus → addJumpLog → uploadFile).

---

## 6. Caching Strategy (addresses the data-heavy views)

| Data | Cache layer | TTL / invalidation |
|---|---|---|
| `GET /jumps/:id/track` (biggest payload, immutable post-upload) | Next.js Data Cache via `fetch` tag, or `unstable_cache` keyed by jump id | infinite; purge only on delete |
| `GET /social/leaderboard?period=` | Next.js route segment `revalidate: 60` | 60s ISR |
| Google Places nearby (paid, ~3 calls/req) | `places_cache` Postgres table, keyed by rounded lat/lon bucket | 30 days; dropzones rarely change |
| Open-Meteo weather (archive immutable) | `weather_cache` table keyed by lat/lon/date | infinite for historical; 10min for recent |
| Mapbox reverse/forward geocoding | `geocode_cache` table keyed by query/coords | 90 days |
| `GET /jumps` list / dashboard stats | React `cache()` for per-request dedupe + short revalidate | revalidate on upload via tag |

**External-API fan-out fix:** the "By Dropzone" tab currently fires N parallel uncached Google Places calls. New design: client calls `/api/places/nearby` (server route) once; server checks `places_cache` first, only calls Google on miss, fans out the 3 sub-queries server-side with the existing Set-dedupe.

---

## 7. Security Model

- **API keys never reach the browser.** `GOOGLE_PLACES_KEY`, Supabase service-role key, Dekunu JWT secret, Open-Meteo (no key) are all server-only. `NEXT_PUBLIC_*` exposes only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_MAPBOX_TOKEN`.
- **Mapbox token hardening:** use a scoped public token restricted to your domains + read-only styles/tiles. Optional `/api/mapbox-token` route mints short-lived scoped tokens via the Mapbox tokens API if you want to go further.
- **RLS** is the core authorization layer (see §3) — enforced in Postgres, not application code.
- **Rate limiting:** add `@upstash/ratelimit` or a simple middleware-based limiter on `/api/places/*` (cost control), `/v1/getSecurityToken2` (token-mint abuse), and auth endpoints.
- **CORS:** lock down to your domain (current `app.use(cors())` is fully permissive).
- **`.env` discipline:** single `.env.example` documenting all keys; real values via Coolify project env / Supabase dashboard. Remove insecure docker-compose defaults (`POSTGRES_PASSWORD:-changeme`).
- **Admin endpoints:** add a real role check (current `/admin/dekunu-compat` accepts any logged-in user). Use a `role` column on `profiles` or Supabase's `raw_app_meta_data.role`.

---

## 8. Build & Deploy

- **Single Next.js 16 app**, one Dockerfile (multi-stage: build → runner). Replaces the 3-service stack — frontend+backend merge; Postgres moves to Supabase hosted (out of compose).
- **Coolify/Traefik labels** move to the single service. Drop `postgres` and `backend` services.
- `docker-compose.yml` simplified to one service + the external `coolify` network.
- Add **TypeScript strict mode, ESLint, Prettier** (none exist today).
- Add a minimal **test setup** (Vitest) for the high-value pure logic: `csvParser`, units conversion, leaderboard aggregations.

---

## 9. Phased Implementation

**Phase 0 — Scaffold & infra (no behavior change)**
- Create Next.js 16 app (TS, Tailwind 4, App Router). Wire ESLint/Prettier/Vitest.
- Provision Supabase project; run migrations `0001`–`0004`. Configure Storage buckets.
- Port shadcn UI primitives to TS. Set up Tailwind theme tokens (light/dark).
- Wire `@supabase/ssr` client/server/middleware. Build login/register + protected-route guard.

**Phase 1 — Core data views (read-only feature parity)**
- Port Dashboard, Jumps (All tab), JumpDetail (map + telemetry replay), Profile (read).
- Server-side data via Supabase server client (RLS). Port Mapbox + chart client components.
- Implement `/api/places`, `/api/geocode`, `/api/weather` proxies with cache tables.

**Phase 2 — Writes & upload**
- CSV upload route (`/api/jumps/upload`) using shared `lib/dekunu/ingest.ts`.
- Jump edit/delete, profile edit, avatar upload (Storage), settings.
- Migrate existing CSV files + avatars into Storage; backfill `raw_file_storage_key`.

**Phase 3 — Dekunu compat + social**
- Port all `/v1/*` route handlers. Test with one physical device before cutover.
- Port Social leaderboard with ISR caching.

**Phase 4 — Data migration & cutover**
- `pg_dump` → Supabase import (users with bcrypt hashes, jumps, data points, devices, logs).
- Repoint DNS / Traefik to the new single-service deploy.
- Decommission the old 3-service stack after a soak period.

---

## Best-practice additions during the rewrite
- TypeScript end-to-end; Zod validation on route-handler inputs and CSV ingest.
- Centralized error handling + typed API responses.
- `next/dynamic` with `ssr:false` for Mapbox components to avoid window-touching on the server.
- Replace the stale `lucide-react@^1.18.0` with the current `lucide-react`.
- Environment-aware logging; structured logs for the Dekunu layer (currently `console.log`).

## Open question for you during build
The numeric `uptime_user_id` (e.g. 469) is what Dekunu hardware uses to identify users for device sync. I'll preserve it as a unique `profiles` column and keep login email-based. If you'd rather **keep numeric-ID login** as the primary UX, say so and I'll build a Supabase custom-auth flow around it — but email login is the cleaner default.
