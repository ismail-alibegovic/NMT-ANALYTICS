-- Restored from live Supabase migration history for project hacutwknfgufrqlgdiia.
-- Do not replay manually in production; this version is already recorded as applied.

begin;

-- 1) Enable RLS on tenant-scoped tables that were exposed through the Data API.
alter table public.accommodation_buildings enable row level security;
alter table public.accommodation_floors enable row level security;
alter table public.accommodation_rooms enable row level security;
alter table public.accommodation_assignments enable row level security;
alter table public.bus_seat_categories enable row level security;
alter table public.campaigns enable row level security;
alter table public.communication_history enable row level security;
alter table public.message_templates enable row level security;
alter table public.payment_links enable row level security;
alter table public.role_permissions enable row level security;

-- Remove any stale policies with our canonical names before recreating them.
drop policy if exists tenant_access_accommodation_buildings on public.accommodation_buildings;
drop policy if exists tenant_access_accommodation_floors on public.accommodation_floors;
drop policy if exists tenant_access_accommodation_rooms on public.accommodation_rooms;
drop policy if exists tenant_access_accommodation_assignments on public.accommodation_assignments;
drop policy if exists tenant_access_bus_seat_categories on public.bus_seat_categories;
drop policy if exists tenant_access_campaigns on public.campaigns;
drop policy if exists tenant_access_communication_history on public.communication_history;
drop policy if exists tenant_access_message_templates on public.message_templates;
drop policy if exists tenant_access_payment_links on public.payment_links;

create policy tenant_access_accommodation_buildings on public.accommodation_buildings
  for all to authenticated
  using (org_id = (select public.get_my_org_id()))
  with check (org_id = (select public.get_my_org_id()));
create policy tenant_access_accommodation_floors on public.accommodation_floors
  for all to authenticated
  using (org_id = (select public.get_my_org_id()))
  with check (org_id = (select public.get_my_org_id()));
create policy tenant_access_accommodation_rooms on public.accommodation_rooms
  for all to authenticated
  using (org_id = (select public.get_my_org_id()))
  with check (org_id = (select public.get_my_org_id()));
create policy tenant_access_accommodation_assignments on public.accommodation_assignments
  for all to authenticated
  using (org_id = (select public.get_my_org_id()))
  with check (org_id = (select public.get_my_org_id()));
create policy tenant_access_bus_seat_categories on public.bus_seat_categories
  for all to authenticated
  using (org_id = (select public.get_my_org_id()))
  with check (org_id = (select public.get_my_org_id()));
create policy tenant_access_campaigns on public.campaigns
  for all to authenticated
  using (org_id = (select public.get_my_org_id()))
  with check (org_id = (select public.get_my_org_id()));
create policy tenant_access_communication_history on public.communication_history
  for all to authenticated
  using (org_id = (select public.get_my_org_id()))
  with check (org_id = (select public.get_my_org_id()));
create policy tenant_access_message_templates on public.message_templates
  for all to authenticated
  using (org_id = (select public.get_my_org_id()))
  with check (org_id = (select public.get_my_org_id()));
create policy tenant_access_payment_links on public.payment_links
  for all to authenticated
  using (org_id = (select public.get_my_org_id()))
  with check (org_id = (select public.get_my_org_id()));

-- role_permissions is global authorization metadata: never expose it through client roles.
revoke all on table public.role_permissions from anon, authenticated;
revoke all on table public.role_permissions from public;

-- Explicitly deny anonymous access to all newly protected tenant tables.
revoke all on table public.accommodation_buildings from anon;
revoke all on table public.accommodation_floors from anon;
revoke all on table public.accommodation_rooms from anon;
revoke all on table public.accommodation_assignments from anon;
revoke all on table public.bus_seat_categories from anon;
revoke all on table public.campaigns from anon;
revoke all on table public.communication_history from anon;
revoke all on table public.message_templates from anon;
revoke all on table public.payment_links from anon;

-- Authenticated users may use these tables only through tenant RLS policies.
grant select, insert, update, delete on table public.accommodation_buildings to authenticated;
grant select, insert, update, delete on table public.accommodation_floors to authenticated;
grant select, insert, update, delete on table public.accommodation_rooms to authenticated;
grant select, insert, update, delete on table public.accommodation_assignments to authenticated;
grant select, insert, update, delete on table public.bus_seat_categories to authenticated;
grant select, insert, update, delete on table public.campaigns to authenticated;
grant select, insert, update, delete on table public.communication_history to authenticated;
grant select, insert, update, delete on table public.message_templates to authenticated;
grant select, insert, update, delete on table public.payment_links to authenticated;

-- 2) Remove legacy permissive INSERT policies that bypass tenant isolation.
drop policy if exists "Allow Insert for Authenticated" on public.reservations;
drop policy if exists "Allow Insert for Authenticated" on public.customers;
drop policy if exists "Allow Insert for Authenticated" on public.packages;

-- 3) Lock down global permission helper from client execution.
revoke execute on function public.has_permission(text,text,text) from public, anon, authenticated;
grant execute on function public.has_permission(text,text,text) to service_role;

-- 4) SECURITY DEFINER RPCs must not trust caller supplied org ids from browser roles.
-- Keep them available to the API's service-role client only.
revoke execute on function public.batch_update_seats_atomic(uuid,uuid,jsonb) from public, anon, authenticated;
revoke execute on function public.create_reservation_atomic(uuid,uuid,jsonb,integer,text) from public, anon, authenticated;
revoke execute on function public.get_dashboard_stats(uuid,timestamptz,timestamptz) from public, anon, authenticated;
revoke execute on function public.get_reports_summary(uuid,timestamptz,timestamptz) from public, anon, authenticated;
revoke execute on function public.get_revenue_analytics(uuid,timestamptz,timestamptz) from public, anon, authenticated;
revoke execute on function public.get_revenue_by_day(uuid,timestamptz,timestamptz) from public, anon, authenticated;
revoke execute on function public.get_total_revenue(uuid,timestamptz,timestamptz) from public, anon, authenticated;
revoke execute on function public.increment_booked(uuid,integer) from public, anon, authenticated;
revoke execute on function public.reserve_capacity_atomic(uuid,uuid,integer) from public, anon, authenticated;

grant execute on function public.batch_update_seats_atomic(uuid,uuid,jsonb) to service_role;
grant execute on function public.create_reservation_atomic(uuid,uuid,jsonb,integer,text) to service_role;
grant execute on function public.get_dashboard_stats(uuid,timestamptz,timestamptz) to service_role;
grant execute on function public.get_reports_summary(uuid,timestamptz,timestamptz) to service_role;
grant execute on function public.get_revenue_analytics(uuid,timestamptz,timestamptz) to service_role;
grant execute on function public.get_revenue_by_day(uuid,timestamptz,timestamptz) to service_role;
grant execute on function public.get_total_revenue(uuid,timestamptz,timestamptz) to service_role;
grant execute on function public.increment_booked(uuid,integer) to service_role;
grant execute on function public.reserve_capacity_atomic(uuid,uuid,integer) to service_role;

commit;
