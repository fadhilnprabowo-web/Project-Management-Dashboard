# Supabase schema audit

**Status: BLOCKED — SUPABASE ACCESS NOT AVAILABLE**  
Audit date: 2026-10-08 (Asia/Jakarta)

No database connection, Supabase CLI, Supabase MCP, or Management API tool is available in this session. `.env.local` contains the variable names `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; values were not read or copied. These browser credentials are not evidence of database catalog access. No database query was run. Do not interpret source code or the draft migration as proof of the live schema.

## Table status

`UNKNOWN` means the live database has not been inspected. “Source reference” only records what the current application code expects.

| Table | Status | Source reference / outstanding verification |
|---|---|---|
| `public.projects` | PARTIALLY VERIFIED | Supabase first returned SQLSTATE 42703 (`column "owner_id" does not exist`). User subsequently reports successful execution of the Phase A+B owner script. This indicates the script ran successfully, but exact column properties, counts, index/FK state, RLS, and policies still need read-only verification using [`verify-owner-backfill.sql`](verify-owner-backfill.sql). |
| `public.wbs` | UNKNOWN | Source references `project_id`, WBS fields, and `parent_id`. Verify actual columns and project/WBS parent relations. |
| `public.activities` | UNKNOWN | Source references `project_id` and activity fields; source also reads WBS/activity labels for weekly progress. Verify columns and relationships. |
| `public.weekly_progress` | UNKNOWN | Source references `project_id`, `week_number`, progress/date/activity/WBS fields. Verify schema, uniqueness, and FK behavior. |
| `public.issues` | UNKNOWN | Source references `project_id` and issue fields. Verify actual schema and constraints. |
| `public.materials` | UNKNOWN | Source references `project_id` and material fields. Verify actual schema and constraints. |

## Required live catalog checks

Run the read-only queries in [`schema-and-data-audit.sql`](schema-and-data-audit.sql) using a trusted Supabase SQL Editor session. Its results must be reviewed before migration design is finalized. In particular, the source-side `owner_id` filter can fail if the live `projects.owner_id` column is absent; the source expectation does not establish that the column exists.

## Other database objects

| Object | Status | Notes |
|---|---|---|
| Primary keys, FKs, delete behavior, unique constraints, indexes | UNKNOWN | Not inspected against PostgreSQL catalogs. |
| RLS and policies | PARTIALLY VERIFIED | Before rollout, screenshots showed RLS enabled and six permissive public `ALL/true` policies. User reports successful execution of Phase C, and a later screenshot confirms `leftover_open_policy_count = 0`. The first two result sets (current RLS flags and complete owner policy definitions) were not visible in the supplied screenshot; verify them if final catalog confirmation is needed. |
| Functions, triggers, views | UNKNOWN | Not inspected. |
| Storage buckets and `storage.objects` policies | UNKNOWN | Not inspected. Application documentation images appear to be stored in project JSON as data URLs in source; this does not prove that Storage is unused in the live project. |
| `auth.users` | PARTIALLY OBSERVED (user-provided screenshot) | Screenshot shows one Auth user row with `id`, `email`, and `created_at`. The user explicitly confirmed all existing projects belong to that account. This is user-provided evidence, not a direct database query by this audit. |

## Proposed Weekly Progress relation

[`20261008000300_normalize_weekly_progress_wbs.sql`](../migrations/20261008000300_normalize_weekly_progress_wbs.sql) adds a `weekly_progress_wbs` junction table with same-project owner RLS and a transaction-safe RPC for replacing a record's selected WBS links. It also backfills links from the prior `wbs_id` field and legacy notes marker. The app keeps that notes format as a compatibility fallback until this migration is applied. The migration has not been run; its type/schema guards must pass first.

## Source-only security observations (not live verification)

- `src/services/database.ts` filters project reads/updates/deletes by `owner_id` and uses `project_id` for child data. Frontend filters are not a security boundary.
- `src/services/supabase.ts` uses Vite URL and publishable-key configuration. Source search found no service-role key reference in the inspected files; this does not prove that no secret exists in deployment configuration or Git history.
- `src/main.tsx` uses `supabase.auth.onAuthStateChange`; `src/services/database.ts` uses `supabase.auth.getSession()` to obtain session context. Live login and session behavior are untested.
- New project inserts rely on the database to assign ownership; whether a live `owner_id DEFAULT auth.uid()` exists is UNKNOWN.

## Gate before proceeding

Owner mapping for all existing projects was explicitly confirmed by the user; the user reports successful execution of Phase A+B and Phase C. Verify the catalog state and row counts with read-only queries. Child-table FK/cascade audit and ordinary authenticated-session isolation tests remain outstanding. Preserve every existing row. See [`data-integrity.md`](data-integrity.md), [`rls-test-matrix.md`](rls-test-matrix.md), and the migration drafts.
