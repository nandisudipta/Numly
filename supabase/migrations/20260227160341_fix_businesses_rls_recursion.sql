/*
  # Fix Businesses RLS Recursion
  
  ## Problem
  The SELECT policies on businesses table check business_members,
  which then check businesses, creating infinite recursion.
  
  ## Solution
  Simplify businesses SELECT policy to only check ownership directly.
  Members will access business data through explicit queries, not through RLS.
  
  ## Changes
  1. Remove recursive SELECT policies
  2. Add simple ownership-based SELECT policy
  3. Keep other policies simple and direct
*/

-- ============================================================================
-- DROP ALL EXISTING POLICIES ON BUSINESSES
-- ============================================================================

DROP POLICY IF EXISTS "Members can view their businesses" ON businesses;
DROP POLICY IF EXISTS "Members can view business invite codes" ON businesses;
DROP POLICY IF EXISTS "Captains can update businesses" ON businesses;
DROP POLICY IF EXISTS "Captains can delete businesses" ON businesses;
DROP POLICY IF EXISTS "Users can create businesses" ON businesses;

-- ============================================================================
-- CREATE NEW NON-RECURSIVE POLICIES
-- ============================================================================

-- SELECT: Users can only view businesses they own
-- (Members access will be handled by explicit joins in app code)
CREATE POLICY "Users can view businesses they own"
  ON businesses FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

-- INSERT: Users can create businesses (they become owner)
CREATE POLICY "Users can create businesses"
  ON businesses FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- UPDATE: Only owners can update their businesses
CREATE POLICY "Owners can update their businesses"
  ON businesses FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- DELETE: Only owners can delete their businesses
CREATE POLICY "Owners can delete their businesses"
  ON businesses FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());
