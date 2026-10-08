# RLS security test matrix

**Status: NOT RUN — user reports successful execution of the Phase C owner-policy script; screenshot confirms there are zero leftover `Allow all access to ...` policies. Ordinary authenticated-session isolation tests are still required.**

Run only after the live schema and existing policies are reviewed, owner mappings are verified, and RLS has been deliberately enabled in a controlled environment. Use two ordinary authenticated browser sessions, never the service-role key.

| Test | Expected result | Result |
|---|---|---|
| Different accounts show separated project lists | Each account sees its own project list | USER REPORT: works; not independently observed |
| User A lists projects | Only A-owned projects | PARTIALLY COVERED by user report |
| User B lists projects | Only B-owned projects | NOT RUN |
| User A reads project B | Invisible / denied | NOT RUN |
| User A inserts a project with B's `owner_id` | Denied | NOT RUN |
| User A updates project B | Denied / zero rows affected | NOT RUN |
| User A deletes project B | Denied / zero rows affected | NOT RUN |
| User A reads, inserts, updates, or deletes B's WBS | Denied / invisible | NOT RUN |
| User A reads, inserts, updates, or deletes B's activities | Denied / invisible | NOT RUN |
| User A reads, inserts, updates, or deletes B's weekly progress | Denied / invisible | NOT RUN |
| User A reads, inserts, updates, or deletes B's issues | Denied / invisible | NOT RUN |
| User A reads, inserts, updates, or deletes B's materials | Denied / invisible | NOT RUN |
| User A assigns a child row to B's `project_id` | Denied | NOT RUN |
| Unauthenticated requests | Denied where intended | NOT RUN |

Record the table/operation, authenticated test user, and sanitized outcome. Do not mark a test passed based on a service-role or SQL-editor query because those do not represent an ordinary authenticated client.
