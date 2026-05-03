/*
  # Fix Books RLS Recursion

  ## Problem
  Books policies check business_members table, which creates infinite recursion
  when business_members policies also reference related data.

  ## Solution
  Create a security definer function that bypasses RLS to check membership,
  then use this function in books policies.

  ## Changes
  1. Create helper function to check user membership (SECURITY DEFINER)
  2. Drop and recreate books policies using the helper function
  3. Apply same pattern to ledgers and transactions tables
*/

-- ============================================================================
-- CREATE HELPER FUNCTION TO CHECK MEMBERSHIP (BYPASSES RLS)
-- ============================================================================

CREATE OR REPLACE FUNCTION is_business_member(
  p_business_id uuid,
  p_user_id uuid,
  p_required_roles text[] DEFAULT ARRAY['captain', 'vice_captain', 'team_member']
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM business_members
    WHERE business_id = p_business_id
      AND user_id = p_user_id
      AND role = ANY(p_required_roles)
  );
END;
$$;

-- ============================================================================
-- FIX BOOKS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Members can view books" ON books;
DROP POLICY IF EXISTS "Members can create books" ON books;
DROP POLICY IF EXISTS "Captains and vice captains can update books" ON books;
DROP POLICY IF EXISTS "Captains and vice captains can delete books" ON books;

CREATE POLICY "Members can view books"
  ON books FOR SELECT
  TO authenticated
  USING (
    is_business_member(business_id, auth.uid())
  );

CREATE POLICY "Members can create books"
  ON books FOR INSERT
  TO authenticated
  WITH CHECK (
    is_business_member(business_id, auth.uid())
  );

CREATE POLICY "Captains and vice captains can update books"
  ON books FOR UPDATE
  TO authenticated
  USING (
    is_business_member(business_id, auth.uid(), ARRAY['captain', 'vice_captain'])
  )
  WITH CHECK (
    is_business_member(business_id, auth.uid(), ARRAY['captain', 'vice_captain'])
  );

CREATE POLICY "Captains and vice captains can delete books"
  ON books FOR DELETE
  TO authenticated
  USING (
    is_business_member(business_id, auth.uid(), ARRAY['captain', 'vice_captain'])
  );

-- ============================================================================
-- FIX LEDGERS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Members can view ledgers" ON ledgers;
DROP POLICY IF EXISTS "Members can create ledgers" ON ledgers;
DROP POLICY IF EXISTS "Captains and vice captains can update ledgers" ON ledgers;
DROP POLICY IF EXISTS "Captains and vice captains can delete ledgers" ON ledgers;

CREATE POLICY "Members can view ledgers"
  ON ledgers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM books
      WHERE books.id = ledgers.book_id
        AND is_business_member(books.business_id, auth.uid())
    )
  );

CREATE POLICY "Members can create ledgers"
  ON ledgers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM books
      WHERE books.id = ledgers.book_id
        AND is_business_member(books.business_id, auth.uid())
    )
  );

CREATE POLICY "Captains and vice captains can update ledgers"
  ON ledgers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM books
      WHERE books.id = ledgers.book_id
        AND is_business_member(books.business_id, auth.uid(), ARRAY['captain', 'vice_captain'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM books
      WHERE books.id = ledgers.book_id
        AND is_business_member(books.business_id, auth.uid(), ARRAY['captain', 'vice_captain'])
    )
  );

CREATE POLICY "Captains and vice captains can delete ledgers"
  ON ledgers FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM books
      WHERE books.id = ledgers.book_id
        AND is_business_member(books.business_id, auth.uid(), ARRAY['captain', 'vice_captain'])
    )
  );

-- ============================================================================
-- FIX TRANSACTIONS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Members can view transactions" ON transactions;
DROP POLICY IF EXISTS "Members can create transactions" ON transactions;
DROP POLICY IF EXISTS "Captains and vice captains can update transactions" ON transactions;
DROP POLICY IF EXISTS "Captains and vice captains can delete transactions" ON transactions;

CREATE POLICY "Members can view transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ledgers
      JOIN books ON books.id = ledgers.book_id
      WHERE ledgers.id = transactions.ledger_id
        AND is_business_member(books.business_id, auth.uid())
    )
  );

CREATE POLICY "Members can create transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ledgers
      JOIN books ON books.id = ledgers.book_id
      WHERE ledgers.id = transactions.ledger_id
        AND is_business_member(books.business_id, auth.uid())
    )
  );

CREATE POLICY "Captains and vice captains can update transactions"
  ON transactions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ledgers
      JOIN books ON books.id = ledgers.book_id
      WHERE ledgers.id = transactions.ledger_id
        AND is_business_member(books.business_id, auth.uid(), ARRAY['captain', 'vice_captain'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ledgers
      JOIN books ON books.id = ledgers.book_id
      WHERE ledgers.id = transactions.ledger_id
        AND is_business_member(books.business_id, auth.uid(), ARRAY['captain', 'vice_captain'])
    )
  );

CREATE POLICY "Captains and vice captains can delete transactions"
  ON transactions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ledgers
      JOIN books ON books.id = ledgers.book_id
      WHERE ledgers.id = transactions.ledger_id
        AND is_business_member(books.business_id, auth.uid(), ARRAY['captain', 'vice_captain'])
    )
  );
