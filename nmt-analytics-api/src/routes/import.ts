import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin } from '../lib/supabase';
import { z } from 'zod';
import multer from 'multer';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { apiError } from "../lib/errors";

const router = Router();

// Configure multer for file uploads
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and XLSX files are allowed'));
    }
  },
});

// --- Validation Schemas ---

const customerImportSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  phone: z.string().min(1, 'Phone number is required'),
  email: z.string().email().optional().or(z.literal('')).or(z.null()),
  notes: z.string().optional().or(z.null()),
}).transform(data => ({
  full_name: data.fullName,
  phone: data.phone,
  email: data.email,
  notes: data.notes
}));

const packageImportSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  destination: z.string().min(1, 'Destination is required'),
  basePrice: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? parseFloat(val) : val),
  currency: z.string().default('BAM'),
  isActive: z.boolean().default(true),
  description: z.string().optional().or(z.null()),
  durationDays: z.number().optional().or(z.null()),
  maxParticipants: z.number().optional().or(z.null()),
  startDate: z.string().optional().or(z.null()),
  endDate: z.string().optional().or(z.null()),
}).transform(data => ({
  name: data.name,
  destination: data.destination,
  base_price: data.basePrice,
  currency: data.currency,
  is_active: data.isActive,
  description: data.description,
  duration_days: data.durationDays,
  max_participants: data.maxParticipants,
  start_date: data.startDate,
  end_date: data.endDate
}));

const departureImportSchema = z.object({
  packageId: z.string().uuid(),
  departAt: z.string().datetime(),
  returnAt: z.string().datetime(),
  capacity: z.number().int().min(1),
  status: z.string().default('active'),
}).transform(data => ({
  package_id: data.packageId,
  depart_at: data.departAt,
  return_at: data.returnAt,
  capacity: data.capacity,
  status: data.status
}));

const reservationImportSchema = z.object({
  customerId: z.string().uuid(),
  departureId: z.string().uuid(),
  partySize: z.number().int().min(1),
  reservationAt: z.string().datetime(),
  status: z.string().default('pending'),
  totalAmount: z.number().optional(),
  currency: z.string().default('BAM'),
}).transform(data => ({
  customer_id: data.customerId,
  departure_id: data.departureId,
  party_size: data.partySize,
  reservation_at: data.reservationAt,
  status: data.status,
  total_amount: data.totalAmount,
  currency: data.currency
}));

const transactionImportSchema = z.object({
  amount: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? parseFloat(val) : val),
  currency: z.string().default('BAM'),
  type: z.string(),
  note: z.string().optional().or(z.null()),
  occurredAt: z.string().datetime(),
}).transform(data => ({
  amount: data.amount,
  currency: data.currency,
  type: data.type,
  note: data.note,
  occurred_at: data.occurredAt
}));

// --- Config ---

const ENTITY_CONFIG: Record<string, any> = {
  customers: {
    table: 'customers',
    schema: customerImportSchema,
    defaultMatchKey: 'phone',
  },
  packages: {
    table: 'packages',
    schema: packageImportSchema,
    defaultMatchKey: 'name',
  },
  departures: {
    table: 'departures',
    schema: departureImportSchema,
    defaultMatchKey: 'id',
  },
  reservations: {
    table: 'reservations',
    schema: reservationImportSchema,
    defaultMatchKey: 'id',
  },
  transactions: {
    table: 'transactions',
    schema: transactionImportSchema,
    defaultMatchKey: 'id',
  },
  payments: {
    table: 'transactions',
    schema: transactionImportSchema,
    defaultMatchKey: 'id',
    forceFields: { type: 'payment' }
  }
};

/**
 * Parses CSV/XLSX into JSON array using PapaParse (CSV) or ExcelJS (XLSX)
 */
async function parseFileGeneric(file: Express.Multer.File): Promise<any[]> {
  if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
    const csvString = file.buffer.toString('utf8');
    const result = Papa.parse(csvString, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
    });
    return result.data;
  } else {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as any);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return [];

    const rows: any[] = [];
    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell) => {
      headers.push(String(cell.value ?? ''));
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // skip header
      const rowData: any = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = headers[colNumber - 1];
        if (header) {
          rowData[header] = cell.value;
        }
      });
      rows.push(rowData);
    });

    return rows;
  }
}

/**
 * POST /api/import/:entity — Import data from uploaded CSV/XLSX
 */
router.post('/import/:entity', authenticateToken, requireOrgContext, upload.single('file'), async (req, res: Response, next) => {
  try {
    const { entity } = req.params;
    const config = ENTITY_CONFIG[entity];

    if (!config) {
      return apiError(res, 400, "VALIDATION_ERROR", "Unsupported entity type for import");
    }

    if (!req.file) {
      return apiError(res, 400, "VALIDATION_ERROR", "No file uploaded");
    }

    const dryRun = req.query.dryRun === 'true';
    const orgId = req.orgId!;

    let options: any = {};
    if (req.body.options) {
      try {
        options = JSON.parse(req.body.options);
      } catch (e) {
        return apiError(res, 400, "VALIDATION_ERROR", "Invalid JSON in options");
      }
    } else {
      options = {
        mode: req.body.mode || 'insert',
        matchKey: req.body.matchKey || config.defaultMatchKey,
        columnMap: req.body.columnMap ? JSON.parse(req.body.columnMap) : undefined
      };
    }

    const { mode = 'insert', matchKey, columnMap } = options;

    const rawRows = await parseFileGeneric(req.file);
    if (rawRows.length === 0) {
      return res.json({ success: true, results: { total: 0, importedCount: 0, invalidCount: 0 } });
    }

    const validRows: any[] = [];
    const invalidRows: any[] = [];

    rawRows.forEach((row, index) => {
      try {
        let normalized: any = {};
        if (columnMap) {
          Object.entries(columnMap).forEach(([csvCol, dbField]) => {
            normalized[dbField as string] = row[csvCol];
          });
        } else {
          normalized = { ...row };
        }

        if (config.forceFields) {
          Object.assign(normalized, config.forceFields);
        }

        const validation = config.schema.safeParse(normalized);
        if (!validation.success) {
          invalidRows.push({ row: index + 1, errors: validation.error.format() });
          return;
        }

        validRows.push({ ...validation.data, org_id: orgId });
      } catch (e: any) {
        invalidRows.push({ row: index + 1, error: e.message });
      }
    });

    if (dryRun) {
      return res.json({
        success: true,
        dryRun: true,
        results: {
          total: rawRows.length,
          validCount: validRows.length,
          invalidCount: invalidRows.length,
          invalidRows,
          preview: validRows.slice(0, 5)
        }
      });
    }

    if (validRows.length > 0) {
      const query = supabaseAdmin.from(config.table);
      if (mode === 'upsert' && matchKey) {
        const { error } = await query.upsert(validRows, { onConflict: `org_id,${matchKey}` });
        if (error) throw error;
      } else {
        const { error } = await query.insert(validRows);
        if (error) throw error;
      }
    }

    return res.json({
      success: true,
      results: {
        total: rawRows.length,
        importedCount: validRows.length,
        invalidCount: invalidRows.length,
        invalidRows
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/import/:entity/headers — Extract column headers from uploaded file
 */
router.post('/import/:entity/headers', authenticateToken, requireOrgContext, upload.single('file'), async (req, res: Response, next) => {
  try {
    if (!req.file) {
      return apiError(res, 400, "VALIDATION_ERROR", "No file uploaded");
    }

    let headers: string[] = [];

    if (req.file.mimetype === 'text/csv' || req.file.originalname.endsWith('.csv')) {
      const csvString = req.file.buffer.toString('utf8');
      const result = Papa.parse(csvString, {
        header: true,
        preview: 1,
      });
      headers = result.meta.fields || [];
    } else {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer as any);
      const worksheet = workbook.worksheets[0];
      if (worksheet) {
        const headerRow = worksheet.getRow(1);
        headerRow.eachCell({ includeEmpty: false }, (cell) => {
          headers.push(String(cell.value ?? ''));
        });
      }
    }

    return res.json({ success: true, headers });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/import/:entity/template.csv — Download CSV template
 */
/**
 * GET /api/import/:entity/template.csv — Download a more user-friendly template
 * Now generates a multi-sheet Excel template with instructions and data sheet
 */
router.get('/import/:entity/template.csv', authenticateToken, requireOrgContext, async (req, res) => {
  const { entity } = req.params;
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `${entity}_template_${dateStr}.xlsx`;

  try {
    const workbook = new ExcelJS.Workbook();

    // ===== INSTRUCTIONS SHEET =====
    const instrSheet = workbook.addWorksheet('Upute');
    instrSheet.columns = [
      { header: 'Korak', key: 'step', width: 10 },
      { header: 'Opis', key: 'desc', width: 60 },
    ];
    instrSheet.addRows([
      { step: '1', desc: 'Popunite podatke u sheet-u "Podaci".' },
      { step: '2', desc: 'Obavezno popunite sva polja označena sa * (obavezno).' },
      { step: '3', desc: 'Ne mijenjajte nazive kolona u prvom redu.' },
      { step: '4', desc: 'Sačuvajte fajl i uvezite ga u NMT Analytics sistem.' },
    ]);
    instrSheet.getRow(1).font = { bold: true, size: 12, color: { argb: 'FF1D4ED8' } };
    instrSheet.getColumn(1).font = { bold: true };

    // ===== DATA SHEET WITH HEADERS =====
    const dataSheet = workbook.addWorksheet('Podaci');
    let headers: { header: string; key: string; required?: boolean; example?: string }[] = [];

    if (entity === 'customers') {
      headers = [
        { header: 'fullName (ime i prezime) *', key: 'fullName', required: true, example: 'John Doe' },
        { header: 'phone (telefon) *', key: 'phone', required: true, example: '+38761123456' },
        { header: 'email (email)', key: 'email', example: 'john@example.com' },
        { header: 'notes (napomena)', key: 'notes', example: 'VIP klijent' },
      ];
    } else if (entity === 'packages') {
      headers = [
        { header: 'name (naziv) *', key: 'name', required: true, example: 'Mediterranean Cruise' },
        { header: 'destination (destinacija) *', key: 'destination', required: true, example: 'Grčka & Italija' },
        { header: 'basePrice (cijena) *', key: 'basePrice', required: true, example: '1200' },
        { header: 'currency (valuta)', key: 'currency', example: 'BAM' },
        { header: 'isActive (aktivan)', key: 'isActive', example: 'true' },
        { header: 'description (opis)', key: 'description', example: 'All inclusive paket...' },
        { header: 'durationDays (trajanje)', key: 'durationDays', example: '7' },
      ];
    } else if (entity === 'reservations') {
      headers = [
        { header: 'customerId (ID kupca) *', key: 'customerId', required: true, example: 'uuid' },
        { header: 'departureId (ID polaska) *', key: 'departureId', required: true, example: 'uuid' },
        { header: 'partySize (broj osoba) *', key: 'partySize', required: true, example: '2' },
        { header: 'totalAmount (ukupno) *', key: 'totalAmount', required: true, example: '2400' },
        { header: 'currency (valuta)', key: 'currency', example: 'BAM' },
        { header: 'status', key: 'status', example: 'confirmed' },
      ];
    } else {
      // Generic fallback
      headers = [
        { header: 'name *', key: 'name', required: true, example: 'Naziv' },
        { header: 'description', key: 'description', example: 'Opis' },
      ];
    }

    // Define columns
    dataSheet.columns = headers.map(h => ({
      header: h.header,
      key: h.key,
      width: Math.max(h.header.length + 5, 20),
    }));

    // Header styling
    const headerRow = dataSheet.getRow(1);
    headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Add example row
    const exampleRow: Record<string, string> = {};
    headers.forEach(h => { exampleRow[h.key] = h.example || ''; });
    dataSheet.addRow(exampleRow);
    const exampleRowNum = dataSheet.rowCount;
    const exRow = dataSheet.getRow(exampleRowNum);
    exRow.font = { italic: true, color: { argb: 'FF6B7280' }, size: 10 };

    // Add data validation for first column
    headers.forEach((h, i) => {
      if (h.required) {
        // Highlight required columns
        const col = dataSheet.getColumn(i + 1);
        col.eachCell((cell) => {
          if ((cell as any).row > 1) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
          }
        });
      }
    });

    // Wait for workbook to be written
    const buf = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error('Template generation error:', err);
    // Fall back to CSV
    let csv = '';
    if (entity === 'customers') csv = 'fullName,phone,email,notes\nJohn Doe,+38761123456,john@example.com,VIP';
    else if (entity === 'packages') csv = 'name,destination,basePrice,currency,isActive\nBeach,Cancun,1200,BAM,true';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${entity}_template.csv"`);
    res.send(csv);
  }
});

router.get('/import/:entity/template.csv', authenticateToken, requireOrgContext, async (req, res) => {
  const { entity } = req.params;
  let csv = '';
  if (entity === 'customers') csv = 'fullName,phone,email,notes\nJohn Doe,+38761123456,john@example.com,VIP';
  else if (entity === 'packages') csv = 'name,destination,basePrice,currency,isActive\nBeach,Cancun,1200,BAM,true';
  else return apiError(res, 404, "NOT_FOUND", "Template not found");

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${entity}_template.csv"`);
  res.send(csv);
});

export default router;
