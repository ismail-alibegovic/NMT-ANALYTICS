-- RPC function to get dashboard analytics for an organization
CREATE OR REPLACE FUNCTION get_dashboard_stats(
    p_org_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
)
RETURNS JSONB AS $$
DECLARE
    v_total_revenue NUMERIC;
    v_bookings_count BIGINT;
    v_average_booking_value NUMERIC;
    v_revenue_by_month JSONB;
    v_top_packages JSONB;
    v_result JSONB;
BEGIN
    -- 1. Total Revenue (confirmed or completed)
    SELECT COALESCE(SUM(total_amount), 0)
    INTO v_total_revenue
    FROM reservations
    WHERE org_id = p_org_id
      AND status IN ('confirmed', 'completed')
      AND reservation_at >= p_start_date
      AND reservation_at <= p_end_date;

    -- 2. Bookings Count
    SELECT COUNT(*)
    INTO v_bookings_count
    FROM reservations
    WHERE org_id = p_org_id
      AND reservation_at >= p_start_date
      AND reservation_at <= p_end_date;

    -- 3. Average Booking Value
    IF v_bookings_count > 0 THEN
        v_average_booking_value := v_total_revenue / v_bookings_count;
    ELSE
        v_average_booking_value := 0;
    END IF;

    -- 4. Revenue By Month (for charts)
    SELECT jsonb_agg(m)
    INTO v_revenue_by_month
    FROM (
        SELECT 
            TO_CHAR(date_trunc('month', reservation_at), 'YYYY-MM') as month,
            SUM(total_amount) as amount
        FROM reservations
        WHERE org_id = p_org_id
          AND status IN ('confirmed', 'completed')
          AND reservation_at >= p_start_date
          AND reservation_at <= p_end_date
        GROUP BY 1
        ORDER BY 1 ASC
    ) m;

    -- 5. Top 5 Performing Packages
    SELECT jsonb_agg(p)
    INTO v_top_packages
    FROM (
        SELECT 
            pkg.name,
            SUM(res.total_amount) as revenue,
            COUNT(res.id) as bookings
        FROM reservations res
        JOIN departures dept ON res.departure_id = dept.id
        JOIN packages pkg ON dept.package_id = pkg.id
        WHERE res.org_id = p_org_id
          AND res.status IN ('confirmed', 'completed')
          AND res.reservation_at >= p_start_date
          AND res.reservation_at <= p_end_date
        GROUP BY pkg.name
        ORDER BY revenue DESC
        LIMIT 5
    ) p;

    -- Combine into final JSONB result
    v_result := jsonb_build_object(
        'total_revenue', v_total_revenue,
        'bookings_count', v_bookings_count,
        'average_booking_value', ROUND(v_average_booking_value, 2),
        'revenue_by_month', COALESCE(v_revenue_by_month, '[]'::jsonb),
        'top_packages', COALESCE(v_top_packages, '[]'::jsonb)
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
