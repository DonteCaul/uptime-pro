-- Additional summary fields from Dekunu summary JSON.
--
-- These are pre-computed by the firmware from smoothed sensor data — more
-- accurate than deriving from raw CSV. Stored on the jumps table alongside
-- the existing summary columns.
--
-- Only GPS-based and position-derived fields are stored. Barometric
-- derivative fields (maxVert, avgVert) are excluded due to sustained sensor
-- glitch issues (inst_vert_speed_ms can report 100+ m/s for dozens of rows
-- that median filters can't correct).
--
-- Fields added:
--   Freefall speeds:    max_horiz_speed_ms, avg_horiz_speed_ms
--   Canopy speeds:      max_canopy_horiz_ms
--   Exit:               exit_ground_speed_knot, exit_distance_m
--   Freefall distance:  freefall_distance_horiz_m, freefall_distance_vert_m
--   Canopy distance:    canopy_distance_horiz_m, canopy_distance_vert_m

alter table public.jumps
  add column if not exists max_freefall_horiz_ms    numeric,
  add column if not exists avg_freefall_horiz_ms    numeric,
  add column if not exists max_canopy_horiz_ms      numeric,
  add column if not exists exit_ground_speed_knot    numeric,
  add column if not exists exit_distance_m           numeric,
  add column if not exists freefall_dist_horiz_m     numeric,
  add column if not exists freefall_dist_vert_m      numeric,
  add column if not exists canopy_dist_horiz_m       numeric,
  add column if not exists canopy_dist_vert_m        numeric;
