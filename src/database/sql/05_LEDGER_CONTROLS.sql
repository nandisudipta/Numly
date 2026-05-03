-- ============================================================================
-- ADD ADVANCED LEDGER CONTROLS (DECIMAL RULES)
-- ============================================================================

-- 1. Remove old max_entry_amount column if it exists
ALTER TABLE public.ledgers DROP COLUMN IF EXISTS max_entry_amount;

-- 2. Add decimal_rule column
ALTER TABLE public.ledgers 
  ADD COLUMN IF NOT EXISTS decimal_rule text DEFAULT 'entry';

-- 3. Add constraint for decimal_rule
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ledgers_decimal_rule_check'
  ) THEN
    ALTER TABLE public.ledgers 
      ADD CONSTRAINT ledgers_decimal_rule_check 
      CHECK (decimal_rule IN ('entry', 'ledger'));
  END IF;
END $$;

-- 4. Ensure decimal_precision is valid
ALTER TABLE public.ledgers 
  ADD COLUMN IF NOT EXISTS decimal_precision integer DEFAULT 2;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ledgers_decimal_precision_check'
  ) THEN
    ALTER TABLE public.ledgers 
      ADD CONSTRAINT ledgers_decimal_precision_check 
      CHECK (decimal_precision >= 0 AND decimal_precision <= 3);
  END IF;
END $$;

UPDATE public.ledgers SET decimal_rule = 'entry' WHERE decimal_rule IS NULL;

-- 5. Notify schema reload
NOTIFY pgrst, 'reload_schema';
