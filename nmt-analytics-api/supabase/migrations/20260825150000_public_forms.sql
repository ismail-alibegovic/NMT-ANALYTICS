-- Phase 13 — Public Forms backend foundation
-- Tables: public_forms, public_form_submissions
-- Function: submit_public_form(form_slug TEXT, submission_data JSONB)
-- Adds inquiries.source_metadata JSONB column

-- 1. Public Forms table
CREATE TABLE IF NOT EXISTS public_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  slug TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  fields JSONB NOT NULL DEFAULT '[]',
  thank_you_message TEXT,
  package_id UUID REFERENCES packages(id) ON DELETE SET NULL,
  departure_id UUID REFERENCES departures(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Public Form Submissions table
CREATE TABLE IF NOT EXISTS public_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES public_forms(id) ON DELETE CASCADE,
  inquiry_id UUID REFERENCES inquiries(id) ON DELETE SET NULL,
  answers JSONB NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Add source_metadata to inquiries
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS source_metadata JSONB DEFAULT '{}';

-- 3b. Add 'public_form' to inquiries.source CHECK constraint
ALTER TABLE inquiries DROP CONSTRAINT IF EXISTS inquiries_source_check;
ALTER TABLE inquiries ADD CONSTRAINT inquiries_source_check
  CHECK (source IN ('web', 'phone', 'email', 'walk_in', 'partner', 'social', 'referral', 'public_form', 'other'));

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_public_forms_org ON public_forms(org_id);
CREATE INDEX IF NOT EXISTS idx_public_forms_slug ON public_forms(slug);
CREATE INDEX IF NOT EXISTS idx_public_forms_active ON public_forms(active);
CREATE INDEX IF NOT EXISTS idx_public_form_submissions_form ON public_form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_public_form_submissions_inquiry ON public_form_submissions(inquiry_id);

-- 5. RLS on public_forms
ALTER TABLE public_forms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation_public_forms ON public_forms;
CREATE POLICY org_isolation_public_forms ON public_forms
  FOR ALL USING (org_id = ((current_setting('request.jwt.claims', true)::jsonb)->>'org_id')::UUID);

-- 6. RLS on public_form_submissions
ALTER TABLE public_form_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation_public_form_submissions ON public_form_submissions;
CREATE POLICY org_isolation_public_form_submissions ON public_form_submissions
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public_forms pf
    WHERE pf.id = public_form_submissions.form_id
    AND pf.org_id = ((current_setting('request.jwt.claims', true)::jsonb)->>'org_id')::UUID
  ));

-- 7. Canonical submit function
DROP FUNCTION IF EXISTS public.submit_public_form(TEXT, JSONB);
CREATE OR REPLACE FUNCTION public.submit_public_form(form_slug TEXT, submission_data JSONB)
RETURNS JSONB AS $$
DECLARE
  active_form_id UUID;
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

  -- Create inquiry with canonical public_form source + source_metadata
  INSERT INTO inquiries (
    org_id, contact_name, phone, email, trip_type, source, source_metadata,
    destination, travel_start, travel_end, travelers, budget, currency, notes
  ) VALUES (
    current_org_id, trim(mapped_contact_name), mapped_phone, mapped_email,
    mapped_trip_type, 'public_form',
    jsonb_build_object(
      'type', 'public_form',
      'form_id', active_form_id,
      'form_slug', form_slug
    ),
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
