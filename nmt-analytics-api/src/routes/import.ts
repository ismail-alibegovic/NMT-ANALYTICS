import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { supabaseAdmin } from '../lib/supabase';
import { z } from 'zod';
import multer from 'multer';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { apiError } from "../lib/errors";

const router = Router();

// Configure multer for file uploads
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept CSV and XLSX files
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
 * Parses CSV/XLSX into JSON array
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
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(worksheet);
  }
}

/**
 * POST /api/import/:entity
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
 * Templates
 */
router.get('/import/:entity/template.csv', authenticateToken, requireOrgContext, (req, res) => {
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
