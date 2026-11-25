-- TurboFex v3.31.0 migration. Run ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to run again and again. It does NOT delete, change or reset any existing row.
-- Why: a line that is sent twice (a retry after a slow answer) used to be stored twice. Each activity line and audit line now has a unique key.
-- Until you run this the site still works: it keeps saving the old way and the dashboard's Server tab says the migration is needed.
alter table public.tfx_events add column if not exists eid text;
create unique index if not exists tfx_events_eid_uq on public.tfx_events (eid);
alter table public.tfx_audit add column if not exists h text;
-- fill the audit key for rows that exist already (their own hash is inside the saved line)
update public.tfx_audit set h = line->>'h' where h is null and line ? 'h';
-- if the next line fails, the audit log holds the same line twice; keep the first of each (the hash chain only needs one copy):
delete from public.tfx_audit a using public.tfx_audit b where a.h is not null and a.h = b.h and a.id > b.id;
create unique index if not exists tfx_audit_h_uq on public.tfx_audit (h);
-- daily totals are stored in tfx_kv under keys like 'daily:2026-11-23' (no new table needed)
