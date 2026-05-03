-- ============================================================================
-- LEDGER LEVEL ACCESS
-- ============================================================================

-- 1. Create ledger_members table
CREATE TABLE IF NOT EXISTS ledger_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id uuid REFERENCES ledgers(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(ledger_id, user_id)
);



ALTER TABLE ledger_members ENABLE ROW LEVEL SECURITY;

-- 2. Security Definer Helper for Ledger Access
CREATE OR REPLACE FUNCTION has_ledger_access(ledger_uuid uuid, user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_book_id uuid;
  v_ledger_created_by uuid;
BEGIN
  -- Get book_id and created_by of the ledger
  SELECT book_id, created_by INTO v_book_id, v_ledger_created_by FROM ledgers WHERE id = ledger_uuid;
  
  IF v_book_id IS NULL THEN
    RETURN false;
  END IF;

  -- 1) If they have book access, they inherently have ledger access.
  -- (has_book_access inherently checks for Captain/Vice-Captain too)
  IF has_book_access(v_book_id, user_uuid) THEN
    RETURN true;
  END IF;

  -- 2) If they created the ledger, they have access
  IF v_ledger_created_by = user_uuid THEN
    RETURN true;
  END IF;

  -- 3) Check explicit assignment directly on the ledger
  IF EXISTS (SELECT 1 FROM ledger_members WHERE ledger_id = ledger_uuid AND user_id = user_uuid) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;


-- 3. Set ledger_members Policies
CREATE POLICY "Users can view own ledger memberships or captains/book_members can view all"
  ON ledger_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    has_ledger_access(ledger_id, auth.uid())
  );

CREATE POLICY "Users with ledger access can manage ledger members"
  ON ledger_members FOR ALL
  TO authenticated
  USING (has_ledger_access(ledger_id, auth.uid()));

-- NOTE: The policies on `ledgers` and `transactions` 
-- BOTH already utilize `has_ledger_access` 
-- which we just updated above to include `ledger_members` checks.
-- So we do not need to rewrite the SELECT/INSERT policies for them.
