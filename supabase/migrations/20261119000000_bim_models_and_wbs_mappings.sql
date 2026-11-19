-- BIM model metadata, private model storage and component-to-WBS mapping.
-- REVIEW/NOT RUN: live schema and Storage policies are not available in this repo.
-- Assumptions from application code: projects.id/owner_id, wbs.id, activities.id,
-- project_id, and activities.wbs_id are UUID; projects.owner_id is the RLS owner.
-- This additive migration aborts if new tables exist, if required source columns
-- differ, if the named bucket is public, or if a broad anon/public storage policy
-- may expose this bucket. Review all guards and foreign keys before applying.

begin;

do $$
declare missing text[] := array[]::text[];
begin
  if to_regclass('public.project_models') is not null or to_regclass('public.model_wbs_mappings') is not null then
    raise exception 'BIM metadata table already exists; inspect and adapt this migration, do not replace existing objects';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='id' and udt_name='uuid') then missing := array_append(missing,'projects.id uuid'); end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='owner_id' and udt_name='uuid') then missing := array_append(missing,'projects.owner_id uuid'); end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='wbs' and column_name='id' and udt_name='uuid') then missing := array_append(missing,'wbs.id uuid'); end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='wbs' and column_name='project_id' and udt_name='uuid') then missing := array_append(missing,'wbs.project_id uuid'); end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='activities' and column_name='id' and udt_name='uuid') then missing := array_append(missing,'activities.id uuid'); end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='activities' and column_name='project_id' and udt_name='uuid') then missing := array_append(missing,'activities.project_id uuid'); end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='activities' and column_name='wbs_id' and udt_name='uuid') then missing := array_append(missing,'activities.wbs_id uuid'); end if;
  if cardinality(missing) > 0 then raise exception 'BIM migration assumptions not met: %', array_to_string(missing, ', '); end if;
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then raise exception 'Supabase Storage is unavailable'; end if;
  if exists (select 1 from storage.buckets where id='project-models' and public) then raise exception 'Bucket project-models exists and is public; audit and make private before continuing'; end if;
  if exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and roles && array['anon'::name,'public'::name]
    and cmd in ('ALL','SELECT','INSERT','UPDATE','DELETE')
    and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) not ilike '%project-models%') then
    raise exception 'Potential broad anon/public Storage policy found; review storage.objects policies before continuing';
  end if;
end $$;

create table public.project_models (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  model_name text not null check (length(trim(model_name)) > 0),
  model_version text not null check (length(trim(model_version)) > 0),
  file_format text not null check (file_format in ('glb','gltf')),
  file_path text not null unique,
  usdz_path text unique,
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 209715200),
  component_manifest jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, model_name, model_version)
);
create index project_models_project_created_idx on public.project_models(project_id, created_at desc);

create table public.model_wbs_mappings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  model_id uuid not null references public.project_models(id) on delete cascade,
  component_key text not null check (length(trim(component_key)) > 0),
  component_name text not null check (length(trim(component_name)) > 0),
  wbs_id uuid not null references public.wbs(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (model_id, component_key)
);
create index model_wbs_mappings_project_wbs_idx on public.model_wbs_mappings(project_id, wbs_id);

alter table public.project_models enable row level security;
alter table public.model_wbs_mappings enable row level security;

create policy project_models_owner_access on public.project_models for all to authenticated
using (exists (select 1 from public.projects p where p.id=project_models.project_id and p.owner_id=(select auth.uid())))
with check (exists (select 1 from public.projects p where p.id=project_models.project_id and p.owner_id=(select auth.uid())));

create policy model_wbs_mappings_owner_access on public.model_wbs_mappings for all to authenticated
using (
  exists (select 1 from public.projects p where p.id=model_wbs_mappings.project_id and p.owner_id=(select auth.uid()))
  and exists (select 1 from public.project_models m where m.id=model_wbs_mappings.model_id and m.project_id=model_wbs_mappings.project_id)
  and exists (select 1 from public.wbs w where w.id=model_wbs_mappings.wbs_id and w.project_id=model_wbs_mappings.project_id)
  and (model_wbs_mappings.activity_id is null or exists (select 1 from public.activities a where a.id=model_wbs_mappings.activity_id and a.project_id=model_wbs_mappings.project_id and a.wbs_id=model_wbs_mappings.wbs_id))
)
with check (
  exists (select 1 from public.projects p where p.id=model_wbs_mappings.project_id and p.owner_id=(select auth.uid()))
  and exists (select 1 from public.project_models m where m.id=model_wbs_mappings.model_id and m.project_id=model_wbs_mappings.project_id)
  and exists (select 1 from public.wbs w where w.id=model_wbs_mappings.wbs_id and w.project_id=model_wbs_mappings.project_id)
  and (model_wbs_mappings.activity_id is null or exists (select 1 from public.activities a where a.id=model_wbs_mappings.activity_id and a.project_id=model_wbs_mappings.project_id and a.wbs_id=model_wbs_mappings.wbs_id))
);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('project-models','project-models',false,209715200,array['model/gltf-binary','model/gltf+json','model/vnd.usdz+zip','application/octet-stream'])
on conflict (id) do nothing;

create policy project_models_storage_select on storage.objects for select to authenticated using (
  bucket_id='project-models' and exists (select 1 from public.projects p where p.id::text=(storage.foldername(name))[1] and p.owner_id=(select auth.uid()))
);
create policy project_models_storage_insert on storage.objects for insert to authenticated with check (
  bucket_id='project-models' and exists (select 1 from public.projects p where p.id::text=(storage.foldername(name))[1] and p.owner_id=(select auth.uid()))
);
create policy project_models_storage_update on storage.objects for update to authenticated using (
  bucket_id='project-models' and exists (select 1 from public.projects p where p.id::text=(storage.foldername(name))[1] and p.owner_id=(select auth.uid()))
) with check (
  bucket_id='project-models' and exists (select 1 from public.projects p where p.id::text=(storage.foldername(name))[1] and p.owner_id=(select auth.uid()))
);
create policy project_models_storage_delete on storage.objects for delete to authenticated using (
  bucket_id='project-models' and exists (select 1 from public.projects p where p.id::text=(storage.foldername(name))[1] and p.owner_id=(select auth.uid()))
);

commit;
