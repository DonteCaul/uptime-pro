-- Add climb_duration_s to jumps table (populated from summary JSON
-- moments.takeoff.time → moments.exit.time). Also used as a display field
-- on the jump detail page.
--
-- jump_number column already exists in the initial schema but was never
-- populated by the ingest pipeline. The updated ingest now assigns it
-- from profiles.next_jump_number (or from the summary JSON's customJumpNum).

alter table public.jumps
  add column if not exists climb_duration_s numeric;
