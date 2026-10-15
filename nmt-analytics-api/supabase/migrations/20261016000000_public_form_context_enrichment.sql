-- Migration: 20261016000000_public_form_context_enrichment.sql
-- Enriches submit_public_form with package_id, departure_id context and auto-populates
-- destination/travel dates when not explicitly provided by the submitter.

CREATE OR REPLACE FUNCTION public.submit_public_form(form_slug TEXT, submission_data JSONB)
RETURNS JSONB AS $$
DECLARE
  active_form_id      UUID;
  form_pkg_id         UUID;
  form_dep_id         UUID;
  effective_pkg_id    UUID;
  effective_dep_id    UUID;
  mapped_contact_name  TEXT;
  mapped_phone         TEXT;
  mapped_email         TEXT;
  mapped_destination   TEXT;
  mapped_travel_start  DATE;
  mapped_travel_end    DATE;
  mapped_travelers     INT;
  mapped_budget        NUMERIC(14,2);
  mapped_trip_type     TEXT;
  inquiry_id           UUID;
  submission_id        UUID;
  current_org_id       UUID;
  pkg_name             TEXT;
BEGIN
  -- Get the form with package and departure links
  SELECT id, org_id, package_id, departure_id
    INTO active_form_id, current_org_id, form_pkg_id, form_dep_id
    FROM public_forms
   WHERE slug = form_slug AND active = true;

  IF NOT found THEN
    RAISE EXCEPTION 'Form not found or inactive' USING ERRCODE = 'NF001';
  END IF;

  -- Determine effective package and departure (submission override or form default)
  effective_dep_id := COALESCE(
    CASE WHEN submission_data->>'departure_id' ~ '^[0-9a-fA-F-]{36}$'
         THEN (submission_data->>'departure_id')::UUID END,
    form_dep_id
  );

  effective_pkg_id := COALESCE(
    CASE WHEN submission_data->>'package_id' ~ '^[0-9a-fA-F-]{36}$'
         THEN (submission_data->>'package_id')::UUID END,
    form_pkg_id
  );

  -- If departure is known but package is not, find package from departure
  IF effective_dep_id IS NOT NULL AND effective_pkg_id IS NULL THEN
    SELECT package_id INTO effective_pkg_id
      FROM departures
     WHERE id = effective_dep_id AND org_id = current_org_id;
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

  -- Auto-populate destination from package if not given
  IF (mapped_destination IS NULL OR trim(mapped_destination) = '') AND effective_pkg_id IS NOT NULL THEN
    SELECT destination, name INTO mapped_destination, pkg_name
      FROM packages
     WHERE id = effective_pkg_id AND org_id = current_org_id;
  ELSIF effective_pkg_id IS NOT NULL THEN
    SELECT name INTO pkg_name
      FROM packages
     WHERE id = effective_pkg_id AND org_id = current_org_id;
  END IF;

  -- Auto-populate travel dates from departure if not given
  IF mapped_travel_start IS NULL AND effective_dep_id IS NOT NULL THEN
    SELECT depart_at::date, return_at::date
      INTO mapped_travel_start, mapped_travel_end
      FROM departures
     WHERE id = effective_dep_id AND org_id = current_org_id;
  END IF;

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

  -- Create inquiry with canonical public_form source + enriched source_metadata
  INSERT INTO inquiries (
    org_id, contact_name, phone, email, trip_type, source, source_metadata,
    destination, travel_start, travel_end, travelers, budget, currency, notes
  ) VALUES (
    current_org_id, trim(mapped_contact_name), mapped_phone, mapped_email,
    mapped_trip_type, 'public_form',
    jsonb_build_object(
      'type', 'public_form',
      'form_id', active_form_id,
      'form_slug', form_slug,
      'package_id', effective_pkg_id,
      'departure_id', effective_dep_id
    ),
    mapped_destination, mapped_travel_start, mapped_travel_end,
    mapped_travelers, mapped_budget, 'BAM',
    CASE
      WHEN pkg_name IS NOT NULL THEN 'Submitted via public form: ' || form_slug || ' (' || pkg_name || ')'
      ELSE 'Submitted via public form: ' || form_slug
    END
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

REVOKE EXECUTE ON FUNCTION public.submit_public_form(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_form(text, jsonb) TO service_role;
