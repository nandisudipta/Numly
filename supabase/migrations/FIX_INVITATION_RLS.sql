-- Add missing RLS policy for business invitations
-- This ensures captains and vice captains can create invitations

DROP POLICY IF EXISTS "Captains and vice captains can create invitations" ON business_invitations;

CREATE POLICY "Captains and vice captains can create invitations"
  ON business_invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_invitations.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    ) OR EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = business_invitations.business_id
      AND b.owner_id = auth.uid()
    )
  );

-- Also add a policy for deleting invitations if it doesn't exist or is insufficient
DROP POLICY IF EXISTS "Captains and vice captains can delete invitations" ON business_invitations;

CREATE POLICY "Captains and vice captains can delete invitations"
  ON business_invitations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_invitations.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    ) OR EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = business_invitations.business_id
      AND b.owner_id = auth.uid()
    )
  );
