-- Allow captains and vice captains to delete business_invitations
CREATE POLICY "Captains and vice captains can delete invitations"
  ON business_invitations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_invitations.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  );
