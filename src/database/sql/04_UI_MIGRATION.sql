-- COLOR, ICON & DESCRIPTION UPGRADE
-- Run this in your Supabase SQL Editor

-- Businesses: add color, emoji logo, and description
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS color TEXT DEFAULT 'gold',
  ADD COLUMN IF NOT EXISTS logo TEXT DEFAULT '🏢',
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;

-- Books: add color and icon name
ALTER TABLE books
  ADD COLUMN IF NOT EXISTS color TEXT DEFAULT 'blue',
  ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT 'book';

-- Ledgers: add color
ALTER TABLE ledgers
  ADD COLUMN IF NOT EXISTS color TEXT DEFAULT NULL;
