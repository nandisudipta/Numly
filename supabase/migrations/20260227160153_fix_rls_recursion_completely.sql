/*
  # Fix RLS Recursion Completely
  
  ## Problem
  RLS policies on business_members are causing infinite recursion
  when checking membership within the same table.
  
  ## Solution
  Simplify all policies to avoid recursive checks:
  1. SELECT: Allow users to see their own memberships only
  2. INSERT: Allow users to add themselves OR allow captains to add others
  3. UPDATE: Allow captains to update roles
  4. DELETE: Allow captains to remove members
  
  ## Key Changes
  - Remove all recursive EXISTS checks on business_members
  - Use direct business ownership checks instead
  - Keep policies simple and non-recursive
*/

-- ============================================================================
-- DROP ALL EXISTING POLICIES ON BUSINESS_MEMBERS
-- ============================================================================

DROP POLICY IF EXISTS "Members can view their memberships" ON business_members;
DROP POLICY IF EXISTS "Captains and vice captains can add members" ON business_members;
DROP POLICY IF EXISTS "Captains can update member roles" ON business_members;
DROP POLICY IF EXISTS "Captains and vice captains can remove members" ON business_members;
DROP POLICY IF EXISTS "Users can view business_members for their businesses" ON business_members;

-- ============================================================================
-- CREATE NEW NON-RECURSIVE POLICIES
-- ============================================================================

-- SELECT: Users can view memberships for businesses they own OR their own memberships
CREATE POLICY "Users can view memberships"
  ON business_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- INSERT: Users can add themselves OR business owners can add anyone
CREATE POLICY "Users can add themselves or owners can add anyone"
  ON business_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- UPDATE: Only business owners can update roles
CREATE POLICY "Owners can update member roles"
  ON business_members FOR UPDATE
  TO authenticated
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- DELETE: Only business owners can remove members
CREATE POLICY "Owners can remove members"
  ON business_members FOR DELETE
  TO authenticated
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );
