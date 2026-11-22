-- Table for the depth lab recordings (api/depth.mjs). Applied to the Supabase project sang-exhibition.
-- Participant 1 is the owner (recorded from local files), so numbering starts at 2.
create sequence if not exists public.depth_participant_seq start with 2;
create table if not exists public.depth_runs (
  id bigint generated always as identity primary key,
  participant_no integer not null,
  take integer not null default 1,
  created_at timestamptz not null default now(),
  camera jsonb,
  rating jsonb,
  frames jsonb not null
);
create index if not exists depth_runs_participant_idx on public.depth_runs (participant_no);
alter table public.depth_runs enable row level security;
create or replace function public.next_depth_participant() returns integer
language sql security definer set search_path = public as $$ select nextval('public.depth_participant_seq')::integer $$;
revoke all on function public.next_depth_participant() from public, anon, authenticated;
-- To delete everything after the tests: drop table public.depth_runs; drop sequence public.depth_participant_seq;
