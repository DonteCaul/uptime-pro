-- Row-Level Security for UpTime.Pro
--
-- Replaces the hand-written `WHERE user_id = $1` scoping in the old Express
-- app. Enforced in Postgres, not application code, so every client (server
-- Supabase client, Drizzle via service role, future mobile client) gets the
-- same protection.

-- Helper: bucket coordinates for the places_cache lookup.
create or replace function app.lat_bucket(lat numeric)
returns integer language sql immutable as $$ select round(lat * 1000)::integer; $$;
create or replace function app.lon_bucket(lon numeric)
returns integer language sql immutable as $$ select round(lon * 1000)::integer; $$;

-- ═══ profiles ══════════════════════════════════════════════════════════════
alter table app.profiles enable row level security;

-- Owner: full read/write on own row.
create policy "profiles_select_own"
  on app.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on app.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_insert_self"
  on app.profiles for insert
  with check (auth.uid() = id);

-- Public rows: readable by anyone (for leaderboard / home-DZ globe).
create policy "profiles_select_public"
  on app.profiles for select
  using (is_public = true);

-- Only the owner may delete their profile row.
create policy "profiles_delete_own"
  on app.profiles for delete
  using (auth.uid() = id);

-- ═══ devices ═══════════════════════════════════════════════════════════════
alter table app.devices enable row level security;

create policy "devices_select_own"
  on app.devices for select
  using (current_user_id = auth.uid());

create policy "devices_insert_own"
  on app.devices for insert
  with check (current_user_id = auth.uid() or current_user_id is null);

create policy "devices_update_own"
  on app.devices for update
  using (current_user_id = auth.uid())
  with check (current_user_id = auth.uid() or current_user_id is null);

create policy "devices_delete_own"
  on app.devices for delete
  using (current_user_id = auth.uid());

-- ═══ jumps ═════════════════════════════════════════════════════════════════
alter table app.jumps enable row level security;

create policy "jumps_select_own"
  on app.jumps for select
  using (user_id = auth.uid());

create policy "jumps_insert_own"
  on app.jumps for insert
  with check (user_id = auth.uid());

create policy "jumps_update_own"
  on app.jumps for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "jumps_delete_own"
  on app.jumps for delete
  using (user_id = auth.uid());

-- ═══ jump_data_points ══════════════════════════════════════════════════════
-- Cascade-protected child of jumps. Access is gated through the parent's
-- user_id via a join — a user can only touch points whose jump they own.
alter table app.jump_data_points enable row level security;

create policy "jump_data_points_all_own"
  on app.jump_data_points for all
  using (
    exists (
      select 1 from app.jumps j
      where j.id = jump_data_points.jump_id and j.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from app.jumps j
      where j.id = jump_data_points.jump_id and j.user_id = auth.uid()
    )
  );

-- ═══ system_logs ═══════════════════════════════════════════════════════════
alter table app.system_logs enable row level security;

create policy "system_logs_all_own"
  on app.system_logs for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ═══ caches ════════════════════════════════════════════════════════════════
-- Readable by any authenticated user; written only by the service role
-- (route handlers). Service role bypasses RLS by default, so no insert/update
-- policy is needed — only a SELECT policy for the anon/authenticated keys.
alter table app.places_cache   enable row level security;
alter table app.geocode_cache  enable row level security;
alter table app.weather_cache  enable row level security;

create policy "places_cache_read_authed"   on app.places_cache   for select to authenticated using (true);
create policy "geocode_cache_read_authed"  on app.geocode_cache  for select to authenticated using (true);
create policy "weather_cache_read_authed"  on app.weather_cache  for select to authenticated using (true);
