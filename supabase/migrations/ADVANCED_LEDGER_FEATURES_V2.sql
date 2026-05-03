-- Add backdated entry restriction and refined custom fields config
ALTER TABLE public.ledgers 
  ADD COLUMN IF NOT EXISTS restrict_backdated_entries text DEFAULT 'always' 
  CHECK (restrict_backdated_entries IN ('always', 'never', 'one_day'));

-- Migrate custom_fields_config from string array to JSONB objects if needed
-- We can do this in the frontend as well, but let's ensure the column is JSONB (already is)
-- The frontend will handle the structure: [{ name: "Field", is_mandatory: boolean }]

-- Notify schema reload
NOTIFY pgrst, 'reload schema';
