-- ============================================================================
-- 1. ADD IMAGE AND COLOR COLUMNS TO BUSINESSES AND BOOKS
-- ============================================================================

ALTER TABLE businesses 
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS color text;

ALTER TABLE books 
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS color text;


-- ============================================================================
-- 2. STORAGE BUCKET: brand-images
-- ============================================================================

-- Insert the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('brand-images', 'brand-images', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for public reading
CREATE POLICY "Public read access for brand images"
ON storage.objects FOR SELECT
USING ( bucket_id = 'brand-images' );

-- Policies for authenticated users uploading
CREATE POLICY "Authenticated users can upload brand images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'brand-images' );

-- Policies for authenticated users updating
CREATE POLICY "Authenticated users can update their brand images"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'brand-images' );

-- Policies for authenticated users deleting
CREATE POLICY "Authenticated users can delete their brand images"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'brand-images' );


-- ============================================================================
-- 3. UPDATE RPC DEFINITION TO INCLUDE NEW COLUMNS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_businesses_with_roles()
RETURNS TABLE (
  id uuid,
  name text,
  created_at timestamptz,
  owner_id uuid,
  member_count bigint,
  user_role text,
  image_url text,
  color text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.name,
    b.created_at,
    b.owner_id,
    (SELECT COUNT(*) FROM business_members bm2 WHERE bm2.business_id = b.id) as member_count,
    bm.role::text as user_role,
    b.image_url,
    b.color
  FROM businesses b
  JOIN business_members bm ON b.id = bm.business_id
  WHERE bm.user_id = auth.uid()
  ORDER BY b.created_at DESC;
END;
$$;
