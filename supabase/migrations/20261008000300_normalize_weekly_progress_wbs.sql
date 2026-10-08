-- Additive migration for multi-WBS Weekly Progress links.
-- NOT executed from this session. The app keeps a legacy notes-based fallback
-- until this migration is applied. No progress, WBS, or project rows are deleted.

begin;

do $$
declare
  rel record;
begin
  if exists (select 1 from public.projects where owner_id is null) then
    raise exception 'Projects without owner_id exist; finish owner backfill first';
  end if;

  for rel in
    select * from (values
      ('projects', 'id'),
      ('weekly_progress', 'id'),
      ('weekly_progress', 'project_id'),
      ('weekly_progress', 'wbs_id'),
      ('weekly_progress', 'notes'),
      ('wbs', 'id'),
      ('wbs', 'project_id')
    ) as required(table_name, column_name)
  loop
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema='public'
        and c.table_name=rel.table_name
        and c.column_name=rel.column_name
    ) then
      raise exception 'Required column public.%.% not found', rel.table_name, rel.column_name;
    end if;
  end loop;

  if (select udt_name from information_schema.columns where table_schema='public' and table_name='weekly_progress' and column_name='id') <> 'uuid'
     or (select udt_name from information_schema.columns where table_schema='public' and table_name='wbs' and column_name='id') <> 'uuid' then
    raise exception 'Expected weekly_progress.id and wbs.id to be UUID before creating relation table';
  end if;

  if not exists (
    select 1 from pg_index i
    join pg_attribute a on a.attrelid=i.indrelid and a.attname='id'
    where i.indrelid='public.weekly_progress'::regclass
      and i.indisunique and i.indisvalid and i.indnkeyatts=1
      and a.attnum = any(i.indkey)
  ) or not exists (
    select 1 from pg_index i
    join pg_attribute a on a.attrelid=i.indrelid and a.attname='id'
    where i.indrelid='public.wbs'::regclass
      and i.indisunique and i.indisvalid and i.indnkeyatts=1
      and a.attnum = any(i.indkey)
  ) then
    raise exception 'weekly_progress.id and wbs.id must be unique keys before adding link foreign keys';
  end if;

  if (select udt_name from information_schema.columns where table_schema='public' and table_name='weekly_progress' and column_name='project_id')
     <> (select udt_name from information_schema.columns where table_schema='public' and table_name='projects' and column_name='id')
     or (select udt_name from information_schema.columns where table_schema='public' and table_name='wbs' and column_name='project_id')
     <> (select udt_name from information_schema.columns where table_schema='public' and table_name='projects' and column_name='id') then
    raise exception 'project_id types do not match projects.id; review schema before continuing';
  end if;

  if (select data_type from information_schema.columns where table_schema='public' and table_name='weekly_progress' and column_name='notes')
     not in ('text','character varying','character') then
    raise exception 'weekly_progress.notes is not a text column; review legacy link migration before continuing';
  end if;
end
$$;

create table if not exists public.weekly_progress_wbs (
  weekly_progress_id uuid not null references public.weekly_progress(id) on delete cascade,
  wbs_id uuid not null references public.wbs(id) on delete cascade,
  primary key (weekly_progress_id, wbs_id)
);

create index if not exists weekly_progress_wbs_wbs_id_idx
  on public.weekly_progress_wbs(wbs_id);

-- Backfill legacy single-WBS links. Only same-project links are copied.
insert into public.weekly_progress_wbs (weekly_progress_id, wbs_id)
select progress.id, wbs.id
from public.weekly_progress progress
join public.wbs wbs
  on wbs.id::text = progress.wbs_id::text
 and wbs.project_id = progress.project_id
where progress.wbs_id is not null
on conflict do nothing;

-- Backfill multi-WBS IDs stored by the previous application version in notes.
-- Malformed legacy marker values are skipped and preserved; no source row changes.
do $$
declare
  progress_row record;
  marker_position integer;
  payload jsonb;
  linked_id text;
begin
  for progress_row in
    select id, project_id, notes
    from public.weekly_progress
    where notes like '%[[weekly-links]] %'
  loop
    marker_position := position('[[weekly-links]] ' in progress_row.notes);
    begin
      payload := substring(progress_row.notes from marker_position + char_length('[[weekly-links]] '))::jsonb;
    exception when others then
      raise notice 'Skipping malformed Weekly Progress links marker for row %', progress_row.id;
      continue;
    end;

    if jsonb_typeof(payload -> 'wbsIds') = 'array' then
      for linked_id in select jsonb_array_elements_text(payload -> 'wbsIds') loop
        begin
          insert into public.weekly_progress_wbs (weekly_progress_id, wbs_id)
          select progress_row.id, wbs.id
          from public.wbs wbs
          where wbs.id = linked_id::uuid
            and wbs.project_id = progress_row.project_id
          on conflict do nothing;
        exception when invalid_text_representation then
          raise notice 'Skipping invalid WBS UUID in Weekly Progress row %', progress_row.id;
          continue;
        end;
      end loop;
    end if;
  end loop;
end
$$;

alter table public.weekly_progress_wbs enable row level security;

drop policy if exists weekly_progress_wbs_owner_access on public.weekly_progress_wbs;
create policy weekly_progress_wbs_owner_access on public.weekly_progress_wbs
  for all to authenticated
  using (exists (
    select 1
    from public.weekly_progress progress
    join public.projects project on project.id = progress.project_id
    join public.wbs wbs on wbs.id = weekly_progress_wbs.wbs_id
                       and wbs.project_id = progress.project_id
    where progress.id = weekly_progress_wbs.weekly_progress_id
      and project.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1
    from public.weekly_progress progress
    join public.projects project on project.id = progress.project_id
    join public.wbs wbs on wbs.id = weekly_progress_wbs.wbs_id
                       and wbs.project_id = progress.project_id
    where progress.id = weekly_progress_wbs.weekly_progress_id
      and project.owner_id = (select auth.uid())
  ));

grant select, insert, delete on public.weekly_progress_wbs to authenticated;
revoke all on public.weekly_progress_wbs from public, anon;

create or replace function public.set_weekly_progress_wbs_links(
  p_progress_id uuid,
  p_wbs_ids uuid[]
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_project_id uuid;
  target_wbs_id uuid;
begin
  select progress.project_id into target_project_id
  from public.weekly_progress progress
  join public.projects project on project.id = progress.project_id
  where progress.id = p_progress_id
    and project.owner_id = (select auth.uid());

  if not found then
    raise exception 'Weekly Progress row is unavailable for the current user';
  end if;

  for target_wbs_id in
    select distinct unnest(coalesce(p_wbs_ids, array[]::uuid[]))
  loop
    if not exists (
      select 1 from public.wbs wbs
      where wbs.id = target_wbs_id
        and wbs.project_id = target_project_id
    ) then
      raise exception 'WBS link must belong to the same project as Weekly Progress';
    end if;
  end loop;

  delete from public.weekly_progress_wbs
  where weekly_progress_id = p_progress_id;

  insert into public.weekly_progress_wbs (weekly_progress_id, wbs_id)
  select p_progress_id, unnest(coalesce(p_wbs_ids, array[]::uuid[]))
  on conflict do nothing;
end
$$;

revoke all on function public.set_weekly_progress_wbs_links(uuid, uuid[]) from public, anon;
grant execute on function public.set_weekly_progress_wbs_links(uuid, uuid[]) to authenticated;

commit;
