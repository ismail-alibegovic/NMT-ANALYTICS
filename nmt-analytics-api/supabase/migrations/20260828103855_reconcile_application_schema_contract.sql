-- Reconcile fresh replay with the current application schema contract.
--
-- Production already contains the sub-agent portal columns used by current API code.
-- Fresh replay was missing them, so the application contract was not reproducible
-- from migrations alone.

ALTER TABLE public.sub_agents
  ADD COLUMN IF NOT EXISTS portal_token_hash text,
  ADD COLUMN IF NOT EXISTS portal_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal_last_seen_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_sub_agents_portal_token_hash
  ON public.sub_agents(portal_token_hash)
  WHERE portal_token_hash IS NOT NULL;

-- Columns introduced by 20260821020000 are not referenced by current application
-- code and are absent from production. Remove them from the canonical fresh end state.
ALTER TABLE public.hotel_rooms
  DROP COLUMN IF EXISTS bed_config,
  DROP COLUMN IF EXISTS beds_count;

ALTER TABLE public.departures
  DROP CONSTRAINT IF EXISTS booked_lte_capacity,
  DROP CONSTRAINT IF EXISTS booked_non_negative,
  DROP CONSTRAINT IF EXISTS departures_status_check;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.departures'::regclass AND conname = 'departures_booked_capacity_check') THEN
    ALTER TABLE public.departures ADD CONSTRAINT departures_booked_capacity_check CHECK (booked >= 0 AND booked <= capacity);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.departures'::regclass AND conname = 'departures_capacity_check') THEN
    ALTER TABLE public.departures ADD CONSTRAINT departures_capacity_check CHECK (capacity > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.departures'::regclass AND conname = 'departures_return_after_depart_check') THEN
    ALTER TABLE public.departures ADD CONSTRAINT departures_return_after_depart_check CHECK (return_at > depart_at);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.hotel_rooms'::regclass AND conname = 'hotel_rooms_room_type_check') THEN
    ALTER TABLE public.hotel_rooms ADD CONSTRAINT hotel_rooms_room_type_check CHECK (room_type = ANY (ARRAY['single'::text, 'double'::text, 'triple'::text, 'apartment'::text]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.packages'::regclass AND conname = 'packages_duration_days_check') THEN
    ALTER TABLE public.packages ADD CONSTRAINT packages_duration_days_check CHECK (duration_days IS NULL OR duration_days > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.packages'::regclass AND conname = 'packages_dates_check') THEN
    ALTER TABLE public.packages ADD CONSTRAINT packages_dates_check CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.packages'::regclass AND conname = 'packages_max_participants_check') THEN
    ALTER TABLE public.packages ADD CONSTRAINT packages_max_participants_check CHECK (max_participants IS NULL OR max_participants > 0);
  END IF;
END $$;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_amount_check;
ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_party_size_check,
  DROP CONSTRAINT IF EXISTS reservations_payment_status_check,
  DROP CONSTRAINT IF EXISTS reservations_source_check;
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_status_check,
  DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_plan_check;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.payments'::regclass AND conname = 'payments_amount_check') THEN
    ALTER TABLE public.payments ADD CONSTRAINT payments_amount_check CHECK (amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.reservations'::regclass AND conname = 'reservations_payment_status_check') THEN
    ALTER TABLE public.reservations ADD CONSTRAINT reservations_payment_status_check CHECK (payment_status = ANY (ARRAY['unpaid'::text, 'partially_paid'::text, 'paid'::text, 'refunded'::text]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.reservations'::regclass AND conname = 'reservations_source_check') THEN
    ALTER TABLE public.reservations ADD CONSTRAINT reservations_source_check CHECK (source IS NULL OR source = ANY (ARRAY['web'::text, 'phone'::text, 'agent'::text, 'walk-in'::text, 'other'::text]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.reservations'::regclass AND conname = 'reservations_total_amount_check') THEN
    ALTER TABLE public.reservations ADD CONSTRAINT reservations_total_amount_check CHECK (total_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.reservations'::regclass AND conname = 'reservations_total_amount_nullable_check') THEN
    ALTER TABLE public.reservations ADD CONSTRAINT reservations_total_amount_nullable_check CHECK (total_amount IS NULL OR total_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.transactions'::regclass AND conname = 'transactions_status_check') THEN
    ALTER TABLE public.transactions ADD CONSTRAINT transactions_status_check CHECK (status = ANY (ARRAY['succeeded'::text, 'pending'::text, 'failed'::text]));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON public.audit_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_departures_package_depart ON public.departures(package_id, depart_at);
CREATE INDEX IF NOT EXISTS idx_org_settings_org_id ON public.org_settings(org_id);
CREATE INDEX IF NOT EXISTS idx_organizations_created_at ON public.organizations(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_org_reservation ON public.payments(org_id, reservation_id);
CREATE INDEX IF NOT EXISTS idx_payments_org_reservation_status ON public.payments(org_id, reservation_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_org_status ON public.payments(org_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_reservation_payment_date ON public.payments(reservation_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles(created_at);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Fresh replay must mirror Supabase service-role table access for server-only API code.
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
