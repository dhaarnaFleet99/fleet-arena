-- Fleet Arena — Clear All Data
-- Run this in the Supabase SQL Editor (or psql).
-- Deletes in dependency order to avoid FK violations.

TRUNCATE TABLE behavioral_flags  RESTART IDENTITY CASCADE;
TRUNCATE TABLE rankings          RESTART IDENTITY CASCADE;
TRUNCATE TABLE responses         RESTART IDENTITY CASCADE;
TRUNCATE TABLE turns             RESTART IDENTITY CASCADE;
TRUNCATE TABLE sessions          RESTART IDENTITY CASCADE;

-- Optionally reset profile counters without deleting accounts:
UPDATE profiles SET total_sessions = 0, total_rankings = 0;

-- Or to fully wipe profiles too (removes all user data):
-- TRUNCATE TABLE profiles RESTART IDENTITY CASCADE;
