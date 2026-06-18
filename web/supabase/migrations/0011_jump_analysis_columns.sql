-- Jump analysis summary columns.
--
-- Computed from sensor data (jump_data_points) during ingest. Stored on the
-- jumps table so the jump log list can display analysis stats without joining
-- the heavy time-series table on every page load.

-- Add nullable analysis columns to jumps.
alter table public.jumps
  add column if not exists avg_freefall_speed_ms  numeric,
  add column if not exists avg_glide_ratio         numeric,
  add column if not exists landing_speed_knot      numeric,
  add column if not exists opening_peak_g          numeric,
  add column if not exists avg_g_force             numeric,
  add column if not exists is_swoop                boolean not null default false,
  add column if not exists swoop_speed_knot        numeric;

-- Function: compute analysis for a single jump from its sensor data.
-- Called during ingest after all data points are inserted.
--
-- IMPORTANT: The `deploy` CTE must be defined BEFORE `g_window` and `avg_g`
-- because Postgres does not allow forward references in WITH clauses.
-- The `landing` CTE uses `row_number() over (order by ...)` instead of
-- bare `ORDER BY ... LIMIT` in a subquery — pgbouncer's parser rejects the
-- latter inside CREATE FUNCTION but accepts window functions.
create or replace function public.compute_jump_analysis(p_jump_id integer)
returns void
language sql
volatile
security definer set search_path = public
as $$
  with ff as (
    select inst_vert_speed_ms
    from jump_data_points
    where jump_id = p_jump_id
      and device_mode = 3
      and inst_vert_speed_ms is not null
  ),
  canopy as (
    select inst_vert_speed_ms, gps_speed_knot, altitude_above_ground_m, sample_ms
    from jump_data_points
    where jump_id = p_jump_id
      and device_mode = 4
  ),
  landing as (
    select avg(gps_speed_knot) as spd
    from (
      select gps_speed_knot,
             row_number() over (order by sample_ms desc) as rn
      from canopy
      where gps_speed_knot is not null
    ) t
    where rn <= 10
  ),
  swoop_check as (
    select max(gps_speed_knot) as peak
    from canopy
    where altitude_above_ground_m < 30
      and gps_speed_knot is not null
  ),
  glide as (
    select avg(
      (coalesce(gps_speed_knot, 0) * 0.514) / nullif(abs(inst_vert_speed_ms), 0)
    ) as ratio
    from canopy
    where abs(inst_vert_speed_ms) > 0.5
      and gps_speed_knot is not null
  ),
  deploy as (
    select min(sample_ms) as deploy_time
    from jump_data_points
    where jump_id = p_jump_id
      and device_mode = 4
  ),
  g_window as (
    select
      sqrt(
        coalesce(accel_x, 0) ^ 2 +
        coalesce(accel_y, 0) ^ 2 +
        coalesce(accel_z, 0) ^ 2
      ) / 7500 as g_mag
    from jump_data_points
    where jump_id = p_jump_id
      and (device_mode = 3 or device_mode = 4)
      and sample_ms >= coalesce((select deploy_time from deploy), 0)
      and sample_ms < coalesce((select deploy_time from deploy), 0) + 30
  ),
  avg_g as (
    select avg(
      sqrt(
        coalesce(accel_x, 0) ^ 2 +
        coalesce(accel_y, 0) ^ 2 +
        coalesce(accel_z, 0) ^ 2
      ) / 7500
    ) as g
    from jump_data_points p2, deploy d
    where p2.jump_id = p_jump_id
      and (p2.device_mode = 3 or p2.device_mode = 4)
      and (p2.sample_ms < d.deploy_time or p2.sample_ms >= d.deploy_time + 30)
  )
  update jumps
  set avg_freefall_speed_ms = (select avg(abs(inst_vert_speed_ms)) from ff),
      avg_glide_ratio        = (select ratio from glide),
      landing_speed_knot     = (select spd from landing),
      opening_peak_g         = (select max(g_mag) from g_window),
      avg_g_force            = (select g from avg_g),
      is_swoop               = coalesce((select (peak > 40) from swoop_check), false),
      swoop_speed_knot       = (select peak from swoop_check)
  where id = p_jump_id;
$$;

-- Backfill existing jumps that have sensor data.
-- Runs as a one-shot; new jumps get populated during ingest.
do $$
declare
  cnt integer := 0;
begin
  for rec in select id from public.jumps where avg_freefall_speed_ms is null loop
    perform public.compute_jump_analysis(rec.id);
    cnt := cnt + 1;
    exit when cnt >= 500; -- safety limit per migration
  end loop;
  raise notice 'Backfilled analysis for % jumps', cnt;
end $$;
