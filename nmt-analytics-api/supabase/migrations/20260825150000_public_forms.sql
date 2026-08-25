-- Phase 13 — Public Forms backen
[truncated]
  active_form_id TEXT;
  mapped_contact_name TEXT;
  mapped_phone        TEXT;
  mapped_email        TEXT;
  mapped_destination  TEXT;
  mapped_travel_start DATE;
  mapped_travel_end    DATE;
  mapped_travelers    INT;
  mapped_budget       NUMERIC(14,2);
  mapped_trip_type    TEXT;
  inquiry_id          UUID;
  submission_id       UUID;
  current_org_id      UUID;
BEGIN
  -- Get the form
  SELECT id, org_id INTO active_form_id, current_org_id
    FROM public_forms
   WHERE slug = form_slug AND active = true;

  IF NOT found THEN
    RAISE EXCEPTION 'Form not found or inactive' USING ERRCODE = 'NF001';
  END IF;

  -- Map recognized fields
  mapped_contact_name := submission_data->>'full_name';
  mapped_phone        := submission_data->>'phone';
  mapped_email        := submission_data->>'email';
  mapped_destination  := submission_data->>'destination';
  mapped_travel_start := CASE WHEN submission_data->>'travel_start' ~ '^\d{4}-\d{2}-\d{2}$'
                               THEN (submission_data->>'travel_start')::DATE END;
  mapped_travel_end    := CASE WHEN submission_data->>'travel_end' ~ '^\d{4}-\d{2}-\d{2}$'
                               THEN (submission_data->>'travel_end')::DATE END;
  mapped_budget       := CASE WHEN submission_data->>'budget' ~ '^\d+(\.\d+)?$'
                               THEN (submission_data->>'budget')::NUMERIC END;
  mapped_travelers    := COALESCE(
    CASE WHEN submission_data->>'travelers' ~ '^\d+$'
         THEN (submission_data->>'travelers')::INT END,
    1);

  mapped_trip_type := 'other';
  IF submission_data->>'trip_type' IN (
    'scheduled_group','tailor_made','accommodation_only','flight_only',
    'corporate','pilgrimage','excursion','transfer','other'
  ) THEN
    mapped_trip_type := submission_data->>'trip_type';
  END IF;

  IF mapped_contact_name IS NULL OR trim(mapped_contact_name) = '' THEN
    RAISE EXCEPTION 'contact_name is required' USING ERRCODE = 'NV001';
  END IF;

  -- Create inquiry
  INSERT INTO inquiries (
    org_id, contact_name, phone, email, trip_type, source,
    destination, travel_start, travel_end, travelers, budget, currency,
    notes
  ) VALUES (
    current_org_id, trim(mapped_contact_name), mapped_phone, mapped_email,
    mapped_trip_type, 'other',
    mapped_destination, mapped_travel_start, mapped_travel_end,
    mapped_travelers, mapped_budget, 'BAM',
    'Submitted via public form: ' || form_slug
  ) RETURNING id INTO inquiry_id;

  -- Create submission
  INSERT INTO public_form_submissions (form_id, inquiry_id, answers)
  VALUES (active_form_id, inquiry_id, submission_data)
  RETURNING id INTO submission_id;

  RETURN jsonb_build_object(
    'inquiry_id', inquiry_id,
    'submission_id', submission_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
