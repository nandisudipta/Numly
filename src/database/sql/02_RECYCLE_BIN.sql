-- ============================================================================
-- RECYCLE BIN SYSTEM FOR NUMLY PRO
-- ============================================================================

-- 1. Add Soft Delete Columns to Books
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) DEFAULT NULL;

-- 2. Add Soft Delete Columns to Ledgers
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.ledgers ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) DEFAULT NULL;

-- 3. Create Performance Indexes
CREATE INDEX IF NOT EXISTS idx_books_active_business ON public.books(business_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ledgers_active_book ON public.ledgers(book_id) WHERE deleted_at IS NULL;

-- 4. Update RLS Policies to hide soft-deleted rows by default
-- Books
DROP POLICY IF EXISTS "Members can view books" ON public.books;
CREATE POLICY "Members can view books"
  ON public.books FOR SELECT
  TO authenticated
  USING (
    is_business_member(business_id, auth.uid())
    AND deleted_at IS NULL
  );

-- Ledgers
DROP POLICY IF EXISTS "Members can view ledgers" ON public.ledgers;
CREATE POLICY "Members can view ledgers"
  ON public.ledgers FOR SELECT
  TO authenticated
  USING (
    is_business_member(business_id, auth.uid())
    AND deleted_at IS NULL
  );

-- 5. Create RLS Policy for Recycle Bin Access (Captains/Vice Captains Only)
-- This allows admins to see deleted rows for the Recycle Bin view
CREATE POLICY "Admins can view soft-deleted books"
  ON public.books FOR SELECT
  TO authenticated
  USING (
    is_business_member(business_id, auth.uid(), ARRAY['captain', 'vice_captain'])
    AND deleted_at IS NOT NULL
  );

CREATE POLICY "Admins can view soft-deleted ledgers"
  ON public.ledgers FOR SELECT
  TO authenticated
  USING (
    is_business_member(business_id, auth.uid(), ARRAY['captain', 'vice_captain'])
    AND deleted_at IS NOT NULL
  );

-- 6. Helper Function for Auto-Purge Warning (Visual only in DB)
COMMENT ON COLUMN public.books.deleted_at IS 'Soft delete timestamp. Items older than 30 days are subject to purging.';
