-- ============================================================
-- Backfill profiles + fix user tracking
-- Run this in DBeaver against your Supabase DB.
-- Safe to run multiple times (uses ON CONFLICT DO UPDATE).
-- ============================================================

-- 1. Re-create the handle_new_user trigger (in case it wasn't installed)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email, is_internal)
  VALUES (new.id, new.email, new.email LIKE '%@fleet.so')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 2. Backfill profiles for all existing auth users,
--    computing total_sessions from the sessions table.
INSERT INTO profiles (id, email, is_internal, total_sessions, first_seen_at, last_seen_at)
SELECT
  u.id,
  u.email,
  u.email LIKE '%@fleet.so' AS is_internal,
  COUNT(DISTINCT s.id)      AS total_sessions,
  u.created_at              AS first_seen_at,
  COALESCE(MAX(s.created_at), u.created_at) AS last_seen_at
FROM auth.users u
LEFT JOIN sessions s ON s.user_id = u.id
GROUP BY u.id, u.email, u.created_at
ON CONFLICT (id) DO UPDATE SET
  email          = EXCLUDED.email,
  is_internal    = EXCLUDED.is_internal,
  total_sessions = EXCLUDED.total_sessions,
  last_seen_at   = EXCLUDED.last_seen_at;

-- 3. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
