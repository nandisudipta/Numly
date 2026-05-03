-- ============================================================================
-- GET USER BUSINESSES RPC
-- ============================================================================
-- secure way to fetch businesses a user is a member of, including their role
-- and the total member count. Uses SECURITY DEFINER to bypass the strict
-- RLS policies on the businesses table.

CREATE OR REPLACE FUNCTION get_user_businesses_with_roles()
RETURNS TABLE (
  id uuid,
  name text,
  created_at timestamptz,
  owner_id uuid,
  member_count bigint,
  user_role text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.name,
    b.created_at,
    b.owner_id,
    (SELECT COUNT(*) FROM business_members bm2 WHERE bm2.business_id = b.id) as member_count,
    bm.role::text as user_role
  FROM businesses b
  JOIN business_members bm ON b.id = bm.business_id
  WHERE bm.user_id = auth.uid()
  ORDER BY b.created_at DESC;
END;
$$;
