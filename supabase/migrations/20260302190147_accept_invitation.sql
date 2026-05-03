-- ============================================================================
-- ACCEPT BUSINESS INVITATION RPC
-- ============================================================================
-- Allows a user to accept an email invitation securely using a token.
-- Security Definer allows it to insert into business_members while bypassing RLS.

CREATE OR REPLACE FUNCTION accept_business_invitation(invite_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_user_email text;
  v_user_id uuid;
BEGIN
  -- Get the current user's details
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT email INTO v_user_email FROM profiles WHERE id = v_user_id;

  -- Find the invitation
  SELECT * INTO v_invite
  FROM business_invitations
  WHERE token = invite_token
  AND accepted_at IS NULL
  AND expires_at > now();

  IF v_invite IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired invitation');
  END IF;

  -- Verify the email matches
  IF lower(v_invite.email) != lower(v_user_email) THEN
    RETURN json_build_object('success', false, 'error', 'This invitation was sent to a different email address');
  END IF;
  
  -- Check if user is already a member
  IF EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = v_invite.business_id AND user_id = v_user_id
  ) THEN
    -- They are already a member, just mark it accepted
    UPDATE business_invitations
    SET accepted_at = now()
    WHERE id = v_invite.id;
    
    RETURN json_build_object('success', true, 'business_id', v_invite.business_id);
  END IF;

  -- Insert the new member
  INSERT INTO business_members (business_id, user_id, role)
  VALUES (v_invite.business_id, v_user_id, v_invite.role);

  -- Mark invitation as accepted
  UPDATE business_invitations
  SET accepted_at = now()
  WHERE id = v_invite.id;

  RETURN json_build_object('success', true, 'business_id', v_invite.business_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
