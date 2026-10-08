-- PHASE A + B ONLY — prepared from the user's explicit ownership confirmation.
-- Not executed by Codex. Review the target Supabase project before running.
-- Confirmed mapping: all existing projects belong to Auth user
-- 6e7e42a0-7fcc-446a-b8f2-5101ddd1d076.
-- This does NOT enable RLS, set NOT NULL, or change child tables.
--
-- Preconditions observed: public.projects.owner_id is absent (Supabase
-- returned SQLSTATE 42703 for that column); the user-provided Auth screenshot
-- shows the mapping target; the user explicitly confirmed all existing projects
-- belong to that account. Other schema details have not been audited here.

begin;

-- Keep owner_id nullable. Existing projects are assigned only because the user
-- explicitly confirmed the ownership mapping above.
alter table public.projects
  add column if not exists owner_id uuid references auth.users(id);

update public.projects
set owner_id = '6e7e42a0-7fcc-446a-b8f2-5101ddd1d076'::uuid
where owner_id is null;

-- Future inserts that omit owner_id receive the authenticated user's ID.
alter table public.projects
  alter column owner_id set default auth.uid();

create index if not exists projects_owner_id_idx
  on public.projects(owner_id);

-- Fail and roll back if any project remains unowned.
do $$
begin
  if exists (select 1 from public.projects where owner_id is null) then
    raise exception 'Owner backfill incomplete; transaction must be rolled back';
  end if;
end
$$;

commit;

-- After running, verify row counts and FK/default/index in Supabase SQL Editor.
-- Keep RLS disabled until existing policies, child FKs/cascades, and security
-- design have been audited. Do not set owner_id NOT NULL until verification
-- confirms zero NULL owners and a recovery plan is ready.
