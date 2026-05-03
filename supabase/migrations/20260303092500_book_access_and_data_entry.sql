-- ============================================================================
-- BOOK LEVEL ACCESS & DATA ENTRY ROLE MIGRATION
-- ============================================================================

-- 1. update business_members ENUM/CHECK constraints
ALTER TABLE business_members DROP CONSTRAINT IF EXISTS business_members_role_check;
ALTER TABLE business_members ADD CONSTRAINT business_members_role_check 
  CHECK (role IN ('captain', 'vice_captain', 'team_member', 'viewer', 'data_entry'));

ALTER TABLE business_invitations DROP CONSTRAINT IF EXISTS business_invitations_role_check;
ALTER TABLE business_invitations ADD CONSTRAINT business_invitations_role_check 
  CHECK (role IN ('vice_captain', 'team_member', 'viewer', 'data_entry'));


-- 2. create book_members table
CREATE TABLE IF NOT EXISTS book_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid REFERENCES books(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(book_id, user_id)
);

ALTER TABLE book_members ENABLE ROW LEVEL SECURITY;


-- 3. Security Definer Helper for Book Access
CREATE OR REPLACE FUNCTION has_book_access(book_uuid uuid, user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_book record;
  v_role text;
BEGIN
  -- Get book details
  SELECT * INTO v_book FROM books WHERE id = book_uuid;
  IF v_book IS NULL THEN
    RETURN false;
  END IF;

  -- Get user's role in the business
  SELECT role INTO v_role FROM business_members 
  WHERE business_id = v_book.business_id AND user_id = user_uuid;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  -- Captains and vice captains have access to ALL books
  IF v_role IN ('captain', 'vice_captain') THEN
    RETURN true;
  END IF;

  -- If they created the book, they have access
  IF v_book.created_by = user_uuid THEN
    RETURN true;
  END IF;

  -- Check explicit assignment
  IF EXISTS (SELECT 1 FROM book_members WHERE book_id = book_uuid AND user_id = user_uuid) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;


-- 4. Set Book_Members Policies
CREATE POLICY "Users can view own book memberships or captains can view all"
  ON book_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    has_book_access(book_id, auth.uid())
  );

CREATE POLICY "Users with book access can manage book members"
  ON book_members FOR ALL
  TO authenticated
  USING (has_book_access(book_id, auth.uid()));


-- 5. Update Books Policies
DROP POLICY IF EXISTS "Members can view books" ON books;
CREATE POLICY "Assigned members can view books"
  ON books FOR SELECT
  TO authenticated
  USING (has_book_access(id, auth.uid()));

-- leave insert/delete/update books alone, they already verify business_membership/creation nicely,
-- but just mapping visibility.


-- 6. Update Ledgers Policies
CREATE OR REPLACE FUNCTION has_ledger_access(ledger_uuid uuid, user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_book_id uuid;
BEGIN
  -- Get book_id of the ledger
  SELECT book_id INTO v_book_id FROM ledgers WHERE id = ledger_uuid;
  IF v_book_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN has_book_access(v_book_id, user_uuid);
END;
$$;

DROP POLICY IF EXISTS "Members can view ledgers" ON ledgers;
CREATE POLICY "Assigned members can view ledgers"
  ON ledgers FOR SELECT
  TO authenticated
  USING (has_book_access(book_id, auth.uid()));

DROP POLICY IF EXISTS "Members can create ledgers" ON ledgers;
CREATE POLICY "Assigned members can create ledgers"
  ON ledgers FOR INSERT
  TO authenticated
  WITH CHECK (has_book_access(book_id, auth.uid()));


-- 7. Update Transactions Policies
DROP POLICY IF EXISTS "Members can view transactions" ON transactions;
CREATE POLICY "Assigned members can view transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (has_ledger_access(ledger_id, auth.uid()));

DROP POLICY IF EXISTS "Members can create transactions" ON transactions;
CREATE POLICY "Assigned members can create transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (has_ledger_access(ledger_id, auth.uid()));

