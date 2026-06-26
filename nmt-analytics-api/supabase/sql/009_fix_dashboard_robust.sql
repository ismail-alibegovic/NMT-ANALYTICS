-- Redefine the get_dashboard_stats function with more robust handling and standardized parameter names
-- Aligned with frontend expectations (Home.tsx)
CREATE OR REPLACE FUNCTION get_dashboard_stats(p_org_id uuid, p_start_date timestamptz, p_end_date timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_revenue numeric;
  v_bookings_count integer;
  v_avg_value numeric;
  v_series jsonb;
  v_top_packages jsonb;
BEGIN
  -- 1. Revenue (Confirmed or Completed)
  SELECT COALESCE(SUM(total_amount), 0) INTO v_revenue
  FROM reservations
  WHERE org_id = p_org_id 
    AND status IN ('confirmed', 'completed') 
    AND created_at BETWEEN p_start_date AND p_end_date;

  -- 2. Bookings Count (All in period)
  SELECT COUNT(*) INTO v_bookings_count
  FROM reservations
  WHERE org_id = p_org_id 
    AND created_at BETWEEN p_start_date AND p_end_date;

  -- 3. Average Booking Value
  IF v_bookings_count > 0 THEN
    v_avg_value := ROUND(v_revenue / v_bookings_count, 2);
  ELSE
    v_avg_value := 0;
  END IF;

  -- 4. Revenue Series (Grouped by Month)
  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v_series
  FROM (
    SELECT 
      to_char(created_at, 'YYYY-MM') as month, 
      SUM(total_amount) as amount
    FROM reservations
    WHERE org_id = p_org_id 
      AND status IN ('confirmed', 'completed')
      AND created_at BETWEEN p_start_date AND p_end_date
    GROUP BY 1 
    ORDER BY 1
  ) t;

  -- 5. Top Packages (By booking count)
  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v_top_packages
  FROM (
    SELECT 
      p.name, 
      count(r.id)::int as bookings,
      SUM(r.total_amount) as revenue
    FROM reservations r
    JOIN departures d ON r.departure_id = d.id
    JOIN packages p ON d.package_id = p.id
    WHERE r.org_id = p_org_id
      AND r.status IN ('confirmed', 'completed')
      AND r.created_at BETWEEN p_start_date AND p_end_date
    GROUP BY p.name
    ORDER BY 2 DESC
    LIMIT 5
  ) t;

  RETURN jsonb_build_object(
    'revenue', v_revenue,
    'total_revenue', v_revenue, -- Include both for safety
    'bookings_count', v_bookings_count,
    'average_booking_value', v_avg_value,
    'revenue_by_month', v_series,
    'top_packages', v_top_packages
  );
END;
$$;
