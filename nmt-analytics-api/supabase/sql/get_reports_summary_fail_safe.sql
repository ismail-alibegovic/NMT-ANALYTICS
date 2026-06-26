CREATE OR REPLACE FUNCTION get_reports_summary(
  p_org_id uuid, 
  p_start_date timestamptz, 
  p_end_date timestamptz
)
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
  -- 1. Aggregate Transaction Revenue (Real cash flow)
  SELECT 
    COALESCE(SUM(CASE WHEN type = 'payment' THEN amount ELSE -amount END), 0)
  INTO v_transaction_revenue
  FROM transactions
  WHERE org_id = p_org_id 
    AND occurred_at BETWEEN p_start_date AND p_end_date;

  -- 2. Aggregate Booking Revenue Breakdown & Counts
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
  FROM reservations
  WHERE org_id = p_org_id 
    AND reservation_at BETWEEN p_start_date AND p_end_date
    AND status IN ('confirmed', 'completed');

  -- 3. Calculate Unpaid & Percent (Guard against negative and div by zero)
  v_unpaid_revenue := GREATEST(v_booked_revenue - v_paid_revenue, 0);
  
  IF v_booked_revenue > 0 THEN
    v_paid_percent := ROUND((v_paid_revenue / v_booked_revenue) * 100, 1);
  ELSE
    v_paid_percent := 0;
  END IF;

  -- 4. Guard against division by zero for avgOrderValue
  IF v_total_reservations > 0 THEN
    v_avg_order_value := ROUND(v_transaction_revenue / v_total_reservations, 2);
  ELSE
    v_avg_order_value := 0;
  END IF;

  -- 5. Fetch top destinations
  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v_top_destinations
  FROM (
    SELECT 
      p.destination, 
      COUNT(r.id)::int as reservations,
      COALESCE(SUM(r.total_amount), 0)::numeric(12,2) as revenue
    FROM reservations r
    JOIN departures d ON r.departure_id = d.id
    JOIN packages p ON d.package_id = p.id
    WHERE r.org_id = p_org_id
      AND r.reservation_at BETWEEN p_start_date AND p_end_date
      AND r.status IN ('confirmed', 'completed')
    GROUP BY p.destination
    ORDER BY 2 DESC
    LIMIT 10
  ) t;

  -- 6. Return combined JSON object
  RETURN jsonb_build_object(
    'totalRevenue', v_transaction_revenue, -- Keep as transaction-based for main display
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
