-- ─── Numly idempotent postlude ────────────────────────────────────────
-- Forces a known-good final state. business_members and businesses
-- policies reference each other → use SECURITY DEFINER helpers to break
-- the recursion (helpers bypass RLS on the inner lookup).

-- ─── 0. SECURITY DEFINER helpers (RLS-bypassing) ──────────────────────
DROP FUNCTION IF EXISTS public._is_business_owner(uuid, uuid) CASCADE;
CREATE FUNCTION public._is_business_owner(b_id uuid, u_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS(SELECT 1 FROM public.businesses WHERE id = b_id AND owner_id = u_id);
$$;

DROP FUNCTION IF EXISTS public._is_business_member(uuid, uuid) CASCADE;
CREATE FUNCTION public._is_business_member(b_id uuid, u_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS(SELECT 1 FROM public.business_members WHERE business_id = b_id AND user_id = u_id);
$$;

GRANT EXECUTE ON FUNCTION public._is_business_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._is_business_member(uuid, uuid) TO authenticated;

-- ─── 1. business_members: drop all + recreate non-recursive ───────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'business_members' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.business_members', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "members_select"
  ON public.business_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public._is_business_owner(business_id, auth.uid())
  );

CREATE POLICY "members_insert"
  ON public.business_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public._is_business_owner(business_id, auth.uid())
  );

CREATE POLICY "members_update"
  ON public.business_members FOR UPDATE
  TO authenticated
  USING (public._is_business_owner(business_id, auth.uid()))
  WITH CHECK (public._is_business_owner(business_id, auth.uid()));

CREATE POLICY "members_delete"
  ON public.business_members FOR DELETE
  TO authenticated
  USING (public._is_business_owner(business_id, auth.uid()));

-- ─── 2. businesses: drop all + recreate ───────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'businesses' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.businesses', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "businesses_select"
  ON public.businesses FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR public._is_business_member(id, auth.uid())
  );

CREATE POLICY "businesses_insert"
  ON public.businesses FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "businesses_update"
  ON public.businesses FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "businesses_delete"
  ON public.businesses FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

-- ─── 3. Re-grant table privileges ─────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_members    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.books               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledgers             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.book_members        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_members      TO authenticated;
GRANT SELECT, INSERT ON public.activity_log TO authenticated;

-- ─── 4. activity_log FK pointing at public.profiles for PostgREST embed
ALTER TABLE public.activity_log
  DROP CONSTRAINT IF EXISTS activity_log_performed_by_fkey;
ALTER TABLE public.activity_log
  ADD CONSTRAINT activity_log_performed_by_fkey
  FOREIGN KEY (performed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ─── 5. Backfill profiles for users that signed up pre-trigger ────────
INSERT INTO public.profiles (id, email, full_name, created_at)
SELECT u.id,
       u.email,
       COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
       u.created_at
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

-- ─── End postlude ────────────────────────────────────────────────────
