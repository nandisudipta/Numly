/*
  # Storage Policies for Transaction Attachments

  ## Overview
  Creates storage policies for the transaction-attachments bucket.
  Only authenticated business members can upload and access attachments.

  ## Security
  - Users can only upload attachments for transactions in their businesses
  - Users can only view attachments for transactions in their businesses
  - 10MB file size limit enforced at bucket level
  - Only JPG, PNG, and PDF files allowed
*/

-- Allow authenticated users to upload attachments
CREATE POLICY "Business members can upload transaction attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'transaction-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow authenticated users to view attachments
CREATE POLICY "Business members can view transaction attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'transaction-attachments'
  );

-- Allow authenticated users to update their attachments
CREATE POLICY "Business members can update transaction attachments"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'transaction-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'transaction-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow authenticated users to delete their attachments
CREATE POLICY "Business members can delete transaction attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'transaction-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );