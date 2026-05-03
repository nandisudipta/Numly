-- Drop all overloads of functions this bundle (re)creates, so signature changes don't conflict.
DO $$
DECLARE
  r record;
  fn_names text[] := ARRAY[
    'accept_business_invitation',
    'auto_add_business_captain',
    'generate_invite_code',
    'get_user_businesses_with_roles',
    'get_user_role_in_business',
    'handle_new_business',
    'handle_new_user',
    'has_book_access',
    'has_ledger_access',
    'is_business_member',
    'is_captain',
    'is_captain_or_vice',
    'join_business_with_code',
    'regenerate_invite_code',
    'set_business_invite_code',
    'update_updated_at_column'
  ];
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname = ANY(fn_names)
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

