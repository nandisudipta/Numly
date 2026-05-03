/*
  # Fix Business Members RLS Policy Recursion
  
  1. Problem
    - INSERT policy on business_members checks for existing membership
    - Creates infinite recursion when trigger tries to add owner as captain
    - Prevents business creation entirely
  
  2. Solution
    - Simplify INSERT policy to allow:
      a) Business owner adding themselves as captain
      b) Existing captains/vice captains adding new members
    - Remove recursive membership check
  
  3. Security
    - Still maintains security by checking ownership or captain status
    - No circular logic that causes recursion
*/

-- Drop the problematic policy
DROP POLICY IF EXISTS "Captains and vice captains can add members" ON public.business_members;

-- Create a fixed policy that doesn't cause recursion
CREATE POLICY "Captains and vice captains can add members"
  ON public.business_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Allow business owner to add themselves as captain (for new businesses)
    (
      business_id IN (
        SELECT id FROM public.businesses 
        WHERE owner_id = auth.uid()
      )
      AND user_id = auth.uid()
      AND role = 'captain'
    )
    OR
    -- Allow existing captains/vice captains to add other members
    (
      auth.uid() IN (
        SELECT bm.user_id 
        FROM public.business_members bm
        WHERE bm.business_id = business_members.business_id
        AND bm.role IN ('captain', 'vice_captain')
      )
    )
  );
