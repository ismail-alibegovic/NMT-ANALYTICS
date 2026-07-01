import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';
import archiver from 'archiver';

const router = Router();

/**
 * GET /api/export/all.zip
 *
 * Exports all organization data as CSV files in a ZIP archive.
 * Includes: customers, packages, departures, reservations, transactions
 *
 * Response: application/zip with filename "travline-export-YYYY-MM-DD.zip"
 */
router.get('/export/all.zip', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const orgId = req.orgId!;
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `travline-export-${dateStr}.zip`;

    // Fetch all data in parallel
    const [customersResult, packagesResult, departuresResult, reservationsResult, transactionsResult] = await Promise.all([
      supabaseAdmin
        .from('customers')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at'),

      supabaseAdmin
        .from('packages')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at'),

      supabaseAdmin
        .from('departures')
        .select(`
          *,
          packages (name, destination)
        `)
        .eq('org_id', orgId)
        .order('depart_at'),

      supabaseAdmin
        .from('reservations')
        .select(`
          *,
          customers (full_name, phone, email),
          departures (
            depart_at,
            return_at,
            packages (name, destination)
          )
        `)
        .eq('org_id', orgId)
        .order('reservation_at'),

      supabaseAdmin
        .from('transactions')
        .select('*')
        .eq('org_id', orgId)
        .order('occurred_at')
    ]);

    if (customersResult.error) throw customersResult.error;
    if (packagesResult.error) throw packagesResult.error;
    if (departuresResult.error) throw departuresResult.error;
    if (reservationsResult.error) throw reservationsResult.error;
    if (transactionsResult.error) throw transactionsResult.error;

    // Build all CSVs in memory
    const files: { name: string; content: string }[] = [];

    // Customers CSV
    const customerHeaders = ['id', 'full_name', 'phone', 'email', 'notes', 'created_at', 'updated_at'];
    files.push({
      name: 'customers.csv',
      content: toCSV(customersResult.data || [], customerHeaders)
    });

    // Packages CSV
    const pkgHeaders = ['id', 'name', 'destination', 'base_price', 'currency', 'is_active', 'description', 'duration_days', 'max_participants', 'start_date', 'end_date', 'created_at', 'updated_at'];
    files.push({
      name: 'packages.csv',
      content: toCSV(packagesResult.data || [], pkgHeaders)
    });

    // Departures CSV
    const depData = (departuresResult.data || []).map(d => ({
      id: d.id,
      package_name: d.packages?.name || '',
      package_destination: d.packages?.destination || '',
      depart_at: d.depart_at,
      return_at: d.return_at,
      capacity: d.capacity,
      booked: d.booked,
      status: d.status,
      created_at: d.created_at,
      updated_at: d.updated_at
    }));
    const depHeaders = ['id', 'package_name', 'package_destination', 'depart_at', 'return_at', 'capacity', 'booked', 'status', 'created_at', 'updated_at'];
    files.push({
      name: 'departures.csv',
      content: toCSV(depData, depHeaders)
    });

    // Reservations CSV
    const resData = (reservationsResult.data || []).map(r => ({
      id: r.id,
      customer_name: r.customers?.full_name || r.customer_name,
      customer_phone: r.customers?.phone || r.customer_phone,
      customer_email: r.customers?.email || '',
      package_name: r.departures?.packages?.name || '',
      package_destination: r.departures?.packages?.destination || '',
      departure_date: r.departures?.depart_at || '',
      return_date: r.departures?.return_at || '',
      party_size: r.party_size,
      reservation_at: r.reservation_at,
      status: r.status,
      total_amount: r.total_amount,
      paid_amount: r.paid_amount,
      currency: r.currency,
      source: r.source || '',
      created_at: r.created_at,
      updated_at: r.updated_at
    }));
    const resHeaders = ['id', 'customer_name', 'customer_phone', 'customer_email', 'package_name', 'package_destination', 'departure_date', 'return_date', 'party_size', 'reservation_at', 'status', 'total_amount', 'paid_amount', 'currency', 'source', 'created_at', 'updated_at'];
    files.push({
      name: 'reservations.csv',
      content: toCSV(resData, resHeaders)
    });

    // Transactions CSV
    const txHeaders = ['id', 'reservation_id', 'amount', 'currency', 'type', 'note', 'occurred_at', 'created_at', 'updated_at'];
    files.push({
      name: 'transactions.csv',
      content: toCSV(transactionsResult.data || [], txHeaders)
    });

    // README
    files.push({
      name: 'README.md',
      content: `# Travline Data Export\n\nThis archive contains all data exported on ${new Date().toISOString()}.\n\nFiles:\n- customers.csv\n- packages.csv\n- departures.csv\n- reservations.csv\n- transactions.csv\n`
    });

    // Build ZIP archive into buffer
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('error', (err: any) => { throw err; });

    for (const file of files) {
      archive.append(file.content, { name: file.name });
    }

    await archive.finalize();
    const zipBuffer = Buffer.concat(chunks);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', zipBuffer.length);
    return res.send(zipBuffer);
  } catch (error) {
    console.error('Error in export/all.zip:', error);
    if (!res.headersSent) {
      apiError(res, 500, 'EXPORT_ERROR', 'Failed to export data');
    }
  }
});

/**
 * GET /api/export/customers.csv
 *
 * Export customers as CSV with optional filtering
 *
 * Query params:
 * - search: Search in name, phone, email
 * - hasReservations: "true" to only include customers with reservations
 */
router.get('/export/customers.csv', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const { search, hasReservations } = req.query;
    const orgId = req.orgId!;

    let query = supabaseAdmin
      .from('customers')
      .select('*')
      .eq('org_id', orgId);

    // Add search filter if provided
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = search.trim();
      query = query.or(`full_name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
    }

    // Filter by customers with reservations if requested
    if (hasReservations === 'true') {
      const { data: customerIds } = await supabaseAdmin
        .from('reservations')
        .select('customer_id')
        .eq('org_id', orgId);

      const ids = [...new Set(customerIds?.map(r => r.customer_id).filter(Boolean))];
      if (ids.length > 0) {
        query = query.in('id', ids);
      } else {
        // No customers with reservations
        query = query.eq('id', '00000000-0000-0000-0000-000000000000'); // Will return no results
      }
    }

    const { data: customers, error } = await query.order('created_at');

    if (error) return handleSupabaseError(res, error, "Failed to export customers");

    // Convert to CSV
    const csvHeaders = ['fullName', 'phone', 'email', 'notes', 'createdAt'];
    const csvRows = (customers || []).map(customer => [
      customer.full_name,
      customer.phone,
      customer.email || '',
      customer.notes || '',
      customer.created_at
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(field => `"${field}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="customers_export.csv"');
    res.send(csvContent);

  } catch (error) {
    console.error('Error in GET /export/customers.csv:', error);
    apiError(res, 500, 'EXPORT_ERROR', 'Failed to export customers');
  }
});

/**
 * GET /api/export/packages.csv
 *
 * Export packages as CSV with optional filtering
 *
 * Query params:
 * - search: Search in name, destination, description
 * - isActive: "true" or "false" to filter by active status
 * - hasDepartures: "true" to only include packages with departures
 */
router.get('/export/packages.csv', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const { search, isActive, hasDepartures } = req.query;
    const orgId = req.orgId!;

    let query = supabaseAdmin
      .from('packages')
      .select('*')
      .eq('org_id', orgId);

    // Add search filter if provided
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = search.trim();
      query = query.or(`name.ilike.%${searchTerm}%,destination.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
    }

    // Filter by active status if specified
    if (isActive !== undefined) {
      const active = isActive === 'true';
      query = query.eq('is_active', active);
    }

    // Filter by packages with departures if requested
    if (hasDepartures === 'true') {
      const { data: packageIds } = await supabaseAdmin
        .from('departures')
        .select('package_id')
        .eq('org_id', orgId);

      const ids = [...new Set(packageIds?.map(d => d.package_id).filter(Boolean))];
      if (ids.length > 0) {
        query = query.in('id', ids);
      } else {
        // No packages with departures
        query = query.eq('id', '00000000-0000-0000-0000-000000000000'); // Will return no results
      }
    }

    const { data: packages, error } = await query.order('created_at');

    if (error) return handleSupabaseError(res, error, "Failed to export packages");

    // Convert to CSV
    const csvHeaders = ['name', 'destination', 'basePrice', 'currency', 'isActive', 'description', 'durationDays', 'maxParticipants', 'startDate', 'endDate', 'createdAt'];
    const csvRows = (packages || []).map(pkg => [
      pkg.name,
      pkg.destination,
      pkg.base_price,
      pkg.currency,
      pkg.is_active,
      pkg.description || '',
      pkg.duration_days || '',
      pkg.max_participants || '',
      pkg.start_date || '',
      pkg.end_date || '',
      pkg.created_at
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(field => `"${field}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="packages_export.csv"');
    res.send(csvContent);

  } catch (error) {
    console.error('Error in GET /export/packages.csv:', error);
    apiError(res, 500, 'EXPORT_ERROR', 'Failed to export packages');
  }
});

/**
 * GET /api/export/departures.csv
 *
 * Export departures as CSV with optional filtering
 *
 * Query params:
 * - search: Search in package name, destination
 * - status: Filter by status (active, cancelled, completed)
 * - fromDate: Filter departures from this date (YYYY-MM-DD)
 * - toDate: Filter departures to this date (YYYY-MM-DD)
 */
router.get('/export/departures.csv', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const { search, status, fromDate, toDate } = req.query;
    const orgId = req.orgId!;

    let query = supabaseAdmin
      .from('departures')
      .select(`
        *,
        packages (name, destination)
      `)
      .eq('org_id', orgId);

    // Add search filter if provided
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = search.trim();
      query = query.or(`packages.name.ilike.%${searchTerm}%,packages.destination.ilike.%${searchTerm}%`);
    }

    // Filter by status if specified
    if (status && typeof status === 'string') {
      query = query.eq('status', status);
    }

    // Filter by date range if specified
    if (fromDate && typeof fromDate === 'string') {
      query = query.gte('depart_at', `${fromDate}T00:00:00Z`);
    }
    if (toDate && typeof toDate === 'string') {
      query = query.lte('depart_at', `${toDate}T23:59:59Z`);
    }

    const { data: departures, error } = await query.order('depart_at');

    if (error) return handleSupabaseError(res, error, "Failed to export departures");

    // Convert to CSV
    const csvHeaders = ['packageName', 'packageDestination', 'departAt', 'returnAt', 'capacity', 'booked', 'status', 'createdAt'];
    const csvRows = (departures || []).map(dep => [
      dep.packages?.name || '',
      dep.packages?.destination || '',
      dep.depart_at,
      dep.return_at,
      dep.capacity,
      dep.booked,
      dep.status,
      dep.created_at
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(field => `"${field}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="departures_export.csv"');
    res.send(csvContent);

  } catch (error) {
    console.error('Error in GET /export/departures.csv:', error);
    apiError(res, 500, 'EXPORT_ERROR', 'Failed to export departures');
  }
});

/**
 * GET /api/export/reservations.csv
 *
 * Export reservations as CSV with optional filtering
 *
 * Query params:
 * - search: Search in customer name, phone, package name
 * - status: Filter by status (pending, confirmed, cancelled)
 * - fromDate: Filter reservations from this date (YYYY-MM-DD)
 * - toDate: Filter reservations to this date (YYYY-MM-DD)
 */
router.get('/export/reservations.csv', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const { search, status, fromDate, toDate } = req.query;
    const orgId = req.orgId!;

    let query = supabaseAdmin
      .from('reservations')
      .select(`
        *,
        customers (full_name, phone, email),
        departures (
          depart_at,
          return_at,
          packages (name, destination)
        )
      `)
      .eq('org_id', orgId);

    // Add search filter if provided
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = search.trim();
      query = query.or(`customer_name.ilike.%${searchTerm}%,customer_phone.ilike.%${searchTerm}%,departures.packages.name.ilike.%${searchTerm}%`);
    }

    // Filter by status if specified
    if (status && typeof status === 'string') {
      query = query.eq('status', status);
    }

    // Filter by date range if specified
    if (fromDate && typeof fromDate === 'string') {
      query = query.gte('reservation_at', `${fromDate}T00:00:00Z`);
    }
    if (toDate && typeof toDate === 'string') {
      query = query.lte('reservation_at', `${toDate}T23:59:59Z`);
    }

    const { data: reservations, error } = await query.order('reservation_at');

    if (error) return handleSupabaseError(res, error, "Failed to export reservations");

    // Convert to CSV
    const csvHeaders = ['customerName', 'customerPhone', 'customerEmail', 'packageName', 'packageDestination', 'departureDate', 'returnDate', 'partySize', 'reservationAt', 'status', 'totalAmount', 'currency', 'source', 'createdAt'];
    const csvRows = (reservations || []).map(res => [
      res.customers?.full_name || res.customer_name,
      res.customers?.phone || res.customer_phone,
      res.customers?.email || '',
      res.departures?.packages?.name || '',
      res.departures?.packages?.destination || '',
      res.departures?.depart_at || '',
      res.departures?.return_at || '',
      res.party_size,
      res.reservation_at,
      res.status,
      res.total_amount || '',
      res.currency,
      res.source || '',
      res.created_at
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(field => `"${field}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="reservations_export.csv"');
    res.send(csvContent);

  } catch (error) {
    console.error('Error in GET /export/reservations.csv:', error);
    apiError(res, 500, 'EXPORT_ERROR', 'Failed to export reservations');
  }
});

/**
 * GET /api/export/transactions.csv
 *
 * Export transactions as CSV with optional filtering
 *
 * Query params:
 * - type: Filter by transaction type
 * - fromDate: Filter transactions from this date (YYYY-MM-DD)
 * - toDate: Filter transactions to this date (YYYY-MM-DD)
 */
router.get('/export/transactions.csv', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const { type, fromDate, toDate } = req.query;
    const orgId = req.orgId!;

    let query = supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('org_id', orgId);

    // Filter by type if specified
    if (type && typeof type === 'string') {
      query = query.eq('type', type);
    }

    // Filter by date range if specified
    if (fromDate && typeof fromDate === 'string') {
      query = query.gte('occurred_at', `${fromDate}T00:00:00Z`);
    }
    if (toDate && typeof toDate === 'string') {
      query = query.lte('occurred_at', `${toDate}T23:59:59Z`);
    }

    const { data: transactions, error } = await query.order('occurred_at');

    if (error) return handleSupabaseError(res, error, "Failed to export transactions");

    // Convert to CSV
    const csvHeaders = ['amount', 'currency', 'type', 'note', 'occurredAt', 'createdAt'];
    const csvRows = (transactions || []).map(tx => [
      tx.amount,
      tx.currency,
      tx.type,
      tx.note || '',
      tx.occurred_at,
      tx.created_at
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(field => `"${field}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="transactions_export.csv"');
    res.send(csvContent);

  } catch (error) {
    console.error('Error in GET /export/transactions.csv:', error);
    apiError(res, 500, 'EXPORT_ERROR', 'Failed to export transactions');
  }
});

// ── Helper: convert array of objects to CSV ──────────────────────────────
function toCSV(data: Record<string, any>[], headers: string[]): string {
  const BOM = '\ufeff';
  const rows = data.map(row =>
    headers.map(h => {
      const v = row[h];
      if (v === null || v === undefined) return '';
      const s = String(v);
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    }).join(',')
  );
  return BOM + headers.join(',') + '\n' + rows.join('\n');
}

export default router;