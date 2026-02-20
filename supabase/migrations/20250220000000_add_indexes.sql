-- ============================================================
-- Performance indexes
-- All FK-referenced columns and common filter columns.
-- Safe to run multiple times (IF NOT EXISTS).
-- ============================================================

-- sessions ────────────────────────────────────────────────────
-- history page: WHERE user_id = $1 ORDER BY created_at DESC
create index if not exists sessions_user_id_created_at_idx
  on sessions(user_id, created_at desc);

-- backfill cron: WHERE is_complete = true (partial index — small, fast)
create index if not exists sessions_is_complete_idx
  on sessions(id) where is_complete = true;

-- turns ───────────────────────────────────────────────────────
-- all turn lookups are by session_id; many also order by turn_number
create index if not exists turns_session_id_turn_number_idx
  on turns(session_id, turn_number);

-- responses ───────────────────────────────────────────────────
-- turn_id is the primary join key for all response lookups
create index if not exists responses_turn_id_idx
  on responses(turn_id);

-- model_id used by stats aggregations and analyzeSession
create index if not exists responses_model_id_idx
  on responses(model_id);

-- rankings ────────────────────────────────────────────────────
-- turn_id used for ranking lookups and stats aggregations
create index if not exists rankings_turn_id_idx
  on rankings(turn_id);

-- response_id used for win-rate joins in stats
create index if not exists rankings_response_id_idx
  on rankings(response_id);

-- rank = 1 filter used for win-rate calculation (partial index)
create index if not exists rankings_rank1_idx
  on rankings(response_id) where rank = 1;

-- behavioral_flags ────────────────────────────────────────────
-- session_id used for idempotency check in analyzeSession
-- and for backfill exclusion query
create index if not exists behavioral_flags_session_id_idx
  on behavioral_flags(session_id);
