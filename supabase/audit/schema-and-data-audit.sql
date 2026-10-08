-- READ-ONLY AUDIT QUERIES. Run from Supabase SQL Editor only after access is
-- available. Do not run migrations or UPDATE/DELETE statements from this file.
-- Initial section uses PostgreSQL catalogs and is safe even when app tables are
-- absent. Data checks below assume the source-referenced columns exist; inspect
-- the catalog output first and adapt only after confirming the live schema.

-- A. Table presence (including RLS enabled state).
select n.nspname as schema_name, c.relname as table_name,
       c.relkind as relation_kind, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'storage')
  and c.relkind in ('r', 'p', 'v', 'm')
  and (n.nspname = 'storage' or c.relname in
       ('projects','wbs','activities','weekly_progress','issues','materials'))
order by n.nspname, c.relname;

-- B. Columns, types, nullability, and defaults.
select table_schema, table_name, ordinal_position, column_name,
       data_type, udt_name, is_nullable, column_default
from information_schema.columns
where (table_schema = 'public' and table_name in
       ('projects','wbs','activities','weekly_progress','issues','materials'))
   or (table_schema = 'storage' and table_name = 'objects')
order by table_schema, table_name, ordinal_position;

-- C. Primary, unique, foreign-key constraints and ON DELETE behavior.
select ns.nspname as schema_name, tbl.relname as table_name,
       con.conname as constraint_name, con.contype as constraint_type,
       pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
join pg_class tbl on tbl.oid = con.conrelid
join pg_namespace ns on ns.oid = tbl.relnamespace
where ns.nspname = 'public'
  and tbl.relname in ('projects','wbs','activities','weekly_progress','issues','materials')
order by tbl.relname, con.contype, con.conname;

-- D. Index definitions.
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('projects','wbs','activities','weekly_progress','issues','materials')
order by tablename, indexname;

-- E. RLS policies currently installed.
select schemaname, tablename, policyname, permissive, roles,
       cmd, qual, with_check
from pg_policies
where schemaname in ('public','storage')
  and (tablename in ('projects','wbs','activities','weekly_progress','issues','materials','objects'))
order by schemaname, tablename, policyname;

-- F. User-defined routines, triggers, and views that touch the application tables.
select n.nspname as schema_name, p.proname as routine_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','storage')
order by n.nspname, p.proname;

select n.nspname as schema_name, c.relname as table_name,
       t.tgname as trigger_name, pg_get_triggerdef(t.oid, true) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal and n.nspname in ('public','storage')
order by n.nspname, c.relname, t.tgname;

select schemaname, viewname, definition
from pg_views
where schemaname in ('public','storage')
order by schemaname, viewname;

-- G. Storage bucket visibility/settings. This does not audit object policies;
-- see section E for storage.objects policies.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;

-- H. Exact counts and basic integrity. Run only after section B confirms each
-- referenced table and column. These are read-only SELECTs; large tables may
-- take time. No data will be repaired or deleted.
select 'projects' as table_name, count(*) as row_count from public.projects
union all select 'wbs', count(*) from public.wbs
union all select 'activities', count(*) from public.activities
union all select 'weekly_progress', count(*) from public.weekly_progress
union all select 'issues', count(*) from public.issues
union all select 'materials', count(*) from public.materials;

-- I. Check whether ownership can currently be audited. Safe even when the
-- column is absent. If owner_id_exists is false, do not run the count query
-- below; Phase A is still subject to schema review and explicit approval.
select exists (
  select 1 from information_schema.columns
  where table_schema = 'public'
    and table_name = 'projects'
    and column_name = 'owner_id'
) as owner_id_exists;

-- Run this only after the previous result is true:
-- select count(*) as total_projects,
--        count(owner_id) as projects_with_owner,
--        count(*) filter (where owner_id is null) as projects_without_owner
-- from public.projects;

-- J. Orphans (only if all child tables have project_id and projects has id).
select 'wbs' as child_table, count(*) as orphan_rows
from public.wbs c left join public.projects p on p.id = c.project_id where p.id is null
union all select 'activities', count(*)
from public.activities c left join public.projects p on p.id = c.project_id where p.id is null
union all select 'weekly_progress', count(*)
from public.weekly_progress c left join public.projects p on p.id = c.project_id where p.id is null
union all select 'issues', count(*)
from public.issues c left join public.projects p on p.id = c.project_id where p.id is null
union all select 'materials', count(*)
from public.materials c left join public.projects p on p.id = c.project_id where p.id is null;

-- K. Candidate duplicates (confirm business key definitions before treating as
-- errors; these queries only report candidates and never modify records).
select 'projects project_code' as candidate_key, project_code as key_value, count(*)
from public.projects group by project_code having count(*) > 1;

select 'wbs project_id + wbs_code' as candidate_key,
       project_id::text || ' / ' || wbs_code as key_value, count(*)
from public.wbs group by project_id, wbs_code having count(*) > 1;

select 'weekly_progress project_id + week_number' as candidate_key,
       project_id::text || ' / ' || week_number::text as key_value, count(*)
from public.weekly_progress group by project_id, week_number having count(*) > 1;

-- L. Inspect Auth users only with an authorized role that can read auth.users.
-- This query returns identifiers/email/created date only. Do not share secrets.
select id, email, created_at from auth.users order by created_at;
