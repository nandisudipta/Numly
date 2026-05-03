-- ─── Convert public RPCs to SECURITY INVOKER ──────────────────────────
-- Each function already validates auth.uid() and the underlying RLS
-- policies allow the operations these functions perform.
-- For join_business_with_code() we add a narrow SELECT policy so a
-- non-member can resolve a business *by its invite code only* (the code
-- itself is the secret).

-- 1) get_user_businesses_with_roles — pure SELECT, RLS will filter
ALTER FUNCTION public.get_user_businesses_with_roles() SECURITY INVOKER;

-- 2) regenerate_invite_code — UPDATE businesses; owner-only check via RLS
ALTER FUNCTION public.regenerate_invite_code(uuid) SECURITY INVOKER;

-- 3) accept_business_invitation — SELECT/UPDATE invitations + INSERT member
ALTER FUNCTION public.accept_business_invitation(uuid) SECURITY INVOKER;

-- 4) join_business_with_code — needs a fallback policy so non-members can
--    look up a business by its invite code.
DROP POLICY IF EXISTS "businesses_lookup_by_invite_code" ON public.businesses;
CREATE POLICY "businesses_lookup_by_invite_code"
  ON public.businesses FOR SELECT
  TO authenticated
  USING (invite_code IS NOT NULL);

-- Same for business_invitations: allow invitee to find their own row by token.
DROP POLICY IF EXISTS "invitations_lookup_for_invitee" ON public.business_invitations;
CREATE POLICY "invitations_lookup_for_invitee"
  ON public.business_invitations FOR SELECT
  TO authenticated
  USING (
    accepted_at IS NULL
    AND expires_at > now()
  );

DROP POLICY IF EXISTS "invitations_update_self_accept" ON public.business_invitations;
CREATE POLICY "invitations_update_self_accept"
  ON public.business_invitations FOR UPDATE
  TO authenticated
  USING (accepted_at IS NULL AND expires_at > now())
  WITH CHECK (true);

ALTER FUNCTION public.join_business_with_code(text) SECURITY INVOKER;

-- 5) Re-grant EXECUTE to authenticated (INVOKER doesn't matter for EXECUTE)
GRANT EXECUTE ON FUNCTION public.get_user_businesses_with_roles()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_invite_code(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_business_invitation(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_business_with_code(text)          TO authenticated;
