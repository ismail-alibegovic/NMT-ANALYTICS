BEGIN;

-- Restore the free-form names intentionally introduced in 20260821020000.
ALTER TABLE public.hotel_rooms DROP CONSTRAINT IF EXISTS hotel_rooms_room_type_check;
-- NOT VALID preserves legacy rows for separately approved inventory review.
-- PostgreSQL still enforces these checks on every new or updated row.
ALTER TABLE public.hotel_rooms ADD CONSTRAINT hotel_rooms_stock_integrity
 CHECK (capacity > 0 AND base_price >= 0 AND total >= 0 AND available >= 0 AND available <= total) NOT VALID;
ALTER TABLE public.hotel_rooms ADD CONSTRAINT hotel_rooms_type_nonempty
 CHECK (length(btrim(room_type)) BETWEEN 1 AND 100) NOT VALID;
ALTER TABLE public.hotels ADD CONSTRAINT hotels_total_rooms_nonnegative
 CHECK (total_rooms >= 0) NOT VALID;

CREATE OR REPLACE FUNCTION public.guard_hotel_stock_total()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_defined bigint;
BEGIN
 IF NEW.total_rooms IS DISTINCT FROM OLD.total_rooms THEN
  SELECT coalesce(sum(greatest(r.total,0)),0) INTO v_defined
  FROM public.hotel_rooms r WHERE r.hotel_id=NEW.id AND r.org_id=NEW.org_id;
  IF NEW.total_rooms < v_defined THEN
   RAISE EXCEPTION 'HOTEL_TOTAL_BELOW_DEFINED_STOCK' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hotel_stock_total_guard ON public.hotels;
CREATE TRIGGER hotel_stock_total_guard BEFORE UPDATE OF total_rooms ON public.hotels
 FOR EACH ROW EXECUTE FUNCTION public.guard_hotel_stock_total();
REVOKE ALL ON FUNCTION public.guard_hotel_stock_total() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_hotel_stock_total() TO service_role;

CREATE OR REPLACE FUNCTION public.create_hotel_inventory(p_org_id uuid,p_hotel jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_hotel public.hotels%ROWTYPE;
 v_id uuid := gen_random_uuid();
 v_total integer;
 v_name text;
 v_destination text;
 v_currency text;
 v_amenities jsonb;
BEGIN
 IF jsonb_typeof(p_hotel) IS DISTINCT FROM 'object'
  OR jsonb_typeof(p_hotel->'name') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_hotel->'destination') IS DISTINCT FROM 'string' THEN
  RAISE EXCEPTION 'INVALID_HOTEL_INPUT' USING ERRCODE='22023';
 END IF;
 v_name := btrim(p_hotel->>'name');
 v_destination := btrim(p_hotel->>'destination');
 IF length(v_name) NOT BETWEEN 1 AND 200 OR length(v_destination) NOT BETWEEN 1 AND 200 THEN
  RAISE EXCEPTION 'INVALID_HOTEL_INPUT' USING ERRCODE='22023';
 END IF;
 IF p_hotel ? 'totalRooms' AND jsonb_typeof(p_hotel->'totalRooms') IS DISTINCT FROM 'number' THEN
  RAISE EXCEPTION 'INVALID_HOTEL_INPUT' USING ERRCODE='22023';
 END IF;
 v_total := coalesce((p_hotel->>'totalRooms')::integer,0);
 IF v_total < 0 THEN RAISE EXCEPTION 'INVALID_HOTEL_INPUT' USING ERRCODE='22023'; END IF;
 SELECT upper(coalesce(nullif(btrim(o.currency),''),'BAM')) INTO v_currency
 FROM public.organizations o WHERE o.id=p_org_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'HOTEL_ORG_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF v_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'INVALID_HOTEL_CURRENCY' USING ERRCODE='22023'; END IF;
 IF p_hotel->'amenities' IS NOT NULL AND p_hotel->'amenities' <> 'null'::jsonb THEN
  IF jsonb_typeof(p_hotel->'amenities') <> 'array' THEN
   RAISE EXCEPTION 'INVALID_HOTEL_INPUT' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_hotel->'amenities') AS item(value) WHERE jsonb_typeof(value)<>'string') THEN
   RAISE EXCEPTION 'INVALID_HOTEL_INPUT' USING ERRCODE='22023';
  END IF;
  v_amenities := p_hotel->'amenities';
 END IF;
 INSERT INTO public.hotels(id,org_id,name,destination,address,contact,total_rooms,stars,description,amenities,email,website,slug)
 VALUES(v_id,p_org_id,v_name,v_destination,p_hotel->>'address',p_hotel->>'contact',v_total,
  (p_hotel->>'stars')::integer,p_hotel->>'description',v_amenities,p_hotel->>'email',p_hotel->>'website',
  'hotel-'||v_id::text) RETURNING * INTO v_hotel;
 IF v_total > 0 THEN
  -- A hotel total does not establish its physical room-type mix. Preserve the
  -- four familiar definitions with zero stock until staff enter actual quantities.
  INSERT INTO public.hotel_rooms(org_id,hotel_id,room_type,capacity,base_price,currency,available,total)
  SELECT p_org_id,v_id,d.kind,d.capacity,0,v_currency,d.quantity,d.quantity
  FROM (VALUES ('single',1,0),('double',2,0),('triple',3,0),('apartment',4,0)) AS d(kind,capacity,quantity);
 END IF;
 -- No exception-swallowing or compensating writes: child failures roll back
 -- the hotel and every room in the same PostgreSQL statement transaction.
 RETURN to_jsonb(v_hotel);
END;
$$;
REVOKE ALL ON FUNCTION public.create_hotel_inventory(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_hotel_inventory(uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.create_hotel_room_inventory(p_org_id uuid,p_hotel_id uuid,p_room jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_hotel public.hotels%ROWTYPE;
 v_room public.hotel_rooms%ROWTYPE;
 v_type text;
 v_capacity integer;
 v_quantity integer;
 v_price numeric;
 v_currency text;
 v_defined bigint;
BEGIN
 IF jsonb_typeof(p_room) IS DISTINCT FROM 'object' OR jsonb_typeof(p_room->'roomType') IS DISTINCT FROM 'string' THEN
  RAISE EXCEPTION 'INVALID_HOTEL_ROOM_INPUT' USING ERRCODE='22023';
 END IF;
 v_type := btrim(p_room->>'roomType');
 IF length(v_type) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_HOTEL_ROOM_INPUT' USING ERRCODE='22023'; END IF;
 IF EXISTS (SELECT 1 FROM (VALUES('capacity'),('quantity'),('basePrice')) AS f(key)
  WHERE p_room ? f.key AND jsonb_typeof(p_room->f.key) IS DISTINCT FROM 'number') THEN
  RAISE EXCEPTION 'INVALID_HOTEL_ROOM_INPUT' USING ERRCODE='22023';
 END IF;
 v_capacity := coalesce((p_room->>'capacity')::integer,2);
 v_quantity := coalesce((p_room->>'quantity')::integer,1);
 v_price := coalesce((p_room->>'basePrice')::numeric,0);
 IF v_capacity<1 OR v_quantity<0 OR v_price<0 OR v_price>9999999999.99 OR v_price<>round(v_price,2) THEN
  RAISE EXCEPTION 'INVALID_HOTEL_ROOM_INPUT' USING ERRCODE='22023';
 END IF;
 -- Serialize sibling stock additions and parent metadata changes on one row.
 SELECT * INTO v_hotel FROM public.hotels h WHERE h.id=p_hotel_id AND h.org_id=p_org_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'HOTEL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT upper(coalesce(nullif(btrim(p_room->>'currency'),''),o.currency,'BAM')) INTO v_currency
 FROM public.organizations o WHERE o.id=p_org_id;
 IF v_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'INVALID_HOTEL_ROOM_INPUT' USING ERRCODE='22023'; END IF;
 INSERT INTO public.hotel_rooms(org_id,hotel_id,room_type,capacity,base_price,currency,available,total)
 VALUES(p_org_id,p_hotel_id,v_type,v_capacity,v_price,v_currency,v_quantity,v_quantity)
 RETURNING * INTO v_room;
 SELECT coalesce(sum(greatest(r.total,0)),0) INTO v_defined
 FROM public.hotel_rooms r WHERE r.hotel_id=p_hotel_id AND r.org_id=p_org_id;
 -- Explicitly adding room quantity may expand the hotel's inventory metadata;
 -- unclassified rooms already included in total_rooms are retained.
 IF v_defined > v_hotel.total_rooms THEN
  UPDATE public.hotels SET total_rooms=v_defined WHERE id=p_hotel_id AND org_id=p_org_id;
 END IF;
 RETURN to_jsonb(v_room);
END;
$$;
REVOKE ALL ON FUNCTION public.create_hotel_room_inventory(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_hotel_room_inventory(uuid,uuid,jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
