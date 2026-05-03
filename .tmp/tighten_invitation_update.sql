-- Tighten the invitation UPDATE policy: invitee can ONLY mark accepted_at,
-- not change business_id / role / email / token / expires_at / invited_by.

DROP POLICY IF EXISTS "invitations_update_self_accept" ON public.business_invitations;

CREATE POLICY "invitations_update_self_accept"
  ON public.business_invitations FOR UPDATE
  TO authenticated
  USING (
    accepted_at IS NULL
    AND expires_at > now()
  )
  WITH CHECK (
    accepted_at IS NOT NULL
  );
