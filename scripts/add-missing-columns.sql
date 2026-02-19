-- ============================================================
-- Fleet Arena — add all columns missing from the live DB
--
-- The live DB was created from an older schema. Later additions
-- (slot_label, session_id) were not applied because
-- CREATE TABLE IF NOT EXISTS skips existing tables.
--
-- Run this entire script in the Supabase SQL Editor, then
-- click "Reload schema cache" in Dashboard → Settings → API.
-- ============================================================

-- ── responses table ──────────────────────────────────────────
ALTER TABLE responses
  ADD COLUMN IF NOT EXISTS slot_label text;

ALTER TABLE responses
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES sessions(id) ON DELETE CASCADE;

-- Backfill session_id via turn
UPDATE responses r
SET session_id = t.session_id
FROM turns t
WHERE r.turn_id = t.id AND r.session_id IS NULL;

-- slot_label cannot be backfilled for old rows (slot assignment is lost)
-- New rows will have it set correctly by the application.

-- ── rankings table ───────────────────────────────────────────
ALTER TABLE rankings
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES sessions(id) ON DELETE CASCADE;

-- Backfill session_id via turn
UPDATE rankings rk
SET session_id = t.session_id
FROM turns t
WHERE rk.turn_id = t.id AND rk.session_id IS NULL;

-- ── Verify (optional — run separately to check) ──────────────
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'responses' ORDER BY ordinal_position;
