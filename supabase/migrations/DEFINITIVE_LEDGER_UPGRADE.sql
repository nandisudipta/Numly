-- ============================================================================
-- DEFINITIVE LEDGER UPGRADE
-- This script adds ALL columns required for the advanced ledger features.
-- Run this in your Supabase SQL Editor once.
-- ============================================================================

-- 1. Add all missing columns to the ledgers table
ALTER TABLE public.ledgers 
  ADD COLUMN IF NOT EXISTS categories text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS decimal_rule text DEFAULT 'entry',
  ADD COLUMN IF NOT EXISTS decimal_precision integer DEFAULT 2,
  ADD COLUMN IF NOT EXISTS is_category_mandatory BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_fields_config JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS restrict_backdated_entries text DEFAULT 'always';

-- 2. Add constraints
DO $$ 
BEGIN 
  -- decimal_rule constraint
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledgers_decimal_rule_check') THEN
    ALTER TABLE public.ledgers 
      ADD CONSTRAINT ledgers_decimal_rule_check 
      CHECK (decimal_rule IN ('entry', 'ledger'));
  END IF;

  -- decimal_precision constraint
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledgers_decimal_precision_check') THEN
    ALTER TABLE public.ledgers 
      ADD CONSTRAINT ledgers_decimal_precision_check 
      CHECK (decimal_precision >= 0 AND decimal_precision <= 3);
  END IF;

  -- restrict_backdated_entries constraint
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledgers_restrict_backdated_entries_check') THEN
    ALTER TABLE public.ledgers 
      ADD CONSTRAINT ledgers_restrict_backdated_entries_check 
      CHECK (restrict_backdated_entries IN ('always', 'never', 'one_day'));
  END IF;
END $$;

-- 3. Update transactions table
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS custom_fields_data JSONB DEFAULT '{}'::jsonb;

-- 4. Create storage bucket if it doesn't exist (via RPC or manual)
-- Bucket: transaction-attachments

-- 5. Refresh PostgREST cache
NOTIFY pgrst, 'reload schema';
