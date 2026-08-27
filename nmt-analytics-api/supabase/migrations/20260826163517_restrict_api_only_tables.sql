-- Restored from live Supabase migration history for project hacutwknfgufrqlgdiia.
-- Do not replay manually in production; this version is already recorded as applied.

begin;
-- Travline admin uses the Express API/service-role for these operational tables.
-- Remove direct browser/Data API access entirely; service_role retains access.
revoke all on table public.accommodation_buildings from authenticated;
revoke all on table public.accommodation_floors from authenticated;
revoke all on table public.accommodation_rooms from authenticated;
revoke all on table public.accommodation_assignments from authenticated;
revoke all on table public.bus_seat_categories from authenticated;
revoke all on table public.campaigns from authenticated;
revoke all on table public.communication_history from authenticated;
revoke all on table public.message_templates from authenticated;
revoke all on table public.payment_links from authenticated;

-- Explicitly retain API service-role access.
grant all on table public.accommodation_buildings to service_role;
grant all on table public.accommodation_floors to service_role;
grant all on table public.accommodation_rooms to service_role;
grant all on table public.accommodation_assignments to service_role;
grant all on table public.bus_seat_categories to service_role;
grant all on table public.campaigns to service_role;
grant all on table public.communication_history to service_role;
grant all on table public.message_templates to service_role;
grant all on table public.payment_links to service_role;
grant all on table public.role_permissions to service_role;
commit;
