-- Restored from live Supabase migration history for project hacutwknfgufrqlgdiia.
-- Do not replay manually in production; this version is already recorded as applied.

begin;
-- These tables are API/service-role only after restrict_api_only_tables.
-- Remove all client policies to avoid duplicate/per-row RLS overhead and accidental future exposure.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname='public'
      and tablename in (
        'accommodation_buildings','accommodation_floors','accommodation_rooms','accommodation_assignments',
        'bus_seat_categories','campaigns','communication_history','message_templates','payment_links','role_permissions'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;
commit;
