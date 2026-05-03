-- ─── Numly Supabase linter fixes ───────────────────────────────────────
-- Addresses: function_search_path_mutable, public_bucket_allows_listing,
-- anon_security_definer_function_executable, authenticated_security_definer_function_executable.

-- 1) Pin search_path on every function flagged (prevents search-path injection)
ALTER FUNCTION public.activity_log_immutable()                              SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column()                            SET search_path = public, pg_temp;
ALTER FUNCTION public.get_user_role_in_business(uuid, uuid)                 SET search_path = public, pg_temp;
ALTER FUNCTION public.is_captain(uuid, uuid)                                SET search_path = public, pg_temp;
ALTER FUNCTION public.is_captain_or_vice(uuid, uuid)                        SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_invite_code()                                SET search_path = public, pg_temp;
ALTER FUNCTION public.set_business_invite_code()                            SET search_path = public, pg_temp;
ALTER FUNCTION public.join_business_with_code(text)                         SET search_path = public, pg_temp;
ALTER FUNCTION public.regenerate_invite_code(uuid)                          SET search_path = public, pg_temp;

-- (Other helpers already have SET search_path = public; this is safe to re-apply)
ALTER FUNCTION public._is_business_member(uuid, uuid)                       SET search_path = public, pg_temp;
ALTER FUNCTION public._is_business_owner(uuid, uuid)                        SET search_path = public, pg_temp;
ALTER FUNCTION public.has_book_access(uuid, uuid)                           SET search_path = public, pg_temp;
ALTER FUNCTION public.has_ledger_access(uuid, uuid)                         SET search_path = public, pg_temp;
ALTER FUNCTION public.is_business_member(uuid, uuid, text[])                SET search_path = public, pg_temp;
ALTER FUNCTION public.accept_business_invitation(uuid)                      SET search_path = public, pg_temp;
ALTER FUNCTION public.get_user_businesses_with_roles()                      SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_business()                                 SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user()                                     SET search_path = public, pg_temp;
ALTER FUNCTION public.auto_add_business_captain()                           SET search_path = public, pg_temp;

-- 2) brand-images bucket: drop public listing SELECT policy.
--    Public buckets serve files via direct URL without needing this policy;
--    listing = enumerating every file in the bucket = unintended exposure.
DROP POLICY IF EXISTS "Public read access for brand images" ON storage.objects;

-- 3) Lock down EXECUTE on SECURITY DEFINER functions.
--    Internal helpers used by RLS policies don't need to be callable directly.
--    RLS executes them within policy context regardless of the caller's privs.

-- 3a) Internal helpers — revoke from everybody, keep service_role implicit
REVOKE EXECUTE ON FUNCTION public._is_business_member(uuid, uuid)           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._is_business_owner(uuid, uuid)            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_book_access(uuid, uuid)               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_ledger_access(uuid, uuid)             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_business_member(uuid, uuid, text[])    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_captain(uuid, uuid)                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_captain_or_vice(uuid, uuid)            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_role_in_business(uuid, uuid)     FROM PUBLIC, anon, authenticated;

-- 3b) Trigger-only functions — never called directly via RPC
REVOKE EXECUTE ON FUNCTION public.auto_add_business_captain()               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_business()                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.activity_log_immutable()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_business_invite_code()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_invite_code()                    FROM PUBLIC, anon, authenticated;

-- 3c) Public RPCs — revoke from anon, grant only to authenticated
REVOKE EXECUTE ON FUNCTION public.accept_business_invitation(uuid)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_businesses_with_roles()          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_business_with_code(text)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.regenerate_invite_code(uuid)              FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.accept_business_invitation(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_businesses_with_roles()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_business_with_code(text)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_invite_code(uuid)               TO authenticated;

-- ─── End ──────────────────────────────────────────────────────────────
