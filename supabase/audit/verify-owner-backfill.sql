-- READ-ONLY verification after the user-reported successful Phase A+B run.
-- Run in Supabase SQL Editor; these queries do not change data.

-- 1. Project count and owner coverage. The migration's guard should make
-- projects_without_owner = 0 if the full script ran and committed.
select count(*) as total_projects,
       count(owner_id) as projects_with_owner,
       count(*) filter (where owner_id is null) as projects_without_owner
from public.projects;

-- 2. Owner distribution. Review UUIDs and counts; do not share unnecessary PII.
select owner_id, count(*) as project_count
from public.projects
group by owner_id
order by owner_id;

-- 3. owner_id type/nullability/default.
select c.data_type, c.udt_name, c.is_nullable, c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'projects'
  and c.column_name = 'owner_id';

-- 4. FK target and delete behavior.
select con.conname as constraint_name,
       pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
join pg_class tbl on tbl.oid = con.conrelid
join pg_namespace ns on ns.oid = tbl.relnamespace
where ns.nspname = 'public'
  and tbl.relname = 'projects'
  and con.contype = 'f'
  and pg_get_constraintdef(con.oid, true) ilike '%owner_id%';

-- 5. Owner index.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'projects'
  and indexname = 'projects_owner_id_idx';

-- 6. Current RLS state for all six application tables.
select c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced,
       c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('projects','wbs','activities','weekly_progress','issues','materials')
order by c.relname;

-- 7. Current policies for project and child tables.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('projects','wbs','activities','weekly_progress','issues','materials')
order by tablename, policyname;

-- 8. Child/project foreign keys and delete behavior.
select tbl.relname as table_name,
       con.conname as constraint_name,
       pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
join pg_class tbl on tbl.oid = con.conrelid
join pg_namespace ns on ns.oid = tbl.relnamespace
where ns.nspname = 'public'
  and tbl.relname in ('projects','wbs','activities','weekly_progress','issues','materials')
  and con.contype = 'f'
order by tbl.relname, con.conname;
