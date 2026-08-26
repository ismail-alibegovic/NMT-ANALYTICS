-- Create covering indexes for public foreign keys that do not already have
-- an index whose leading columns match the FK column order.
DO $$
DECLARE
  r record;
  v_cols text;
  v_idx_name text;
BEGIN
  FOR r IN
    SELECT c.conrelid,
           c.conname,
           c.conkey,
           cls.relname AS table_name
    FROM pg_constraint c
    JOIN pg_class cls ON cls.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE c.contype = 'f'
      AND ns.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_index i
        WHERE i.indrelid = c.conrelid
          AND i.indisvalid
          AND i.indisready
          AND i.indpred IS NULL
          AND (i.indkey::smallint[])[0:cardinality(c.conkey)-1] = c.conkey
      )
  LOOP
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY u.ord)
      INTO v_cols
    FROM unnest(r.conkey) WITH ORDINALITY AS u(attnum, ord)
    JOIN pg_attribute a
      ON a.attrelid = r.conrelid AND a.attnum = u.attnum;

    v_idx_name := left('idx_fk_' || r.table_name || '_' || substr(md5(r.conname),1,10), 63);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (%s)',
                   v_idx_name, r.conrelid::regclass, v_cols);
  END LOOP;
END
$$;

DROP INDEX IF EXISTS public.idx_packages_is_active;
