-- Supabase Storage buckets + policies
--
-- Replaces the local-disk uploads/ volume from the old app. Three buckets:
--   - avatars     : public-read, user-scoped write
--   - jump-csv    : private,     user-scoped read/write
--   - system-logs : private,     user-scoped read/write

insert into storage.buckets (id, name, public)
values
  ('avatars',     'avatars',     true),
  ('jump-csv',    'jump-csv',    false),
  ('system-logs', 'system-logs', false)
on conflict (id) do nothing;

-- ═══ avatars ═══════════════════════════════════════════════════════════════
-- Anyone may read (public bucket). Only the owner may write/delete their
-- avatar, stored at <auth.uid()>/avatar.<ext>.
create policy "avatars_read_all"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_write_own"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_update_own"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ═══ jump-csv ══════════════════════════════════════════════════════════════
-- Private bucket. Owner can read/write/delete their own prefix only.
create policy "jump_csv_read_own"
  on storage.objects for select
  using (
    bucket_id = 'jump-csv'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "jump_csv_write_own"
  on storage.objects for insert
  with check (
    bucket_id = 'jump-csv'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "jump_csv_update_own"
  on storage.objects for update
  using (
    bucket_id = 'jump-csv'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "jump_csv_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'jump-csv'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ═══ system-logs ═══════════════════════════════════════════════════════════
create policy "system_logs_read_own"
  on storage.objects for select
  using (
    bucket_id = 'system-logs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "system_logs_write_own"
  on storage.objects for insert
  with check (
    bucket_id = 'system-logs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "system_logs_update_own"
  on storage.objects for update
  using (
    bucket_id = 'system-logs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "system_logs_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'system-logs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
