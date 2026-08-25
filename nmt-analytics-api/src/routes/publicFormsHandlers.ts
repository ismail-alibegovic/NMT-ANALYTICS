import type { Response } from 'express';
import { supabaseAdmin, handleSupabaseError } from '../lib/supabase';
import { apiError } from '../lib/errors';

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

  const fieldDefs = (form.fields || []) as any[];
  const answers = req.body || {};

  for (const field of fieldDefs) {
    const value = answers[field.id];
    if (field.required && (value === undefined || value === null || (typeof value === 'string' && value.trim() === ''))) {
      return apiError(res, 400, 'VALIDATION_ERROR', `Field '${field.label}' is required`);
    }
    if (value !== undefined && value !== null) {
      if (field.type === 'email' && typeof value === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return apiError(res, 400, 'VALIDATION_ERROR', `Invalid email for '${field.label}'`);
      }
      if (field.type === 'number' && (typeof value !== 'number' || isNaN(value))) {
        return apiError(res, 400, 'VALIDATION_ERROR', `'${field.label}' must be a number`);
      }
      if ((field.type === 'select') && field.options) {
        if (!field.options.includes(value)) {
          return apiError(res, 400, 'VALIDATION_ERROR', `Invalid option for '${field.label}'`);
        }
      }
      if (field.type === 'multiselect' && field.options && Array.isArray(value)) {
        for (const v of value) {
          if (!field.options.includes(v)) {
            return apiError(res, 400, 'VALIDATION_ERROR', `Invalid option for '${field.label}'`);
          }
        }
      }
    }
    if (field.mapTo && value !== undefined && value !== null) {
      const mappedKey = `mapped_${field.mapTo}`;
      if (!answers[mappedKey]) answers[mappedKey] = value;
    }
  }

  const { data: result, error } = await supabaseAdmin.rpc('submit_public_form', {
    form_slug: form.slug,
    submission_data: answers,
  });

  if (error) {
    if (error.message?.includes('contact_name')) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'Contact name is required');
    }
    return handleSupabaseError(res, error, 'Failed to submit form');
  }

  return res.status(201).json({ ok: true, inquiryId: result.inquiry_id });
}
