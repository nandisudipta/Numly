-- ─── Make handle_new_user trigger resilient ──────────────────────────
-- Current ON CONFLICT (id) DO NOTHING only handles PK collisions.
-- If the Google email already exists in profiles (from a prior signup),
-- the email UNIQUE constraint trips, the trigger errors, and the whole
-- auth.users INSERT rolls back → Supabase reports "user not found"
-- on the subsequent session check.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        updated_at = NOW();
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- Some other row owns this email. Don't fail the auth.users insert.
    RETURN NEW;
  WHEN OTHERS THEN
    -- Anything else — log + don't kill auth.users insert.
    RAISE WARNING 'handle_new_user failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
