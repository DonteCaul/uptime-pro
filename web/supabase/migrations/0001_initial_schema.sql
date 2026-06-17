-- UpTime.Pro initial schema
--
-- All app tables live in a dedicated `app` schema to keep them separate from
-- Supabase's own tables (auth.*, storage.*, realtime.*).
--
-- Tenancy note: authorization is enforced by Row-Level Security in
-- 0002_rls_policies.sql. user-scoped tables carry a user_id column
-- referencing auth.users.id (a uuid).

create schema if not exists app;

-- ─── Profiles ──────────────────────────────────────────────────────────────
-- 1:1 with auth.users. Created by the handle_new_user trigger below on signup.
-- Includes the 14 profile columns missing from the original schema.sql.
create table if not exists app.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  uptime_user_id         integer unique,                  -- Dekunu device user id (e.g. 469)
  email                  text unique,
  full_name              text,
  bio                    text,
  home_dz                text,
  home_dz_lat            numeric(10,7),
  home_dz_lon            numeric(10,7),
  avatar_url             text,
  uspa_license           text,
  uspa_member_number     text,
  burble_name            text,
  ratings                text,
  canopy_size            integer,
  wing_load              numeric(5,2),
  rig_type               text,
  canopy_type            text,
  reserve_repack_date    timestamptz,
  is_public              boolean      not null default false,
  next_jump_number       integer      not null default 1,
  units                  text         not null default 'metric',   -- 'metric' | 'imperial'
  theme                  text         not null default 'light',    -- 'light' | 'dark'
  role                   text         not null default 'user',     -- 'user' | 'admin'
  created_at             timestamptz  not null default now(),
  updated_at             timestamptz  not null default now()
);

-- Auto-create a profile row when a new auth.users row appears.
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = auth, public
as $$
begin
  insert into app.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- Keep updated_at current on profile edits.
create or replace function app.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists profiles_touch_updated_at on app.profiles;
create trigger profiles_touch_updated_at
  before update on app.profiles
  for each row execute function app.touch_updated_at();

-- ─── Devices ───────────────────────────────────────────────────────────────
create table if not exists app.devices (
  id                  serial primary key,
  device_id           integer unique not null,        -- Dekunu device id
  device_type         text,
  hardware_serial     text,
  firmware_version    text,
  timezone_offset     integer not null default 0,
  current_user_id     uuid references auth.users(id) on delete set null,
  last_seen_at        timestamptz,
  created_at          timestamptz not null default now()
);

-- ─── Jumps ─────────────────────────────────────────────────────────────────
-- `discipline` is TEXT (not an id) to preserve the original semantics: stores
-- values like "Belly / RW", "BASE", and the sentinel "Rode the plane down".
-- `raw_file_storage_key` replaces the old absolute raw_file_path; points into
-- the Supabase Storage `jump-csv` bucket.
create table if not exists app.jumps (
  id                       serial primary key,
  user_id                  uuid not null references auth.users(id) on delete cascade,
  device_id                integer references app.devices(id) on delete set null,
  jump_number              integer,
  filename                 text not null,
  jumped_at                timestamptz,
  action_type_id           integer,
  discipline               text,
  exit_altitude_m          numeric,
  deployment_altitude_m    numeric,
  freefall_duration_s      numeric,
  max_freefall_speed_ms    numeric,
  canopy_duration_s        numeric,
  exit_lat                 numeric(10,7),
  exit_lon                 numeric(10,7),
  landing_lat              numeric(10,7),
  landing_lon              numeric(10,7),
  dz_lat                   numeric(10,7),
  dz_lon                   numeric(10,7),
  notes                    text,
  raw_file_storage_key     text,
  row_count                integer,
  created_at               timestamptz not null default now()
);

create index if not exists idx_jumps_user_id     on app.jumps(user_id);
create index if not exists idx_jumps_jumped_at   on app.jumps(jumped_at);
create index if not exists idx_jumps_user_file   on app.jumps(user_id, filename);

-- ─── Jump data points (time-series; the hot table) ─────────────────────────
-- Bulk-inserted in batches of 200. 26 numeric sensor columns per row.
create table if not exists app.jump_data_points (
  id                          bigserial primary key,
  jump_id                     integer not null references app.jumps(id) on delete cascade,
  sample_ms                   bigint,
  device_mode                 smallint,
  gps_time                    bigint,
  gps_lat                     numeric(10,7),
  gps_lon                     numeric(10,7),
  gps_altitude_m              numeric,
  gps_speed_knot              numeric,
  gps_angle_deg               numeric,
  gps_sats                    smallint,
  pressure_pa                 numeric,
  temperature_c               numeric,
  altitude_m                  numeric,
  altitude_above_ground_m     numeric,
  ground_level_m              numeric,
  inst_vert_speed_ms          numeric,
  compass_angle               numeric,
  accel_x                     numeric,
  accel_y                     numeric,
  accel_z                     numeric,
  gyro_x                      numeric,
  gyro_y                      numeric,
  gyro_z                      numeric,
  batt_perc                   numeric,
  pressure_pa_baro2           numeric,
  temperature_c_baro2         numeric,
  altitude_m_baro2            numeric
);

create index if not exists idx_jump_data_points_jump_id on app.jump_data_points(jump_id);

-- ─── System logs ───────────────────────────────────────────────────────────
create table if not exists app.system_logs (
  id           bigserial primary key,
  device_id    integer references app.devices(id) on delete set null,
  user_id      uuid references auth.users(id) on delete set null,
  log_source   text,                  -- 'syslog' | 'syslog_esp32'
  log_number   integer,
  content      text,
  uploaded_at  timestamptz not null default now()
);

create index if not exists idx_system_logs_user_id on app.system_logs(user_id);

-- ─── Server-side caches (written by route handlers via service role) ───────
create table if not exists app.places_cache (
  id             bigserial primary key,
  lat_bucket     integer not null,    -- round(lat * 1000)
  lon_bucket     integer not null,    -- round(lon * 1000)
  query          text not null,
  response_json  text not null,
  fetched_at     timestamptz not null default now(),
  unique (lat_bucket, lon_bucket, query)
);

create table if not exists app.geocode_cache (
  id             bigserial primary key,
  key            text not null unique,
  response_json  text not null,
  fetched_at     timestamptz not null default now()
);

create table if not exists app.weather_cache (
  id             bigserial primary key,
  key            text not null unique,  -- "lat,lon,YYYY-MM-DD"
  response_json  text not null,
  fetched_at     timestamptz not null default now()
);
