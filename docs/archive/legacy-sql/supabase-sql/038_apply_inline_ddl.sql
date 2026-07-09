-- 038_apply_inline_ddl.sql
-- Provides a tiny RPC helper for executing DDL authorized during bootstrap.
-- THIS IS A TEMPORARY DEV/BOOTSTRAP AID — keep it scoped to the migration schema.
CREATE OR REPLACE FUNCTION pg_temp.run_inline_ddl(sql_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql_text;
  RETURN 'OK';
END;
$$;
