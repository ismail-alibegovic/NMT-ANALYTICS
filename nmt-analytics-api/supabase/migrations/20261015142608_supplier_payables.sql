-- M20.1: issued supplier obligations are separate from cost estimates/customer payments.
CREATE TABLE public.supplier_payables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  departure_id uuid NOT NULL,
  cost_item_id uuid NOT NULL,
  request_id uuid NOT NULL,
  fingerprint text NOT NULL CHECK(fingerprint ~ '^[0-9a-f]{64}$'),
  supplier_id uuid NOT NULL,
  supplier_name text NOT NULL,
  label text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0 AND amount <> 'NaN'::numeric),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  due_date date NOT NULL CHECK (isfinite(due_date)),
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancelled_by uuid,
  CHECK ((cancelled_at IS NULL) = (cancelled_by IS NULL)),
  UNIQUE(id,org_id),
  UNIQUE(org_id,request_id),
  CONSTRAINT supplier_payables_cost_org_fk FOREIGN KEY(cost_item_id,org_id)
    REFERENCES public.departure_cost_items(id,org_id) ON DELETE RESTRICT,
  CONSTRAINT supplier_payables_departure_org_fk FOREIGN KEY(departure_id,org_id)
    REFERENCES public.departures(id,org_id) ON DELETE RESTRICT,
  CONSTRAINT supplier_payables_supplier_org_fk FOREIGN KEY(supplier_id,org_id)
    REFERENCES public.suppliers(id,org_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX supplier_payables_active_cost ON public.supplier_payables(org_id,cost_item_id) WHERE cancelled_at IS NULL;
CREATE INDEX supplier_payables_cost_history ON public.supplier_payables(org_id,cost_item_id);
CREATE INDEX supplier_payables_departure ON public.supplier_payables(org_id,departure_id,created_at,id);
CREATE INDEX supplier_payables_supplier ON public.supplier_payables(org_id,supplier_id,due_date);

CREATE TABLE public.supplier_payable_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  payable_id uuid NOT NULL,
  request_id uuid NOT NULL,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  kind text NOT NULL CHECK(kind IN ('payment','reversal')),
  amount numeric(14,2) NOT NULL CHECK(amount <> 0 AND amount <> 'NaN'::numeric),
  payment_date date NOT NULL CHECK(isfinite(payment_date)),
  reference text CHECK(length(reference)<=200),
  note text CHECK(length(note)<=1000),
  reverses_id uuid,
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,request_id),
  UNIQUE(id,org_id,payable_id),
  UNIQUE(reverses_id),
  CHECK ((kind='payment' AND amount>0 AND reverses_id IS NULL) OR (kind='reversal' AND amount<0 AND reverses_id IS NOT NULL)),
  CONSTRAINT supplier_payable_entries_payable_org_fk FOREIGN KEY(payable_id,org_id)
    REFERENCES public.supplier_payables(id,org_id) ON DELETE RESTRICT,
  CONSTRAINT supplier_payable_entries_reversal_org_fk FOREIGN KEY(reverses_id,org_id,payable_id)
    REFERENCES public.supplier_payable_entries(id,org_id,payable_id) ON DELETE RESTRICT
);
CREATE INDEX supplier_payable_entries_payable ON public.supplier_payable_entries(org_id,payable_id,created_at,id);

ALTER TABLE public.supplier_payables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payable_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_payables_org ON public.supplier_payables FOR ALL TO authenticated
  USING(org_id=(SELECT public.get_my_org_id())) WITH CHECK(org_id=(SELECT public.get_my_org_id()));
CREATE POLICY supplier_payable_entries_org ON public.supplier_payable_entries FOR ALL TO authenticated
  USING(org_id=(SELECT public.get_my_org_id())) WITH CHECK(org_id=(SELECT public.get_my_org_id()));
REVOKE ALL ON public.supplier_payables,public.supplier_payable_entries FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.supplier_payables TO service_role;
GRANT SELECT,INSERT ON public.supplier_payable_entries TO service_role;

CREATE FUNCTION public.guard_supplier_payable()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.departure_cost_items; supplier text;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'PAYABLE_IMMUTABLE'; END IF;
  IF TG_OP='INSERT' THEN
    SELECT * INTO c FROM public.departure_cost_items WHERE id=NEW.cost_item_id AND org_id=NEW.org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PAYABLE_SOURCE_NOT_FOUND'; END IF;
    SELECT name INTO supplier FROM public.suppliers WHERE id=c.supplier_id AND org_id=c.org_id;
    IF supplier IS NULL OR NEW.supplier_id IS DISTINCT FROM c.supplier_id OR NEW.departure_id IS DISTINCT FROM c.departure_id
       OR NEW.amount IS DISTINCT FROM round(c.quantity*c.unit_cost,2) OR NEW.currency IS DISTINCT FROM c.currency
       OR NEW.label IS DISTINCT FROM c.label OR NEW.supplier_name IS DISTINCT FROM supplier
       OR NEW.cancelled_at IS NOT NULL OR NEW.cancelled_by IS NOT NULL
       OR NOT EXISTS(SELECT FROM public.profiles WHERE id=NEW.actor_id AND org_id=NEW.org_id) THEN
      RAISE EXCEPTION 'PAYABLE_SOURCE_INVALID';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW)-'cancelled_at'-'cancelled_by') IS DISTINCT FROM (to_jsonb(OLD)-'cancelled_at'-'cancelled_by')
     OR OLD.cancelled_at IS NOT NULL OR NEW.cancelled_at IS NULL OR NEW.cancelled_by IS NULL THEN
    RAISE EXCEPTION 'PAYABLE_IMMUTABLE';
  END IF;
  IF NOT EXISTS(SELECT FROM public.profiles WHERE id=NEW.cancelled_by AND org_id=NEW.org_id) THEN RAISE EXCEPTION 'PAYABLE_ACTOR_INVALID'; END IF;
  IF (SELECT coalesce(sum(amount),0) FROM public.supplier_payable_entries WHERE payable_id=OLD.id AND org_id=OLD.org_id)<>0 THEN
    RAISE EXCEPTION 'PAYABLE_HAS_PAYMENTS';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER supplier_payables_guard BEFORE INSERT OR UPDATE OR DELETE ON public.supplier_payables
FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_payable();

CREATE FUNCTION public.guard_supplier_payable_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.supplier_payables; original public.supplier_payable_entries; paid numeric;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'PAYABLE_ENTRY_IMMUTABLE'; END IF;
  SELECT * INTO p FROM public.supplier_payables WHERE id=NEW.payable_id AND org_id=NEW.org_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYABLE_NOT_FOUND'; END IF;
  IF p.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'PAYABLE_CANCELLED'; END IF;
  IF NOT EXISTS(SELECT FROM public.profiles WHERE id=NEW.actor_id AND org_id=NEW.org_id) THEN RAISE EXCEPTION 'PAYABLE_ACTOR_INVALID'; END IF;
  SELECT coalesce(sum(amount),0) INTO paid FROM public.supplier_payable_entries WHERE payable_id=p.id AND org_id=p.org_id;
  IF NEW.kind='reversal' THEN
    SELECT * INTO original FROM public.supplier_payable_entries
      WHERE id=NEW.reverses_id AND org_id=p.org_id AND payable_id=p.id AND kind='payment';
    IF NOT FOUND THEN RAISE EXCEPTION 'PAYABLE_PAYMENT_NOT_FOUND'; END IF;
    IF NEW.amount IS DISTINCT FROM -original.amount OR nullif(trim(NEW.note),'') IS NULL THEN RAISE EXCEPTION 'PAYABLE_REVERSAL_INVALID'; END IF;
    IF EXISTS(SELECT FROM public.supplier_payable_entries WHERE reverses_id=original.id) THEN RAISE EXCEPTION 'PAYABLE_ALREADY_REVERSED'; END IF;
  END IF;
  IF paid+NEW.amount>p.amount OR paid+NEW.amount<0 THEN RAISE EXCEPTION 'PAYABLE_BALANCE_CONFLICT'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER supplier_payable_entries_guard BEFORE INSERT OR UPDATE OR DELETE ON public.supplier_payable_entries
FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_payable_entry();

CREATE FUNCTION public.guard_payable_cost_source()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF EXISTS(SELECT FROM public.supplier_payables WHERE cost_item_id=OLD.id AND org_id=OLD.org_id AND cancelled_at IS NULL) THEN
    IF TG_OP='DELETE' OR NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.departure_id IS DISTINCT FROM OLD.departure_id
       OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id OR NEW.quantity IS DISTINCT FROM OLD.quantity
       OR NEW.unit_cost IS DISTINCT FROM OLD.unit_cost OR NEW.currency IS DISTINCT FROM OLD.currency THEN
      RAISE EXCEPTION 'PAYABLE_COST_LOCKED';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER departure_cost_payable_guard BEFORE UPDATE OR DELETE ON public.departure_cost_items
FOR EACH ROW EXECUTE FUNCTION public.guard_payable_cost_source();

CREATE FUNCTION public.issue_supplier_payable(p_org_id uuid,p_actor_id uuid,p_departure_id uuid,p_cost_item_id uuid,p_due_date date,p_request_id uuid,p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.departure_cost_items; p public.supplier_payables; supplier text;
BEGIN
  IF NOT EXISTS(SELECT FROM public.profiles WHERE id=p_actor_id AND org_id=p_org_id) THEN RAISE EXCEPTION 'PAYABLE_ACTOR_INVALID'; END IF;
  IF p_due_date IS NULL OR NOT isfinite(p_due_date) THEN RAISE EXCEPTION 'PAYABLE_SOURCE_INVALID'; END IF;
  SELECT * INTO c FROM public.departure_cost_items WHERE id=p_cost_item_id AND org_id=p_org_id AND departure_id=p_departure_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYABLE_SOURCE_NOT_FOUND'; END IF;
  SELECT * INTO p FROM public.supplier_payables WHERE org_id=p_org_id AND request_id=p_request_id;
  IF FOUND THEN
    IF p.cost_item_id<>c.id OR p.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'PAYABLE_REQUEST_CONFLICT'; END IF;
    RETURN jsonb_build_object('created',false,'record',to_jsonb(p));
  END IF;
  SELECT * INTO p FROM public.supplier_payables WHERE cost_item_id=c.id AND org_id=p_org_id AND cancelled_at IS NULL;
  IF FOUND THEN
    -- Do not alias an unrecorded request key to another issuer's obligation:
    -- retrying that key after cancellation must never issue a new obligation.
    RAISE EXCEPTION 'PAYABLE_ALREADY_ISSUED';
  END IF;
  SELECT name INTO supplier FROM public.suppliers WHERE id=c.supplier_id AND org_id=p_org_id;
  IF supplier IS NULL OR round(c.quantity*c.unit_cost,2)<=0 OR round(c.quantity*c.unit_cost,2)>999999999999.99 THEN RAISE EXCEPTION 'PAYABLE_SOURCE_INVALID'; END IF;
  INSERT INTO public.supplier_payables(org_id,departure_id,cost_item_id,request_id,fingerprint,supplier_id,supplier_name,label,amount,currency,due_date,actor_id)
    VALUES(p_org_id,c.departure_id,c.id,p_request_id,p_fingerprint,c.supplier_id,supplier,c.label,round(c.quantity*c.unit_cost,2),c.currency,p_due_date,p_actor_id)
    RETURNING * INTO p;
  RETURN jsonb_build_object('created',true,'record',to_jsonb(p));
END;
$$;

CREATE FUNCTION public.record_supplier_payable_entry(p_org_id uuid,p_actor_id uuid,p_payable_id uuid,p_request_id uuid,p_fingerprint text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.supplier_payables; e public.supplier_payable_entries; original public.supplier_payable_entries; value numeric;
BEGIN
  IF NOT EXISTS(SELECT FROM public.profiles WHERE id=p_actor_id AND org_id=p_org_id) THEN RAISE EXCEPTION 'PAYABLE_ACTOR_INVALID'; END IF;
  SELECT * INTO p FROM public.supplier_payables WHERE id=p_payable_id AND org_id=p_org_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYABLE_NOT_FOUND'; END IF;
  SELECT * INTO e FROM public.supplier_payable_entries WHERE org_id=p_org_id AND request_id=p_request_id;
  IF FOUND THEN
    IF e.payable_id<>p.id OR e.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'PAYABLE_REQUEST_CONFLICT'; END IF;
    RETURN jsonb_build_object('created',false,'record',to_jsonb(e));
  END IF;
  IF p_payload->>'currency' IS DISTINCT FROM p.currency THEN RAISE EXCEPTION 'PAYABLE_CURRENCY_MISMATCH'; END IF;
  IF p_payload->>'kind'='reversal' THEN
    SELECT * INTO original FROM public.supplier_payable_entries
      WHERE id=(p_payload->>'reversesId')::uuid AND org_id=p_org_id AND payable_id=p.id AND kind='payment';
    IF NOT FOUND THEN RAISE EXCEPTION 'PAYABLE_PAYMENT_NOT_FOUND'; END IF;
    value:=-original.amount;
  ELSIF p_payload->>'kind'='payment' THEN
    value:=(p_payload->>'amount')::numeric;
    IF value IS NULL OR value<=0 OR value<>round(value,2) THEN RAISE EXCEPTION 'PAYABLE_SOURCE_INVALID'; END IF;
  ELSE RAISE EXCEPTION 'PAYABLE_SOURCE_INVALID'; END IF;
  INSERT INTO public.supplier_payable_entries(org_id,payable_id,request_id,fingerprint,kind,amount,payment_date,reference,note,reverses_id,actor_id)
    VALUES(p_org_id,p.id,p_request_id,p_fingerprint,p_payload->>'kind',value,(p_payload->>'paymentDate')::date,
      nullif(p_payload->>'reference',''),nullif(p_payload->>'note',''),(p_payload->>'reversesId')::uuid,p_actor_id)
    RETURNING * INTO e;
  RETURN jsonb_build_object('created',true,'record',to_jsonb(e));
END;
$$;

CREATE FUNCTION public.cancel_supplier_payable(p_org_id uuid,p_actor_id uuid,p_payable_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.supplier_payables;
BEGIN
  IF NOT EXISTS(SELECT FROM public.profiles WHERE id=p_actor_id AND org_id=p_org_id) THEN RAISE EXCEPTION 'PAYABLE_ACTOR_INVALID'; END IF;
  SELECT * INTO p FROM public.supplier_payables WHERE id=p_payable_id AND org_id=p_org_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYABLE_NOT_FOUND'; END IF;
  IF p.cancelled_at IS NOT NULL THEN RETURN jsonb_build_object('created',false,'record',to_jsonb(p)); END IF;
  UPDATE public.supplier_payables SET cancelled_at=clock_timestamp(),cancelled_by=p_actor_id WHERE id=p.id AND org_id=p_org_id RETURNING * INTO p;
  RETURN jsonb_build_object('created',true,'record',to_jsonb(p));
END;
$$;

-- JSON aggregation keeps complete balances/history in one MVCC snapshot, without
-- PostgREST's embedded-row limit silently truncating a long payment ledger.
CREATE FUNCTION public.list_supplier_payables(p_org_id uuid,p_departure_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS(SELECT FROM public.departures WHERE id=p_departure_id AND org_id=p_org_id) THEN RAISE EXCEPTION 'PAYABLE_SOURCE_NOT_FOUND'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('entries',
    (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.created_at,e.id),'[]'::jsonb)
       FROM public.supplier_payable_entries e WHERE e.payable_id=p.id AND e.org_id=p_org_id))
    ORDER BY p.created_at,p.id),'[]'::jsonb) INTO result
    FROM public.supplier_payables p WHERE p.org_id=p_org_id AND p.departure_id=p_departure_id;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.list_supplier_payables(uuid,uuid),public.guard_supplier_payable(),public.guard_supplier_payable_entry(),public.guard_payable_cost_source(),public.issue_supplier_payable(uuid,uuid,uuid,uuid,date,uuid,text),public.record_supplier_payable_entry(uuid,uuid,uuid,uuid,text,jsonb),public.cancel_supplier_payable(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_supplier_payables(uuid,uuid),public.guard_supplier_payable(),public.guard_supplier_payable_entry(),public.guard_payable_cost_source(),public.issue_supplier_payable(uuid,uuid,uuid,uuid,date,uuid,text),public.record_supplier_payable_entry(uuid,uuid,uuid,uuid,text,jsonb),public.cancel_supplier_payable(uuid,uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
