import { auditLog } from '../middleware/auditLogger';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken';
import { requireOrgContext } from '../middleware/requireOrgContext';
import { requireMinimumRole } from '../middleware/requireRole';
import { supabaseAdmin } from '../lib/supabase';
import multer from 'multer';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { apiError } from '../lib/errors';
import {
  MAX_IMPORT_ROWS,
  applyColumnMap,
  isDisabledImportEntity,
  isImportable,
  parseColumnMap,
  validateCustomerRow,
  validatePackageRow,
  type InvalidRow,
} from '../lib/importValidation';

const router = Router();

/**
 * Bulk import. Security model:
 *  - authentication, organization context and a manager+ role are enforced for EVERY
 *    /import route before any file is parsed or any entity is inspected;
 *  - the organization always comes from the authenticated context, never from the file;
 *  - only entities that can be written without bypassing a canonical workflow are
 *    importable (customers, packages). Departures and reservations are disabled: their
 *    canonical routes also materialize accommodation/costs, enforce capacity, pricing,
 *    installments and idempotency, which a direct table insert cannot reproduce;
 *  - a file is imported all-or-nothing: any invalid row rejects the whole file and a
 *    single INSERT statement writes the batch atomically.
 */
router.use('/import', authenticateToken, requireOrgContext, requireMinimumRole('manager'));

const auditImport = auditLog('CREATE', 'import', undefined, (req) => req.params.entity);
const auditImportUnlessDryRun = (req: Request, res: Response, next: NextFunction) =>
  req.query.dryRun === 'true' ? next() : auditImport(req, res, next);

const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.endsWith('.csv')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and XLSX files are allowed'));
    }
  },
});

function uploadFile(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return apiError(res, 413, 'FILE_TOO_LARGE', 'File exceeds the 10MB limit');
    }
    return apiError(res, 400, 'INVALID_FILE', err instanceof Error ? err.message : 'Invalid file');
  });
}

/** Rejects unknown and disabled entities before auditing or parsing anything. */
function resolveEntity(req: Request, res: Response, next: NextFunction) {
  const entity = String(req.params.entity);
  if (isDisabledImportEntity(entity)) {
    return apiError(
      res,
      410,
      'IMPORT_ENTITY_DISABLED',
      `Bulk import of ${entity} is disabled because it cannot bypass the canonical ${entity} workflow safely. Use the standard screens.`,
    );
  }
  if (!isImportable(entity)) {
    return apiError(res, 404, 'NOT_FOUND', 'Unsupported entity type for import');
  }
  return next();
}

function isCsv(file: Express.Multer.File): boolean {
  return file.mimetype === 'text/csv' || file.originalname.endsWith('.csv');
}

async function parseFileGeneric(file: Express.Multer.File): Promise<Record<string, unknown>[]> {
  if (isCsv(file)) {
    // No dynamic typing: phone numbers like "061123456" must keep their leading zero.
    const result = Papa.parse<Record<string, unknown>>(file.buffer.toString('utf8'), {
      header: true,
      skipEmptyLines: true,
    });
    return result.data;
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file.buffer as any);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    headers[col - 1] = String(cell.value ?? '');
  });
  const rows: Record<string, unknown>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const rowData: Record<string, unknown> = {};
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const header = headers[col - 1];
      if (header) rowData[header] = cell.value;
    });
    rows.push(rowData);
  });
  return rows;
}

const CHUNK = 200;
function chunk<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** POST /api/import/:entity — all-or-nothing import of customers or packages. */
router.post(
  '/import/:entity',
  resolveEntity,
  auditImportUnlessDryRun,
  uploadFile,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entity = String(req.params.entity);
      const orgId = req.orgId!;
      const file = req.file;
      if (!file) return apiError(res, 400, 'VALIDATION_ERROR', 'No file uploaded');
      const dryRun = req.query.dryRun === 'true';

      let options: Record<string, unknown> = {};
      if (req.body?.options) {
        try {
          options = JSON.parse(req.body.options);
        } catch {
          return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid JSON in options');
        }
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
          return apiError(res, 400, 'VALIDATION_ERROR', 'Invalid options');
        }
      } else {
        options = { mode: req.body?.mode, columnMap: req.body?.columnMap };
      }

      // Upsert never worked (no unique constraint backs it) and would overwrite existing
      // rows; only insert is supported.
      const mode = options.mode ?? 'insert';
      if (mode !== 'insert') {
        return apiError(res, 400, 'UNSUPPORTED_IMPORT_MODE', 'Only insert mode is supported for imports');
      }
      const columnMap = parseColumnMap(options.columnMap);
      if (columnMap === null) {
        return apiError(res, 400, 'VALIDATION_ERROR', 'columnMap must be an object of strings');
      }

      let rawRows: Record<string, unknown>[];
      try {
        rawRows = await parseFileGeneric(file);
      } catch {
        return apiError(res, 400, 'UNREADABLE_FILE', 'The file could not be read');
      }
      if (rawRows.length === 0) {
        return res.json({ success: true, results: { total: 0, importedCount: 0, invalidCount: 0, invalidRows: [] } });
      }
      if (rawRows.length > MAX_IMPORT_ROWS) {
        return apiError(res, 413, 'TOO_MANY_ROWS', `An import may contain at most ${MAX_IMPORT_ROWS} rows`);
      }

      const validate = entity === 'customers' ? validateCustomerRow : validatePackageRow;
      const candidates: { row: number; data: Record<string, any> }[] = [];
      const invalidRows: InvalidRow[] = [];
      rawRows.forEach((raw, index) => {
        const result = validate(applyColumnMap(raw, columnMap));
        if (result.ok === true) candidates.push({ row: index + 1, data: result.data });
        else invalidRows.push({ row: index + 1, errors: result.errors });
      });

      // Customers: reject phones already in this organization or repeated in the file.
      if (entity === 'customers' && candidates.length > 0) {
        const existing = new Set<string>();
        for (const part of chunk(Array.from(new Set(candidates.map((c) => c.data.phone as string))))) {
          const { data, error } = await supabaseAdmin
            .from('customers')
            .select('phone')
            .eq('org_id', orgId)
            .in('phone', part);
          if (error) throw error;
          (data || []).forEach((c: any) => existing.add(c.phone));
        }
        const seen = new Set<string>();
        for (const c of candidates) {
          const phone = c.data.phone as string;
          if (existing.has(phone) || seen.has(phone)) {
            invalidRows.push({ row: c.row, errors: ['A customer with this phone already exists or is repeated in the file'] });
            c.row = -1;
          } else {
            seen.add(phone);
          }
        }
        invalidRows.sort((x, y) => x.row - y.row);
      }
      const validRows = candidates.filter((c) => c.row !== -1).map((c) => c.data);

      const summary = {
        total: rawRows.length,
        validCount: validRows.length,
        invalidCount: invalidRows.length,
        invalidRows,
      };

      if (dryRun) {
        return res.json({ success: true, dryRun: true, results: { ...summary, preview: validRows.slice(0, 5) } });
      }

      if (invalidRows.length > 0) {
        return res.status(422).json({
          success: false,
          code: 'IMPORT_VALIDATION_FAILED',
          message: 'The file contains invalid rows; nothing was imported. Fix the rows and upload again.',
          results: { ...summary, importedCount: 0 },
        });
      }

      // One INSERT statement: PostgreSQL applies it atomically, so a failure leaves no rows.
      const { data, error } = await supabaseAdmin
        .from(entity)
        .insert(validRows.map((r) => ({ ...r, org_id: orgId })))
        .select('id');
      if (error) {
        if ((error as any).code === '23505') {
          return apiError(res, 409, 'IMPORT_CONFLICT', 'Some rows conflict with existing data; nothing was imported');
        }
        throw error;
      }

      return res.json({
        success: true,
        results: { ...summary, importedCount: (data || []).length },
      });
    } catch (error) {
      next(error);
    }
  },
);

/** POST /api/import/:entity/headers — extract column headers from an uploaded file. */
router.post('/import/:entity/headers', resolveEntity, uploadFile, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return apiError(res, 400, 'VALIDATION_ERROR', 'No file uploaded');
    let headers: string[] = [];
    try {
      if (isCsv(req.file)) {
        const result = Papa.parse(req.file.buffer.toString('utf8'), { header: true, preview: 1 });
        headers = result.meta.fields || [];
      } else {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer as any);
        workbook.worksheets[0]?.getRow(1).eachCell({ includeEmpty: false }, (cell) => {
          headers.push(String(cell.value ?? ''));
        });
      }
    } catch {
      return apiError(res, 400, 'UNREADABLE_FILE', 'The file could not be read');
    }
    return res.json({ success: true, headers });
  } catch (error) {
    next(error);
  }
});

const TEMPLATES: Record<string, string> = {
  customers: 'fullName,phone,email,notes\nJohn Doe,+38761123456,john@example.com,VIP',
  packages:
    'name,destination,basePrice,currency,isActive,description,durationDays,maxParticipants,startDate,endDate\n' +
    'Beach week,Cancun,1200,BAM,true,All inclusive,7,40,2026-07-01,2026-07-08',
};

/** GET /api/import/:entity/template.csv */
router.get('/import/:entity/template.csv', resolveEntity, (req: Request, res: Response) => {
  const entity = String(req.params.entity);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${entity}_template.csv"`);
  res.send(TEMPLATES[entity]);
});

export default router;
