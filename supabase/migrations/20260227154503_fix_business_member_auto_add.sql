/*
  # Fix Business Member Auto-Add
  
  1. Purpose
    - Automatically add business owner as captain when business is created
    - Ensures owner can access their own business immediately
    - Prevents "no access" errors after business creation
  
  2. Changes
    - Create trigger function to auto-add owner as captain
    - Create trigger on businesses insert
  
  3. Security
    - Function runs with security definer privileges
    - Only adds the owner as captain
    - Uses proper role assignment
*/

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_business_created ON public.businesses;
DROP FUNCTION IF EXISTS public.handle_new_business() CASCADE;

-- Create function to auto-add owner as captain
CREATE OR REPLACE FUNCTION public.handle_new_business()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Add the owner as captain of the business
  INSERT INTO public.business_members (business_id, user_id, role, invited_by, joined_at)
  VALUES (
    NEW.id,
    NEW.owner_id,
    'captain',
    NEW.owner_id,
    NOW()
  )
  ON CONFLICT DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER on_business_created
  AFTER INSERT ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_business();

-- Fix existing businesses without members
INSERT INTO public.business_members (business_id, user_id, role, invited_by, joined_at)
SELECT 
  b.id,
  b.owner_id,
  'captain',
  b.owner_id,
  b.created_at
FROM public.businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM public.business_members bm 
  WHERE bm.business_id = b.id AND bm.user_id = b.owner_id
)
ON CONFLICT DO NOTHING;
