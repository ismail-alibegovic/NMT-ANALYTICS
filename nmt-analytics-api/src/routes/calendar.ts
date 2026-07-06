import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin } from '../lib/supabase';
import { apiError } from '../lib/errors';
import { z } from 'zod';
import { requireMinimumRole } from '../middleware/requireRole';

const router = Router();

const monthSchema = z.object({
  // YYYY-MM, e.g. 2026-07. Defaults to current month in Europe/Sarajevo.
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Invalid month format. Use YYYY-MM')
    .optional(),
});

function monthBounds(month: string): { start: string; end: string } {
  // month is YYYY-MM (UTC). Build inclusive date range covering the full month.
  const [year, m] = month.split('-').map(Number);
  const start = `${month}-01T00:00:00Z`;
  // last day of month
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const end = `${month}-${String(lastDay).padStart(2, '0')}T23:59:59Z`;
  return { start, end };
}

function currentSarajevoMonth(): string {
  // Europe/Sarajevo is UTC+1 (UTC+2 DST). Compute current month in that tz.
  const now = new Date();
  const shifted = new Date(now.getTime() + 60 * 60 * 1000); // crude UTC+1
  return shifted.toISOString().slice(0, 7);
}

/**
 * GET /api/calendar?month=2026-07
 * Returns all departures in the given month with booked/capacity counts,
 * plus the reservations tied to each departure. Designed for the visual
 * travel calendar page.
 */
router.get(
  '/calendar',
  authenticateToken,
  requireOrgContext,
  requireMinimumRole('agent'),
  async (req, res: Response) => {
    try {
      const v = monthSchema.safeParse(req.query);
      if (!v.success) {
        return apiError(res, 400, 'VALIDATION_ERROR', 'Validation error', v.error.issues);
      }
      const month = v.data.month || currentSarajevoMonth();
      const { start, end } = monthBounds(month);
      const orgId = req.orgId!;

      const { data: departures, error } = await supabaseAdmin
        .from('departures')
        .select(
          `id,
           depart_at,
           return_at,
           capacity,
           booked,
           status,
           packages (id, name, destination)`
        )
        .eq('org_id', orgId)
        .gte('depart_at', start)
        .lte('depart_at', end)
        .order('depart_at', { ascending: true });

      if (error) throw error;

      // Pull reservation counts per departure in one query
      const depIds = (departures || []).map((d: any) => d.id);
      let perDepartureCounts: Record<string, { total: number; confirmed: number }> = {};
      if (depIds.length > 0) {
        const { data: reservations } = await supabaseAdmin
          .from('reservations')
          .select('departure_id, status')
          .in('departure_id', depIds)
          .eq('org_id', orgId);

        const counts: Record<string, { total: number; confirmed: number }> = {};
        for (const r of reservations || []) {
          const k = r.departure_id;
          if (!counts[k]) counts[k] = { total: 0, confirmed: 0 };
          counts[k].total += 1;
          if (r.status === 'confirmed') counts[k].confirmed += 1;
        }
        perDepartureCounts = counts;
      }

      const events = (departures || []).map((d: any) => {
        const pkg = d.packages as any;
        const counts = perDepartureCounts[d.id] || { total: 0, confirmed: 0 };
        const capacity = Number(d.capacity ?? 0);
        const booked = Number(d.booked ?? 0);
        return {
          id: d.id,
          departAt: d.depart_at,
          returnAt: d.return_at,
          capacity,
          booked,
          available: Math.max(0, capacity - booked),
          status: d.status,
          packageId: pkg?.id || null,
          packageName: pkg?.name || null,
          destination: pkg?.destination || null,
          reservationCount: counts.total,
          confirmedCount: counts.confirmed,
        };
      });

      return res.json({ month, events });
    } catch (err) {
      console.error('Error in GET /calendar:', err);
      apiError(res, 500, 'INTERNAL_ERROR', 'Internal server error', String(err));
    }
  }
);

export default router;
