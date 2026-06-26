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
 * Response: application/zip with filename "nmt-export-YYYY-MM-DD.zip"
 */
router.get('/export/all.zip', authenticateToken, requireOrgContext, async (req, res: Response) => {
  try {
    const orgId = req.orgId!;
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `nmt-export-${dateStr}.zip`;

    // Set response headers
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Create ZIP archive
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    // Handle archive errors
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) {
        apiError(res, 500, 'ARCHIVE_ERROR', 'Failed to create archive');
      }
    });

    // Pipe archive to response
    archive.pipe(res);

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

    // Check for errors
    if (customersResult.error) throw customersResult.error;
    if (packagesResult.error) throw packagesResult.error;
    if (departuresResult.error) throw departuresResult.error;
    if (reservationsResult.error) throw reservationsResult.error;
    if (transactionsResult.error) throw transactionsResult.error;

    // Helper function to convert array of objects to CSV
    const arrayToCSV = (data: any[], headers: string[]): string => {
      const csvRows = [headers.join(',')];

      for (const row of data) {
        const values = headers.map(header => {
          const value = row[header];
          // Escape commas and quotes in CSV
          if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value || '';
        });
        csvRows.push(values.join(','));
      }

      return csvRows.join('\n');
    };

    // Generate CSV files

    // Customers CSV
    const customersHeaders = ['id', 'full_name', 'phone', 'email', 'notes', 'created_at', 'updated_at'];
    const customersCSV = arrayToCSV(customersResult.data || [], customersHeaders);
    archive.append(customersCSV, { name: 'customers.csv' });

    // Packages CSV
    const packagesHeaders = ['id', 'name', 'destination', 'base_price', 'currency', 'is_active', 'description', 'duration_days', 'max_participants', 'start_date', 'end_date', 'created_at', 'updated_at'];
    const packagesCSV = arrayToCSV(packagesResult.data || [], packagesHeaders);
    archive.append(packagesCSV, { name: 'packages.csv' });

    // Departures CSV
    const departuresData = (departuresResult.data || []).map(dep => ({
      id: dep.id,
      package_name: dep.packages?.name || '',
      package_destination: dep.packages?.destination || '',
      depart_at: dep.depart_at,
      return_at: dep.return_at,
      capacity: dep.capacity,
      booked: dep.booked,
      status: dep.status,
      created_at: dep.created_at,
      updated_at: dep.updated_at
    }));
    const departuresHeaders = ['id', 'package_name', 'package_destination', 'depart_at', 'return_at', 'capacity', 'booked', 'status', 'created_at', 'updated_at'];
    const departuresCSV = arrayToCSV(departuresData, departuresHeaders);
    archive.append(departuresCSV, { name: 'departures.csv' });

    // Reservations CSV
    const reservationsData = (reservationsResult.data || []).map(res => ({
      id: res.id,
      customer_name: res.customers?.full_name || res.customer_name,
      customer_phone: res.customers?.phone || res.customer_phone,
      customer_email: res.customers?.email || '',
      package_name: res.departures?.packages?.name || '',
      package_destination: res.departures?.packages?.destination || '',
      departure_date: res.departures?.depart_at || '',
      return_date: res.departures?.return_at || '',
      party_size: res.party_size,
      reservation_at: res.reservation_at,
      status: res.status,
      total_amount: res.total_amount,
      currency: res.currency,
      source: res.source,
      created_at: res.created_at,
      updated_at: res.updated_at
    }));
    const reservationsHeaders = ['id', 'customer_name', 'customer_phone', 'customer_email', 'package_name', 'package_destination', 'departure_date', 'return_date', 'party_size', 'reservation_at', 'status', 'total_amount', 'currency', 'source', 'created_at', 'updated_at'];
    const reservationsCSV = arrayToCSV(reservationsData, reservationsHeaders);
    archive.append(reservationsCSV, { name: 'reservations.csv' });

    // Transactions CSV
    const transactionsHeaders = ['id', 'amount', 'currency', 'type', 'note', 'occurred_at', 'created_at', 'updated_at'];
    const transactionsCSV = arrayToCSV(transactionsResult.data || [], transactionsHeaders);
    archive.append(transactionsCSV, { name: 'transactions.csv' });

    // Add a README file to the ZIP
    const readmeContent = `# NMT Analytics Data Export

This archive contains all data for your organization exported on ${new Date().toISOString()}.

## Files Included:

- customers.csv: All customer records
- packages.csv: All travel packages
- departures.csv: All departure schedules
- reservations.csv: All booking records
- transactions.csv: All payment transactions

## Import Instructions:

To import this data into another NMT Analytics instance:

1. Extract the ZIP file
2. Use the import API endpoint: POST /api/import
3. Send the data as JSON arrays in the request body
4. Or use the admin interface import feature

## Notes:

- All data is organization-scoped
- Dates are in ISO format (YYYY-MM-DDTHH:mm:ss.sssZ)
- IDs are internal identifiers and may change between systems
- Use natural keys (names, phones, dates) for cross-system compatibility
`;

    archive.append(readmeContent, { name: 'README.md' });

    // Finalize the archive
    await archive.finalize();

  } catch (error) {
    console.error('Error in GET /export/all.zip:', error);
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

export default router;
