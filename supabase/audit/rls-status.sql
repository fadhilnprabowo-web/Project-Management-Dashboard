-- Run this entire statement by itself in the Supabase SQL Editor.
-- Read-only: shows whether RLS is enabled/forced on each application table.
SELECT
  cls.relname AS table_name,
  cls.relrowsecurity AS rls_enabled,
  cls.relforcerowsecurity AS rls_forced
FROM pg_class AS cls
JOIN pg_namespace AS ns ON ns.oid = cls.relnamespace
WHERE ns.nspname = 'public'
  AND cls.relname IN ('projects', 'wbs', 'activities', 'weekly_progress', 'issues', 'materials')
ORDER BY cls.relname;
