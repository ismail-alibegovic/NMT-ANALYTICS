-- Restored from live Supabase migration history for project hacutwknfgufrqlgdiia.
-- Do not replay manually in production; this version is already recorded as applied.

begin;

-- Travline's browser talks to the Express API; core tables should never be anonymously reachable.
revoke all on table public.customers from anon;
revoke all on table public.packages from anon;
revoke all on table public.departures from anon;
revoke all on table public.reservations from anon;
revoke all on table public.transactions from anon;

-- Replace years of overlapping permissive policies with one canonical tenant policy per core table.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname='public' and tablename in ('customers','packages','departures','reservations','transactions')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

create policy tenant_customers on public.customers
  for all to authenticated
  using (org_id = (select public.get_my_org_id()))
  with check (org_id = (select public.get_my_org_id()));
create policy tenant_packages on public.packages
  for all to authenticated
  using (org_id = (select public.get_my_org_id()))
  with check (org_id = (select public.get_my_org_id()));
create policy tenant_departures on public.departures
  for all to authenticated
  using (org_id = (select public.get_my_org_id()))
  with check (org_id = (select public.get_my_org_id()));
create policy tenant_reservations on public.reservations
  for all to authenticated
  using (org_id = (select public.get_my_org_id()))
  with check (org_id = (select public.get_my_org_id()));
create policy tenant_transactions on public.transactions
  for all to authenticated
  using (org_id = (select public.get_my_org_id()))
  with check (org_id = (select public.get_my_org_id()));

-- Service role remains the server-side path and bypasses RLS, but keep grants explicit.
grant all on table public.customers, public.packages, public.departures, public.reservations, public.transactions to service_role;

commit;
