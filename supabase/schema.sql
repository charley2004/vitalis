-- Vitalis cloud sync schema.
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
--
-- Storage model: one row per user holding their entire local AsyncStorage
-- state as a single JSON blob. The app already treats AsyncStorage as its
-- source of truth on every screen, so syncing one blob (rather than
-- normalizing routines/events/sessions into separate tables) means zero
-- changes to existing read/write call sites — sync only pulls the blob down
-- into AsyncStorage on login and pushes it back up on change.

create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

create policy "Users can read their own data"
  on public.user_data for select
  using (auth.uid() = user_id);

create policy "Users can insert their own data"
  on public.user_data for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own data"
  on public.user_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keep updated_at accurate on every write, since the sync engine uses it
-- to decide whether the local or remote snapshot is newer.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_user_data_updated_at on public.user_data;
create trigger set_user_data_updated_at
  before update on public.user_data
  for each row execute function public.set_updated_at();
