-- Upgrade handle_new_user() trigger for robust OAuth support
-- This function correctly parses metadata from Google and Apple

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  name_from_meta text;
  avatar_from_meta text;
BEGIN
  -- Extract name
  -- 1. Try 'full_name' (Standard/Google)
  -- 2. Try 'name' (Some providers)
  -- 3. Try Apple's nested structure: raw_user_meta_data->'user'->'name'->>'firstName'
  name_from_meta := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    (NEW.raw_user_meta_data->'user'->'name'->>'firstName' || ' ' || NEW.raw_user_meta_data->'user'->'name'->>'lastName'),
    SPLIT_PART(NEW.email, '@', 1) -- Fallback to email prefix
  );

  -- Extract avatar
  avatar_from_meta := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture'
  );

  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    name_from_meta,
    avatar_from_meta
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url,
    updated_at = now();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error or just return NEW to allow auth to proceed even if profile fails
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-apply trigger to ensure it uses the updated function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
