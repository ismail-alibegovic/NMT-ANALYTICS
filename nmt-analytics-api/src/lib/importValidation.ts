import { z } from 'zod';

/**
 * Pure validation for bulk imports (no I/O) so every rule is unit-testable.
 *
 * Only entities that can be written without bypassing a canonical workflow are
 * importable. Departures (accommodation + cost materialization) and reservations
 * (capacity, pricing, installments, idempotency) must go through their canonical
 * routes, so they are deliberately disabled here.
 */
export const IMPORTABLE_ENTITIES = ['customers', 'packages'] as const;
export type ImportableEntity = (typeof IMPORTABLE_ENTITIES)[number];

export const DISABLED_IMPORT_ENTITIES = ['departures', 'reservations'] as const;

export const MAX_IMPORT_ROWS = 2000;

export function isImportable(entity: string): entity is ImportableEntity {
  return (IMPORTABLE_ENTITIES as readonly string[]).includes(entity);
}

export function isDisabledImportEntity(entity: string): boolean {
  return (DISABLED_IMPORT_ENTITIES as readonly string[]).includes(entity);
}

/** Normalise a CSV/XLSX cell to a trimmed string, or undefined when empty. */
export function normalizeCell(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (typeof value === 'object') {
    const cell = value as Record<string, unknown>;
    if (Array.isArray(cell.richText)) {
      return normalizeCell(cell.richText.map((part: any) => part?.text ?? '').join(''));
    }
    if ('result' in cell) return normalizeCell(cell.result);
    if ('text' in cell) return normalizeCell(cell.text);
    return undefined;
  }
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

const optionalText = (max: number) =>
  z.string().max(max).optional();

const customerSchema = z.object({
  fullName: z.string({ error: 'fullName is required' }).min(1, 'fullName is required').max(200),
  phone: z
    .string({ error: 'phone is required' })
    .min(1, 'phone is required')
    .max(40)
    .refine((v) => (v.match(/\d/g) || []).length >= 5, 'phone must contain at least 5 digits'),
  email: z.string().max(254).email('email is invalid').optional(),
  notes: optionalText(2000),
});

function parseBoolean(value: string | undefined, fallback: boolean): boolean | null {
  if (value === undefined) return fallback;
  const v = value.toLowerCase();
  if (['true', '1', 'yes', 'da'].includes(v)) return true;
  if (['false', '0', 'no', 'ne'].includes(v)) return false;
  return null;
}

function parseDecimal(value: string | undefined): number | null {
  if (value === undefined) return null;
  const cleaned = value.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n <= 1_000_000_000 ? n : null;
}

function parseIntStrict(value: string | undefined): number | null {
  if (value === undefined) return null;
  return /^\d+$/.test(value) ? Number(value) : null;
}

function parseIsoDate(value: string | undefined): string | null {
  if (value === undefined) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export type RowResult<T> = { ok: true; data: T } | { ok: false; errors: string[] };

function zodErrors(error: z.ZodError): string[] {
  return error.issues.map((i) => i.message);
}

export function validateCustomerRow(row: Record<string, unknown>): RowResult<{
  full_name: string; phone: string; email: string | null; notes: string | null;
}> {
  const parsed = customerSchema.safeParse({
    fullName: normalizeCell(row.fullName),
    phone: normalizeCell(row.phone),
    email: normalizeCell(row.email),
    notes: normalizeCell(row.notes),
  });
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const d = parsed.data;
  return {
    ok: true,
    data: { full_name: d.fullName, phone: d.phone, email: d.email ?? null, notes: d.notes ?? null },
  };
}

export function validatePackageRow(row: Record<string, unknown>): RowResult<{
  name: string; destination: string; base_price: number; currency: string; is_active: boolean;
  description: string | null; duration_days: number | null; max_participants: number | null;
  start_date: string | null; end_date: string | null;
}> {
  const errors: string[] = [];
  const name = normalizeCell(row.name);
  const destination = normalizeCell(row.destination);
  if (!name) errors.push('name is required');
  else if (name.length > 200) errors.push('name is too long');
  if (!destination) errors.push('destination is required');
  else if (destination.length > 200) errors.push('destination is too long');

  const rawPrice = normalizeCell(row.basePrice);
  const basePrice = parseDecimal(rawPrice);
  if (basePrice === null) errors.push('basePrice must be a non-negative amount with at most 2 decimals');

  const currency = (normalizeCell(row.currency) ?? 'BAM').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) errors.push('currency must be a 3-letter code');

  const isActive = parseBoolean(normalizeCell(row.isActive), true);
  if (isActive === null) errors.push('isActive must be true or false');

  const rawDuration = normalizeCell(row.durationDays);
  const durationDays = rawDuration === undefined ? null : parseIntStrict(rawDuration);
  if (rawDuration !== undefined && (durationDays === null || durationDays < 1 || durationDays > 3650)) {
    errors.push('durationDays must be a positive whole number');
  }

  const rawMax = normalizeCell(row.maxParticipants);
  const maxParticipants = rawMax === undefined ? null : parseIntStrict(rawMax);
  if (rawMax !== undefined && (maxParticipants === null || maxParticipants < 1 || maxParticipants > 100000)) {
    errors.push('maxParticipants must be a positive whole number');
  }

  const rawStart = normalizeCell(row.startDate);
  const rawEnd = normalizeCell(row.endDate);
  const startDate = rawStart === undefined ? null : parseIsoDate(rawStart);
  const endDate = rawEnd === undefined ? null : parseIsoDate(rawEnd);
  if (rawStart !== undefined && startDate === null) errors.push('startDate is not a valid date');
  if (rawEnd !== undefined && endDate === null) errors.push('endDate is not a valid date');
  if (startDate && endDate && endDate < startDate) errors.push('endDate must not be before startDate');

  const description = normalizeCell(row.description);
  if (description && description.length > 5000) errors.push('description is too long');

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      name: name!, destination: destination!, base_price: basePrice!, currency,
      is_active: isActive!, description: description ?? null,
      duration_days: durationDays, max_participants: maxParticipants,
      start_date: startDate, end_date: endDate,
    },
  };
}

export type InvalidRow = { row: number; errors: string[] };

/** Applies the column map (CSV header -> field) when provided, otherwise uses headers as-is. */
export function applyColumnMap(
  row: Record<string, unknown>,
  columnMap?: Record<string, string>,
): Record<string, unknown> {
  if (!columnMap) return row;
  const out: Record<string, unknown> = {};
  for (const [csvColumn, field] of Object.entries(columnMap)) out[field] = row[csvColumn];
  return out;
}

export function parseColumnMap(raw: unknown): Record<string, string> | undefined | null {
  if (raw === undefined || raw === null || raw === '') return undefined;
  let value = raw;
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw); } catch { return null; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.some(([, v]) => typeof v !== 'string')) return null;
  return value as Record<string, string>;
}
