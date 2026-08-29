import type { Response } from 'express';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';

const FIELD_TYPES = ['short_text', 'long_text', 'email', 'phone', 'number', 'date', 'select', 'multiselect', 'checkbox'] as const;
const ALLOWED_MAP_TO = ['contact_name', 'email', 'phone', 'destination', 'travel_start', 'travel_end', 'travelers', 'budget', 'trip_type'] as const;

type PublicFieldType = (typeof FIELD_TYPES)[number];
type AllowedMapTo = (typeof ALLOWED_MAP_TO)[number];

type PublicField = {
  id: string;
  type: PublicFieldType;
  label: string;
  required: boolean;
  options?: string[];
  mapTo?: AllowedMapTo;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+\d][\d\s\-()/]{5,24}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validateFieldDefinitions(fields: unknown): { valid: true; fields: PublicField[] } | { valid: false; message: string } {
  if (!Array.isArray(fields)) return { valid: false, message: 'Invalid form configuration' };

  const seen = new Set<string>();
  const normalized: PublicField[] = [];

  for (const rawField of fields) {
    if (!isPlainObject(rawField)) return { valid: false, message: 'Invalid form configuration' };
    const id = typeof rawField.id === 'string' ? rawField.id.trim() : '';
    const label = typeof rawField.label === 'string' ? rawField.label.trim() : '';
    const type = rawField.type;
    const required = rawField.required === true;
    const mapTo = rawField.mapTo;
    const options = Array.isArray(rawField.options)
      ? rawField.options
          .filter((option): option is string => typeof option === 'string')
          .map((option) => option.trim())
          .filter(Boolean)
      : undefined;

    if (!id || !/^[a-z0-9_]+$/.test(id)) return { valid: false, message: 'Invalid form configuration' };
    if (seen.has(id)) return { valid: false, message: 'Invalid form configuration' };
    seen.add(id);
    if (!label) return { valid: false, message: 'Invalid form configuration' };
    if (!FIELD_TYPES.includes(type as PublicFieldType)) return { valid: false, message: 'Invalid form configuration' };
    if (mapTo !== undefined && !ALLOWED_MAP_TO.includes(mapTo as AllowedMapTo)) {
      return { valid: false, message: 'Invalid form configuration' };
    }
    if ((type === 'select' || type === 'multiselect') && (!options || options.length === 0)) {
      return { valid: false, message: 'Invalid form configuration' };
    }
    normalized.push({
      id,
      label,
      type: type as PublicFieldType,
      required,
      options,
      mapTo: mapTo as AllowedMapTo | undefined,
    });
  }

  return { valid: true, fields: normalized };
}

function normalizeFormSubmission(fieldDefs: PublicField[], payload: unknown) {
  if (!isPlainObject(payload)) {
    return { valid: false as const, status: 400, message: 'Invalid submission payload' };
  }

  const sanitized: Record<string, unknown> = {};

  for (const field of fieldDefs) {
    const rawValue = payload[field.id];
    const isMissing =
      rawValue === undefined ||
      rawValue === null ||
      (typeof rawValue === 'string' && rawValue.trim() === '') ||
      (Array.isArray(rawValue) && rawValue.length === 0);

    if (field.required && isMissing) {
      return { valid: false as const, status: 400, message: `Field '${field.label}' is required` };
    }

    if (isMissing) continue;

    switch (field.type) {
      case 'short_text':
      case 'long_text':
        if (typeof rawValue !== 'string') {
          return { valid: false as const, status: 400, message: `Invalid value for '${field.label}'` };
        }
        sanitized[field.id] = rawValue.trim();
        break;
      case 'email':
        if (typeof rawValue !== 'string' || !EMAIL_REGEX.test(rawValue.trim())) {
          return { valid: false as const, status: 400, message: `Invalid email for '${field.label}'` };
        }
        sanitized[field.id] = rawValue.trim();
        break;
      case 'phone':
        if (typeof rawValue !== 'string' || !PHONE_REGEX.test(rawValue.trim())) {
          return { valid: false as const, status: 400, message: `Invalid phone for '${field.label}'` };
        }
        sanitized[field.id] = rawValue.trim();
        break;
      case 'number': {
        const numericValue =
          typeof rawValue === 'number'
            ? rawValue
            : typeof rawValue === 'string' && rawValue.trim() !== ''
              ? Number(rawValue)
              : Number.NaN;
        if (!Number.isFinite(numericValue)) {
          return { valid: false as const, status: 400, message: `'${field.label}' must be a number` };
        }
        sanitized[field.id] = numericValue;
        break;
      }
      case 'date':
        if (typeof rawValue !== 'string' || !DATE_REGEX.test(rawValue.trim())) {
          return { valid: false as const, status: 400, message: `Invalid date for '${field.label}'` };
        }
        sanitized[field.id] = rawValue.trim();
        break;
      case 'checkbox':
        if (typeof rawValue !== 'boolean') {
          return { valid: false as const, status: 400, message: `Invalid value for '${field.label}'` };
        }
        sanitized[field.id] = rawValue;
        break;
      case 'select':
        if (typeof rawValue !== 'string' || !field.options?.includes(rawValue)) {
          return { valid: false as const, status: 400, message: `Invalid option for '${field.label}'` };
        }
        sanitized[field.id] = rawValue;
        break;
      case 'multiselect':
        if (!Array.isArray(rawValue) || rawValue.some((item) => typeof item !== 'string' || !field.options?.includes(item))) {
          return { valid: false as const, status: 400, message: `Invalid option for '${field.label}'` };
        }
        sanitized[field.id] = Array.from(new Set(rawValue));
        break;
      default:
        return { valid: false as const, status: 400, message: `Invalid value for '${field.label}'` };
    }

    const normalizedValue = sanitized[field.id];
    if (field.mapTo && normalizedValue !== undefined) {
      switch (field.mapTo) {
        case 'contact_name':
          sanitized.full_name = normalizedValue;
          break;
        case 'email':
        case 'phone':
        case 'destination':
        case 'travel_start':
        case 'travel_end':
        case 'travelers':
        case 'budget':
        case 'trip_type':
          sanitized[field.mapTo] = normalizedValue;
          break;
      }
    }
  }

  return { valid: true as const, answers: sanitized };
}

export async function getPublicForm(req: any, res: Response) {
  const { data, error } = await supabaseAdmin
    .from('public_forms')
    .select('id, title, description, slug, fields, thank_you_message, active')
    .eq('slug', req.params.slug)
    .maybeSingle();

  if (error || !data) return apiError(res, 404, 'NOT_FOUND', 'Form not found');
  if (!data.active) return apiError(res, 404, 'NOT_FOUND', 'Form not available');

  return res.json({
    title: data.title,
    description: data.description,
    fields: data.fields,
    thankYouMessage: data.thank_you_message,
  });
}

export async function submitPublicForm(req: any, res: Response) {
  const { data: form } = await supabaseAdmin
    .from('public_forms')
    .select('id, slug, active, fields, org_id')
    .eq('slug', req.params.slug)
    .maybeSingle();

  if (!form) return apiError(res, 404, 'NOT_FOUND', 'Form not found');
  if (!form.active) return apiError(res, 404, 'NOT_FOUND', 'Form not available');

  const parsedFields = validateFieldDefinitions(form.fields);
  if (!parsedFields.valid) {
    return apiError(res, 400, 'VALIDATION_ERROR', parsedFields.message);
  }

  const normalized = normalizeFormSubmission(parsedFields.fields, req.body);
  if (!normalized.valid) {
    return apiError(res, normalized.status, 'VALIDATION_ERROR', normalized.message);
  }

  const { data: result, error } = await supabaseAdmin.rpc('submit_public_form', {
    form_slug: form.slug,
    submission_data: normalized.answers,
  });

  if (error) {
    if (error.message?.includes('contact_name')) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'Contact name is required');
    }
    return handleSupabaseError(res, error, 'Failed to submit form');
  }

  return res.status(201).json({ ok: true, inquiryId: result.inquiry_id });
}
