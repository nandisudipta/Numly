-- Consolidation of all ledger upgrade features
-- Run this in Supabase SQL Editor

-- 1. Update Ledgers Table
ALTER TABLE public.ledgers 
  ADD COLUMN IF NOT EXISTS restrict_backdated_entries text DEFAULT 'always',
  ADD COLUMN IF NOT EXISTS is_category_mandatory BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_fields_config JSONB DEFAULT '[]'::jsonb;

-- Add check constraint for backdated entries
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledgers_restrict_backdated_entries_check') THEN
    ALTER TABLE public.ledgers 
      ADD CONSTRAINT ledgers_restrict_backdated_entries_check 
      CHECK (restrict_backdated_entries IN ('always', 'never', 'one_day'));
  END IF;
END $$;

-- 2. Update Transactions Table
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS custom_fields_data JSONB DEFAULT '{}'::jsonb;

-- 3. Ensure Storage Bucket Exists
-- Note: This requires Supabase Storage API access or manual creation in Dashboard
-- Bucket name: transaction-attachments

-- 4. Refresh Schema Cache
NOTIFY pgrst, 'reload schema';
