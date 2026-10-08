-- READ-ONLY post-migration verification. Run the entire file in Supabase SQL Editor.

-- 1. RLS enabled/forced state on all application tables.
SELECT
  cls.relname AS table_name,
  cls.relrowsecurity AS rls_enabled,
  cls.relforcerowsecurity AS rls_forced
FROM pg_class AS cls
JOIN pg_namespace AS ns ON ns.oid = cls.relnamespace
WHERE ns.nspname = 'public'
  AND cls.relname IN ('projects', 'wbs', 'activities', 'weekly_progress', 'issues', 'materials')
ORDER BY cls.relname;

-- 2. Current policies. Expected: one *_owner_access policy per table;
-- no "Allow all access to ..." policy and no qual/with_check equal to true.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('projects', 'wbs', 'activities', 'weekly_progress', 'issues', 'materials')
ORDER BY tablename, policyname;

-- 3. Count any leftover open policies from the prior configuration.
SELECT count(*) AS leftover_open_policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('projects', 'wbs', 'activities', 'weekly_progress', 'issues', 'materials')
  AND policyname LIKE 'Allow all access to %';
