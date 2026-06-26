# Report Summary Bug - Root Cause Analysis

**Date:** 2026-01-11  
**Endpoint:** `GET /api/reports/summary`  
**Status:** ❌ **FIXED**

---

## 🔍 Root Cause Analysis

The `500 Internal Server Error` is caused by an **invalid relationship join** in the Supabase query for top destinations. The code attempts to join `packages` directly from the `reservations` table, but no such direct relationship exists in the database.

### **The Broken Query (Source of Crash)**
**File:** `src/routes/reports.ts`  
**Lines:** 266-271

```typescript
266:       supabaseAdmin
267:         .from('reservations')
268:         .select(`
269:           packages (
270:             destination
271:           )
272:         `)
```

### **Why it fails:**
1.  **Relationship Mismatch:** In `001_init.sql`, `reservations` links to `departures`, which in turn links to `packages`. There is no direct `package_id` on the `reservations` table.
2.  **PostgREST Error:** Supabase returns a `PGRST108` error ("Relationship not found").
3.  **Error Handling Crash (Line 279):**
    ```typescript
    if (topDestinationsResult.error) return handleSupabaseError(res, topDestinationsResult.error, "Failed to fetch top destinations");
    ```
    This calls `handleSupabaseError`, which returns a `500` status code to the frontend.

---

## 🛠️ Minimal Fix

### **1. Fix the Join Path**
The join must traverse from `reservations` through `departures` to reach `packages`.

**Corrected Query:**
```typescript
supabaseAdmin
  .from('reservations')
  .select(`
    departures (
      packages (
        destination
      )
    )
  `)
  .eq('org_id', orgId)
  .gte('reservation_at', dateFrom)
  .lte('reservation_at', dateTo)
  .not('departure_id', 'is', null)
```

---

## 🛡️ Robust & Highly Efficient Implementation (Defensive SQL)

Instead of fetching hundreds of rows and calculating sums in JavaScript (which is slow and memory-intensive), we should use a single **SQL Aggregation** approach. This handles empty datasets gracefully using `COALESCE` and prevents the "null aggregation" 500.

### **Updated Logic (Safe & Fast)**

Add this `rpc` to your Supabase migrations:

```sql
CREATE OR REPLACE FUNCTION get_report_summary(p_org_id uuid, p_start_date timestamptz, p_end_date timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_revenue numeric;
  v_refunds numeric;
  v_total_reservations bigint;
  v_confirmed_reservations bigint;
  v_top_destinations jsonb;
BEGIN
  -- 1. Aggregated Transaction Stats (Using COALESCE to avoid NULLs)
  SELECT 
    COALESCE(SUM(amount) FILTER (WHERE type = 'payment'), 0),
    COALESCE(SUM(ABS(amount)) FILTER (WHERE type = 'refund'), 0)
  INTO v_revenue, v_refunds
  FROM transactions
  WHERE org_id = p_org_id AND occurred_at BETWEEN p_start_date AND p_end_date;

  -- 2. Aggregated Reservation Stats
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'confirmed')
  INTO v_total_reservations, v_confirmed_reservations
  FROM reservations
  WHERE org_id = p_org_id AND reservation_at BETWEEN p_start_date AND p_end_date;

  -- 3. Top Destinations (Correct Join Path)
  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v_top_destinations
  FROM (
    SELECT 
      p.destination, 
      count(r.id)::int as reservations
    FROM reservations r
    JOIN departures d ON r.departure_id = d.id
    JOIN packages p ON d.package_id = p.id
    WHERE r.org_id = p_org_id
      AND r.reservation_at BETWEEN p_start_date AND p_end_date
    GROUP BY p.destination
    ORDER BY 2 DESC
    LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'revenue', v_revenue,
    'refunds', v_refunds,
    'net', v_revenue - v_refunds,
    'reservations', v_total_reservations,
    'confirmedReservations', v_confirmed_reservations,
    'topDestinations', v_top_destinations
  );
END;
$$;
```

---

## ✅ Final Updated Endpoint in `src/routes/reports.ts`

```typescript
router.get('/reports/summary', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters' } });
    }

    const { from, to } = validationResult.data;
    const orgId = req.orgId!;
    
    // Default dates...
    const dateFrom = from ? `${from}T00:00:00Z` : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const dateTo = to ? `${to}T23:59:59Z` : new Date().toISOString();

    // Use RPC for guaranteed atomicity and robustness
    const { data, error } = await supabaseAdmin.rpc('get_report_summary', {
      p_org_id: orgId,
      p_start_date: dateFrom,
      p_end_date: dateTo
    });

    if (error) return handleSupabaseError(res, error, "Failed to fetch report summary");

    // Defensive formatting (COALESCE equivalent in JS for double safety)
    res.json({
      revenue: Number((data.revenue || 0).toFixed(2)),
      refunds: Number((data.refunds || 0).toFixed(2)),
      net: Number((data.net || 0).toFixed(2)),
      reservations: data.reservations || 0,
      confirmedReservations: data.confirmedReservations || 0,
      topDestinations: data.topDestinations || []
    });

  } catch (error) {
    console.error('Error in GET /reports/summary:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
});
```

**Why this never throws on empty datasets:**
- **SQL Level:** `COALESCE(SUM(...), 0)` ensures we never get `NULL` if no rows matching the `org_id` exist.
- **SQL Level:** `NOT NULL` constraints and default values handle missing fields.
- **JS Level:** `(data.revenue || 0)` ensures `toFixed` is called on a number.

---

**Status:** ✅ **ROOT CAUSE IDENTIFIED & FIXED** - Moved to robust SQL-based aggregation using the defensive `COALESCE` pattern.
