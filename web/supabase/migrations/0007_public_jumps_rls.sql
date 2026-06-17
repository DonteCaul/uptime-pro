-- Allow reading jumps that belong to a user with a public profile.
--
-- Without this, the /u/[id] public profile page can't show another user's
-- recent jumps (the existing jumps_select_own policy only allows the owner).
-- This adds a second SELECT policy: any authenticated user can read jumps
-- whose owner has is_public = true. Writes remain owner-only.

create policy "jumps_select_public_profile"
  on public.jumps for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = jumps.user_id and p.is_public = true
    )
  );

-- Same for jump_data_points — the public profile doesn't currently show
-- telemetry, but enabling it keeps the policy set consistent if we add a
-- public replay view later.
create policy "jump_data_points_select_public_profile"
  on public.jump_data_points for select
  to authenticated
  using (
    exists (
      select 1 from public.jumps j
      join public.profiles p on p.id = j.user_id
      where j.id = jump_data_points.jump_id and p.is_public = true
    )
  );
