-- Disposable migration replay only; every synthetic record is rolled back.
BEGIN;
CREATE FUNCTION pg_temp.expect_quote_error(statement text, expected_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = expected_message THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'Expected % for %', expected_message, statement;
END;
$$;
DO $$
DECLARE
  org uuid := gen_random_uuid();
  other_org uuid := gen_random_uuid();
  q uuid := gen_random_uuid();
  empty_q uuid := gen_random_uuid();
  mixed_q uuid := gen_random_uuid();
  draft_q uuid := gen_random_uuid();
  item uuid := gen_random_uuid();
  draft_item uuid := gen_random_uuid();
  saved public.quotations;
BEGIN
  INSERT INTO public.organizations(id,name,slug)
  VALUES(org,'Quote replay','quote-replay-'||org), (other_org,'Other quote org','quote-other-'||other_org);
  INSERT INTO public.quotations(id,org_id,title,reference,currency)
  VALUES(q,org,'Approved quotation','QTN-guard-1','EUR'),
        (empty_q,org,'Empty','QTN-guard-2','EUR'),
        (mixed_q,org,'Mixed','QTN-guard-3','EUR'),
        (draft_q,org,'Draft','QTN-guard-4','EUR');
  INSERT INTO public.quotation_items(id,org_id,quotation_id,title,quantity,net_unit_price,markup_percent,currency)
  VALUES(item,org,q,'Persisted fractional price',1.25,10.01,10,'EUR'),
        (gen_random_uuid(),org,mixed_q,'EUR',1,10,0,'EUR'),
        (gen_random_uuid(),org,mixed_q,'BAM',1,10,0,'BAM'),
        (draft_item,org,draft_q,'Draft item',1,5,0,'EUR');
  PERFORM pg_temp.expect_quote_error(format('UPDATE public.quotations SET status=''accepted'' WHERE id=%L',empty_q),'QUOTATION_INVALID_PRICING');
  PERFORM pg_temp.expect_quote_error(format('UPDATE public.quotations SET status=''accepted'' WHERE id=%L',mixed_q),'QUOTATION_INVALID_PRICING');
  IF (SELECT status FROM public.quotations WHERE id=mixed_q) <> 'draft' THEN RAISE EXCEPTION 'Invalid acceptance changed status'; END IF;
  UPDATE public.quotations SET status='accepted',sell_total=999 WHERE id=q;
  SELECT * INTO saved FROM public.quotations WHERE id=q;
  IF saved.net_total <> 12.51 OR saved.sell_total <> 13.76 OR saved.margin_total <> 1.25
     OR saved.accepted_at IS NULL OR NOT saved.commercial_locked THEN
    RAISE EXCEPTION 'Acceptance did not derive persisted prices';
  END IF;
  PERFORM pg_temp.expect_quote_error(format('UPDATE public.quotation_items SET net_unit_price=999 WHERE id=%L',item),'QUOTATION_LOCKED');
  PERFORM pg_temp.expect_quote_error(format('DELETE FROM public.quotation_items WHERE id=%L',item),'QUOTATION_LOCKED');
  PERFORM pg_temp.expect_quote_error(format('INSERT INTO public.quotation_items(org_id,quotation_id,title) VALUES(%L,%L,''Added'')',org,q),'QUOTATION_LOCKED');
  PERFORM pg_temp.expect_quote_error(format('UPDATE public.quotation_items SET quotation_id=%L WHERE id=%L',q,draft_item),'QUOTATION_ITEM_IDENTITY_LOCKED');
  PERFORM pg_temp.expect_quote_error(format('UPDATE public.quotations SET title=''Changed'' WHERE id=%L',q),'QUOTATION_LOCKED');
  PERFORM pg_temp.expect_quote_error(format('UPDATE public.quotations SET sell_total=999 WHERE id=%L',q),'QUOTATION_LOCKED');
  PERFORM pg_temp.expect_quote_error(format('UPDATE public.quotations SET status=''draft'',commercial_locked=false,accepted_at=NULL WHERE id=%L',q),'QUOTATION_LOCKED');
  PERFORM pg_temp.expect_quote_error(format('DELETE FROM public.quotations WHERE id=%L',q),'QUOTATION_LOCKED');
  UPDATE public.quotations SET internal_notes='Operations note',status='rejected' WHERE id=q;
  IF (SELECT accepted_at FROM public.quotations WHERE id=q) IS DISTINCT FROM saved.accepted_at THEN RAISE EXCEPTION 'Approval timestamp changed'; END IF;
  PERFORM pg_temp.expect_quote_error(format('DELETE FROM public.quotation_items WHERE id=%L',item),'QUOTATION_LOCKED');
  PERFORM pg_temp.expect_quote_error(format('UPDATE public.quotations SET status=''sent'' WHERE id=%L',q),'QUOTATION_LOCKED');
  -- Existing draft CRUD and draft cascading deletion continue to work.
  UPDATE public.quotation_items SET net_unit_price=7 WHERE id=draft_item;
  DELETE FROM public.quotations WHERE id=draft_q;
  IF EXISTS(SELECT FROM public.quotation_items WHERE id=draft_item) THEN RAISE EXCEPTION 'Draft cascade failed'; END IF;

  IF has_function_privilege('authenticated','public.guard_accepted_quotation()','EXECUTE')
     OR has_function_privilege('anon','public.guard_accepted_quotation_item()','EXECUTE') THEN
    RAISE EXCEPTION 'Approval trigger functions publicly executable';
  END IF;
  IF EXISTS(SELECT FROM pg_proc WHERE oid IN ('public.guard_accepted_quotation()'::regprocedure,'public.guard_accepted_quotation_item()'::regprocedure) AND prosecdef) THEN
    RAISE EXCEPTION 'Approval guards must use SECURITY INVOKER';
  END IF;
  RAISE NOTICE 'Accepted quotation guards PASS';
END;
$$;
ROLLBACK;
