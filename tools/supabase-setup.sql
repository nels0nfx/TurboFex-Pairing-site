-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- It makes three private tables. Only the site (with your secret key) can read or write them.
create table if not exists public.tfx_kv     (key text primary key, value jsonb not null, updated_at timestamptz default now());
create table if not exists public.tfx_events (id bigint generated always as identity primary key, t bigint not null, e jsonb not null);
create table if not exists public.tfx_audit  (id bigint generated always as identity primary key, line jsonb not null);
create index if not exists tfx_events_t on public.tfx_events (t);
alter table public.tfx_kv enable row level security;
alter table public.tfx_events enable row level security;
alter table public.tfx_audit enable row level security;
revoke all on public.tfx_kv, public.tfx_events, public.tfx_audit from anon, authenticated;
-- v3.31.0: unique keys so a retried write is stored once (existing installs: run tools/supabase-migrate-v3.31.sql instead)
alter table public.tfx_events add column if not exists eid text;
create unique index if not exists tfx_events_eid_uq on public.tfx_events (eid);
alter table public.tfx_audit add column if not exists h text;
create unique index if not exists tfx_audit_h_uq on public.tfx_audit (h);
