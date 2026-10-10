BEGIN;
DO $$
DECLARE
  tenant uuid := gen_random_uuid();
  other_tenant uuid := gen_random_uuid();
  product uuid := gen_random_uuid();
  trip uuid := gen_random_uuid();
  item uuid := gen_random_uuid();
  event_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO organizations(id, name, slug) VALUES (tenant, 'Atomicity test', tenant::text), (other_tenant, 'Other tenant', other_tenant::text);
  INSERT INTO packages(id, org_id, name, destination, base_price) VALUES(product, tenant, 'Test', 'Test', 100);
  INSERT INTO departures(id, org_id, package_id, depart_at, return_at, capacity) VALUES(trip, tenant, product, now(), now() + interval '1 day', 10);
  INSERT INTO departure_cost_items(id, org_id, departure_id, category, label, unit_cost) VALUES(item, tenant, trip, 'hotel', 'Test', 100);
  INSERT INTO supplier_confirmation_events(id, org_id, departure_id, cost_item_id, status) VALUES(event_id, tenant, trip, item, 'requested');
  IF (SELECT confirmation_status FROM departure_cost_items WHERE id = item) <> 'requested' THEN
    RAISE EXCEPTION 'Event did not update status';
  END IF;
  BEGIN
    INSERT INTO supplier_confirmation_events(id, org_id, departure_id, cost_item_id, status) VALUES(event_id, tenant, trip, item, 'confirmed');
    RAISE EXCEPTION 'Duplicate event unexpectedly accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF (SELECT confirmation_status FROM departure_cost_items WHERE id = item) <> 'requested' THEN
    RAISE EXCEPTION 'Failed insert changed status';
  END IF;
  BEGIN
    INSERT INTO supplier_confirmation_events(org_id, departure_id, cost_item_id, status) VALUES(other_tenant, trip, item, 'confirmed');
    RAISE EXCEPTION 'Cross-tenant event unexpectedly accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO supplier_confirmation_events(org_id, departure_id, cost_item_id, status) VALUES(tenant, gen_random_uuid(), item, 'confirmed');
    RAISE EXCEPTION 'Wrong departure unexpectedly accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  IF (SELECT confirmation_status FROM departure_cost_items WHERE id = item) <> 'requested' THEN
    RAISE EXCEPTION 'Rejected event changed status';
  END IF;
END $$;
ROLLBACK;
