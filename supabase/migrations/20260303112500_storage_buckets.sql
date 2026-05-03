-- ============================================================================
-- STORAGE BUCKET: brand-images
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
