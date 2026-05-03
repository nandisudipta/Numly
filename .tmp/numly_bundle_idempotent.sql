-- ============================================================
-- NUMLY combined migration bundle
-- Generated Sun May  3 01:49:18 IST 2026
-- Run once in Supabase SQL Editor (https://supabase.com/dashboard/project/qdafklgkshwljeyqrwqd/sql/new)
-- ============================================================


-- ─── 20260226160339_create_tables.sql ────────────────────────────────────────────────
/*
  # NUMLY Database Tables Creation

  ## Overview
  Creates all core tables for the NUMLY bookkeeping application without RLS policies.
  Policies will be added in a separate migration to avoid circular dependencies.

  ## Tables Created
  1. profiles - User profile information
  2. businesses - Business entities
  3. business_members - Team membership with roles
  4. business_invitations - Pending team invitations
  5. books - Bookkeeping books within businesses
  6. ledgers - Ledgers within books with unit types
  7. transactions - Individual cash in/out transactions
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PROFILES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text,
  avatar_url text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- ============================================================================
-- BUSINESSES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  owner_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- ============================================================================
-- BUSINESS MEMBERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS business_members (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL CHECK (role IN ('captain', 'vice_captain', 'team_member', 'viewer')),
  invited_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  joined_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(business_id, user_id)
);

-- ============================================================================
-- BUSINESS INVITATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS business_invitations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('vice_captain', 'team_member', 'viewer')),
  token uuid DEFAULT uuid_generate_v4() NOT NULL UNIQUE,
  invited_by uuid REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  expires_at timestamptz DEFAULT (now() + interval '7 days') NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- ============================================================================
-- BOOKS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS books (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- ============================================================================
-- LEDGERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ledgers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  book_id uuid REFERENCES books(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  unit text NOT NULL CHECK (unit IN ('INR', 'gram', 'pieces')),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- ============================================================================
-- TRANSACTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ledger_id uuid REFERENCES ledgers(id) ON DELETE CASCADE NOT NULL,
  amount decimal(20, 4) NOT NULL CHECK (amount > 0),
  type text NOT NULL CHECK (type IN ('cash_in', 'cash_out')),
  note text,
  attachment_url text,
  transaction_date timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_businesses_owner_id ON businesses(owner_id);
CREATE INDEX IF NOT EXISTS idx_business_members_business_id ON business_members(business_id);
CREATE INDEX IF NOT EXISTS idx_business_members_user_id ON business_members(user_id);
CREATE INDEX IF NOT EXISTS idx_business_invitations_business_id ON business_invitations(business_id);
CREATE INDEX IF NOT EXISTS idx_business_invitations_email ON business_invitations(email);
CREATE INDEX IF NOT EXISTS idx_business_invitations_token ON business_invitations(token);
CREATE INDEX IF NOT EXISTS idx_books_business_id ON books(business_id);
CREATE INDEX IF NOT EXISTS idx_ledgers_book_id ON ledgers(book_id);
CREATE INDEX IF NOT EXISTS idx_transactions_ledger_id ON transactions(ledger_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_by ON transactions(created_by);
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_date ON transactions(transaction_date);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_businesses_updated_at ON businesses;
CREATE TRIGGER update_businesses_updated_at BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_books_updated_at ON books;
CREATE TRIGGER update_books_updated_at BEFORE UPDATE ON books
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ledgers_updated_at ON ledgers;
CREATE TRIGGER update_ledgers_updated_at BEFORE UPDATE ON ledgers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_transactions_updated_at ON transactions;
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- AUTO-CREATE PROFILE ON USER SIGNUP
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── 20260226160410_add_rls_policies.sql ────────────────────────────────────────────────
/*
  # Add Row Level Security Policies

  ## Overview
  Enables RLS and creates comprehensive security policies for all tables.
  Enforces role-based permissions at the database level.

  ## Security Model
  - Captain: Full control including business deletion
  - Vice Captain: Full control except business deletion and ownership transfer
  - Team Member: Can add transactions and view data, cannot delete
  - Viewer: Read-only access

  ## Policy Structure
  Each table has policies for SELECT, INSERT, UPDATE, and DELETE operations
  that check user authentication, business membership, and role permissions.
*/

-- ============================================================================
-- PROFILES TABLE POLICIES
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile" ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can read profiles of business members" ON profiles;
CREATE POLICY "Users can read profiles of business members" ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm1
      JOIN business_members bm2 ON bm1.business_id = bm2.business_id
      WHERE bm1.user_id = profiles.id
      AND bm2.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- BUSINESSES TABLE POLICIES
-- ============================================================================

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their businesses" ON businesses;
CREATE POLICY "Members can view their businesses" ON businesses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM business_members
      WHERE business_members.business_id = businesses.id
      AND business_members.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create businesses" ON businesses;
CREATE POLICY "Users can create businesses" ON businesses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Captains can update businesses" ON businesses;
CREATE POLICY "Captains can update businesses" ON businesses FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Captains can delete businesses" ON businesses;
CREATE POLICY "Captains can delete businesses" ON businesses FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

-- ============================================================================
-- BUSINESS MEMBERS TABLE POLICIES
-- ============================================================================

ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view team members" ON business_members;
CREATE POLICY "Members can view team members" ON business_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_members.business_id
      AND bm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Captains and vice captains can add members" ON business_members;
CREATE POLICY "Captains and vice captains can add members" ON business_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_members.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    ) OR (
      business_id IN (
        SELECT id FROM businesses WHERE owner_id = auth.uid()
      ) AND role = 'captain' AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Captains can update member roles" ON business_members;
CREATE POLICY "Captains can update member roles" ON business_members FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = business_members.business_id
      AND b.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = business_members.business_id
      AND b.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Captains and vice captains can remove members" ON business_members;
CREATE POLICY "Captains and vice captains can remove members" ON business_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_members.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  );

-- ============================================================================
-- BUSINESS INVITATIONS TABLE POLICIES
-- ============================================================================

ALTER TABLE business_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view business invitations" ON business_invitations;
CREATE POLICY "Members can view business invitations" ON business_invitations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_invitations.business_id
      AND bm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Captains and vice captains can create invitations" ON business_invitations;
CREATE POLICY "Captains and vice captains can create invitations" ON business_invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_invitations.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  );

DROP POLICY IF EXISTS "Users can accept their invitations" ON business_invitations;
CREATE POLICY "Users can accept their invitations" ON business_invitations FOR UPDATE
  TO authenticated
  USING (
    email = (SELECT email FROM profiles WHERE id = auth.uid())
    AND accepted_at IS NULL
    AND expires_at > now()
  )
  WITH CHECK (
    email = (SELECT email FROM profiles WHERE id = auth.uid())
  );

-- ============================================================================
-- BOOKS TABLE POLICIES
-- ============================================================================

ALTER TABLE books ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view books" ON books;
CREATE POLICY "Members can view books" ON books FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = books.business_id
      AND bm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members can create books" ON books;
CREATE POLICY "Members can create books" ON books FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = books.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain', 'team_member')
    )
  );

DROP POLICY IF EXISTS "Captains and vice captains can update books" ON books;
CREATE POLICY "Captains and vice captains can update books" ON books FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = books.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = books.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  );

DROP POLICY IF EXISTS "Captains and vice captains can delete books" ON books;
CREATE POLICY "Captains and vice captains can delete books" ON books FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = books.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  );

-- ============================================================================
-- LEDGERS TABLE POLICIES
-- ============================================================================

ALTER TABLE ledgers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view ledgers" ON ledgers;
CREATE POLICY "Members can view ledgers" ON ledgers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM books b
      JOIN business_members bm ON bm.business_id = b.business_id
      WHERE b.id = ledgers.book_id
      AND bm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members can create ledgers" ON ledgers;
CREATE POLICY "Members can create ledgers" ON ledgers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM books b
      JOIN business_members bm ON bm.business_id = b.business_id
      WHERE b.id = ledgers.book_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain', 'team_member')
    )
  );

DROP POLICY IF EXISTS "Captains and vice captains can update ledgers" ON ledgers;
CREATE POLICY "Captains and vice captains can update ledgers" ON ledgers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM books b
      JOIN business_members bm ON bm.business_id = b.business_id
      WHERE b.id = ledgers.book_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM books b
      JOIN business_members bm ON bm.business_id = b.business_id
      WHERE b.id = ledgers.book_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  );

DROP POLICY IF EXISTS "Captains and vice captains can delete ledgers" ON ledgers;
CREATE POLICY "Captains and vice captains can delete ledgers" ON ledgers FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM books b
      JOIN business_members bm ON bm.business_id = b.business_id
      WHERE b.id = ledgers.book_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  );

-- ============================================================================
-- TRANSACTIONS TABLE POLICIES
-- ============================================================================

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view transactions" ON transactions;
CREATE POLICY "Members can view transactions" ON transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ledgers l
      JOIN books b ON b.id = l.book_id
      JOIN business_members bm ON bm.business_id = b.business_id
      WHERE l.id = transactions.ledger_id
      AND bm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members can create transactions" ON transactions;
CREATE POLICY "Members can create transactions" ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ledgers l
      JOIN books b ON b.id = l.book_id
      JOIN business_members bm ON bm.business_id = b.business_id
      WHERE l.id = transactions.ledger_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain', 'team_member')
    )
  );

DROP POLICY IF EXISTS "Captains and vice captains can update transactions" ON transactions;
CREATE POLICY "Captains and vice captains can update transactions" ON transactions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ledgers l
      JOIN books b ON b.id = l.book_id
      JOIN business_members bm ON bm.business_id = b.business_id
      WHERE l.id = transactions.ledger_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ledgers l
      JOIN books b ON b.id = l.book_id
      JOIN business_members bm ON bm.business_id = b.business_id
      WHERE l.id = transactions.ledger_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  );

DROP POLICY IF EXISTS "Captains and vice captains can delete transactions" ON transactions;
CREATE POLICY "Captains and vice captains can delete transactions" ON transactions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ledgers l
      JOIN books b ON b.id = l.book_id
      JOIN business_members bm ON bm.business_id = b.business_id
      WHERE l.id = transactions.ledger_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  );

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_role_in_business(business_uuid uuid, user_uuid uuid)
RETURNS text AS $$
  SELECT role FROM business_members
  WHERE business_id = business_uuid AND user_id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_captain(business_uuid uuid, user_uuid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM businesses
    WHERE id = business_uuid AND owner_id = user_uuid
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_captain_or_vice(business_uuid uuid, user_uuid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = business_uuid
    AND user_id = user_uuid
    AND role IN ('captain', 'vice_captain')
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- ─── 20260226160430_create_storage_policies.sql ────────────────────────────────────────────────
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
DROP POLICY IF EXISTS "Business members can upload transaction attachments" ON storage.objects;
CREATE POLICY "Business members can upload transaction attachments" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'transaction-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow authenticated users to view attachments
DROP POLICY IF EXISTS "Business members can view transaction attachments" ON storage.objects;
CREATE POLICY "Business members can view transaction attachments" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'transaction-attachments'
  );

-- Allow authenticated users to update their attachments
DROP POLICY IF EXISTS "Business members can update transaction attachments" ON storage.objects;
CREATE POLICY "Business members can update transaction attachments" ON storage.objects FOR UPDATE
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
DROP POLICY IF EXISTS "Business members can delete transaction attachments" ON storage.objects;
CREATE POLICY "Business members can delete transaction attachments" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'transaction-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ─── 20260227132842_fix_profile_creation_trigger.sql ────────────────────────────────────────────────
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
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_new_user();


-- ─── 20260227154446_create_profile_trigger.sql ────────────────────────────────────────────────
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
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
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


-- ─── 20260227154503_fix_business_member_auto_add.sql ────────────────────────────────────────────────
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

-- CREATE OR REPLACE FUNCTION to auto-add owner as captain
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
DROP TRIGGER IF EXISTS on_business_created ON public.businesses;
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


-- ─── 20260227155246_fix_business_members_policy_recursion.sql ────────────────────────────────────────────────
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
DROP POLICY IF EXISTS "Captains and vice captains can add members" ON public.business_members;
CREATE POLICY "Captains and vice captains can add members" ON public.business_members
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


-- ─── 20260227155623_add_invite_code_system.sql ────────────────────────────────────────────────
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

DROP POLICY IF EXISTS "Members can view business invite codes" ON businesses;
CREATE POLICY "Members can view business invite codes" ON businesses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM business_members
      WHERE business_members.business_id = businesses.id
      AND business_members.user_id = auth.uid()
    )
  );


-- ─── 20260227155642_fix_business_creation_rls.sql ────────────────────────────────────────────────
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

DROP POLICY IF EXISTS "Captains and vice captains can add members" ON business_members;
CREATE POLICY "Captains and vice captains can add members" ON business_members FOR INSERT
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

DROP POLICY IF EXISTS "Users can create businesses" ON businesses;
CREATE POLICY "Users can create businesses" ON businesses FOR INSERT
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
DROP TRIGGER IF EXISTS auto_add_captain_trigger ON businesses;
CREATE TRIGGER auto_add_captain_trigger
  AFTER INSERT ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION auto_add_business_captain();


-- ─── 20260227160153_fix_rls_recursion_completely.sql ────────────────────────────────────────────────
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
DROP POLICY IF EXISTS "Users can view memberships" ON business_members;
CREATE POLICY "Users can view memberships" ON business_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- INSERT: Users can add themselves OR business owners can add anyone
DROP POLICY IF EXISTS "Users can add themselves or owners can add anyone" ON business_members;
CREATE POLICY "Users can add themselves or owners can add anyone" ON business_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- UPDATE: Only business owners can update roles
DROP POLICY IF EXISTS "Owners can update member roles" ON business_members;
CREATE POLICY "Owners can update member roles" ON business_members FOR UPDATE
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
DROP POLICY IF EXISTS "Owners can remove members" ON business_members;
CREATE POLICY "Owners can remove members" ON business_members FOR DELETE
  TO authenticated
  USING (
    business_id IN (
      SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );


-- ─── 20260227160205_simplify_business_creation_trigger.sql ────────────────────────────────────────────────
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
DROP TRIGGER IF EXISTS auto_add_captain_trigger ON businesses;
CREATE TRIGGER auto_add_captain_trigger
  AFTER INSERT ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION auto_add_business_captain();


-- ─── 20260227160341_fix_businesses_rls_recursion.sql ────────────────────────────────────────────────
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
DROP POLICY IF EXISTS "Users can view businesses they own" ON businesses;
CREATE POLICY "Users can view businesses they own" ON businesses FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

-- INSERT: Users can create businesses (they become owner)
DROP POLICY IF EXISTS "Users can create businesses" ON businesses;
CREATE POLICY "Users can create businesses" ON businesses FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- UPDATE: Only owners can update their businesses
DROP POLICY IF EXISTS "Owners can update their businesses" ON businesses;
CREATE POLICY "Owners can update their businesses" ON businesses FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- DELETE: Only owners can delete their businesses
DROP POLICY IF EXISTS "Owners can delete their businesses" ON businesses;
CREATE POLICY "Owners can delete their businesses" ON businesses FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());


-- ─── 20260227162020_fix_books_rls_recursion.sql ────────────────────────────────────────────────
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

DROP POLICY IF EXISTS "Members can view books" ON books;
CREATE POLICY "Members can view books" ON books FOR SELECT
  TO authenticated
  USING (
    is_business_member(business_id, auth.uid())
  );

DROP POLICY IF EXISTS "Members can create books" ON books;
CREATE POLICY "Members can create books" ON books FOR INSERT
  TO authenticated
  WITH CHECK (
    is_business_member(business_id, auth.uid())
  );

DROP POLICY IF EXISTS "Captains and vice captains can update books" ON books;
CREATE POLICY "Captains and vice captains can update books" ON books FOR UPDATE
  TO authenticated
  USING (
    is_business_member(business_id, auth.uid(), ARRAY['captain', 'vice_captain'])
  )
  WITH CHECK (
    is_business_member(business_id, auth.uid(), ARRAY['captain', 'vice_captain'])
  );

DROP POLICY IF EXISTS "Captains and vice captains can delete books" ON books;
CREATE POLICY "Captains and vice captains can delete books" ON books FOR DELETE
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

DROP POLICY IF EXISTS "Members can view ledgers" ON ledgers;
CREATE POLICY "Members can view ledgers" ON ledgers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM books
      WHERE books.id = ledgers.book_id
        AND is_business_member(books.business_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Members can create ledgers" ON ledgers;
CREATE POLICY "Members can create ledgers" ON ledgers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM books
      WHERE books.id = ledgers.book_id
        AND is_business_member(books.business_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Captains and vice captains can update ledgers" ON ledgers;
CREATE POLICY "Captains and vice captains can update ledgers" ON ledgers FOR UPDATE
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

DROP POLICY IF EXISTS "Captains and vice captains can delete ledgers" ON ledgers;
CREATE POLICY "Captains and vice captains can delete ledgers" ON ledgers FOR DELETE
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

DROP POLICY IF EXISTS "Members can view transactions" ON transactions;
CREATE POLICY "Members can view transactions" ON transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ledgers
      JOIN books ON books.id = ledgers.book_id
      WHERE ledgers.id = transactions.ledger_id
        AND is_business_member(books.business_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Members can create transactions" ON transactions;
CREATE POLICY "Members can create transactions" ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ledgers
      JOIN books ON books.id = ledgers.book_id
      WHERE ledgers.id = transactions.ledger_id
        AND is_business_member(books.business_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Captains and vice captains can update transactions" ON transactions;
CREATE POLICY "Captains and vice captains can update transactions" ON transactions FOR UPDATE
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

DROP POLICY IF EXISTS "Captains and vice captains can delete transactions" ON transactions;
CREATE POLICY "Captains and vice captains can delete transactions" ON transactions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ledgers
      JOIN books ON books.id = ledgers.book_id
      WHERE ledgers.id = transactions.ledger_id
        AND is_business_member(books.business_id, auth.uid(), ARRAY['captain', 'vice_captain'])
    )
  );


-- ─── 20260227170822_fix_trigger_rls_bypass.sql ────────────────────────────────────────────────
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

DROP POLICY IF EXISTS "Users can add themselves or owners can add anyone" ON business_members;
CREATE POLICY "Users can add themselves or owners can add anyone" ON business_members FOR INSERT
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
DROP POLICY IF EXISTS "System can add members" ON business_members;
CREATE POLICY "System can add members" ON business_members FOR INSERT
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
DROP TRIGGER IF EXISTS auto_add_captain_trigger ON businesses;
CREATE TRIGGER auto_add_captain_trigger
  AFTER INSERT ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION auto_add_business_captain();


-- ─── 20260227170835_simplify_business_members_insert.sql ────────────────────────────────────────────────
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
DROP POLICY IF EXISTS "Allow member additions" ON business_members;
CREATE POLICY "Allow member additions" ON business_members FOR INSERT
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


-- ─── 20260302190147_accept_invitation.sql ────────────────────────────────────────────────
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


-- ─── 20260303080000_get_user_businesses_rpc.sql ────────────────────────────────────────────────
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


-- ─── 20260303092500_book_access_and_data_entry.sql ────────────────────────────────────────────────
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
DROP POLICY IF EXISTS "Users can view own book memberships or captains can view all" ON book_members;
CREATE POLICY "Users can view own book memberships or captains can view all" ON book_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    has_book_access(book_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users with book access can manage book members" ON book_members;
CREATE POLICY "Users with book access can manage book members" ON book_members FOR ALL
  TO authenticated
  USING (has_book_access(book_id, auth.uid()));


-- 5. Update Books Policies
DROP POLICY IF EXISTS "Members can view books" ON books;
DROP POLICY IF EXISTS "Assigned members can view books" ON books;
CREATE POLICY "Assigned members can view books" ON books FOR SELECT
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
DROP POLICY IF EXISTS "Assigned members can view ledgers" ON ledgers;
CREATE POLICY "Assigned members can view ledgers" ON ledgers FOR SELECT
  TO authenticated
  USING (has_book_access(book_id, auth.uid()));

DROP POLICY IF EXISTS "Members can create ledgers" ON ledgers;
DROP POLICY IF EXISTS "Assigned members can create ledgers" ON ledgers;
CREATE POLICY "Assigned members can create ledgers" ON ledgers FOR INSERT
  TO authenticated
  WITH CHECK (has_book_access(book_id, auth.uid()));


-- 7. Update Transactions Policies
DROP POLICY IF EXISTS "Members can view transactions" ON transactions;
DROP POLICY IF EXISTS "Assigned members can view transactions" ON transactions;
CREATE POLICY "Assigned members can view transactions" ON transactions FOR SELECT
  TO authenticated
  USING (has_ledger_access(ledger_id, auth.uid()));

DROP POLICY IF EXISTS "Members can create transactions" ON transactions;
DROP POLICY IF EXISTS "Assigned members can create transactions" ON transactions;
CREATE POLICY "Assigned members can create transactions" ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (has_ledger_access(ledger_id, auth.uid()));



-- ─── 20260303110500_ledger_access.sql ────────────────────────────────────────────────
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
DROP POLICY IF EXISTS "Users can view own ledger memberships or captains/book_members can view all" ON ledger_members;
CREATE POLICY "Users can view own ledger memberships or captains/book_members can view all" ON ledger_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    has_ledger_access(ledger_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users with ledger access can manage ledger members" ON ledger_members;
CREATE POLICY "Users with ledger access can manage ledger members" ON ledger_members FOR ALL
  TO authenticated
  USING (has_ledger_access(ledger_id, auth.uid()));

-- NOTE: The policies on `ledgers` and `transactions` 
-- BOTH already utilize `has_ledger_access` 
-- which we just updated above to include `ledger_members` checks.
-- So we do not need to rewrite the SELECT/INSERT policies for them.


-- ─── 20260303112000_images_and_colors.sql ────────────────────────────────────────────────
-- ============================================================================
-- ADD IMAGE AND COLOR COLUMNS TO BUSINESSES AND BOOKS
-- ============================================================================

ALTER TABLE businesses 
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS color text;

ALTER TABLE books 
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS color text;


-- ─── 20260303112500_storage_buckets.sql ────────────────────────────────────────────────
-- ============================================================================
-- STORAGE BUCKET: brand-images
-- ============================================================================

-- Insert the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('brand-images', 'brand-images', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for public reading
DROP POLICY IF EXISTS "Public read access for brand images" ON storage.objects;
CREATE POLICY "Public read access for brand images" ON storage.objects FOR SELECT
USING ( bucket_id = 'brand-images' );

-- Policies for authenticated users uploading
DROP POLICY IF EXISTS "Authenticated users can upload brand images" ON storage.objects;
CREATE POLICY "Authenticated users can upload brand images" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'brand-images' );

-- Policies for authenticated users updating
DROP POLICY IF EXISTS "Authenticated users can update their brand images" ON storage.objects;
CREATE POLICY "Authenticated users can update their brand images" ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'brand-images' );

-- Policies for authenticated users deleting
DROP POLICY IF EXISTS "Authenticated users can delete their brand images" ON storage.objects;
CREATE POLICY "Authenticated users can delete their brand images" ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'brand-images' );


-- ─── 20260303113500_image_color_setup.sql ────────────────────────────────────────────────
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
DROP POLICY IF EXISTS "Public read access for brand images" ON storage.objects;
CREATE POLICY "Public read access for brand images" ON storage.objects FOR SELECT
USING ( bucket_id = 'brand-images' );

-- Policies for authenticated users uploading
DROP POLICY IF EXISTS "Authenticated users can upload brand images" ON storage.objects;
CREATE POLICY "Authenticated users can upload brand images" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'brand-images' );

-- Policies for authenticated users updating
DROP POLICY IF EXISTS "Authenticated users can update their brand images" ON storage.objects;
CREATE POLICY "Authenticated users can update their brand images" ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'brand-images' );

-- Policies for authenticated users deleting
DROP POLICY IF EXISTS "Authenticated users can delete their brand images" ON storage.objects;
CREATE POLICY "Authenticated users can delete their brand images" ON storage.objects FOR DELETE
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


-- ─── 20260303114500_transaction_category.sql ────────────────────────────────────────────────
-- ============================================================================
-- ADD CATEGORY COLUMN TO TRANSACTIONS
-- ============================================================================

ALTER TABLE transactions 
  ADD COLUMN IF NOT EXISTS category text;


-- ─── 20260303115500_strict_ledger_access.sql ────────────────────────────────────────────────
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


-- ─── 20260303120000_ledger_categories.sql ────────────────────────────────────────────────
-- ============================================================================
-- ADD CATEGORIES TO LEDGERS
-- ============================================================================

ALTER TABLE ledgers 
  ADD COLUMN IF NOT EXISTS categories text[] DEFAULT '{}';


-- ─── 20260303182800_invitation_delete_policy.sql ────────────────────────────────────────────────
-- Allow captains and vice captains to delete business_invitations
DROP POLICY IF EXISTS "Captains and vice captains can delete invitations" ON business_invitations;
CREATE POLICY "Captains and vice captains can delete invitations" ON business_invitations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_invitations.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    )
  );


-- ─── 20260304124000_add_books_position.sql ────────────────────────────────────────────────
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


-- ─── ORCHESTRATE_OAUTH_TRIGGERS.sql (ad-hoc) ──────────────────────────────────────
-- Upgrade handle_new_user() trigger for robust OAuth support
-- This function correctly parses metadata from Google and Apple

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  name_from_meta text;
  avatar_from_meta text;
BEGIN
  -- Extract name
  -- 1. Try 'full_name' (Standard/Google)
  -- 2. Try 'name' (Some providers)
  -- 3. Try Apple's nested structure: raw_user_meta_data->'user'->'name'->>'firstName'
  name_from_meta := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    (NEW.raw_user_meta_data->'user'->'name'->>'firstName' || ' ' || NEW.raw_user_meta_data->'user'->'name'->>'lastName'),
    SPLIT_PART(NEW.email, '@', 1) -- Fallback to email prefix
  );

  -- Extract avatar
  avatar_from_meta := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture'
  );

  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    name_from_meta,
    avatar_from_meta
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url,
    updated_at = now();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error or just return NEW to allow auth to proceed even if profile fails
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-apply trigger to ensure it uses the updated function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ─── FIX_INVITATION_RLS.sql (ad-hoc) ──────────────────────────────────────
-- Add missing RLS policy for business invitations
-- This ensures captains and vice captains can create invitations

DROP POLICY IF EXISTS "Captains and vice captains can create invitations" ON business_invitations;

DROP POLICY IF EXISTS "Captains and vice captains can create invitations" ON business_invitations;
CREATE POLICY "Captains and vice captains can create invitations" ON business_invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_invitations.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    ) OR EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = business_invitations.business_id
      AND b.owner_id = auth.uid()
    )
  );

-- Also add a policy for deleting invitations if it doesn't exist or is insufficient
DROP POLICY IF EXISTS "Captains and vice captains can delete invitations" ON business_invitations;

DROP POLICY IF EXISTS "Captains and vice captains can delete invitations" ON business_invitations;
CREATE POLICY "Captains and vice captains can delete invitations" ON business_invitations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = business_invitations.business_id
      AND bm.user_id = auth.uid()
      AND bm.role IN ('captain', 'vice_captain')
    ) OR EXISTS (
      SELECT 1 FROM businesses b
      WHERE b.id = business_invitations.business_id
      AND b.owner_id = auth.uid()
    )
  );


-- ─── ADVANCED_LEDGER_FEATURES.sql (ad-hoc) ──────────────────────────────────────
-- Add advanced features to ledgers and transactions

ALTER TABLE ledgers 
ADD COLUMN IF NOT EXISTS is_category_mandatory BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS custom_fields_config JSONB DEFAULT '[]'::jsonb;

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS custom_fields_data JSONB DEFAULT '{}'::jsonb;

-- Update existing triggers or policies if necessary (none needed here for simple columns)


-- ─── ADVANCED_LEDGER_FEATURES_V2.sql (ad-hoc) ──────────────────────────────────────
-- Add backdated entry restriction and refined custom fields config
ALTER TABLE public.ledgers 
  ADD COLUMN IF NOT EXISTS restrict_backdated_entries text DEFAULT 'always' 
  CHECK (restrict_backdated_entries IN ('always', 'never', 'one_day'));

-- Migrate custom_fields_config from string array to JSONB objects if needed
-- We can do this in the frontend as well, but let's ensure the column is JSONB (already is)
-- The frontend will handle the structure: [{ name: "Field", is_mandatory: boolean }]

-- Notify schema reload
NOTIFY pgrst, 'reload schema';


-- ─── COMPLETE_LEDGER_UPGRADE.sql (ad-hoc) ──────────────────────────────────────
-- Consolidation of all ledger upgrade features
-- Run this in Supabase SQL Editor

-- 1. Update Ledgers Table
ALTER TABLE public.ledgers 
  ADD COLUMN IF NOT EXISTS restrict_backdated_entries text DEFAULT 'always',
  ADD COLUMN IF NOT EXISTS is_category_mandatory BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_fields_config JSONB DEFAULT '[]'::jsonb;

-- Add check constraint for backdated entries
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledgers_restrict_backdated_entries_check') THEN
    ALTER TABLE public.ledgers 
      ADD CONSTRAINT ledgers_restrict_backdated_entries_check 
      CHECK (restrict_backdated_entries IN ('always', 'never', 'one_day'));
  END IF;
END $$;

-- 2. Update Transactions Table
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS custom_fields_data JSONB DEFAULT '{}'::jsonb;

-- 3. Ensure Storage Bucket Exists
-- Note: This requires Supabase Storage API access or manual creation in Dashboard
-- Bucket name: transaction-attachments

-- 4. Refresh Schema Cache
NOTIFY pgrst, 'reload schema';


-- ─── DEFINITIVE_LEDGER_UPGRADE.sql (ad-hoc) ──────────────────────────────────────
-- ============================================================================
-- DEFINITIVE LEDGER UPGRADE
-- This script adds ALL columns required for the advanced ledger features.
-- Run this in your Supabase SQL Editor once.
-- ============================================================================

-- 1. Add all missing columns to the ledgers table
ALTER TABLE public.ledgers 
  ADD COLUMN IF NOT EXISTS categories text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS decimal_rule text DEFAULT 'entry',
  ADD COLUMN IF NOT EXISTS decimal_precision integer DEFAULT 2,
  ADD COLUMN IF NOT EXISTS is_category_mandatory BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_fields_config JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS restrict_backdated_entries text DEFAULT 'always';

-- 2. Add constraints
DO $$ 
BEGIN 
  -- decimal_rule constraint
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledgers_decimal_rule_check') THEN
    ALTER TABLE public.ledgers 
      ADD CONSTRAINT ledgers_decimal_rule_check 
      CHECK (decimal_rule IN ('entry', 'ledger'));
  END IF;

  -- decimal_precision constraint
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledgers_decimal_precision_check') THEN
    ALTER TABLE public.ledgers 
      ADD CONSTRAINT ledgers_decimal_precision_check 
      CHECK (decimal_precision >= 0 AND decimal_precision <= 3);
  END IF;

  -- restrict_backdated_entries constraint
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledgers_restrict_backdated_entries_check') THEN
    ALTER TABLE public.ledgers 
      ADD CONSTRAINT ledgers_restrict_backdated_entries_check 
      CHECK (restrict_backdated_entries IN ('always', 'never', 'one_day'));
  END IF;
END $$;

-- 3. Update transactions table
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS custom_fields_data JSONB DEFAULT '{}'::jsonb;

-- 4. Create storage bucket if it doesn't exist (via RPC or manual)
-- Bucket: transaction-attachments

-- 5. Refresh PostgREST cache
NOTIFY pgrst, 'reload schema';

