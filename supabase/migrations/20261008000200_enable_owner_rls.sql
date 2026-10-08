-- PHASE C DRAFT — review before running in Supabase SQL Editor.
-- Based on user-provided pg_policies screenshot showing exactly one permissive
-- ALL/true policy per app table named "Allow all access to <table>".
-- The screenshot does NOT show whether RLS is enabled. This migration checks
-- preconditions, removes only those named open policies, enables RLS, and adds
-- owner-based policies. It does not alter or delete table data.
--
-- Do not run until `verify-owner-backfill.sql` has been run and reviewed,
-- remaining schema/FK checks are complete, and a recovery path is available.

begin;

do $$
declare
  expected_owner constant uuid := '6e7e42a0-7fcc-446a-b8f2-5101ddd1d076';
  tbl text;
  col text;
  missing_tables text[] := array[]::text[];
  missing_columns text[] := array[]::text[];
begin
  foreach tbl in array array['projects','wbs','activities','weekly_progress','issues','materials'] loop
    if to_regclass(format('public.%I', tbl)) is null then
      missing_tables := array_append(missing_tables, tbl);
    end if;
  end loop;
  if cardinality(missing_tables) > 0 then
    raise exception 'Required public tables not found: %', array_to_string(missing_tables, ', ');
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='projects' and column_name='id') then
    missing_columns := array_append(missing_columns, 'projects.id');
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='projects' and column_name='owner_id'
                   and udt_name='uuid') then
    missing_columns := array_append(missing_columns, 'projects.owner_id uuid');
  end if;
  foreach tbl in array array['wbs','activities','weekly_progress','issues','materials'] loop
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name=tbl and column_name='project_id') then
      missing_columns := array_append(missing_columns, tbl || '.project_id');
    end if;
  end loop;
  if cardinality(missing_columns) > 0 then
    raise exception 'Required columns missing or incompatible: %', array_to_string(missing_columns, ', ');
  end if;

  if exists (select 1 from public.projects where owner_id is null or owner_id <> expected_owner) then
    raise exception 'Owner verification failed; found NULL or unexpected project owners';
  end if;

  -- Do not silently remove or override policies not covered by the screenshot.
  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename in ('projects','wbs','activities','weekly_progress','issues','materials')
      and policyname not in (
        'Allow all access to projects','Allow all access to wbs',
        'Allow all access to activities','Allow all access to weekly_progress',
        'Allow all access to issues','Allow all access to materials',
        'projects_owner_access','wbs_project_owner_access',
        'activities_project_owner_access','weekly_progress_project_owner_access',
        'issues_project_owner_access','materials_project_owner_access'
      )
  ) then
    raise exception 'Unexpected existing policy found; audit policies and revise this draft before applying';
  end if;
end
$$;

-- Remove the known permissive policies. A permissive true policy would combine
-- with restrictive owner policies using OR and defeat the isolation boundary.
drop policy if exists "Allow all access to projects" on public.projects;
drop policy if exists "Allow all access to wbs" on public.wbs;
drop policy if exists "Allow all access to activities" on public.activities;
drop policy if exists "Allow all access to weekly_progress" on public.weekly_progress;
drop policy if exists "Allow all access to issues" on public.issues;
drop policy if exists "Allow all access to materials" on public.materials;

alter table public.projects enable row level security;
alter table public.wbs enable row level security;
alter table public.activities enable row level security;
alter table public.weekly_progress enable row level security;
alter table public.issues enable row level security;
alter table public.materials enable row level security;

drop policy if exists projects_owner_access on public.projects;
create policy projects_owner_access on public.projects
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists wbs_project_owner_access on public.wbs;
create policy wbs_project_owner_access on public.wbs
  for all to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = wbs.project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p
                      where p.id = wbs.project_id and p.owner_id = (select auth.uid())));

drop policy if exists activities_project_owner_access on public.activities;
create policy activities_project_owner_access on public.activities
  for all to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = activities.project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p
                      where p.id = activities.project_id and p.owner_id = (select auth.uid())));

drop policy if exists weekly_progress_project_owner_access on public.weekly_progress;
create policy weekly_progress_project_owner_access on public.weekly_progress
  for all to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = weekly_progress.project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p
                      where p.id = weekly_progress.project_id and p.owner_id = (select auth.uid())));

drop policy if exists issues_project_owner_access on public.issues;
create policy issues_project_owner_access on public.issues
  for all to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = issues.project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p
                      where p.id = issues.project_id and p.owner_id = (select auth.uid())));

drop policy if exists materials_project_owner_access on public.materials;
create policy materials_project_owner_access on public.materials
  for all to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = materials.project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p
                      where p.id = materials.project_id and p.owner_id = (select auth.uid())));

commit;

-- After applying, immediately review policies/RLS and test authenticated User A
-- against User B's project and every child table. Never use service_role to test.
