-- ============================================================================
-- ADD CATEGORIES TO LEDGERS
-- ============================================================================

ALTER TABLE ledgers 
  ADD COLUMN IF NOT EXISTS categories text[] DEFAULT '{}';
