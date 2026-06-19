-- Extract "Rode the plane down" sentinel into a dedicated boolean column.
--
-- The discipline column used a sentinel string value to mark non-jump flights,
-- which caused NULL disciplines to be excluded from counts (NULL <> 'Rode...'
-- evaluates to NULL, not true). Moving this into a dedicated is_plane_ride
-- boolean lets the discipline column be cleanly NULL for unclassified jumps
-- while still hiding plane rides from stats/leaderboards.

-- 1. Add the column (defaults to false for all existing rows).
alter table public.jumps
  add column if not exists is_plane_ride boolean not null default false;

-- 2. Migrate existing sentinel values to the boolean flag.
update public.jumps
  set is_plane_ride = true, discipline = null
  where discipline = 'Rode the plane down';

-- 3. No index needed — boolean with low cardinality, RLS handles access.
