-- Read-only overview: balances, filtered totals and page share one MVCC snapshot.
CREATE FUNCTION public.supplier_payables_overview(p_org_id uuid,p_supplier_id uuid,p_status text,p_offset integer,p_limit integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb; zone text; today date;
BEGIN
  IF p_org_id IS NULL OR p_status IS NULL OR p_status NOT IN ('all','open','overdue','paid','cancelled')
     OR p_offset IS NULL OR p_offset<0 OR p_limit IS NULL OR p_limit<1 OR p_limit>100 THEN
    RAISE EXCEPTION 'PAYABLE_FILTER_INVALID';
  END IF;
  SELECT coalesce((SELECT name FROM pg_catalog.pg_timezone_names WHERE name=o.timezone),'Europe/Sarajevo') INTO zone
    FROM public.organizations o WHERE o.id=p_org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYABLE_SOURCE_NOT_FOUND'; END IF;
  today:=(statement_timestamp() AT TIME ZONE zone)::date;
  WITH balances AS MATERIALIZED (
    SELECT p.id,p.org_id,p.departure_id,p.supplier_id,p.supplier_name,p.label,p.amount,p.currency,p.due_date,p.cancelled_at,
      coalesce((SELECT sum(e.amount) FROM public.supplier_payable_entries e WHERE e.org_id=p_org_id AND e.payable_id=p.id),0) paid
    FROM public.supplier_payables p WHERE p.org_id=p_org_id
  ), classified AS MATERIALIZED (
    SELECT b.*,CASE WHEN cancelled_at IS NOT NULL THEN 0 ELSE amount-paid END remaining,
      CASE WHEN cancelled_at IS NOT NULL THEN 'cancelled' WHEN paid=amount THEN 'paid' WHEN paid>0 THEN 'partial' ELSE 'unpaid' END status
    FROM balances b
  ), filtered AS MATERIALIZED (
    SELECT * FROM classified b WHERE (p_supplier_id IS NULL OR b.supplier_id=p_supplier_id)
      AND (p_status='all' OR (p_status='open' AND b.remaining>0) OR (p_status='overdue' AND b.remaining>0 AND b.due_date<today)
        OR (p_status='paid' AND b.status='paid') OR (p_status='cancelled' AND b.status='cancelled'))
  ), page AS (
    SELECT * FROM filtered ORDER BY due_date,id OFFSET p_offset LIMIT p_limit
  ), totals AS (
    SELECT currency,count(*) count,sum(remaining) outstanding,
      coalesce(sum(remaining) FILTER (WHERE due_date<today),0) overdue,
      coalesce(sum(remaining) FILTER (WHERE due_date=today),0) due_today
    FROM filtered GROUP BY currency
  )
  SELECT jsonb_build_object('orgId',p_org_id,'asOfDate',today,'timezone',zone,
    'totalCount',(SELECT count(*) FROM filtered),
    'invalidLedger',EXISTS(SELECT FROM balances WHERE paid<0 OR paid>amount),
    'currencies',coalesce((SELECT jsonb_agg(jsonb_build_object('currency',currency,'count',count,'outstanding',outstanding,'overdue',overdue,'dueToday',due_today) ORDER BY currency) FROM totals),'[]'::jsonb),
    'suppliers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',supplier_id,'name',supplier_name) ORDER BY supplier_name,supplier_id)
      FROM (SELECT DISTINCT ON(supplier_id) supplier_id,supplier_name FROM balances ORDER BY supplier_id,id DESC) s),'[]'::jsonb),
    'payables',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'departureId',departure_id,'supplierId',supplier_id,'supplierName',supplier_name,
      'label',label,'amount',amount,'currency',currency,'dueDate',due_date,'paid',paid,'remaining',remaining,'status',status,
      'overdue',remaining>0 AND due_date<today) ORDER BY due_date,id) FROM page),'[]'::jsonb)) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.supplier_payables_overview(uuid,uuid,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_payables_overview(uuid,uuid,text,integer,integer) TO service_role;
NOTIFY pgrst,'reload schema';
