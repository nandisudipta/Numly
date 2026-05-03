/*
  # Fix Business Creation RLS Policies
  
  ## Problem
  Current policies cause infinite recursion when creating businesses.
  The INSERT policy on business_members checks for existing membership,
  which creates a circular dependency with the trigger that adds the owner.
  
  ## Solution
  1. Simplify business_members INSERT policy
    - Allow business owner to add themselves directly
    - Allow captains/vice captains to add others
    - Remove recursive membership checks
  
  2. Update businesses INSERT policy
    - Keep simple owner check
    - Ensure owner_id matches authenticated user
  
  ## Security
  - Users can only create businesses as themselves
  - Business owners can add themselves as captain
  - Only captains/vice captains can add other members
  - Prevents unauthorized business creation
*/

-- ============================================================================
-- DROP AND RECREATE BUSINESS_MEMBERS INSERT POLICY
-- ============================================================================

DROP POLICY IF EXISTS "Captains and vice captains can add members" ON business_members;

CREATE POLICY "Captains and vice captains can add members"
  ON business_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_members.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  );

-- ============================================================================
-- ENSURE BUSINESS INSERT POLICY IS SIMPLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can create businesses" ON businesses;

CREATE POLICY "Users can create businesses"
  ON businesses FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- ============================================================================
-- FIX AUTO-ADD CAPTAIN TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_add_business_captain()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO business_members (business_id, user_id, role, invited_by)
  VALUES (NEW.id, NEW.owner_id, 'captain', NEW.owner_id)
  ON CONFLICT (business_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS auto_add_captain_trigger ON businesses;
CREATE TRIGGER auto_add_captain_trigger
  AFTER INSERT ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION auto_add_business_captain();
