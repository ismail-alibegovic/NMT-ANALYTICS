  -- Atomic reservation creation with capacity check
  -- Prevents overbooking by locking the departure row during the transaction
  CREATE OR REPLACE FUNCTION create_reservation_atomic(
    p_org_id UUID,
    p_departure_id UUID,
    p_customer_data JSONB,
    p_party_size INT,
    p_status TEXT
  )
  RETURNS JSONB AS $$
  DECLARE
    v_booked INT;
    v_capacity INT;
    v_reservation_id UUID;
    v_result JSONB;
  BEGIN
    -- 1. If departure_id is provided, lock and check capacity
    IF p_departure_id IS NOT NULL THEN
      SELECT booked, capacity INTO v_booked, v_capacity
      FROM departures
      WHERE id = p_departure_id AND org_id = p_org_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'DEPARTURE_NOT_FOUND';
      END IF;

      -- Only increment if status is confirmed
      IF p_status = 'confirmed' THEN
        IF v_booked + p_party_size > v_capacity THEN
          RAISE EXCEPTION 'CAPACITY_FULL';
        END IF;

        UPDATE departures
        SET booked = booked + p_party_size
        WHERE id = p_departure_id;
      END IF;
    END IF;

    -- 2. Insert the reservation
    -- Field names in JSON match the spreadsheet/frontend convention (camelCase)
    INSERT INTO reservations (
      org_id,
      departure_id,
      customer_id,
      customer_name,
      customer_phone,
      party_size,
      reservation_at,
      status,
      total_amount,
      currency,
      source
    ) VALUES (
      p_org_id,
      p_departure_id,
      (p_customer_data->>'customerId')::UUID,
      p_customer_data->>'customerName',
      p_customer_data->>'customerPhone',
      p_party_size,
      (p_customer_data->>'reservationAt')::TIMESTAMPTZ,
      p_status,
      (COALESCE(p_customer_data->>'totalAmount', '0'))::NUMERIC,
      COALESCE(p_customer_data->>'currency', 'USD'),
      p_customer_data->>'source'
    )
    RETURNING id INTO v_reservation_id;

    -- 3. Return the created reservation as JSON
    SELECT row_to_json(r)::jsonb INTO v_result
    FROM reservations r
    WHERE r.id = v_reservation_id;

    RETURN v_result;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;
