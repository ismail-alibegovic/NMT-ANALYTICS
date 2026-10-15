BEGIN;
CREATE FUNCTION pg_temp.expect_payable_error(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN IF SQLERRM=expected THEN RETURN; END IF; RAISE; END;
  RAISE EXCEPTION 'Expected %',expected;
END; $$;
DO $$
DECLARE
  org uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid();
  product uuid:=gen_random_uuid(); departure uuid:=gen_random_uuid(); supplier uuid:=gen_random_uuid(); cost uuid:=gen_random_uuid();
  issue_request uuid:=gen_random_uuid(); pay_request uuid:=gen_random_uuid(); p uuid; p2 uuid; a uuid; b uuid; retry jsonb; result jsonb; ledger jsonb;
BEGIN
  INSERT INTO public.organizations(id,name,slug) VALUES(org,'Payable replay',org::text),(other_org,'Other org',other_org::text);
  INSERT INTO auth.users(id,email) VALUES(actor,'payable-replay@test.test');
  INSERT INTO public.profiles(id,org_id,role,email) VALUES(actor,org,'director','payable-replay@test.test') ON CONFLICT(id) DO UPDATE SET org_id=EXCLUDED.org_id,role=EXCLUDED.role;
  INSERT INTO public.packages(id,org_id,name,destination,base_price,currency) VALUES(product,org,'Replay package','Mostar',180,'BAM');
  INSERT INTO public.departures(id,org_id,package_id,depart_at,return_at,capacity,status) VALUES(departure,org,product,'2027-07-10','2027-07-11',8,'active');
  INSERT INTO public.suppliers(id,org_id,name,category) VALUES(supplier,org,'Replay supplier','transport');
  INSERT INTO public.departure_cost_items(id,org_id,departure_id,supplier_id,category,label,quantity,unit_cost,currency)
    VALUES(cost,org,departure,supplier,'transport','Approved bus cost',2,50,'BAM');
  result:=public.issue_supplier_payable(org,actor,departure,cost,'2027-07-01',issue_request,repeat('a',64));
  p:=(result->'record'->>'id')::uuid;
  IF (result->'record'->>'amount')::numeric<>100 THEN RAISE EXCEPTION 'Wrong issued total'; END IF;
  retry:=public.issue_supplier_payable(org,actor,departure,cost,'2027-07-01',issue_request,repeat('a',64));
  IF (retry->>'created')::boolean OR retry->'record'->>'id'<>p::text THEN RAISE EXCEPTION 'Duplicate issue'; END IF;
  PERFORM pg_temp.expect_payable_error(format('SELECT public.issue_supplier_payable(%L,%L,%L,%L,%L,%L,%L)',org,actor,departure,cost,'2027-07-01',gen_random_uuid(),repeat('b',64)),'PAYABLE_ALREADY_ISSUED');
  PERFORM pg_temp.expect_payable_error(format('SELECT public.issue_supplier_payable(%L,%L,%L,%L,%L,%L,%L)',org,actor,departure,cost,'2027-07-02',gen_random_uuid(),repeat('b',64)),'PAYABLE_ALREADY_ISSUED');
  PERFORM pg_temp.expect_payable_error(format('SELECT public.issue_supplier_payable(%L,%L,%L,%L,%L,%L,%L)',other_org,actor,departure,cost,'2027-07-01',gen_random_uuid(),repeat('b',64)),'PAYABLE_ACTOR_INVALID');
  PERFORM pg_temp.expect_payable_error(format('SELECT public.issue_supplier_payable(%L,%L,%L,%L,%L,%L,%L)',org,actor,gen_random_uuid(),cost,'2027-07-01',gen_random_uuid(),repeat('b',64)),'PAYABLE_SOURCE_NOT_FOUND');
  PERFORM pg_temp.expect_payable_error(format('UPDATE public.departure_cost_items SET unit_cost=70 WHERE id=%L',cost),'PAYABLE_COST_LOCKED');
  result:=public.record_supplier_payable_entry(org,actor,p,pay_request,repeat('c',64),'{"currency":"BAM","kind":"payment","amount":60,"paymentDate":"2026-10-15"}');
  a:=(result->'record'->>'id')::uuid;
  retry:=public.record_supplier_payable_entry(org,actor,p,pay_request,repeat('c',64),'{"currency":"BAM","kind":"payment","amount":60,"paymentDate":"2026-10-15"}');
  IF (retry->>'created')::boolean OR retry->'record'->>'id'<>a::text THEN RAISE EXCEPTION 'Duplicate payment'; END IF;
  PERFORM pg_temp.expect_payable_error(format('SELECT public.record_supplier_payable_entry(%L,%L,%L,%L,%L,%L::jsonb)',org,actor,p,pay_request,repeat('d',64),'{"currency":"BAM","kind":"payment","amount":61,"paymentDate":"2026-10-15"}'),'PAYABLE_REQUEST_CONFLICT');
  PERFORM pg_temp.expect_payable_error(format('SELECT public.record_supplier_payable_entry(%L,%L,%L,%L,%L,%L::jsonb)',org,actor,p,gen_random_uuid(),repeat('d',64),'{"currency":"BAM","kind":"payment","amount":40.01,"paymentDate":"2026-10-15"}'),'PAYABLE_BALANCE_CONFLICT');
  PERFORM pg_temp.expect_payable_error(format('SELECT public.record_supplier_payable_entry(%L,%L,%L,%L,%L,%L::jsonb)',org,actor,p,gen_random_uuid(),repeat('d',64),'{"currency":"BAM","kind":"payment","amount":0.001,"paymentDate":"2026-10-15"}'),'PAYABLE_SOURCE_INVALID');
  result:=public.record_supplier_payable_entry(org,actor,p,gen_random_uuid(),repeat('d',64),'{"currency":"BAM","kind":"payment","amount":40,"paymentDate":"2026-10-15"}');
  b:=(result->'record'->>'id')::uuid;
  PERFORM pg_temp.expect_payable_error(format('SELECT public.cancel_supplier_payable(%L,%L,%L)',org,actor,p),'PAYABLE_HAS_PAYMENTS');
  PERFORM pg_temp.expect_payable_error(format('UPDATE public.supplier_payable_entries SET amount=1 WHERE id=%L',a),'PAYABLE_ENTRY_IMMUTABLE');
  PERFORM pg_temp.expect_payable_error(format('DELETE FROM public.supplier_payable_entries WHERE id=%L',a),'PAYABLE_ENTRY_IMMUTABLE');
  PERFORM public.record_supplier_payable_entry(org,actor,p,gen_random_uuid(),repeat('e',64),jsonb_build_object('currency','BAM','kind','reversal','reversesId',a,'paymentDate','2026-10-15','note','Correction'));
  PERFORM pg_temp.expect_payable_error(format('SELECT public.record_supplier_payable_entry(%L,%L,%L,%L,%L,%L::jsonb)',org,actor,p,gen_random_uuid(),repeat('e',64),jsonb_build_object('currency','BAM','kind','reversal','reversesId',a,'paymentDate','2026-10-15','note','Again')),'PAYABLE_ALREADY_REVERSED');
  PERFORM public.record_supplier_payable_entry(org,actor,p,gen_random_uuid(),repeat('f',64),jsonb_build_object('currency','BAM','kind','reversal','reversesId',b,'paymentDate','2026-10-15','note','Correction'));
  PERFORM public.cancel_supplier_payable(org,actor,p);
  PERFORM public.cancel_supplier_payable(org,actor,p);
  PERFORM pg_temp.expect_payable_error(format('SELECT public.record_supplier_payable_entry(%L,%L,%L,%L,%L,%L::jsonb)',org,actor,p,gen_random_uuid(),repeat('a',64),'{"currency":"BAM","kind":"payment","amount":1,"paymentDate":"2026-10-15"}'),'PAYABLE_CANCELLED');
  UPDATE public.departure_cost_items SET unit_cost=70 WHERE id=cost;
  result:=public.issue_supplier_payable(org,actor,departure,cost,'2027-07-01',gen_random_uuid(),repeat('b',64));
  p2:=(result->'record'->>'id')::uuid;
  retry:=public.issue_supplier_payable(org,actor,departure,cost,'2027-07-01',issue_request,repeat('a',64));
  IF retry->'record'->>'id'<>p::text OR (retry->'record'->>'amount')::numeric<>100 THEN RAISE EXCEPTION 'Cancelled request lost identity'; END IF;
  IF (SELECT count(*) FROM public.supplier_payable_entries WHERE payable_id=p AND org_id=org)<>4 THEN RAISE EXCEPTION 'Failure/reversal corrupted history'; END IF;
  -- A ledger longer than PostgREST's usual embedded row limit must stay complete.
  INSERT INTO public.supplier_payable_entries(org_id,payable_id,request_id,fingerprint,kind,amount,payment_date,actor_id)
    SELECT org,p2,gen_random_uuid(),repeat('c',64),'payment',0.01,'2026-10-15',actor FROM generate_series(1,1001);
  ledger:=public.list_supplier_payables(org,departure);
  IF (SELECT jsonb_array_length(x->'entries') FROM jsonb_array_elements(ledger) x WHERE x->>'id'=p2::text)<>1001
     OR (SELECT sum(amount) FROM public.supplier_payable_entries WHERE payable_id=p2 AND org_id=org)<>10.01 THEN RAISE EXCEPTION 'Long ledger truncated'; END IF;
  IF has_table_privilege('authenticated','public.supplier_payables','insert')
     OR has_table_privilege('anon','public.supplier_payable_entries','select')
     OR has_function_privilege('authenticated','public.record_supplier_payable_entry(uuid,uuid,uuid,uuid,text,jsonb)','execute')
     OR has_function_privilege('anon','public.list_supplier_payables(uuid,uuid)','execute') THEN RAISE EXCEPTION 'Supplier ledger exposed'; END IF;
  RAISE NOTICE 'Supplier payable integrity PASS';
END; $$;
ROLLBACK;
