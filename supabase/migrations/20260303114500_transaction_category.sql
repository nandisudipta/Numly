-- ============================================================================
-- ADD CATEGORY COLUMN TO TRANSACTIONS
-- ============================================================================

ALTER TABLE transactions 
  ADD COLUMN IF NOT EXISTS category text;
