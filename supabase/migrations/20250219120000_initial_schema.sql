-- Sessions
create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  model_ids text[] not null,
  is_complete boolean default false,
  created_at timestamptz default now(),
  metadata jsonb default '{}'
);

-- Turns
create table turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  turn_number int not null,
  prompt text not null,
  created_at timestamptz default now()
);

-- Responses (blind: no model_id exposed to client until ranked)
create table responses (
  id uuid primary key default gen_random_uuid(),
  turn_id uuid references turns(id) on delete cascade,
  model_id text not null,           -- hidden from client until ranking submitted
  content text,
  latency_ms int,
  token_count int,
  finish_reason text,
  created_at timestamptz default now()
);

-- Rankings
create table rankings (
  id uuid primary key default gen_random_uuid(),
  turn_id uuid references turns(id) on delete cascade,
  session_id uuid references sessions(id) on delete cascade,
  response_id uuid references responses(id) on delete cascade,
  rank int not null,                -- 1 = best
  created_at timestamptz default now()
);

-- Behavioral flags (written by analysis worker)
create table behavioral_flags (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  turn_id uuid references turns(id),
  model_id text not null,
  flag_type text not null,          -- refusal | context_loss | sycophancy | verbosity | rank_reversal
  severity text not null,           -- low | medium | high
  description text,
  evidence jsonb,
  confidence float,
  created_at timestamptz default now()
);

-- RLS: users can only read their own sessions
alter table sessions enable row level security;
alter table turns enable row level security;
alter table responses enable row level security;
alter table rankings enable row level security;
alter table behavioral_flags enable row level security;

create policy "users read own sessions" on sessions
  for select using (auth.uid() = user_id or user_id is null);

create policy "users insert own sessions" on sessions
  for insert with check (auth.uid() = user_id or user_id is null);

create policy "users update own sessions" on sessions
  for update using (auth.uid() = user_id or user_id is null);

create policy "turns via session" on turns
  for all using (
    exists (select 1 from sessions s where s.id = session_id and (s.user_id = auth.uid() or s.user_id is null))
  );

create policy "responses via turn" on responses
  for all using (
    exists (
      select 1 from turns t
      join sessions s on s.id = t.session_id
      where t.id = turn_id and (s.user_id = auth.uid() or s.user_id is null)
    )
  );

create policy "rankings via session" on rankings
  for all using (
    exists (select 1 from sessions s where s.id = session_id and (s.user_id = auth.uid() or s.user_id is null))
  );

-- Internal only: behavioral_flags readable by service role only (no user policy)
-- Access via server-side API route that checks @fleet.so email
