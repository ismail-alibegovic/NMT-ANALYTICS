-- Legacy Travline baseline immediately before 20260704000027_voucher_enhancement.sql.
-- This is a normalized schema snapshot reconstructed from docs/archive/legacy-sql/supabase-sql/001_init.sql through 026_currency_default_bam.sql.
-- It intentionally excludes Supabase-owned platform objects such as auth.users and storage metadata tables.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  phone text,
  email text,
  address text,
  currency text DEFAULT 'BAM',
  timezone text DEFAULT 'Europe/Sarajevo',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid,
  role text NOT NULL DEFAULT 'agent' CHECK (role IN ('super_admin', 'director', 'manager', 'agent', 'viewer')),
  email text,
  full_name text,
  created_at timestamptz DEFAULT now()
);


CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,
  full_name text NOT NULL,
  email text,
  phone text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.tours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text NOT NULL,
  email text,
  notes text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'lead', 'archived')),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_phone_per_org UNIQUE (org_id, phone)
);

CREATE TABLE public.packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  destination text NOT NULL,
  base_price numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'BAM',
  description text,
  duration_days integer,
  max_participants integer,
  start_date date,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.departures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE SET NULL,
  depart_at timestamptz NOT NULL,
  return_at timestamptz NOT NULL,
  capacity integer NOT NULL,
  booked integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'completed')),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT booked_lte_capacity CHECK (booked <= capacity),
  CONSTRAINT booked_non_negative CHECK (booked >= 0)
);

CREATE TABLE public.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  departure_id uuid REFERENCES public.departures(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text,
  party_size integer NOT NULL CHECK (party_size > 0),
  reservation_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'refunded')),
  total_amount numeric(12,2) DEFAULT 0,
  paid_amount numeric(12,2) DEFAULT 0 CHECK (paid_amount >= 0),
  balance_due numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BAM',
  source text CHECK (source IN ('web', 'phone', 'agent', 'walk-in', 'other')),
  assigned_to uuid,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT reservations_paid_lte_total_check CHECK (paid_amount <= total_amount)
);


CREATE TABLE public.departure_passengers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  departure_id uuid NOT NULL REFERENCES public.departures(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  email text,
  id_document_number text,
  id_document_type text CHECK (id_document_type IN ('passport', 'id_card', 'none')),
  nationality text,
  date_of_birth date,
  seat_number integer,
  passenger_group_name text,
  seat_category text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  type text NOT NULL CHECK (type IN ('payment', 'refund')),
  currency text NOT NULL DEFAULT 'BAM',
  status text DEFAULT 'succeeded' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'cancelled')),
  note text,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'BAM',
  status text NOT NULL DEFAULT 'succeeded' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'cancelled')),
  payment_date date,
  payment_method text,
  refund_reason text,
  refunded_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.org_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  invoice_primary_color text DEFAULT '#1D4ED8',
  invoice_secondary_color text DEFAULT '#111827',
  invoice_logo_url text,
  invoice_footer_text text DEFAULT 'Thank you for your business!',
  invoice_show_qr boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, key)
);

CREATE TABLE public.org_modules (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (org_id, module_key)
);

CREATE TABLE public.document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  html_template text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, key)
);

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.document_templates(id) ON DELETE CASCADE,
  entity_type text,
  entity_id uuid,
  payload jsonb,
  name text,
  type text,
  size bigint,
  storage_path text,
  uploaded_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  resource text NOT NULL,
  action text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (role, resource, action)
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('new_reservation', 'payment_received', 'departure_reminder', 'payment_overdue', 'system')),
  title text NOT NULL,
  body text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.payment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'BAM',
  is_paid boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_org_id ON public.profiles(org_id);
CREATE INDEX idx_customers_org_id_created_at ON public.customers(org_id, created_at);
CREATE INDEX idx_customers_status ON public.customers(org_id, status);
CREATE INDEX idx_customers_org_id_phone ON public.customers(org_id, phone);
CREATE INDEX idx_customers_search ON public.customers(org_id, full_name, phone);
CREATE INDEX idx_packages_org_id_created_at ON public.packages(org_id, created_at);
CREATE INDEX idx_packages_org_id_is_active ON public.packages(org_id, is_active);
CREATE INDEX idx_packages_is_active ON public.packages(org_id, is_active);
CREATE INDEX idx_departures_org_id_depart_at ON public.departures(org_id, depart_at);
CREATE INDEX idx_departures_package_id ON public.departures(package_id);
CREATE INDEX idx_reservations_org_id_reservation_at ON public.reservations(org_id, reservation_at);
CREATE INDEX idx_reservations_departure_id ON public.reservations(departure_id);
CREATE INDEX idx_reservations_customer_id ON public.reservations(customer_id);
CREATE INDEX idx_reservations_paid_amount ON public.reservations(org_id, paid_amount);
CREATE INDEX idx_reservations_assigned_to ON public.reservations(org_id, assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_fk_reservations_1fc9e23e23 ON public.reservations(assigned_to);
CREATE INDEX idx_reservations_payment_status ON public.reservations(org_id, payment_status);
CREATE INDEX idx_reservations_created_at ON public.reservations(created_at);
CREATE INDEX idx_reservations_org_id_created_at ON public.reservations(org_id, created_at);
CREATE INDEX idx_transactions_org_id_occurred_at ON public.transactions(org_id, occurred_at);
CREATE INDEX idx_transactions_reservation_id ON public.transactions(reservation_id);
CREATE INDEX idx_transactions_status ON public.transactions(status, org_id) WHERE status <> 'succeeded';
CREATE INDEX idx_transactions_created_at ON public.transactions(created_at);
CREATE INDEX idx_transactions_org_id_created_at ON public.transactions(org_id, created_at);
CREATE INDEX idx_transactions_type_org_id ON public.transactions(type, org_id, occurred_at) WHERE type = 'payment';
CREATE INDEX idx_transactions_analytics ON public.transactions(org_id, type, status, occurred_at) WHERE type = 'payment' AND status = 'succeeded';
CREATE INDEX idx_payments_org_id ON public.payments(org_id);
CREATE INDEX idx_payments_reservation_id ON public.payments(reservation_id);
CREATE INDEX idx_payments_payment_date ON public.payments(payment_date);
CREATE INDEX idx_payments_org_date ON public.payments(org_id, payment_date);
CREATE INDEX idx_payments_status ON public.payments(status) WHERE status <> 'succeeded';
CREATE INDEX idx_payments_refunded_at ON public.payments(refunded_at) WHERE refunded_at IS NOT NULL;
CREATE INDEX idx_notifications_org_user ON public.notifications(org_id, user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_org_created_at ON public.notifications(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_org_user_created_at ON public.notifications(org_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(org_id, user_id, is_read) WHERE is_read = false;

CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX idx_notifications_is_read ON public.notifications(is_read) WHERE is_read = false;
CREATE INDEX idx_payment_links_code ON public.payment_links(code);
CREATE INDEX idx_payment_links_org ON public.payment_links(org_id);
CREATE INDEX idx_payment_links_reservation ON public.payment_links(reservation_id);
CREATE INDEX idx_audit_logs_org_id_created_at ON public.audit_logs(org_id, created_at);
CREATE INDEX idx_audit_logs_entity_id ON public.audit_logs(entity_id);

CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.increment_booked(row_id uuid, amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.departures
  SET booked = booked + amount
  WHERE id = row_id
    AND booked + amount >= 0
    AND booked + amount <= capacity;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Update failed: capacity exceeded or departure not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_permission(user_role text, check_resource text, check_action text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF user_role = 'super_admin' THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.role_permissions
    WHERE role = user_role
      AND (resource = check_resource OR resource = '*')
      AND (action = check_action OR action = '*')
      AND allowed = true
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.create_reservation_atomic(p_org_id uuid, p_departure_id uuid, p_customer_data jsonb, p_party_size integer, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booked INT;
  v_capacity INT;
  v_reservation_id uuid;
  v_result jsonb;
BEGIN
  IF p_departure_id IS NOT NULL THEN
    SELECT booked, capacity INTO v_booked, v_capacity
    FROM public.departures
    WHERE id = p_departure_id AND org_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'DEPARTURE_NOT_FOUND';
    END IF;

    IF p_status = 'confirmed' THEN
      IF v_booked + p_party_size > v_capacity THEN
        RAISE EXCEPTION 'CAPACITY_FULL';
      END IF;

      UPDATE public.departures
      SET booked = booked + p_party_size
      WHERE id = p_departure_id;
    END IF;
  END IF;

  INSERT INTO public.reservations (org_id, departure_id, customer_id, customer_name, customer_phone, party_size, reservation_at, status, total_amount, currency, source)
  VALUES (p_org_id, p_departure_id, (p_customer_data->>'customerId')::uuid, p_customer_data->>'customerName', p_customer_data->>'customerPhone', p_party_size, COALESCE((p_customer_data->>'reservationAt')::timestamptz, now()), p_status, COALESCE(p_customer_data->>'totalAmount', '0')::numeric, COALESCE(p_customer_data->>'currency', 'BAM'), p_customer_data->>'source')
  RETURNING id INTO v_reservation_id;

  SELECT row_to_json(r)::jsonb INTO v_result FROM public.reservations r WHERE r.id = v_reservation_id;
  RETURN v_result;
END;
$$;


CREATE OR REPLACE FUNCTION public.notify_upcoming_departures()
RETURNS TABLE(notification_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
  nid UUID;
BEGIN
  FOR rec IN
    SELECT d.id AS departure_id, d.depart_at, p.name AS package_name, d.org_id
    FROM public.departures d
    JOIN public.packages p ON p.id = d.package_id
    WHERE d.depart_at::date = (CURRENT_DATE + 1)
      AND d.status = 'active'
      AND d.booked > 0
  LOOP
    INSERT INTO public.notifications (org_id, user_id, type, title, body, data)
    VALUES (
      rec.org_id,
      NULL,
      'departure_reminder',
      'Podsjetnik: Polazak sutra',
      rec.package_name || ' polazi sutra u ' || to_char(rec.depart_at, 'HH24:MI'),
      jsonb_build_object('departure_id', rec.departure_id, 'package_name', rec.package_name, 'departure_date', rec.depart_at::text)
    )
    RETURNING id INTO nid;
    notification_id := nid;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_org_id uuid, p_date_from timestamptz, p_date_to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_revenue NUMERIC;
  v_bookings_count INT;
  v_top_packages JSONB;
  v_revenue_by_month JSONB;
  v_result JSONB;
BEGIN
  SELECT COALESCE(SUM(total_amount), 0)
  INTO v_revenue
  FROM public.reservations
  WHERE org_id = p_org_id
    AND status IN ('confirmed', 'completed')
    AND reservation_at >= p_date_from
    AND reservation_at <= p_date_to;

  SELECT COUNT(*)
  INTO v_bookings_count
  FROM public.reservations
  WHERE org_id = p_org_id
    AND reservation_at >= p_date_from
    AND reservation_at <= p_date_to;

  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb)
  INTO v_top_packages
  FROM (
    SELECT
      p.name,
      SUM(r.total_amount) as revenue,
      COUNT(r.id) as bookings
    FROM public.reservations r
    JOIN public.departures d ON r.departure_id = d.id
    JOIN public.packages p ON d.package_id = p.id
    WHERE r.org_id = p_org_id
      AND r.status IN ('confirmed', 'completed')
      AND r.reservation_at >= p_date_from
      AND r.reservation_at <= p_date_to
    GROUP BY p.name
    ORDER BY revenue DESC
    LIMIT 5
  ) t;

  SELECT COALESCE(jsonb_agg(m), '[]'::jsonb)
  INTO v_revenue_by_month
  FROM (
    SELECT
      TO_CHAR(reservation_at, 'YYYY-MM') as month,
      SUM(total_amount) as revenue
    FROM public.reservations
    WHERE org_id = p_org_id
      AND status IN ('confirmed', 'completed')
      AND reservation_at >= p_date_from
      AND reservation_at <= p_date_to
    GROUP BY month
    ORDER BY month ASC
  ) m;

  v_result := jsonb_build_object(
    'revenue', v_revenue,
    'bookings_count', v_bookings_count,
    'top_packages', v_top_packages,
    'revenue_by_month', v_revenue_by_month
  );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_reports_summary(p_org_id uuid, p_start_date timestamptz, p_end_date timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction_revenue numeric;
  v_booked_revenue numeric;
  v_paid_revenue numeric;
  v_unpaid_revenue numeric;
  v_paid_percent numeric;
  v_total_reservations bigint;
  v_total_customers bigint;
  v_avg_order_value numeric;
  v_top_destinations jsonb;
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN type = 'payment' THEN amount ELSE -amount END), 0)
  INTO v_transaction_revenue
  FROM public.transactions
  WHERE org_id = p_org_id
    AND occurred_at BETWEEN p_start_date AND p_end_date;

  SELECT
    COUNT(*),
    COUNT(DISTINCT customer_id),
    COALESCE(SUM(total_amount), 0),
    COALESCE(SUM(paid_amount), 0)
  INTO
    v_total_reservations,
    v_total_customers,
    v_booked_revenue,
    v_paid_revenue
  FROM public.reservations
  WHERE org_id = p_org_id
    AND reservation_at BETWEEN p_start_date AND p_end_date
    AND status IN ('confirmed', 'completed');

  v_unpaid_revenue := GREATEST(v_booked_revenue - v_paid_revenue, 0);

  IF v_booked_revenue > 0 THEN
    v_paid_percent := ROUND((v_paid_revenue / v_booked_revenue) * 100, 1);
  ELSE
    v_paid_percent := 0;
  END IF;

  IF v_total_reservations > 0 THEN
    v_avg_order_value := ROUND(v_transaction_revenue / v_total_reservations, 2);
  ELSE
    v_avg_order_value := 0;
  END IF;

  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v_top_destinations
  FROM (
    SELECT
      p.destination,
      COUNT(r.id)::int as reservations,
      COALESCE(SUM(r.total_amount), 0)::numeric(12,2) as revenue
    FROM public.reservations r
    JOIN public.departures d ON r.departure_id = d.id
    JOIN public.packages p ON d.package_id = p.id
    WHERE r.org_id = p_org_id
      AND r.reservation_at BETWEEN p_start_date AND p_end_date
      AND r.status IN ('confirmed', 'completed')
    GROUP BY p.destination
    ORDER BY 2 DESC
    LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'totalRevenue', v_transaction_revenue,
    'bookedRevenue', v_booked_revenue,
    'paidRevenue', v_paid_revenue,
    'unpaidRevenue', v_unpaid_revenue,
    'paidPercent', v_paid_percent,
    'totalReservations', v_total_reservations,
    'totalCustomers', v_total_customers,
    'avgOrderValue', v_avg_order_value,
    'topDestinations', v_top_destinations
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'totalRevenue', 0,
    'bookedRevenue', 0,
    'paidRevenue', 0,
    'unpaidRevenue', 0,
    'paidPercent', 0,
    'totalReservations', 0,
    'totalCustomers', 0,
    'avgOrderValue', 0,
    'topDestinations', '[]'::jsonb,
    'error_logged', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_revenue_analytics(p_org_id uuid, p_start_date timestamptz, p_end_date timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'org_id cannot be null';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'start_date and end_date cannot be null';
  END IF;
  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'start_date must be before or equal to end_date';
  END IF;

  WITH payment_metrics AS (
    SELECT
      COALESCE(SUM(amount), 0) as total_revenue,
      COUNT(*) as payment_count,
      COALESCE(AVG(amount), 0) as avg_payment_amount
    FROM public.transactions
    WHERE org_id = p_org_id
      AND type = 'payment'
      AND status = 'succeeded'
      AND occurred_at >= p_start_date
      AND occurred_at <= p_end_date
  ),
  booking_metrics AS (
    SELECT
      COALESCE(SUM(total_amount), 0) as booked_amount,
      COUNT(*) as reservation_count,
      COUNT(DISTINCT customer_id) as unique_customers
    FROM public.reservations
    WHERE org_id = p_org_id
      AND reservation_at >= p_date_from
      AND reservation_at <= p_date_to
      AND status IN ('confirmed', 'completed')
  ),
  revenue_by_day AS (
    SELECT jsonb_agg(jsonb_build_object(
      'date', date,
      'revenue', daily_revenue,
      'paymentCount', payment_count
    ) ORDER BY date) as daily_data
    FROM (
      SELECT
        DATE(occurred_at) as date,
        COALESCE(SUM(amount), 0) as daily_revenue,
        COUNT(*) as payment_count
      FROM public.transactions
      WHERE org_id = p_org_id
        AND type = 'payment'
        AND status = 'succeeded'
        AND occurred_at >= p_start_date
        AND occurred_at <= p_end_date
      GROUP BY DATE(occurred_at)
    ) daily
  ),
  revenue_by_package AS (
    SELECT jsonb_agg(jsonb_build_object(
      'packageId', package_id,
      'packageName', package_name,
      'destination', destination,
      'revenue', revenue,
      'paymentCount', payment_count,
      'reservationCount', reservation_count
    ) ORDER BY revenue DESC) as package_data
    FROM (
      SELECT
        p.id as package_id,
        p.name as package_name,
        p.destination,
        COALESCE(SUM(t.amount), 0) as revenue,
        COUNT(DISTINCT t.id) as payment_count,
        COUNT(DISTINCT t.reservation_id) as reservation_count
      FROM public.transactions t
      LEFT JOIN public.reservations r ON t.reservation_id = r.id
      LEFT JOIN public.departures d ON r.departure_id = d.id
      LEFT JOIN public.packages p ON d.package_id = p.id
      WHERE t.org_id = p_org_id
        AND t.type = 'payment'
        AND t.status = 'succeeded'
        AND t.occurred_at >= p_start_date
        AND t.occurred_at <= p_end_date
        AND p.id IS NOT NULL
      GROUP BY p.id, p.name, p.destination
      LIMIT 10
    ) pkg
  ),
  revenue_by_customer AS (
    SELECT jsonb_agg(jsonb_build_object(
      'customerId', customer_id,
      'customerName', customer_name,
      'revenue', revenue,
      'paymentCount', payment_count,
      'lastPaymentDate', last_payment_date
    ) ORDER BY revenue DESC) as customer_data
    FROM (
      SELECT
        c.id as customer_id,
        c.full_name as customer_name,
        COALESCE(SUM(t.amount), 0) as revenue,
        COUNT(DISTINCT t.id) as payment_count,
        MAX(t.occurred_at) as last_payment_date
      FROM public.transactions t
      LEFT JOIN public.reservations r ON t.reservation_id = r.id
      LEFT JOIN public.customers c ON r.customer_id = c.id
      WHERE t.org_id = p_org_id
        AND t.type = 'payment'
        AND t.status = 'succeeded'
        AND t.occurred_at >= p_start_date
        AND t.occurred_at <= p_end_date
        AND c.id IS NOT NULL
      GROUP BY c.id, c.full_name
      ORDER BY revenue DESC
      LIMIT 10
    ) cust
  )
  SELECT jsonb_build_object(
    'totalRevenue', ROUND(pm.total_revenue, 2),
    'paidRevenue', ROUND(pm.total_revenue, 2),
    'paymentCount', pm.payment_count,
    'avgPaymentAmount', ROUND(pm.avg_payment_amount, 2),
    'bookedAmount', ROUND(bm.booked_amount, 2),
    'unpaidAmount', ROUND(GREATEST(bm.booked_amount - pm.total_revenue, 0), 2),
    'reservationCount', bm.reservation_count,
    'uniqueCustomers', bm.unique_customers,
    'paidPercent', CASE
      WHEN bm.booked_amount > 0
      THEN ROUND((pm.total_revenue / bm.booked_amount) * 100, 2)
      ELSE 0
    END,
    'revenueByDay', COALESCE(rbd.daily_data, '[]'::jsonb),
    'revenueByPackage', COALESCE(rbp.package_data, '[]'::jsonb),
    'revenueByCustomer', COALESCE(rbc.customer_data, '[]'::jsonb)
  ) INTO v_result
  FROM payment_metrics pm, booking_metrics bm, revenue_by_day rbd,
       revenue_by_package rbp, revenue_by_customer rbc;

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'error', true,
    'message', SQLERRM,
    'detail', SQLSTATE
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_revenue_by_day(p_org_id uuid, p_start_date timestamptz, p_end_date timestamptz)
RETURNS TABLE (
  date DATE,
  revenue NUMERIC,
  payment_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    DATE(occurred_at) as date,
    COALESCE(SUM(amount), 0) as revenue,
    COUNT(*) as payment_count
  FROM public.transactions
  WHERE org_id = p_org_id
    AND type = 'payment'
    AND status = 'succeeded'
    AND occurred_at >= p_start_date
    AND occurred_at <= p_end_date
  GROUP BY DATE(occurred_at)
  ORDER BY date;
$$;

CREATE OR REPLACE FUNCTION public.get_total_revenue(p_org_id uuid, p_start_date timestamptz DEFAULT NULL, p_end_date timestamptz DEFAULT NULL)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM public.transactions
  WHERE org_id = p_org_id
    AND type = 'payment'
    AND status = 'succeeded'
    AND (p_start_date IS NULL OR occurred_at >= p_start_date)
    AND (p_end_date IS NULL OR occurred_at <= p_end_date);
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_reservation_paid_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.reservations
  SET paid_amount = COALESCE((
    SELECT SUM(amount)
    FROM public.payments
    WHERE reservation_id = COALESCE(NEW.reservation_id, OLD.reservation_id)
      AND status = 'succeeded'
  ), 0)
  WHERE id = COALESCE(NEW.reservation_id, OLD.reservation_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_payment_currency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_reservation_currency TEXT;
BEGIN
    SELECT currency INTO v_reservation_currency
    FROM public.reservations
    WHERE id = NEW.reservation_id;
    IF NEW.currency IS NULL THEN
        NEW.currency := v_reservation_currency;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_payment_currency
BEFORE INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.validate_payment_currency();

CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_update_reservation_paid_amount
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.update_reservation_paid_amount();


ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departure_passengers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own organization" ON public.organizations FOR SELECT USING (id = public.get_my_org_id());
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Directors can read profiles in their org" ON public.profiles FOR SELECT USING (org_id = public.get_my_org_id() AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'director'));
CREATE POLICY "Tenant access - Customers" ON public.customers FOR ALL USING (org_id = public.get_my_org_id()) WITH CHECK (org_id = public.get_my_org_id());
CREATE POLICY "Tenant access - Packages" ON public.packages FOR ALL USING (org_id = public.get_my_org_id()) WITH CHECK (org_id = public.get_my_org_id());
CREATE POLICY "Tenant access - Departures" ON public.departures FOR ALL USING (org_id = public.get_my_org_id()) WITH CHECK (org_id = public.get_my_org_id());
CREATE POLICY "Tenant access - Reservations" ON public.reservations FOR ALL USING (org_id = public.get_my_org_id() AND (assigned_to IS NULL OR assigned_to = auth.uid() OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'director', 'manager'))) WITH CHECK (org_id = public.get_my_org_id());
CREATE POLICY "Tenant access - Transactions" ON public.transactions FOR ALL USING (org_id = public.get_my_org_id()) WITH CHECK (org_id = public.get_my_org_id());
CREATE POLICY "Tenant access - Payments" ON public.payments FOR ALL USING (org_id = public.get_my_org_id()) WITH CHECK (org_id = public.get_my_org_id());
CREATE POLICY "Users can read modules for their org" ON public.org_modules FOR SELECT USING (org_id = public.get_my_org_id());
CREATE POLICY "Directors can manage org modules" ON public.org_modules FOR ALL USING (org_id = public.get_my_org_id() AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'director')) WITH CHECK (org_id = public.get_my_org_id() AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'director'));
CREATE POLICY "Users can read templates for their org" ON public.document_templates FOR SELECT USING (org_id = public.get_my_org_id());
CREATE POLICY "Admins can manage templates for their org" ON public.document_templates FOR ALL USING (org_id = public.get_my_org_id() AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'director')) WITH CHECK (org_id = public.get_my_org_id() AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'director'));
CREATE POLICY "Org Access" ON public.documents FOR SELECT USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Org Insert" ON public.documents FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Org Delete" ON public.documents FOR DELETE USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Managers can manage documents" ON public.documents FOR ALL USING (org_id = public.get_my_org_id() AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'director', 'manager')) WITH CHECK (org_id = public.get_my_org_id() AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'director', 'manager'));

CREATE POLICY "Tenant read notifications" ON public.notifications FOR SELECT USING (org_id = public.get_my_org_id() AND (user_id = auth.uid() OR user_id IS NULL));
CREATE POLICY "Tenant update own notifications" ON public.notifications FOR UPDATE USING (org_id = public.get_my_org_id() AND (user_id = auth.uid() OR user_id IS NULL)) WITH CHECK (org_id = public.get_my_org_id() AND (user_id = auth.uid() OR user_id IS NULL));

CREATE POLICY "Directors can read audit logs" ON public.audit_logs FOR SELECT USING (org_id = public.get_my_org_id() AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'director'));

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

CREATE POLICY "Directors can manage org settings" ON public.org_settings FOR ALL USING (org_id = public.get_my_org_id() AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'director')) WITH CHECK (org_id = public.get_my_org_id() AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'director'));
