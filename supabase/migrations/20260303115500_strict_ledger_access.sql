-- ============================================================================
-- REFINED LEDGER LEVEL ACCESS
-- ============================================================================
-- The previous version of has_ledger_access automatically granted access to 
-- everyone who had access to the parent Book. This changes it so only
-- Captains, Vice Captains, and explicit members can view a ledger.

CREATE OR REPLACE FUNCTION has_ledger_access(ledger_uuid uuid, user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_book record;
  v_role text;
  v_ledger_created_by uuid;
BEGIN
  -- Get book_id and created_by of the ledger
  SELECT book_id, created_by INTO v_book.id, v_ledger_created_by FROM ledgers WHERE id = ledger_uuid;
  
  IF v_book.id IS NULL THEN
    RETURN false;
  END IF;

  -- Get the business_id for the book to check role
  SELECT business_id INTO v_book.business_id FROM books WHERE id = v_book.id;

  -- Get user's role in the business
  SELECT role INTO v_role FROM business_members 
  WHERE business_id = v_book.business_id AND user_id = user_uuid;

  -- 1) Captains and Vice Captains have access to EVERYTHING
  IF v_role IN ('captain', 'vice_captain') THEN
    RETURN true;
  END IF;

  -- 2) If they created the ledger, they have access
  IF v_ledger_created_by = user_uuid THEN
    RETURN true;
  END IF;

  -- 3) Check explicit assignment directly on the ledger
  IF EXISTS (SELECT 1 FROM ledger_members WHERE ledger_id = ledger_uuid AND user_id = user_uuid) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
