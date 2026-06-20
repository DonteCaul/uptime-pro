-- jump_with_neighbors(p_jump_id bigint)
--
-- Returns a single row with the jump's full metadata plus prev_id/next_id
-- computed via LAG/LEAD window functions. Only 3 rows are materialized
-- (prev, current, next) instead of fetching the user's entire jump history.
--
-- Display order: jumped_at DESC (newest first).
--   next_id = newer jump (LAG in DESC order = previous row = newer)
--   prev_id = older jump (LEAD in DESC order = next row = older)

CREATE OR REPLACE FUNCTION public.jump_with_neighbors(p_jump_id bigint)
RETURNS TABLE (
  id bigint,
  filename text,
  jumped_at timestamptz,
  exit_altitude_m numeric,
  deployment_altitude_m numeric,
  freefall_duration_s numeric,
  max_freefall_speed_ms numeric,
  canopy_duration_s numeric,
  climb_duration_s numeric,
  jump_number integer,
  exit_lat numeric,
  exit_lon numeric,
  notes text,
  discipline text,
  is_public boolean,
  row_count integer,
  prev_id bigint,
  next_id bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH ordered AS (
    SELECT
      j.id,
      j.filename,
      j.jumped_at,
      j.exit_altitude_m,
      j.deployment_altitude_m,
      j.freefall_duration_s,
      j.max_freefall_speed_ms,
      j.canopy_duration_s,
      j.climb_duration_s,
      j.jump_number,
      j.exit_lat,
      j.exit_lon,
      j.notes,
      j.discipline,
      j.is_public,
      j.row_count,
      LAG(j.id) OVER (ORDER BY j.jumped_at DESC NULLS LAST) AS next_id,
      LEAD(j.id) OVER (ORDER BY j.jumped_at DESC NULLS LAST) AS prev_id
    FROM public.jumps j
    WHERE j.jumped_at IS NOT NULL
      AND NOT j.is_plane_ride
  ),
  windowed AS (
    SELECT *
    FROM ordered
    WHERE id = p_jump_id
       OR id = (SELECT next_id FROM ordered WHERE id = p_jump_id)
       OR id = (SELECT prev_id FROM ordered WHERE id = p_jump_id)
    ORDER BY jumped_at DESC NULLS LAST
  )
  SELECT
    w.id,
    w.filename,
    w.jumped_at,
    w.exit_altitude_m,
    w.deployment_altitude_m,
    w.freefall_duration_s,
    w.max_freefall_speed_ms,
    w.canopy_duration_s,
    w.climb_duration_s,
    w.jump_number,
    w.exit_lat,
    w.exit_lon,
    w.notes,
    w.discipline,
    w.is_public,
    w.row_count,
    w.prev_id,
    w.next_id
  FROM windowed w
  WHERE w.id = p_jump_id;
$$;
