# Existing data integrity audit

**Status: BLOCKED — live data unavailable**  
No row counts or integrity queries were executed. Counts below are intentionally `UNKNOWN`, not zero.

| Data set / check | Result |
|---|---|
| Projects | UNKNOWN |
| WBS | UNKNOWN |
| Activities | UNKNOWN |
| Weekly progress | UNKNOWN |
| Issues | UNKNOWN |
| Materials | UNKNOWN |
| `projects.owner_id` | Initially NOT FOUND (error 42703); user reports Phase A+B script succeeded. Exact project/owner counts still require verification query. Script guard would abort if NULL owners remained at commit. |
| Duplicate projects / project codes | UNKNOWN |
| Projects without child rows | UNKNOWN |
| Orphan child `project_id` values | UNKNOWN |
| Invalid WBS `parent_id` / cross-project parents | UNKNOWN |
| Activities linked to invalid or cross-project WBS | UNKNOWN |
| Duplicate WBS codes / weekly numbers | UNKNOWN |
| Auth user rows | Screenshot provided by user shows one row; full user count not independently verified |
| Existing project-owner mapping | User explicitly confirmed all existing projects belong to the account shown in the screenshot; database rows/counts remain unverified |

No row was deleted. Owner mapping is explicitly confirmed by the user for the account shown in the screenshot. The user reports successful execution of Phase A+B and Phase C. A screenshot confirms zero leftover open policies. Phase A+B's guard checks for remaining NULL owners before commit, but exact row counts and the first two post-migration policy verification result sets have not been returned yet. Run [`verify-owner-backfill.sql`](verify-owner-backfill.sql) if exact ownership counts are needed.

Run the read-only checks in [`schema-and-data-audit.sql`](schema-and-data-audit.sql) after verifying the tables and columns listed in [`schema-audit.md`](schema-audit.md). Return sanitized results (counts and UUID mapping decisions only as appropriate); never share passwords, access tokens, or service-role keys.

## Required owner decision

For each existing project with no trusted owner relation, an authorized project owner must explicitly identify the corresponding authenticated user. Preserve unmapped rows and keep RLS rollout blocked until every project has a verified owner or a separately approved access-preservation plan.
