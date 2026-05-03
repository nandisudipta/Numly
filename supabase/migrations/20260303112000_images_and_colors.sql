-- ============================================================================
-- ADD IMAGE AND COLOR COLUMNS TO BUSINESSES AND BOOKS
-- ============================================================================

ALTER TABLE businesses 
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS color text;

ALTER TABLE books 
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS color text;
