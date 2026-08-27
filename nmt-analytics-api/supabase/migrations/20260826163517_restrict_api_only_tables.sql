-- ⚠️ RESTORED FROM LIVE: This migration was applied to production as 20260826163517.
-- It revokes authenticated access from API-only operational tables.
-- The earlier 20260826155408 already revoked authenticated from ALL public tables,
-- so on a fresh database this migration is a no-op. It exists to document the
-- live migration history exactly as recorded in supabase_migrations.schema_migrations.

-- API-only tables that must never receive direct PostgREST queries from
-- authenticated clients. All access goes through the Travline Express API
-- using the service_role client.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS obj
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r','v')
      AND c.relname IN (
        'communication_history',
        'message_templates',
        'campaigns',
        'accommodation_buildings',
        'accommodation_floors',
        'accommodation_rooms',
        'accommodation_assignments',
        'bus_seat_categories',
        'departure_passengers',
        'departure_passenger_groups',
        'payment_links',
        'role_permissions'
      )
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON %s FROM authenticated', r.obj);
  END LOOP;
END
$$;
