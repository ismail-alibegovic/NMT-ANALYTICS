import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { get, post } from '../api/client';
import { useT } from '../lib/i18n/context';

type PublicFieldType = 'short_text' | 'long_text' | 'email' | 'phone' | 'number' | 'date' | 'select' | 'multiselect' | 'checkbox';

type PublicField = {
  id: string;
  type: PublicFieldType;
  label: string;
  required: boolean;
  options?: string[];
};

type PublicFormResponse = {
  title: string;
  description: string | null;
  fields: PublicField[];
  thankYouMessage: string | null;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+\d][\d\s\-()/]{5,24}$/;

export default function PublicFormRenderer() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useT();
  const c = t.publicForms.public;

  const [form, setForm] = useState<PublicFormResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    setSubmitted(false);
    get<PublicFormResponse>(`/public/forms/${slug}`)
      .then((response) => {
        if (response?.data) {
          setForm(response.data);
          setAnswers({});
          setFieldErrors({});
          setSubmitError(null);
        } else {
          setError(c.notFound);
        }
      })
      .catch((err: any) => {
        if (err?.response?.status === 404) setError(c.notFound);
        else setError(c.loadError);
      })
      .finally(() => setLoading(false));
  }, [slug, c.loadError, c.notFound]);

  const requiredFieldCount = useMemo(
    () => (form?.fields || []).filter((field) => field.required).length,
    [form],
  );

  function setAnswer(id: string, value: unknown) {
    setAnswers((current) => ({ ...current, [id]: value }));
    setFieldErrors((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function validate() {
    if (!form) return false;
    const nextErrors: Record<string, string> = {};

    form.fields.forEach((field) => {
      const value = answers[field.id];
      const empty =
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim() === '') ||
        (Array.isArray(value) && value.length === 0);

      if (field.required && empty) {
        nextErrors[field.id] = c.required.replace('{label}', field.label);
        return;
      }

      if (empty) return;

      if (field.type === 'email' && (typeof value !== 'string' || !EMAIL_REGEX.test(value.trim()))) {
        nextErrors[field.id] = c.invalidEmail;
      }

      if (field.type === 'phone' && (typeof value !== 'string' || !PHONE_REGEX.test(value.trim()))) {
        nextErrors[field.id] = c.invalidPhone;
      }

      if (field.type === 'number') {
        const numericValue =
          typeof value === 'number'
            ? value
            : typeof value === 'string' && value.trim() !== ''
              ? Number(value)
              : Number.NaN;
        if (!Number.isFinite(numericValue)) {
          nextErrors[field.id] = c.invalidNumber;
        }
      }
    });

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      await post(`/public/forms/${slug}`, answers);
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err?.response?.data?.message || err?.message || c.submitError);
    } finally {
      setSubmitting(false);
    }
  }

  function renderField(field: PublicField) {
    const value = answers[field.id];
    const hasError = !!fieldErrors[field.id];
    const baseClass = `w-full rounded-xl border px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:ring-2 dark:text-white ${
      hasError
        ? 'border-red-400 focus:border-red-500 focus:ring-red-500/15 dark:border-red-500'
        : 'border-gray-300 focus:border-brand-500 focus:ring-brand-500/15 dark:border-gray-700'
    } bg-white dark:bg-gray-900`;

    switch (field.type) {
      case 'long_text':
        return (
          <textarea
            id={field.id}
            rows={4}
            className={baseClass}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => setAnswer(field.id, event.target.value)}
            disabled={submitting}
          />
        );
      case 'email':
        return (
          <input
            id={field.id}
            type="email"
            inputMode="email"
            autoComplete="email"
            className={baseClass}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => setAnswer(field.id, event.target.value)}
            disabled={submitting}
          />
        );
      case 'phone':
        return (
          <input
            id={field.id}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className={baseClass}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => setAnswer(field.id, event.target.value)}
            disabled={submitting}
          />
        );
      case 'number':
        return (
          <input
            id={field.id}
            type="number"
            inputMode="decimal"
            className={baseClass}
            value={typeof value === 'number' || typeof value === 'string' ? value : ''}
            onChange={(event) => setAnswer(field.id, event.target.value)}
            disabled={submitting}
          />
        );
      case 'date':
        return (
          <input
            id={field.id}
            type="date"
            className={baseClass}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => setAnswer(field.id, event.target.value)}
            disabled={submitting}
          />
        );
      case 'select':
        return (
          <select
            id={field.id}
            className={baseClass}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => setAnswer(field.id, event.target.value)}
            disabled={submitting}
          >
            <option value="">{c.selectPlaceholder}</option>
            {(field.options || []).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        );
      case 'multiselect':
        return (
          <div className="space-y-2">
            {(field.options || []).map((option) => {
              const selectedValues = Array.isArray(value) ? value : [];
              const checked = selectedValues.includes(option);
              return (
                <label key={option} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const current = Array.isArray(value) ? [...value] : [];
                      const next = checked ? current.filter((item) => item !== option) : [...current, option];
                      setAnswer(field.id, next);
                    }}
                    disabled={submitting}
                  />
                  <span>{option}</span>
                </label>
              );
            })}
          </div>
        );
      case 'checkbox':
        return (
          <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-3 text-sm dark:border-gray-800">
            <input
              id={field.id}
              type="checkbox"
              checked={value === true}
              onChange={(event) => setAnswer(field.id, event.target.checked)}
              disabled={submitting}
            />
            <span>{field.label}</span>
          </label>
        );
      case 'short_text':
      default:
        return (
          <input
            id={field.id}
            type="text"
            className={baseClass}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => setAnswer(field.id, event.target.value)}
            disabled={submitting}
          />
        );
    }
  }

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-gray-50 px-4 py-10 dark:bg-gray-950">
        <div className="mx-auto max-w-xl animate-pulse space-y-4 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <div className="h-8 w-2/3 rounded bg-gray-200 dark:bg-gray-800" />
          <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-800" />
          <div className="h-4 w-5/6 rounded bg-gray-200 dark:bg-gray-800" />
          <div className="h-11 w-full rounded bg-gray-200 dark:bg-gray-800" />
          <div className="h-11 w-full rounded bg-gray-200 dark:bg-gray-800" />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-[100dvh] bg-gray-50 px-4 py-10 dark:bg-gray-950">
        <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{c.unavailableTitle}</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{error}</p>
        </div>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="min-h-[100dvh] bg-gray-50 px-4 py-10 dark:bg-gray-950">
        <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
            ✓
          </div>
          <h1 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">{c.successTitle}</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {form?.thankYouMessage || c.successFallback}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-gray-50 px-4 py-6 dark:bg-gray-950 sm:py-10">
      <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{form?.title}</h1>
          {form?.description && <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{form.description}</p>}
          {requiredFieldCount > 0 && (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              {c.requiredHint.replace('{count}', String(requiredFieldCount))}
            </p>
          )}
        </div>

        {submitError && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-300">
            {submitError}
          </div>
        )}

        <form noValidate onSubmit={handleSubmit} className="space-y-5">
          {(form?.fields || []).map((field) => (
            <div key={field.id}>
              {field.type !== 'checkbox' && (
                <label htmlFor={field.id} className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {field.label}
                  {field.required && <span className="ml-1 text-red-500">*</span>}
                </label>
              )}
              {renderField(field)}
              {fieldErrors[field.id] && (
                <p className="mt-1.5 text-xs text-red-500">{fieldErrors[field.id]}</p>
              )}
            </div>
          ))}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? c.submitting : c.submit}
          </button>
        </form>
      </div>
    </main>
  );
}
