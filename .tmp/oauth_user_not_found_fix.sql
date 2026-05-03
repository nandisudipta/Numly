-- ─── Eliminate "User not found" on Google OAuth ────────────────────────
-- Root cause: handle_new_user trigger throws on profiles.email UNIQUE
-- conflict → auth.users INSERT rolls back → Supabase returns
-- error=server_error, error_description=User+not+found.

-- 1) Drop the redundant UNIQUE constraint on profiles.email.
--    auth.users.email is the source of truth for uniqueness.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_email_key;

-- 2) Make the trigger bulletproof: never let it fail the auth.users INSERT.
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
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
      SET email      = EXCLUDED.email,
          full_name  = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
          updated_at = NOW();
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'handle_new_user soft-fail for %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 3) Same defensive treatment for the other auth-fire trigger
--    auto_add_business_captain (it could fail and roll back business creation,
--    though that's not the OAuth path it's worth hardening anyway).
DROP FUNCTION IF EXISTS public.auto_add_business_captain() CASCADE;

CREATE OR REPLACE FUNCTION public.auto_add_business_captain()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    INSERT INTO public.business_members (business_id, user_id, role, invited_by)
    VALUES (NEW.id, NEW.owner_id, 'captain', NEW.owner_id)
    ON CONFLICT (business_id, user_id) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'auto_add_business_captain soft-fail: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_add_business_captain() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS auto_add_captain_trigger ON public.businesses;
CREATE TRIGGER auto_add_captain_trigger
  AFTER INSERT ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_add_business_captain();

-- 4) Backfill any auth.users without a corresponding profile (so old failed
--    attempts don't block future logins of the same identity).
INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
SELECT u.id,
       u.email,
       COALESCE(
         u.raw_user_meta_data->>'full_name',
         u.raw_user_meta_data->>'name',
         split_part(u.email, '@', 1)
       ),
       u.created_at,
       NOW()
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- ─── End ──────────────────────────────────────────────────────────────
