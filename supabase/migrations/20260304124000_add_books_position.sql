-- Add position column to books table
ALTER TABLE books ADD COLUMN IF NOT EXISTS "position" integer DEFAULT 0;

-- Update existing rows to have a default position based on created_at
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY business_id ORDER BY created_at ASC) - 1 as new_pos
  FROM books
)
UPDATE books
SET position = numbered.new_pos
FROM numbered
WHERE books.id = numbered.id;
