-- Xyra Chat — Week 1 schema
-- Apply by pasting into Supabase SQL Editor, or `supabase db push` once linked.

-- pgvector for future bot embeddings (Week 6+)
CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================================
-- ORGANIZATIONS
-- =====================================================================
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'trial',
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ -- GDPR soft delete
);

CREATE INDEX organizations_deleted_at_idx ON organizations (deleted_at);

-- =====================================================================
-- PROFILES (extends auth.users)
-- =====================================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  role TEXT DEFAULT 'agent' CHECK (role IN ('owner','admin','agent')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ -- GDPR soft delete
);

CREATE INDEX profiles_org_id_idx ON profiles (org_id);
CREATE INDEX profiles_deleted_at_idx ON profiles (deleted_at);

-- =====================================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =====================================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =====================================================================
-- ROW LEVEL SECURITY
-- Every policy includes `deleted_at IS NULL` per GDPR baseline.
-- =====================================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Organizations: members can read their own org (only if both rows live).
CREATE POLICY "org members can view org"
  ON organizations FOR SELECT
  USING (
    deleted_at IS NULL
    AND id IN (
      SELECT org_id FROM profiles
      WHERE id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Profiles: own row only.
CREATE POLICY "users can view own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY "users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid() AND deleted_at IS NULL);

-- Profiles: insert handled by handle_new_user() trigger (SECURITY DEFINER),
-- but allow self-insert as a fallback in case the trigger is replaced.
CREATE POLICY "users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- =====================================================================
-- ACTIVE-ROW VIEWS (pre-filter deleted_at IS NULL — app code SELECTs from these)
-- =====================================================================
CREATE OR REPLACE VIEW organizations_active AS
  SELECT * FROM organizations WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW profiles_active AS
  SELECT * FROM profiles WHERE deleted_at IS NULL;
