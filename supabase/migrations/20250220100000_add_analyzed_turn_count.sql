-- Track how many turns were analyzed so we can re-run the judge when the user
-- resumes a session, adds more turns, and completes again (avoid missing new data).
alter table sessions
  add column if not exists analyzed_turn_count int;

comment on column sessions.analyzed_turn_count is 'Number of turns included in the last behavioral_flags run; re-analyze if current turn count differs.';
