-- ─── Numly linter follow-ups ──────────────────────────────────────────

-- 1) ledger_members has RLS enabled but no policies → nothing accessible.
--    Add owner/captain-based policies that work via the existing helper.

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'ledger_members' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.ledger_members', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "ledger_members_select"
  ON public.ledger_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.ledgers l
      JOIN public.books b ON b.id = l.book_id
      WHERE l.id = ledger_members.ledger_id
        AND public._is_business_owner(b.business_id, auth.uid())
    )
  );

CREATE POLICY "ledger_members_insert"
  ON public.ledger_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ledgers l
      JOIN public.books b ON b.id = l.book_id
      WHERE l.id = ledger_members.ledger_id
        AND public._is_business_owner(b.business_id, auth.uid())
    )
  );

CREATE POLICY "ledger_members_delete"
  ON public.ledger_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ledgers l
      JOIN public.books b ON b.id = l.book_id
      WHERE l.id = ledger_members.ledger_id
        AND public._is_business_owner(b.business_id, auth.uid())
    )
  );

GRANT SELECT, INSERT, DELETE ON public.ledger_members TO authenticated;

-- ─── End ──────────────────────────────────────────────────────────────
