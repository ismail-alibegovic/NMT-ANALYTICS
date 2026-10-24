BEGIN;

-- Cancellation is an explicit release of live resources, not deletion of the
-- traveler, sold accommodation or financial history. Preserve manager locks.
CREATE FUNCTION public.release_cancelled_reservation_resources() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE seats jsonb; rooms jsonb;
BEGIN
  PERFORM 1 FROM public.departure_passengers p WHERE p.org_id=NEW.org_id AND p.reservation_id=NEW.id ORDER BY p.id FOR UPDATE;
  IF EXISTS(SELECT FROM public.departure_passengers p WHERE p.org_id=NEW.org_id AND p.reservation_id=NEW.id AND p.seat_locked)
    OR EXISTS(SELECT FROM public.departure_room_slot_assignments a JOIN public.departure_passengers p ON p.id=a.passenger_id AND p.org_id=NEW.org_id
      WHERE a.org_id=NEW.org_id AND p.reservation_id=NEW.id AND a.locked)
  THEN RAISE EXCEPTION 'RESERVATION_OPERATIONAL_ASSIGNMENTS_LOCKED'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('passenger_id',p.id,'seat_number',p.seat_number,'is_manual',p.seat_is_manual)),'[]') INTO seats
    FROM public.departure_passengers p WHERE p.org_id=NEW.org_id AND p.reservation_id=NEW.id AND p.seat_number IS NOT NULL;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('passenger_id',a.passenger_id,'room_slot_id',a.room_slot_id,'is_manual',a.is_manual)),'[]') INTO rooms
    FROM public.departure_room_slot_assignments a JOIN public.departure_passengers p ON p.id=a.passenger_id AND p.org_id=NEW.org_id
    WHERE a.org_id=NEW.org_id AND p.reservation_id=NEW.id;
  UPDATE public.departure_passengers SET seat_number=NULL,seat_is_manual=false,seat_locked=false
    WHERE org_id=NEW.org_id AND reservation_id=NEW.id AND (seat_number IS NOT NULL OR seat_is_manual OR seat_locked);
  DELETE FROM public.departure_room_slot_assignments a USING public.departure_passengers p
    WHERE a.passenger_id=p.id AND a.org_id=NEW.org_id AND p.org_id=NEW.org_id AND p.reservation_id=NEW.id;
  IF seats<>'[]'::jsonb OR rooms<>'[]'::jsonb THEN
    INSERT INTO public.audit_logs(org_id,user_id,action,entity,entity_id,details) VALUES(NEW.org_id,NULL,'cancel_resource_release','reservation',NEW.id,
      jsonb_build_object('metadata',jsonb_build_object('actor','system','reason','reservation_cancelled','released_seats',seats,'released_rooms',rooms)));
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.release_cancelled_reservation_resources() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER reservation_cancel_resource_release AFTER UPDATE OF status ON public.reservations
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status='cancelled')
  EXECUTE FUNCTION public.release_cancelled_reservation_resources();

CREATE FUNCTION public.reject_cancelled_passenger_seat() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.seat_number IS NOT NULL AND NEW.seat_number>0 AND EXISTS(
    SELECT FROM public.reservations r WHERE r.id=NEW.reservation_id AND r.org_id=NEW.org_id AND r.status='cancelled'
  ) THEN RAISE EXCEPTION 'RESERVATION_CANCELLED'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.reject_cancelled_passenger_seat() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aa_reject_cancelled_passenger_seat BEFORE INSERT OR UPDATE OF seat_number,reservation_id ON public.departure_passengers
  FOR EACH ROW EXECUTE FUNCTION public.reject_cancelled_passenger_seat();

CREATE FUNCTION public.reject_cancelled_passenger_room() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE booking_id uuid;
BEGIN
  -- Serialize against cancellation before checking status. A stale proposal
  -- cannot wait for cancellation and then acquire a room after it commits.
  SELECT p.reservation_id INTO booking_id FROM public.departure_passengers p WHERE p.id=NEW.passenger_id AND p.org_id=NEW.org_id FOR UPDATE;
  IF EXISTS(SELECT FROM public.reservations r WHERE r.id=booking_id AND r.org_id=NEW.org_id AND r.status='cancelled')
  THEN RAISE EXCEPTION 'RESERVATION_CANCELLED'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.reject_cancelled_passenger_room() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aa_reject_cancelled_passenger_room BEFORE INSERT OR UPDATE ON public.departure_room_slot_assignments
  FOR EACH ROW EXECUTE FUNCTION public.reject_cancelled_passenger_room();

COMMIT;
