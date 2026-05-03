-- ─── Numly idempotent prelude ─────────────────────────────────────────
-- 1. Wipe ALL policies on the tables this bundle touches, so old
--    recursive/buggy policies don't survive a re-run with renamed fixes.
-- 2. Ensure activity_log table exists (referenced in code but never had its
--    own create migration in this bundle).

DO $$
DECLARE
  r record;
  tables text[] := ARRAY[
    'profiles',
    'businesses',
    'business_members',
    'business_invitations',
    'books',
    'ledgers',
    'transactions',
    'book_members',
    'ledger_members',
    'activity_log'
  ];
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(tables)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- activity_log: append-only audit table referenced by AuditLog.tsx + auditLogger.ts
CREATE TABLE IF NOT EXISTS public.activity_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL,
  action       text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    text NOT NULL,
  old_value    jsonb,
  new_value    jsonb,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_business_id  ON public.activity_log(business_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at  ON public.activity_log(created_at DESC);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Members of the business can read; nobody can update/delete (append-only).
DROP POLICY IF EXISTS "members_read_audit" ON public.activity_log;
CREATE POLICY "members_read_audit"
  ON public.activity_log FOR SELECT
  TO authenticated
  USING (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
    OR business_id IN (SELECT business_id FROM public.business_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "members_insert_audit" ON public.activity_log;
CREATE POLICY "members_insert_audit"
  ON public.activity_log FOR INSERT
  TO authenticated
  WITH CHECK (
    business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid())
    OR business_id IN (SELECT business_id FROM public.business_members WHERE user_id = auth.uid())
  );

-- Block updates/deletes via trigger (immutability)
CREATE OR REPLACE FUNCTION public.activity_log_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'activity_log entries are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS activity_log_no_update ON public.activity_log;
CREATE TRIGGER activity_log_no_update
  BEFORE UPDATE ON public.activity_log
  FOR EACH ROW EXECUTE FUNCTION public.activity_log_immutable();

DROP TRIGGER IF EXISTS activity_log_no_delete ON public.activity_log;
CREATE TRIGGER activity_log_no_delete
  BEFORE DELETE ON public.activity_log
  FOR EACH ROW EXECUTE FUNCTION public.activity_log_immutable();

-- ─── End prelude ─────────────────────────────────────────────────────
