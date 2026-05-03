-- SUPABASE STORAGE BUCKET SETUP
-- Ensure business_logos bucket exists
INSERT INTO storage.buckets (id, name, public) 
VALUES ('business_logos', 'business_logos', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for public read and authenticated upload
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'business_logos');
CREATE POLICY "Authenticated Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'business_logos' AND auth.role() = 'authenticated');
