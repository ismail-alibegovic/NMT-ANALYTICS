-- ⚠️ RESTORED FROM LIVE: This migration was applied to production as 20260826163545.
-- It explicitly DROPS the RLS policies from API-only operational tables.
--
-- After 20260826163517 revoked authenticated access from these tables,
-- the per-table _tenant policies became pointless clutter.
-- The Supabase Security Advisor flags tables with RLS enabled but zero
-- policies as a warning — this is deliberate and correct: the tables are
-- backend-only and accessed through the service_role client exclusively.
--
-- Tables where policies ARE dropped (API-only, backend-access):
--   communication_history, message_templates, campaigns,
--   accommodation_buildings, bus_seat_categories,
--   departure_passengers, departure_passenger_groups
--
-- Tables where policies are NOT dropped (client-accessible):
--   reservations, departures, customers, profiles, etc.
--   (These keep their tenant RLS policies — see 20260826163605.)

DROP POLICY IF EXISTS communication_history_tenant ON public.communication_history;
DROP POLICY IF EXISTS message_templates_tenant ON public.message_templates;
DROP POLICY IF EXISTS campaigns_tenant ON public.campaigns;
DROP POLICY IF EXISTS accommodation_buildings_tenant ON public.accommodation_buildings;
DROP POLICY IF EXISTS bus_seat_categories_tenant ON public.bus_seat_categories;
DROP POLICY IF EXISTS departure_passengers_tenant ON public.departure_passengers;
DROP POLICY IF EXISTS departure_passenger_groups_tenant ON public.departure_passenger_groups;
