/*
  # Fix Profile Creation Trigger
  
  ## Problem
  The trigger `handle_new_user()` was failing because it didn't have proper permissions
  to insert into the profiles table during user signup. The RLS policy requires 
  authenticated users, but the trigger runs in a context where the user isn't yet
  fully authenticated.
  
  ## Solution
  Recreate the trigger function with `SECURITY DEFINER` and proper permissions
  to bypass RLS when creating the initial profile.
  
  ## Changes
  1. Drop and recreate the handle_new_user function with better error handling
  2. Ensure it runs with elevated privileges to bypass RLS
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Recreate the function with better error handling and proper security
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert into profiles table
  -- This function runs as the definer (with elevated privileges)
  -- so it bypasses RLS policies
  INSERT INTO public.profiles (id, email, full_name, avatar_url, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    updated_at = NOW();
    
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the user creation
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_new_user();
/*
  # Create Auto Profile Creation Trigger
  
  1. Purpose
    - Automatically create a profile entry when a new user signs up
    - Ensures every auth.users entry has a corresponding profiles entry
    - Eliminates manual profile creation step
  
  2. Changes
    - Drop existing trigger if it exists
    - Create improved trigger function that:
      - Handles both email/password and OAuth signups
      - Extracts full name from user metadata
      - Uses proper error handling
    - Create trigger on auth.users insert
  
  3. Security
    - Function runs with security definer privileges
    - Only creates profile for the new user
    - Prevents duplicate profile creation
*/

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Create improved profile creation function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create profiles for existing users who don't have one
INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
SELECT 
  u.id,
  u.email,
  COALESCE(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1)
  ) as full_name,
  u.created_at,
  NOW()
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
)
ON CONFLICT (id) DO NOTHING;
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
/*
  # Add Invite Code System for Business Onboarding
  
  ## Overview
  Implements a simplified invite code system for team onboarding.
  Replaces complex email-based invitations with shareable codes.
  
  ## Changes
  1. Add invite_code column to businesses table
    - Short, unique 8-character alphanumeric code
    - Generated automatically on business creation
    - Can be regenerated by captain
  
  2. Add public function to accept invite codes
    - Validates code and business existence
    - Adds user to business_members as 'viewer' by default
    - Prevents duplicate memberships
  
  3. Security
    - Only authenticated users can join via invite code
    - Users automatically added as 'viewer' role
    - Captain can change roles after joining
    - Prevents users from joining same business twice
  
  ## Notes
  - Invite codes are permanent (don't expire)
  - Captain can regenerate code to revoke old one
  - Simple 8-character format: ABCD1234
*/

-- ============================================================================
-- ADD INVITE CODE TO BUSINESSES TABLE
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'businesses' AND column_name = 'invite_code'
  ) THEN
    ALTER TABLE businesses ADD COLUMN invite_code text UNIQUE;
  END IF;
END $$;

-- ============================================================================
-- FUNCTION TO GENERATE RANDOM INVITE CODE
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS text AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION TO AUTO-GENERATE INVITE CODE ON BUSINESS CREATION
-- ============================================================================

CREATE OR REPLACE FUNCTION set_business_invite_code()
RETURNS TRIGGER AS $$
DECLARE
  new_code text;
  code_exists boolean;
BEGIN
  IF NEW.invite_code IS NULL THEN
    LOOP
      new_code := generate_invite_code();
      SELECT EXISTS(SELECT 1 FROM businesses WHERE invite_code = new_code) INTO code_exists;
      EXIT WHEN NOT code_exists;
    END LOOP;
    NEW.invite_code := new_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_invite_code_trigger ON businesses;
CREATE TRIGGER set_invite_code_trigger
  BEFORE INSERT ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION set_business_invite_code();

-- ============================================================================
-- GENERATE CODES FOR EXISTING BUSINESSES
-- ============================================================================

DO $$
DECLARE
  business_record RECORD;
  new_code text;
  code_exists boolean;
BEGIN
  FOR business_record IN SELECT id FROM businesses WHERE invite_code IS NULL LOOP
    LOOP
      new_code := generate_invite_code();
      SELECT EXISTS(SELECT 1 FROM businesses WHERE invite_code = new_code) INTO code_exists;
      EXIT WHEN NOT code_exists;
    END LOOP;
    UPDATE businesses SET invite_code = new_code WHERE id = business_record.id;
  END LOOP;
END $$;

-- ============================================================================
-- FUNCTION TO JOIN BUSINESS VIA INVITE CODE
-- ============================================================================

CREATE OR REPLACE FUNCTION join_business_with_code(code text)
RETURNS jsonb AS $$
DECLARE
  business_record RECORD;
  already_member boolean;
  result jsonb;
BEGIN
  SELECT id, name INTO business_record
  FROM businesses
  WHERE invite_code = code;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid invite code'
    );
  END IF;
  
  SELECT EXISTS(
    SELECT 1 FROM business_members
    WHERE business_id = business_record.id
    AND user_id = auth.uid()
  ) INTO already_member;
  
  IF already_member THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'You are already a member of this business'
    );
  END IF;
  
  INSERT INTO business_members (business_id, user_id, role)
  VALUES (business_record.id, auth.uid(), 'viewer');
  
  RETURN jsonb_build_object(
    'success', true,
    'business_id', business_record.id,
    'business_name', business_record.name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION TO REGENERATE INVITE CODE (CAPTAIN ONLY)
-- ============================================================================

CREATE OR REPLACE FUNCTION regenerate_invite_code(business_id uuid)
RETURNS jsonb AS $$
DECLARE
  new_code text;
  code_exists boolean;
  is_owner boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM businesses
    WHERE id = business_id
    AND owner_id = auth.uid()
  ) INTO is_owner;
  
  IF NOT is_owner THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only the captain can regenerate invite codes'
    );
  END IF;
  
  LOOP
    new_code := generate_invite_code();
    SELECT EXISTS(SELECT 1 FROM businesses WHERE invite_code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  UPDATE businesses SET invite_code = new_code WHERE id = business_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'invite_code', new_code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- RLS POLICY FOR VIEWING INVITE CODES
-- ============================================================================

CREATE POLICY "Members can view business invite codes"
  ON businesses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM business_members
      WHERE business_members.business_id = businesses.id
      AND business_members.user_id = auth.uid()
    )
  );
/*
  # Fix Business Creation RLS Policies
  
  ## Problem
  Current policies cause infinite recursion when creating businesses.
  The INSERT policy on business_members checks for existing membership,
  which creates a circular dependency with the trigger that adds the owner.
  
  ## Solution
  1. Simplify business_members INSERT policy
    - Allow business owner to add themselves directly
    - Allow captains/vice captains to add others
    - Remove recursive membership checks
  
  2. Update businesses INSERT policy
    - Keep simple owner check
    - Ensure owner_id matches authenticated user
  
  ## Security
  - Users can only create businesses as themselves
  - Business owners can add themselves as captain
  - Only captains/vice captains can add other members
  - Prevents unauthorized business creation
*/

-- ============================================================================
-- DROP AND RECREATE BUSINESS_MEMBERS INSERT POLICY
-- ============================================================================

DROP POLICY IF EXISTS "Captains and vice captains can add members" ON business_members;

CREATE POLICY "Captains and vice captains can add members"
  ON business_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_members.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  );

-- ============================================================================
-- ENSURE BUSINESS INSERT POLICY IS SIMPLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can create businesses" ON businesses;

CREATE POLICY "Users can create businesses"
  ON businesses FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- ============================================================================
-- FIX AUTO-ADD CAPTAIN TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_add_business_captain()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO business_members (business_id, user_id, role, invited_by)
  VALUES (NEW.id, NEW.owner_id, 'captain', NEW.owner_id)
  ON CONFLICT (business_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS auto_add_captain_trigger ON businesses;
CREATE TRIGGER auto_add_captain_trigger
  AFTER INSERT ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION auto_add_business_captain();
/*
  # Fix RLS Recursion Completely
  
  ## Problem
  RLS policies on business_members are causing infinite recursion
  when checking membership within the same table.
  
  ## Solution
  Simplify all policies to avoid recursive checks:
  1. SELECT: Allow users to see their own memberships only
  2. INSERT: Allow users to add themselves OR allow captains to add others
  3. UPDATE: Allow captains to update roles
  4. DELETE: Allow captains to remove members
  
  ## Key Changes
  - Remove all recursive EXISTS checks on business_members
  - Use direct business ownership checks instead
  - Keep policies simple and non-recursive
*/

-- ============================================================================
-- DROP ALL EXISTING POLICIES ON BUSINESS_MEMBERS
-- ============================================================================

DROP POLICY IF EXISTS "Members can view their memberships" ON business_members;
DROP POLICY IF EXISTS "Captains and vice captains can add members" ON business_members;
DROP POLICY IF EXISTS "Captains can update member roles" ON business_members;
DROP POLICY IF EXISTS "Captains and vice captains can remove members" ON business_members;
DROP POLICY IF EXISTS "Users can view business_members for their businesses" ON business_members;

-- ============================================================================
-- CREATE NEW NON-RECURSIVE POLICIES
-- ============================================================================

-- SELECT: Users can view memberships for businesses they own OR their own memberships
CREATE POLICY "Users can view memberships"
  ON business_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- INSERT: Users can add themselves OR business owners can add anyone
CREATE POLICY "Users can add themselves or owners can add anyone"
  ON business_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- UPDATE: Only business owners can update roles
CREATE POLICY "Owners can update member roles"
  ON business_members FOR UPDATE
  TO authenticated
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- DELETE: Only business owners can remove members
CREATE POLICY "Owners can remove members"
  ON business_members FOR DELETE
  TO authenticated
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );
/*
  # Simplify Business Creation Trigger
  
  ## Changes
  1. Ensure auto-add captain trigger uses SECURITY DEFINER
  2. Add explicit conflict handling
  3. Make sure trigger bypasses RLS by using SECURITY DEFINER
  
  ## Security
  - Trigger runs with elevated privileges to bypass RLS
  - Only runs on new business creation
  - Adds owner as captain automatically
*/

-- ============================================================================
-- RECREATE AUTO-ADD CAPTAIN TRIGGER WITH SECURITY DEFINER
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_add_business_captain()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO business_members (business_id, user_id, role, invited_by)
  VALUES (NEW.id, NEW.owner_id, 'captain', NEW.owner_id)
  ON CONFLICT (business_id, user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS auto_add_captain_trigger ON businesses;
CREATE TRIGGER auto_add_captain_trigger
  AFTER INSERT ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION auto_add_business_captain();
/*
  # Fix Businesses RLS Recursion
  
  ## Problem
  The SELECT policies on businesses table check business_members,
  which then check businesses, creating infinite recursion.
  
  ## Solution
  Simplify businesses SELECT policy to only check ownership directly.
  Members will access business data through explicit queries, not through RLS.
  
  ## Changes
  1. Remove recursive SELECT policies
  2. Add simple ownership-based SELECT policy
  3. Keep other policies simple and direct
*/

-- ============================================================================
-- DROP ALL EXISTING POLICIES ON BUSINESSES
-- ============================================================================

DROP POLICY IF EXISTS "Members can view their businesses" ON businesses;
DROP POLICY IF EXISTS "Members can view business invite codes" ON businesses;
DROP POLICY IF EXISTS "Captains can update businesses" ON businesses;
DROP POLICY IF EXISTS "Captains can delete businesses" ON businesses;
DROP POLICY IF EXISTS "Users can create businesses" ON businesses;

-- ============================================================================
-- CREATE NEW NON-RECURSIVE POLICIES
-- ============================================================================

-- SELECT: Users can only view businesses they own
-- (Members access will be handled by explicit joins in app code)
CREATE POLICY "Users can view businesses they own"
  ON businesses FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

-- INSERT: Users can create businesses (they become owner)
CREATE POLICY "Users can create businesses"
  ON businesses FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- UPDATE: Only owners can update their businesses
CREATE POLICY "Owners can update their businesses"
  ON businesses FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- DELETE: Only owners can delete their businesses
CREATE POLICY "Owners can delete their businesses"
  ON businesses FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());
/*
  # Fix Books RLS Recursion

  ## Problem
  Books policies check business_members table, which creates infinite recursion
  when business_members policies also reference related data.

  ## Solution
  Create a security definer function that bypasses RLS to check membership,
  then use this function in books policies.

  ## Changes
  1. Create helper function to check user membership (SECURITY DEFINER)
  2. Drop and recreate books policies using the helper function
  3. Apply same pattern to ledgers and transactions tables
*/

-- ============================================================================
-- CREATE HELPER FUNCTION TO CHECK MEMBERSHIP (BYPASSES RLS)
-- ============================================================================

CREATE OR REPLACE FUNCTION is_business_member(
  p_business_id uuid,
  p_user_id uuid,
  p_required_roles text[] DEFAULT ARRAY['captain', 'vice_captain', 'team_member']
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM business_members
    WHERE business_id = p_business_id
      AND user_id = p_user_id
      AND role = ANY(p_required_roles)
  );
END;
$$;

-- ============================================================================
-- FIX BOOKS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Members can view books" ON books;
DROP POLICY IF EXISTS "Members can create books" ON books;
DROP POLICY IF EXISTS "Captains and vice captains can update books" ON books;
DROP POLICY IF EXISTS "Captains and vice captains can delete books" ON books;

CREATE POLICY "Members can view books"
  ON books FOR SELECT
  TO authenticated
  USING (
    is_business_member(business_id, auth.uid())
  );

CREATE POLICY "Members can create books"
  ON books FOR INSERT
  TO authenticated
  WITH CHECK (
    is_business_member(business_id, auth.uid())
  );

CREATE POLICY "Captains and vice captains can update books"
  ON books FOR UPDATE
  TO authenticated
  USING (
    is_business_member(business_id, auth.uid(), ARRAY['captain', 'vice_captain'])
  )
  WITH CHECK (
    is_business_member(business_id, auth.uid(), ARRAY['captain', 'vice_captain'])
  );

CREATE POLICY "Captains and vice captains can delete books"
  ON books FOR DELETE
  TO authenticated
  USING (
    is_business_member(business_id, auth.uid(), ARRAY['captain', 'vice_captain'])
  );

-- ============================================================================
-- FIX LEDGERS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Members can view ledgers" ON ledgers;
DROP POLICY IF EXISTS "Members can create ledgers" ON ledgers;
DROP POLICY IF EXISTS "Captains and vice captains can update ledgers" ON ledgers;
DROP POLICY IF EXISTS "Captains and vice captains can delete ledgers" ON ledgers;

CREATE POLICY "Members can view ledgers"
  ON ledgers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM books
      WHERE books.id = ledgers.book_id
        AND is_business_member(books.business_id, auth.uid())
    )
  );

CREATE POLICY "Members can create ledgers"
  ON ledgers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM books
      WHERE books.id = ledgers.book_id
        AND is_business_member(books.business_id, auth.uid())
    )
  );

CREATE POLICY "Captains and vice captains can update ledgers"
  ON ledgers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM books
      WHERE books.id = ledgers.book_id
        AND is_business_member(books.business_id, auth.uid(), ARRAY['captain', 'vice_captain'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM books
      WHERE books.id = ledgers.book_id
        AND is_business_member(books.business_id, auth.uid(), ARRAY['captain', 'vice_captain'])
    )
  );

CREATE POLICY "Captains and vice captains can delete ledgers"
  ON ledgers FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM books
      WHERE books.id = ledgers.book_id
        AND is_business_member(books.business_id, auth.uid(), ARRAY['captain', 'vice_captain'])
    )
  );

-- ============================================================================
-- FIX TRANSACTIONS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Members can view transactions" ON transactions;
DROP POLICY IF EXISTS "Members can create transactions" ON transactions;
DROP POLICY IF EXISTS "Captains and vice captains can update transactions" ON transactions;
DROP POLICY IF EXISTS "Captains and vice captains can delete transactions" ON transactions;

CREATE POLICY "Members can view transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ledgers
      JOIN books ON books.id = ledgers.book_id
      WHERE ledgers.id = transactions.ledger_id
        AND is_business_member(books.business_id, auth.uid())
    )
  );

CREATE POLICY "Members can create transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ledgers
      JOIN books ON books.id = ledgers.book_id
      WHERE ledgers.id = transactions.ledger_id
        AND is_business_member(books.business_id, auth.uid())
    )
  );

CREATE POLICY "Captains and vice captains can update transactions"
  ON transactions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ledgers
      JOIN books ON books.id = ledgers.book_id
      WHERE ledgers.id = transactions.ledger_id
        AND is_business_member(books.business_id, auth.uid(), ARRAY['captain', 'vice_captain'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ledgers
      JOIN books ON books.id = ledgers.book_id
      WHERE ledgers.id = transactions.ledger_id
        AND is_business_member(books.business_id, auth.uid(), ARRAY['captain', 'vice_captain'])
    )
  );

CREATE POLICY "Captains and vice captains can delete transactions"
  ON transactions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ledgers
      JOIN books ON books.id = ledgers.book_id
      WHERE ledgers.id = transactions.ledger_id
        AND is_business_member(books.business_id, auth.uid(), ARRAY['captain', 'vice_captain'])
    )
  );
/*
  # Fix Trigger RLS Bypass

  ## Problem
  The auto_add_business_captain trigger has SECURITY DEFINER but RLS policies
  still block the insert because there's no auth.uid() context in triggers.

  ## Solution
  Update the INSERT policy on business_members to allow inserts from the
  system (when auth.uid() is NULL) for new business creation.

  ## Changes
  1. Update INSERT policy to allow system inserts during business creation
  2. Keep existing user-based checks for normal operations
*/

-- ============================================================================
-- UPDATE BUSINESS_MEMBERS INSERT POLICY TO ALLOW TRIGGER INSERTS
-- ============================================================================

DROP POLICY IF EXISTS "Users can add themselves or owners can add anyone" ON business_members;

CREATE POLICY "Users can add themselves or owners can add anyone"
  ON business_members FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Allow if user is adding themselves
    user_id = auth.uid()
    OR
    -- Allow if business owner is adding someone
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- Create a separate policy for service role / triggers (bypasses auth check)
CREATE POLICY "System can add members"
  ON business_members FOR INSERT
  WITH CHECK (true);

-- Alternatively, we can make the trigger use a direct INSERT that bypasses RLS
-- by recreating the function to explicitly disable RLS

DROP FUNCTION IF EXISTS auto_add_business_captain() CASCADE;

CREATE OR REPLACE FUNCTION auto_add_business_captain()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Temporarily disable RLS for this insert
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  
  INSERT INTO business_members (business_id, user_id, role, invited_by)
  VALUES (NEW.id, NEW.owner_id, 'captain', NEW.owner_id)
  ON CONFLICT (business_id, user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
DROP TRIGGER IF EXISTS auto_add_captain_trigger ON businesses;
CREATE TRIGGER auto_add_captain_trigger
  AFTER INSERT ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION auto_add_business_captain();
/*
  # Simplify Business Members Insert Policy

  ## Problem
  The trigger cannot insert into business_members because RLS policies
  block it even with SECURITY DEFINER.

  ## Solution
  Create a more permissive INSERT policy that allows:
  1. Users to add themselves (for join codes)
  2. Business owners to add anyone (for invites)
  3. System/trigger to add captain during business creation

  ## Changes
  1. Drop overly restrictive policies
  2. Create new permissive INSERT policy
*/

-- ============================================================================
-- DROP RESTRICTIVE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "System can add members" ON business_members;
DROP POLICY IF EXISTS "Users can add themselves or owners can add anyone" ON business_members;

-- ============================================================================
-- CREATE PERMISSIVE INSERT POLICY
-- ============================================================================

-- Allow inserts if ANY of these conditions are met:
-- 1. User is adding themselves
-- 2. User is the business owner
-- 3. Insert is from a trigger (user_id matches the business owner_id)
CREATE POLICY "Allow member additions"
  ON business_members FOR INSERT
  WITH CHECK (
    -- User adding themselves
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR
    -- Business owner adding someone
    (auth.uid() IS NOT NULL AND business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    ))
    OR
    -- Trigger adding owner as captain (verify this is a valid business owner)
    (business_id IN (
      SELECT id FROM businesses WHERE owner_id = user_id
    ))
  );
-- ============================================================================
-- ACCEPT BUSINESS INVITATION RPC
-- ============================================================================
-- Allows a user to accept an email invitation securely using a token.
-- Security Definer allows it to insert into business_members while bypassing RLS.

CREATE OR REPLACE FUNCTION accept_business_invitation(invite_token uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_user_email text;
  v_user_id uuid;
BEGIN
  -- Get the current user's details
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT email INTO v_user_email FROM profiles WHERE id = v_user_id;

  -- Find the invitation
  SELECT * INTO v_invite
  FROM business_invitations
  WHERE token = invite_token
  AND accepted_at IS NULL
  AND expires_at > now();

  IF v_invite IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired invitation');
  END IF;

  -- Verify the email matches
  IF lower(v_invite.email) != lower(v_user_email) THEN
    RETURN json_build_object('success', false, 'error', 'This invitation was sent to a different email address');
  END IF;
  
  -- Check if user is already a member
  IF EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = v_invite.business_id AND user_id = v_user_id
  ) THEN
    -- They are already a member, just mark it accepted
    UPDATE business_invitations
    SET accepted_at = now()
    WHERE id = v_invite.id;
    
    RETURN json_build_object('success', true, 'business_id', v_invite.business_id);
  END IF;

  -- Insert the new member
  INSERT INTO business_members (business_id, user_id, role)
  VALUES (v_invite.business_id, v_user_id, v_invite.role);

  -- Mark invitation as accepted
  UPDATE business_invitations
  SET accepted_at = now()
  WHERE id = v_invite.id;

  RETURN json_build_object('success', true, 'business_id', v_invite.business_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
-- ============================================================================
-- GET USER BUSINESSES RPC
-- ============================================================================
-- secure way to fetch businesses a user is a member of, including their role
-- and the total member count. Uses SECURITY DEFINER to bypass the strict
-- RLS policies on the businesses table.

CREATE OR REPLACE FUNCTION get_user_businesses_with_roles()
RETURNS TABLE (
  id uuid,
  name text,
  created_at timestamptz,
  owner_id uuid,
  member_count bigint,
  user_role text
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
    bm.role::text as user_role
  FROM businesses b
  JOIN business_members bm ON b.id = bm.business_id
  WHERE bm.user_id = auth.uid()
  ORDER BY b.created_at DESC;
END;
$$;
-- ============================================================================
-- BOOK LEVEL ACCESS & DATA ENTRY ROLE MIGRATION
-- ============================================================================

-- 1. update business_members ENUM/CHECK constraints
ALTER TABLE business_members DROP CONSTRAINT IF EXISTS business_members_role_check;
ALTER TABLE business_members ADD CONSTRAINT business_members_role_check 
  CHECK (role IN ('captain', 'vice_captain', 'team_member', 'viewer', 'data_entry'));

ALTER TABLE business_invitations DROP CONSTRAINT IF EXISTS business_invitations_role_check;
ALTER TABLE business_invitations ADD CONSTRAINT business_invitations_role_check 
  CHECK (role IN ('vice_captain', 'team_member', 'viewer', 'data_entry'));


-- 2. create book_members table
CREATE TABLE IF NOT EXISTS book_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid REFERENCES books(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(book_id, user_id)
);

ALTER TABLE book_members ENABLE ROW LEVEL SECURITY;


-- 3. Security Definer Helper for Book Access
CREATE OR REPLACE FUNCTION has_book_access(book_uuid uuid, user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_book record;
  v_role text;
BEGIN
  -- Get book details
  SELECT * INTO v_book FROM books WHERE id = book_uuid;
  IF v_book IS NULL THEN
    RETURN false;
  END IF;

  -- Get user's role in the business
  SELECT role INTO v_role FROM business_members 
  WHERE business_id = v_book.business_id AND user_id = user_uuid;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  -- Captains and vice captains have access to ALL books
  IF v_role IN ('captain', 'vice_captain') THEN
    RETURN true;
  END IF;

  -- If they created the book, they have access
  IF v_book.created_by = user_uuid THEN
    RETURN true;
  END IF;

  -- Check explicit assignment
  IF EXISTS (SELECT 1 FROM book_members WHERE book_id = book_uuid AND user_id = user_uuid) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;


-- 4. Set Book_Members Policies
CREATE POLICY "Users can view own book memberships or captains can view all"
  ON book_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    has_book_access(book_id, auth.uid())
  );

CREATE POLICY "Users with book access can manage book members"
  ON book_members FOR ALL
  TO authenticated
  USING (has_book_access(book_id, auth.uid()));


-- 5. Update Books Policies
DROP POLICY IF EXISTS "Members can view books" ON books;
CREATE POLICY "Assigned members can view books"
  ON books FOR SELECT
  TO authenticated
  USING (has_book_access(id, auth.uid()));

-- leave insert/delete/update books alone, they already verify business_membership/creation nicely,
-- but just mapping visibility.


-- 6. Update Ledgers Policies
CREATE OR REPLACE FUNCTION has_ledger_access(ledger_uuid uuid, user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_book_id uuid;
BEGIN
  -- Get book_id of the ledger
  SELECT book_id INTO v_book_id FROM ledgers WHERE id = ledger_uuid;
  IF v_book_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN has_book_access(v_book_id, user_uuid);
END;
$$;

DROP POLICY IF EXISTS "Members can view ledgers" ON ledgers;
CREATE POLICY "Assigned members can view ledgers"
  ON ledgers FOR SELECT
  TO authenticated
  USING (has_book_access(book_id, auth.uid()));

DROP POLICY IF EXISTS "Members can create ledgers" ON ledgers;
CREATE POLICY "Assigned members can create ledgers"
  ON ledgers FOR INSERT
  TO authenticated
  WITH CHECK (has_book_access(book_id, auth.uid()));


-- 7. Update Transactions Policies
DROP POLICY IF EXISTS "Members can view transactions" ON transactions;
CREATE POLICY "Assigned members can view transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (has_ledger_access(ledger_id, auth.uid()));

DROP POLICY IF EXISTS "Members can create transactions" ON transactions;
CREATE POLICY "Assigned members can create transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (has_ledger_access(ledger_id, auth.uid()));

-- ============================================================================
-- LEDGER LEVEL ACCESS
-- ============================================================================

-- 1. Create ledger_members table
CREATE TABLE IF NOT EXISTS ledger_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id uuid REFERENCES ledgers(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(ledger_id, user_id)
);



ALTER TABLE ledger_members ENABLE ROW LEVEL SECURITY;

-- 2. Security Definer Helper for Ledger Access
CREATE OR REPLACE FUNCTION has_ledger_access(ledger_uuid uuid, user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_book_id uuid;
  v_ledger_created_by uuid;
BEGIN
  -- Get book_id and created_by of the ledger
  SELECT book_id, created_by INTO v_book_id, v_ledger_created_by FROM ledgers WHERE id = ledger_uuid;
  
  IF v_book_id IS NULL THEN
    RETURN false;
  END IF;

  -- 1) If they have book access, they inherently have ledger access.
  -- (has_book_access inherently checks for Captain/Vice-Captain too)
  IF has_book_access(v_book_id, user_uuid) THEN
    RETURN true;
  END IF;

  -- 2) If they created the ledger, they have access
  IF v_ledger_created_by = user_uuid THEN
    RETURN true;
  END IF;

  -- 3) Check explicit assignment directly on the ledger
  IF EXISTS (SELECT 1 FROM ledger_members WHERE ledger_id = ledger_uuid AND user_id = user_uuid) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;


-- 3. Set ledger_members Policies
CREATE POLICY "Users can view own ledger memberships or captains/book_members can view all"
  ON ledger_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    has_ledger_access(ledger_id, auth.uid())
  );

CREATE POLICY "Users with ledger access can manage ledger members"
  ON ledger_members FOR ALL
  TO authenticated
  USING (has_ledger_access(ledger_id, auth.uid()));

-- NOTE: The policies on `ledgers` and `transactions` 
-- BOTH already utilize `has_ledger_access` 
-- which we just updated above to include `ledger_members` checks.
-- So we do not need to rewrite the SELECT/INSERT policies for them.
-- ============================================================================
-- ADD IMAGE AND COLOR COLUMNS TO BUSINESSES AND BOOKS
-- ============================================================================

ALTER TABLE businesses 
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS color text;

ALTER TABLE books 
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS color text;
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
-- ============================================================================
-- ADD CATEGORY COLUMN TO TRANSACTIONS
-- ============================================================================

ALTER TABLE transactions 
  ADD COLUMN IF NOT EXISTS category text;
-- ============================================================================
-- REFINED LEDGER LEVEL ACCESS
-- ============================================================================
-- The previous version of has_ledger_access automatically granted access to 
-- everyone who had access to the parent Book. This changes it so only
-- Captains, Vice Captains, and explicit members can view a ledger.

CREATE OR REPLACE FUNCTION has_ledger_access(ledger_uuid uuid, user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_book record;
  v_role text;
  v_ledger_created_by uuid;
BEGIN
  -- Get book_id and created_by of the ledger
  SELECT book_id, created_by INTO v_book.id, v_ledger_created_by FROM ledgers WHERE id = ledger_uuid;
  
  IF v_book.id IS NULL THEN
    RETURN false;
  END IF;

  -- Get the business_id for the book to check role
  SELECT business_id INTO v_book.business_id FROM books WHERE id = v_book.id;

  -- Get user's role in the business
  SELECT role INTO v_role FROM business_members 
  WHERE business_id = v_book.business_id AND user_id = user_uuid;

  -- 1) Captains and Vice Captains have access to EVERYTHING
  IF v_role IN ('captain', 'vice_captain') THEN
    RETURN true;
  END IF;

  -- 2) If they created the ledger, they have access
  IF v_ledger_created_by = user_uuid THEN
    RETURN true;
  END IF;

  -- 3) Check explicit assignment directly on the ledger
  IF EXISTS (SELECT 1 FROM ledger_members WHERE ledger_id = ledger_uuid AND user_id = user_uuid) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
-- ============================================================================
-- ADD CATEGORIES TO LEDGERS
-- ============================================================================

ALTER TABLE ledgers 
  ADD COLUMN IF NOT EXISTS categories text[] DEFAULT '{}';
-- Allow captains and vice captains to delete business_invitations
CREATE POLICY "Captains and vice captains can delete invitations"
  ON business_invitations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_invitations.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  );
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
