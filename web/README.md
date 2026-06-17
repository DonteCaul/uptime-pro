# UpTime.Pro — Next.js 16 + Supabase

Greenfield full-stack rewrite of UpTime.Pro (skydiving jump-log + telemetry app).
Runs alongside the legacy Vite + Express app until data migration in Phase 4.

See [`../REFACTOR_PLAN.md`](../REFACTOR_PLAN.md) for the full plan.

## Stack

- **Next.js 16** (App Router, Turbopack, React 19, TypeScript)
- **Supabase** — hosted Postgres (RLS), Auth (`@supabase/ssr`), Storage
- **Drizzle ORM** for typed server-side data access
- **Tailwind CSS 4** + shadcn-style primitives (ported from the Vite app)
- **Vitest** for unit tests

## Quick start

```bash
cp .env.example .env.local   # fill in Supabase + Mapbox keys
npm install
npm run dev                  # http://localhost:3000
```

### Scripts

| Script                 | Description                                  |
| ---------------------- | -------------------------------------------- |
| `npm run dev`          | Dev server (Turbopack)                       |
| `npm run build`        | Production build                             |
| `npm run start`        | Serve the production build                   |
| `npm run typecheck`    | `tsc --noEmit`                               |
| `npm run lint`         | ESLint (flat config)                         |
| `npm run test`         | Vitest (one-shot)                            |
| `npm run test:watch`   | Vitest watch mode                            |
| `npm run format`       | Prettier write                               |
| `npm run db:generate`  | Generate Drizzle migration from schema       |
| `npm run db:push`      | Push schema to the linked database           |
| `npm run db:studio`    | Drizzle Studio GUI                           |

## Database setup

Migrations live in `supabase/migrations/` and are the source of truth. Apply
them via the Supabase CLI against your project:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

After the first migration is applied, generate the typed Supabase client:

```bash
supabase gen types --lang=typescript --project-ref <your-ref> > lib/db/types.gen.ts
```

Then replace the placeholder export in `lib/db/types.ts` with the generated type.

## Auth model

- **Email/password** via Supabase Auth (replaces the legacy numeric-ID login).
- Sessions stored in **httpOnly cookies** managed by `@supabase/ssr`.
- `proxy.ts` (Next.js 16 successor to middleware) refreshes the session and
  guards protected routes under `(app)/`.
- Row-Level Security scopes every read — see `supabase/migrations/0002`.
- The Dekunu device layer (`/v1/*`) uses its own separate JWT scheme.

## Project status (Phase 1 complete)

- [x] App scaffolded, Tailwind 4 theme tokens + theme-flash script ported
- [x] Supabase browser/server/admin clients + session-guarding `proxy.ts`
- [x] Drizzle schema + Postgres migrations 0001–0005 (schema, RLS, legacy auth import, Storage, stats function)
- [x] shadcn UI primitives ported to TypeScript
- [x] Login/register + auth callback + sign-out action
- [x] ESLint / Prettier / Vitest wired with a passing units test suite
- [x] **Phase 1 — Core read views**
  - Dashboard (stats via Postgres function + recent jumps)
  - Jumps list: All (server-paginated) / By-Dropzone (cached geocoding) / Map (Mapbox cluster)
  - JumpDetail: 3D satellite replay + 4-channel telemetry scrubber + RAF playback + analysis + weather + notes/delete
  - Profile (read view with gear, credentials, devices, reserve countdown)
  - 3 cached server-side API proxies (/api/places, /api/geocode, /api/weather) — keys never reach the browser
- [ ] Phase 2 — CSV upload + writes (profile editing, avatar)
- [ ] Phase 3 — Dekunu compat layer + Social
- [ ] Phase 4 — Data migration & cutover
- [ ] Phase 5+ — Public marketing site, admin area, social auth
