BEGIN;
DO $$
DECLARE org uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); product uuid:=gen_random_uuid(); departure uuid:=gen_random_uuid(); supplier uuid:=gen_random_uuid();
 cost uuid; payable uuid; payment uuid; result jsonb; row_data jsonb; today date; i int;
BEGIN
 INSERT INTO public.organizations(id,name,slug,timezone) VALUES(org,'Overview replay',org::text,'Pacific/Kiritimati');
 INSERT INTO auth.users(id,email) VALUES(actor,'overview-replay@test.test');
 INSERT INTO public.profiles(id,org_id,role,email) VALUES(actor,org,'director','overview-replay@test.test') ON CONFLICT(id) DO UPDATE SET org_id=EXCLUDED.org_id,role=EXCLUDED.role;
 INSERT INTO public.packages(id,org_id,name,destination,base_price,currency) VALUES(product,org,'Overview package','Mostar',100,'BAM');
 INSERT INTO public.departures(id,org_id,package_id,depart_at,return_at,capacity,status) VALUES(departure,org,product,'2027-07-10','2027-07-11',8,'active');
 INSERT INTO public.suppliers(id,org_id,name,category) VALUES(supplier,org,'Overview supplier','transport');
 result:=public.supplier_payables_overview(org,NULL,'all',0,25);
 today:=(statement_timestamp() AT TIME ZONE 'Pacific/Kiritimati')::date;
 IF result->>'asOfDate'<>today::text OR result->>'timezone'<>'Pacific/Kiritimati' OR (result->>'totalCount')::int<>0 THEN RAISE EXCEPTION 'Incorrect calendar boundary'; END IF;
 -- BAM overdue partial (reversal restores debt), EUR due today, BAM future,
 -- EUR fully paid in the past, and a cancelled past obligation.
 FOR i IN 1..5 LOOP
  cost:=gen_random_uuid();
  INSERT INTO public.departure_cost_items(id,org_id,departure_id,supplier_id,category,label,quantity,unit_cost,currency)
   VALUES(cost,org,departure,supplier,'transport','Overview cost '||i,1,100,CASE WHEN i IN(2,4) THEN 'EUR' ELSE 'BAM' END);
  result:=public.issue_supplier_payable(org,actor,departure,cost,CASE WHEN i=2 THEN today WHEN i=3 THEN today+1 ELSE today-1 END,gen_random_uuid(),repeat('a',64));
  payable:=(result->'record'->>'id')::uuid;
  IF i IN(1,4) THEN
   result:=public.record_supplier_payable_entry(org,actor,payable,gen_random_uuid(),repeat('b',64),jsonb_build_object('currency',CASE WHEN i=4 THEN 'EUR' ELSE 'BAM' END,'kind','payment','amount',CASE WHEN i=4 THEN 100 ELSE 60 END,'paymentDate',today));
   payment:=(result->'record'->>'id')::uuid;
  END IF;
  IF i=1 THEN
   PERFORM public.record_supplier_payable_entry(org,actor,payable,gen_random_uuid(),repeat('c',64),jsonb_build_object('currency','BAM','kind','reversal','reversesId',payment,'paymentDate',today,'note','Correction'));
   PERFORM public.record_supplier_payable_entry(org,actor,payable,gen_random_uuid(),repeat('d',64),jsonb_build_object('currency','BAM','kind','payment','amount',20,'paymentDate',today));
  END IF;
  IF i=5 THEN PERFORM public.cancel_supplier_payable(org,actor,payable); END IF;
 END LOOP;
 result:=public.supplier_payables_overview(org,NULL,'open',0,1);
 IF (result->>'totalCount')::int<>3 OR jsonb_array_length(result->'payables')<>1 OR jsonb_array_length(result->'currencies')<>2 THEN RAISE EXCEPTION 'Pagination or currency grouping failed'; END IF;
 SELECT x INTO row_data FROM jsonb_array_elements(result->'currencies') x WHERE x->>'currency'='BAM';
 IF (row_data->>'outstanding')::numeric<>180 OR (row_data->>'overdue')::numeric<>80 OR (row_data->>'dueToday')::numeric<>0 THEN RAISE EXCEPTION 'BAM exposure incorrect'; END IF;
 SELECT x INTO row_data FROM jsonb_array_elements(result->'currencies') x WHERE x->>'currency'='EUR';
 IF (row_data->>'outstanding')::numeric<>100 OR (row_data->>'overdue')::numeric<>0 OR (row_data->>'dueToday')::numeric<>100 THEN RAISE EXCEPTION 'EUR exposure incorrect'; END IF;
 IF public.supplier_payables_overview(org,NULL,'open',1,1)->'payables'->0->>'id'=result->'payables'->0->>'id' THEN RAISE EXCEPTION 'Unstable page order'; END IF;
 IF (public.supplier_payables_overview(org,supplier,'overdue',0,25)->>'totalCount')::int<>1
 OR (public.supplier_payables_overview(org,supplier,'paid',0,25)->>'totalCount')::int<>1
 OR (public.supplier_payables_overview(org,supplier,'cancelled',0,25)->>'totalCount')::int<>1
 OR (public.supplier_payables_overview(org,supplier,'all',0,25)->>'totalCount')::int<>5
 OR (public.supplier_payables_overview(org,gen_random_uuid(),'all',0,25)->>'totalCount')::int<>0 THEN RAISE EXCEPTION 'Status/supplier filters incorrect'; END IF;
 result:=public.supplier_payables_overview(org,NULL,'all',900,25);
 IF (result->>'totalCount')::int<>5 OR jsonb_array_length(result->'payables')<>0 THEN RAISE EXCEPTION 'Empty page lost totals'; END IF;
 UPDATE public.organizations SET timezone='invalid timezone' WHERE id=org;
 IF public.supplier_payables_overview(org,NULL,'all',0,25)->>'timezone'<>'Europe/Sarajevo' THEN RAISE EXCEPTION 'Invalid timezone fallback failed'; END IF;
 IF has_function_privilege('anon','public.supplier_payables_overview(uuid,uuid,text,integer,integer)','execute')
 OR has_function_privilege('authenticated','public.supplier_payables_overview(uuid,uuid,text,integer,integer)','execute') THEN RAISE EXCEPTION 'Overview RPC exposed'; END IF;
 RAISE NOTICE 'Supplier payable overview integrity PASS';
END; $$;
ROLLBACK;
