/*
  # Simplify Business Creation Trigger
  
  ## Changes
  1. Ensure auto-add captain trigger uses SECURITY DEFINER
  2. Add explicit conflict handling
  3. Make sure trigger bypasses RLS by using SECURITY DEFINER
  
  ## Security
  - Trigger runs with elevated privileges to bypass RLS
  - Only runs on new business creation
  - Adds owner as captain automatically
*/

-- ============================================================================
-- RECREATE AUTO-ADD CAPTAIN TRIGGER WITH SECURITY DEFINER
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_add_business_captain()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO business_members (business_id, user_id, role, invited_by)
  VALUES (NEW.id, NEW.owner_id, 'captain', NEW.owner_id)
  ON CONFLICT (business_id, user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS auto_add_captain_trigger ON businesses;
CREATE TRIGGER auto_add_captain_trigger
  AFTER INSERT ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION auto_add_business_captain();
