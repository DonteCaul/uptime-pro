-- Auto-increment uptime_user_id for new users.
--
-- 1. Create a sequence starting above the highest existing value so there's
--    no collision with legacy imported IDs.
-- 2. Update the handle_new_user() trigger to grab the next value on insert.
-- 3. Backfill any existing profiles that have NULL uptime_user_id.

-- Sequence starting above the max existing ID (or 1 if no rows / all NULL).
DO $$
DECLARE
  max_id integer;
BEGIN
  SELECT COALESCE(MAX(uptime_user_id), 0) INTO max_id FROM public.profiles;
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.uptime_user_id_seq START WITH %s INCREMENT BY 1', max_id + 1);
END $$;

-- Rewrite the trigger function to assign the next ID on profile creation.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY definer SET search_path = auth, public
AS $$
DECLARE
  v_next_id integer;
BEGIN
  -- Grab the next auto-incremented ID for this user.
  SELECT nextval('public.uptime_user_id_seq') INTO v_next_id;

  INSERT INTO public.profiles (id, email, full_name, uptime_user_id)
  VALUES (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), v_next_id)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- Backfill existing profiles that have NULL uptime_user_id.
UPDATE public.profiles
SET uptime_user_id = nextval('public.uptime_user_id_seq')
WHERE uptime_user_id IS NULL;
