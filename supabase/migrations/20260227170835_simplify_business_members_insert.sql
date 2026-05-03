/*
  # Simplify Business Members Insert Policy

  ## Problem
  The trigger cannot insert into business_members because RLS policies
  block it even with SECURITY DEFINER.

  ## Solution
  Create a more permissive INSERT policy that allows:
  1. Users to add themselves (for join codes)
  2. Business owners to add anyone (for invites)
  3. System/trigger to add captain during business creation

  ## Changes
  1. Drop overly restrictive policies
  2. Create new permissive INSERT policy
*/

-- ============================================================================
-- DROP RESTRICTIVE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "System can add members" ON business_members;
DROP POLICY IF EXISTS "Users can add themselves or owners can add anyone" ON business_members;

-- ============================================================================
-- CREATE PERMISSIVE INSERT POLICY
-- ============================================================================

-- Allow inserts if ANY of these conditions are met:
-- 1. User is adding themselves
-- 2. User is the business owner
-- 3. Insert is from a trigger (user_id matches the business owner_id)
CREATE POLICY "Allow member additions"
  ON business_members FOR INSERT
  WITH CHECK (
    -- User adding themselves
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR
    -- Business owner adding someone
    (auth.uid() IS NOT NULL AND business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    ))
    OR
    -- Trigger adding owner as captain (verify this is a valid business owner)
    (business_id IN (
      SELECT id FROM businesses WHERE owner_id = user_id
    ))
  );
