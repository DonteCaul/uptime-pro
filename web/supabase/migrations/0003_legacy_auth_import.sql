-- Legacy auth import
--
-- Supports migrating existing users from the old Express app (bcrypt-hashed
-- passwords, numeric uptime_user_id) into Supabase Auth so they keep their
-- current password.
--
-- Strategy: Supabase Auth stores password hashes in auth.users.encrypted_password
-- in bcrypt format. We import users with their existing bcrypt hash and mark
-- them as email-confirmed. The standard Supabase sign-in flow will then
-- verify the password against the bcrypt hash automatically.
--
-- Run this AFTER the pg_dump import has populated the staging table
-- (public._legacy_users) with (uptime_user_id, email, password_hash, full_name).
-- Then run the import function below.

-- Staging table for the dump.
create table if not exists public._legacy_users (
  uptime_user_id  integer primary key,
  email           text,
  password_hash   text,        -- bcrypt, $2a$... / $2b$...
  full_name       text,
  imported_at     timestamptz default now()
);

-- Import function: for each legacy user, create an auth.users row + profile.
-- Idempotent — safe to re-run. Skips users whose email already exists.
create or replace function public.import_legacy_users()
returns table (imported bigint, skipped bigint, errored bigint)
language plpgsql
security definer set search_path = auth, public
as $$
declare
  v_imported bigint := 0;
  v_skipped  bigint := 0;
  v_errored  bigint := 0;
  rec        record;
  v_uid      uuid;
begin
  for rec in select * from public._legacy_users loop
    begin
      -- Skip if a profile already exists for this email or uptime_user_id.
      if exists (
        select 1 from public.profiles p
        where p.email = rec.email or p.uptime_user_id = rec.uptime_user_id
      ) then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      -- Create the auth.users row with the existing bcrypt hash. encrypted_password
      -- accepts bcrypt hashes directly. email_confirmed_at enables sign-in.
      v_uid := gen_random_uuid();

      insert into auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        last_sign_in_at
      )
      values (
        v_uid,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        rec.email,
        rec.password_hash,
        now(),
        jsonb_build_object('provider', 'email', 'providers', array['email']),
        jsonb_build_object('full_name', rec.full_name, 'uptime_user_id', rec.uptime_user_id),
        now(),
        now(),
        null
      )
      on conflict (email) do nothing;

      if not found then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      -- Backfill the profile row. The on_auth_user_created trigger also fires,
      -- but our ON CONFLICT (id) DO NOTHING keeps this insert authoritative.
      insert into public.profiles (id, email, full_name, uptime_user_id)
      values (v_uid, rec.email, coalesce(rec.full_name, ''), rec.uptime_user_id)
      on conflict (id) do update
        set uptime_user_id = excluded.uptime_user_id,
            full_name      = excluded.full_name;

      v_imported := v_imported + 1;
    exception when others then
      v_errored := v_errored + 1;
      raise notice 'Failed to import legacy user %: %', rec.uptime_user_id, sqlerrm;
    end;
  end loop;

  return query select v_imported, v_skipped, v_errored;
end;
$$;

-- NOTE: this is a migration-time helper. After the cutover import succeeds,
-- you may drop the staging table and revoke the function:
--   drop table public._legacy_users;
--   drop function public.import_legacy_users();
