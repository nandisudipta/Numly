-- Add advanced features to ledgers and transactions

ALTER TABLE ledgers 
ADD COLUMN IF NOT EXISTS is_category_mandatory BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS custom_fields_config JSONB DEFAULT '[]'::jsonb;

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS custom_fields_data JSONB DEFAULT '{}'::jsonb;

-- Update existing triggers or policies if necessary (none needed here for simple columns)
