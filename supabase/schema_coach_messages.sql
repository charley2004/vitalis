-- Adds persisted Coach chat history on top of the base schema.sql.
-- Run this once in the Supabase SQL Editor, separately from schema.sql
-- (schema.sql was already applied when cloud sync was set up — re-running it
-- would error on the policies that already exist there).

create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.coach_messages enable row level security;

create policy "Users can read their own coach messages"
  on public.coach_messages for select
  using (auth.uid() = user_id);

create policy "Users can insert their own coach messages"
  on public.coach_messages for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own coach messages"
  on public.coach_messages for delete
  using (auth.uid() = user_id);

create index if not exists coach_messages_user_created_idx
  on public.coach_messages (user_id, created_at);
