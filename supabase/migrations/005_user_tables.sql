-- User Favorites Table
-- Run this in your Supabase SQL editor

-- Create the user_favorites table
CREATE TABLE IF NOT EXISTS user_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  building_id UUID REFERENCES buildings(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure at least one of building_id or unit_id is set
  CONSTRAINT at_least_one_target CHECK (building_id IS NOT NULL OR unit_id IS NOT NULL),

  -- Prevent duplicate favorites
  CONSTRAINT unique_user_building UNIQUE (user_id, building_id),
  CONSTRAINT unique_user_unit UNIQUE (user_id, unit_id)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_building_id ON user_favorites(building_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_unit_id ON user_favorites(unit_id);

-- Enable RLS
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own favorites" ON user_favorites;
DROP POLICY IF EXISTS "Users can insert own favorites" ON user_favorites;
DROP POLICY IF EXISTS "Users can delete own favorites" ON user_favorites;

-- Policy: Users can only see their own favorites
CREATE POLICY "Users can view own favorites"
  ON user_favorites
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own favorites
CREATE POLICY "Users can insert own favorites"
  ON user_favorites
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own favorites
CREATE POLICY "Users can delete own favorites"
  ON user_favorites
  FOR DELETE
  USING (auth.uid() = user_id);

-- User Saved Searches Table
CREATE TABLE IF NOT EXISTS user_saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  query_params JSONB NOT NULL, -- Stores the search parameters
  email_alerts BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for user lookups
CREATE INDEX IF NOT EXISTS idx_user_saved_searches_user_id ON user_saved_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_user_saved_searches_email_alerts ON user_saved_searches(email_alerts) WHERE email_alerts = true;

-- Enable RLS
ALTER TABLE user_saved_searches ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own saved searches" ON user_saved_searches;
DROP POLICY IF EXISTS "Users can insert own saved searches" ON user_saved_searches;
DROP POLICY IF EXISTS "Users can update own saved searches" ON user_saved_searches;
DROP POLICY IF EXISTS "Users can delete own saved searches" ON user_saved_searches;

-- Policy: Users can only see their own saved searches
CREATE POLICY "Users can view own saved searches"
  ON user_saved_searches
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own saved searches
CREATE POLICY "Users can insert own saved searches"
  ON user_saved_searches
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own saved searches
CREATE POLICY "Users can update own saved searches"
  ON user_saved_searches
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own saved searches
CREATE POLICY "Users can delete own saved searches"
  ON user_saved_searches
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists and recreate
DROP TRIGGER IF EXISTS update_user_saved_searches_updated_at ON user_saved_searches;

CREATE TRIGGER update_user_saved_searches_updated_at
  BEFORE UPDATE ON user_saved_searches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
