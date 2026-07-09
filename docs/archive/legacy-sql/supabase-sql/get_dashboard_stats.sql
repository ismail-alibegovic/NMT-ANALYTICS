-- RPC function to get dashboard stats for analytics
CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_org_id UUID,
  p_date_from TIMESTAMPTZ,
  p_date_to TIMESTAMPTZ
)
RETURNS JSONB AS $$
DECLARE
  v_revenue NUMERIC;
  v_bookings_count INT;
  v_top_packages JSONB;
  v_revenue_by_month JSONB;
  v_result JSONB;
BEGIN
  -- 1. Total Revenue
  SELECT COALESCE(SUM(total_amount), 0)
  INTO v_revenue
  FROM reservations
  WHERE org_id = p_org_id
    AND status IN ('confirmed', 'completed')
    AND reservation_at >= p_date_from
    AND reservation_at <= p_date_to;

  -- 2. Bookings Count
  SELECT COUNT(*)
  INTO v_bookings_count
  FROM reservations
  WHERE org_id = p_org_id
    AND reservation_at >= p_date_from
    AND reservation_at <= p_date_to;

  -- 3. Top Packages
  SELECT jsonb_agg(t)
  INTO v_top_packages
  FROM (
    SELECT 
      p.name,
      SUM(r.total_amount) as revenue,
      COUNT(r.id) as bookings
    FROM reservations r
    JOIN departures d ON r.departure_id = d.id
    JOIN packages p ON d.package_id = p.id
    WHERE r.org_id = p_org_id
      AND r.status IN ('confirmed', 'completed')
      AND r.reservation_at >= p_date_from
      AND r.reservation_at <= p_date_to
    GROUP BY p.name
    ORDER BY revenue DESC
    LIMIT 5
  ) t;

  -- 4. Revenue By Month
  SELECT jsonb_agg(m)
  INTO v_revenue_by_month
  FROM (
    SELECT 
      TO_CHAR(reservation_at, 'YYYY-MM') as month,
      SUM(total_amount) as revenue
    FROM reservations
    WHERE org_id = p_org_id
      AND status IN ('confirmed', 'completed')
      AND reservation_at >= p_date_from
      AND reservation_at <= p_date_to
    GROUP BY month
    ORDER BY month ASC
  ) m;

  -- Combine into final result
  v_result := jsonb_build_object(
    'revenue', v_revenue,
    'bookings_count', v_bookings_count,
    'top_packages', COALESCE(v_top_packages, '[]'::jsonb),
    'revenue_by_month', COALESCE(v_revenue_by_month, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
