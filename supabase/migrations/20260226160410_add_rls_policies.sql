/*
  # Add Row Level Security Policies

  ## Overview
  Enables RLS and creates comprehensive security policies for all tables.
  Enforces role-based permissions at the database level.

  ## Security Model
  - Captain: Full control including business deletion
  - Vice Captain: Full control except business deletion and ownership transfer
  - Team Member: Can add transactions and view data, cannot delete
  - Viewer: Read-only access

  ## Policy Structure
  Each table has policies for SELECT, INSERT, UPDATE, and DELETE operations
  that check user authentication, business membership, and role permissions.
*/

-- ============================================================================
-- PROFILES TABLE POLICIES
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can read profiles of business members"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm1
      JOIN business_members bm2 ON bm1.business_id = bm2.business_id
      WHERE bm1.user_id = profiles.id
      AND bm2.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- BUSINESSES TABLE POLICIES
-- ============================================================================

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their businesses"
  ON businesses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM business_members
      WHERE business_members.business_id = businesses.id
      AND business_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create businesses"
  ON businesses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Captains can update businesses"
  ON businesses FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Captains can delete businesses"
  ON businesses FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

-- ============================================================================
-- BUSINESS MEMBERS TABLE POLICIES
-- ============================================================================

ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view team members"
  ON business_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_members.business_id
      AND bm.user_id = auth.uid()
    )
  );

CREATE POLICY "Captains and vice captains can add members"
  ON business_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_members.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    ) OR (
      business_id IN (
        SELECT id FROM businesses WHERE owner_id = auth.uid()
      ) AND role = 'captain' AND user_id = auth.uid()
    )
  );

CREATE POLICY "Captains can update member roles"
  ON business_members FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = business_members.business_id
      AND b.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = business_members.business_id
      AND b.owner_id = auth.uid()
    )
  );

CREATE POLICY "Captains and vice captains can remove members"
  ON business_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_members.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  );

-- ============================================================================
-- BUSINESS INVITATIONS TABLE POLICIES
-- ============================================================================

ALTER TABLE business_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view business invitations"
  ON business_invitations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_invitations.business_id
      AND bm.user_id = auth.uid()
    )
  );

CREATE POLICY "Captains and vice captains can create invitations"
  ON business_invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_invitations.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  );

CREATE POLICY "Users can accept their invitations"
  ON business_invitations FOR UPDATE
  TO authenticated
  USING (
    email = (SELECT email FROM profiles WHERE id = auth.uid())
    AND accepted_at IS NULL
    AND expires_at > now()
  )
  WITH CHECK (
    email = (SELECT email FROM profiles WHERE id = auth.uid())
  );

-- ============================================================================
-- BOOKS TABLE POLICIES
-- ============================================================================

ALTER TABLE books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view books"
  ON books FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = books.business_id
      AND bm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create books"
  ON books FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = books.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain', 'team_member')
    )
  );

CREATE POLICY "Captains and vice captains can update books"
  ON books FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = books.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = books.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  );

CREATE POLICY "Captains and vice captains can delete books"
  ON books FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = books.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  );

-- ============================================================================
-- LEDGERS TABLE POLICIES
-- ============================================================================

ALTER TABLE ledgers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view ledgers"
  ON ledgers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM books b
      JOIN business_members bm ON bm.business_id = b.business_id
      WHERE b.id = ledgers.book_id
      AND bm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create ledgers"
  ON ledgers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM books b
      JOIN business_members bm ON bm.business_id = b.business_id
      WHERE b.id = ledgers.book_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain', 'team_member')
    )
  );

CREATE POLICY "Captains and vice captains can update ledgers"
  ON ledgers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM books b
      JOIN business_members bm ON bm.business_id = b.business_id
      WHERE b.id = ledgers.book_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM books b
      JOIN business_members bm ON bm.business_id = b.business_id
      WHERE b.id = ledgers.book_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  );

CREATE POLICY "Captains and vice captains can delete ledgers"
  ON ledgers FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM books b
      JOIN business_members bm ON bm.business_id = b.business_id
      WHERE b.id = ledgers.book_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  );

-- ============================================================================
-- TRANSACTIONS TABLE POLICIES
-- ============================================================================

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ledgers l
      JOIN books b ON b.id = l.book_id
      JOIN business_members bm ON bm.business_id = b.business_id
      WHERE l.id = transactions.ledger_id
      AND bm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ledgers l
      JOIN books b ON b.id = l.book_id
      JOIN business_members bm ON bm.business_id = b.business_id
      WHERE l.id = transactions.ledger_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain', 'team_member')
    )
  );

CREATE POLICY "Captains and vice captains can update transactions"
  ON transactions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ledgers l
      JOIN books b ON b.id = l.book_id
      JOIN business_members bm ON bm.business_id = b.business_id
      WHERE l.id = transactions.ledger_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ledgers l
      JOIN books b ON b.id = l.book_id
      JOIN business_members bm ON bm.business_id = b.business_id
      WHERE l.id = transactions.ledger_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  );

CREATE POLICY "Captains and vice captains can delete transactions"
  ON transactions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ledgers l
      JOIN books b ON b.id = l.book_id
      JOIN business_members bm ON bm.business_id = b.business_id
      WHERE l.id = transactions.ledger_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  );

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_role_in_business(business_uuid uuid, user_uuid uuid)
RETURNS text AS $$
  SELECT role FROM business_members
  WHERE business_id = business_uuid AND user_id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_captain(business_uuid uuid, user_uuid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM businesses
    WHERE id = business_uuid AND owner_id = user_uuid
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_captain_or_vice(business_uuid uuid, user_uuid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = business_uuid
    AND user_id = user_uuid
    AND role IN ('captain', 'vice_captain')
  );
$$ LANGUAGE sql SECURITY DEFINER;