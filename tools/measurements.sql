-- Anonymous visitor measurements (only with the visitor's consent).
-- Only the Vercel function (service key) can write; nobody can read through the public API.
create table if not exists public.measurements (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  gender      text not null check (gender in ('female', 'male')),
  age         int  not null check (age in (20, 30, 40, 50)),
  values      jsonb not null,
  confidence  int  not null check (confidence between 0 and 100),
  frames      int  not null default 0,
  app_version text not null default ''
);
alter table public.measurements enable row level security;
-- no policies on purpose: the anon and authenticated roles get nothing
