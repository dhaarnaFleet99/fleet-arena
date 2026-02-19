-- ============================================================
-- Fleet Arena Schema (v2)
-- Run this in full if starting fresh, or run the ALTER sections
-- if upgrading from v1.
-- ============================================================

-- ── User profiles (extends Supabase auth.users) ──────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  is_internal boolean default false,
  total_sessions int default 0,
  total_rankings int default 0,
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now()
);

-- Auto-create profile on sign-up
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, is_internal)
  values (
    new.id,
    new.email,
    new.email like '%@fleet.so'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── Sessions ─────────────────────────────────────────────────
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  model_ids text[] not null,
  is_complete boolean default false,
  turn_count int default 0,
  created_at timestamptz default now(),
  completed_at timestamptz,
  metadata jsonb default '{}'
);

-- ── Turns ────────────────────────────────────────────────────
create table if not exists turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  turn_number int not null,
  prompt text not null,
  ranking_submitted boolean default false,
  created_at timestamptz default now()
);

-- ── Responses ────────────────────────────────────────────────
create table if not exists responses (
  id uuid primary key default gen_random_uuid(),
  turn_id uuid references turns(id) on delete cascade,
  session_id uuid references sessions(id) on delete cascade,
  model_id text not null,
  slot_label text not null,
  content text default '',
  latency_ms int,
  token_count int,
  finish_reason text,
  created_at timestamptz default now()
);

-- ── Rankings ─────────────────────────────────────────────────
create table if not exists rankings (
  id uuid primary key default gen_random_uuid(),
  turn_id uuid references turns(id) on delete cascade,
  session_id uuid references sessions(id) on delete cascade,
  response_id uuid references responses(id) on delete cascade,
  user_id uuid references auth.users(id),
  rank int not null,
  created_at timestamptz default now()
);

-- ── Behavioral flags ─────────────────────────────────────────
create table if not exists behavioral_flags (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  turn_id uuid references turns(id),
  model_id text not null,
  flag_type text not null,
  severity text not null,
  description text,
  evidence jsonb default '{}',
  confidence float default 0,
  created_at timestamptz default now()
);

-- ── RLS Policies ─────────────────────────────────────────────
alter table profiles enable row level security;
alter table sessions enable row level security;
alter table turns enable row level security;
alter table responses enable row level security;
alter table rankings enable row level security;
alter table behavioral_flags enable row level security;

create policy "users read own profile" on profiles for select using (auth.uid() = id);
create policy "users update own profile" on profiles for update using (auth.uid() = id);

create policy "users read own sessions" on sessions for select using (auth.uid() = user_id);
create policy "users insert own sessions" on sessions for insert with check (auth.uid() = user_id);
create policy "users update own sessions" on sessions for update using (auth.uid() = user_id);

create policy "turns via session" on turns for all using (
  exists (select 1 from sessions s where s.id = session_id and s.user_id = auth.uid())
);
create policy "responses via session" on responses for all using (
  exists (select 1 from sessions s where s.id = session_id and s.user_id = auth.uid())
);
create policy "rankings via session" on rankings for all using (
  exists (select 1 from sessions s where s.id = session_id and s.user_id = auth.uid())
);

-- ── Helper RPC functions for profile counters ─────────────────
create or replace function increment_profile_sessions(uid uuid)
returns void language plpgsql security definer as $$
begin
  update profiles
  set total_sessions = total_sessions + 1, last_seen_at = now()
  where id = uid;
end;
$$;

create or replace function increment_profile_rankings(uid uuid)
returns void language plpgsql security definer as $$
begin
  update profiles
  set total_rankings = total_rankings + 1, last_seen_at = now()
  where id = uid;
end;
$$;
