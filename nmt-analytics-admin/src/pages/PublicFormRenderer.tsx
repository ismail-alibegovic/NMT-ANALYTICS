import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router';
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

type PackageContext = {
  id: string;
  name: string;
  destination: string;
  basePrice: number;
  currency: string;
  durationDays?: number;
};

type DepartureContext = {
  id: string;
  packageId?: string;
  departAt: string;
  returnAt: string;
  capacity: number;
  booked: number;
  available: number;
  status: string;
};

type PublicFormResponse = {
  title: string;
  description: string | null;
  fields: PublicField[];
  thankYouMessage: string | null;
  packageId?: string | null;
  departureId?: string | null;
  package?: PackageContext | null;
  departure?: DepartureContext | null;
  availableDepartures?: DepartureContext[];
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+\d][\d\s\-()/]{5,24}$/;

export default function PublicFormRenderer() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const { t, lang } = useT();
  const c = t.publicForms.public;

  const isEmbedded =
    (typeof window !== 'undefined' && window.self !== window.top) ||
    new URLSearchParams(location.search).get('embed') === '1' ||
    (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('embed') === '1');

  const [form, setForm] = useState<PublicFormResponse | null>(null);
  const [selectedDepartureId, setSelectedDepartureId] = useState<string>('');
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
          const formData = response.data;
          setForm(formData);
          setAnswers({});
          setFieldErrors({});
          setSubmitError(null);
          const defaultDepId = formData.departureId || formData.departure?.id;
          if (defaultDepId) {
            setSelectedDepartureId(defaultDepId);
          } else if (formData.availableDepartures && formData.availableDepartures.length === 1) {
            setSelectedDepartureId(formData.availableDepartures[0].id);
          } else {
            setSelectedDepartureId('');
          }
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

  useEffect(() => {
    if (!isEmbedded || typeof window === 'undefined') return;
    const sendResize = () => {
      const height = document.documentElement.scrollHeight || document.body.scrollHeight;
      window.parent?.postMessage({ type: 'travline-form-resize', slug, height }, '*');
    };
    sendResize();
    window.addEventListener('resize', sendResize);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sendResize) : null;
    if (observer && document.body) observer.observe(document.body);
    return () => {
      window.removeEventListener('resize', sendResize);
      observer?.disconnect();
    };
  }, [isEmbedded, slug, form, submitted]);

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
      const payload: Record<string, unknown> = { ...answers };
      if (selectedDepartureId) {
        payload.departureId = selectedDepartureId;
      }
      if (form?.packageId || form?.package?.id) {
        payload.packageId = form.packageId || form.package?.id;
      }
      await post(`/public/forms/${slug}`, payload);
      setSubmitted(true);
      if (isEmbedded && typeof window !== 'undefined') {
        window.parent?.postMessage({ type: 'travline-form-submitted', slug }, '*');
      }
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
      <main className={isEmbedded ? 'p-4 bg-transparent' : 'min-h-[100dvh] bg-gray-50 px-4 py-10 dark:bg-gray-950'}>
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
      <main className={isEmbedded ? 'p-4 bg-transparent' : 'min-h-[100dvh] bg-gray-50 px-4 py-10 dark:bg-gray-950'}>
        <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{c.unavailableTitle}</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{error}</p>
        </div>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className={isEmbedded ? 'p-4 bg-transparent' : 'min-h-[100dvh] bg-gray-50 px-4 py-10 dark:bg-gray-950'}>
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
    <main className={isEmbedded ? 'p-2 sm:p-4 bg-transparent' : 'min-h-[100dvh] bg-gray-50 px-4 py-6 dark:bg-gray-950 sm:py-10'}>
      <div className={isEmbedded ? 'mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900' : 'mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-8'}>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{form?.title}</h1>
          {form?.description && <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{form.description}</p>}
          {requiredFieldCount > 0 && (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              {c.requiredHint.replace('{count}', String(requiredFieldCount))}
            </p>
          )}
        </div>

        {/* Trip Context & Real-Time Availability Banner */}
        {(form?.package || form?.departure || (form?.availableDepartures && form.availableDepartures.length > 0)) && (
          <div className="mb-6 rounded-xl border border-brand-100 bg-brand-50/60 p-4 dark:border-brand-900/30 dark:bg-brand-950/20">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">
                  {c.tripDetails}
                </span>
                {form.package && (
                  <h2 className="mt-1 text-base font-semibold text-gray-900 dark:text-white">
                    {form.package.name} — {form.package.destination}
                  </h2>
                )}
                {form.package?.durationDays && (
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {c.duration}: {form.package.durationDays} {c.days}
                  </p>
                )}
              </div>
              {form.package?.basePrice && (
                <div className="text-right">
                  <span className="text-xs text-gray-500 dark:text-gray-400">{c.priceFrom}</span>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">
                    {form.package.basePrice} {form.package.currency || 'BAM'}
                  </div>
                </div>
              )}
            </div>

            {/* Fixed departure display */}
            {form.departure && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-brand-100 pt-3 dark:border-brand-900/30">
                <div className="text-xs text-gray-600 dark:text-gray-300">
                  <span className="font-medium text-gray-900 dark:text-white">{c.departureDate}: </span>
                  {new Date(form.departure.departAt).toLocaleDateString(lang === 'bs' ? 'bs-BA' : 'en-US')}
                  {form.departure.returnAt ? ` – ${new Date(form.departure.returnAt).toLocaleDateString(lang === 'bs' ? 'bs-BA' : 'en-US')}` : ''}
                </div>
                <div>
                  {form.departure.available > 0 ? (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
                      {c.availableSpots.replace('{count}', String(form.departure.available))}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300">
                      {c.soldOut}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Selectable upcoming departures */}
            {!form.departure && form.availableDepartures && form.availableDepartures.length > 0 && (
              <div className="mt-3 border-t border-brand-100 pt-3 dark:border-brand-900/30">
                <label htmlFor="departure_selector" className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                  {c.selectDeparture}
                </label>
                <select
                  id="departure_selector"
                  value={selectedDepartureId}
                  onChange={(e) => setSelectedDepartureId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                >
                  <option value="">{c.selectPlaceholder}</option>
                  {form.availableDepartures.map((dep) => {
                    const startStr = new Date(dep.departAt).toLocaleDateString(lang === 'bs' ? 'bs-BA' : 'en-US');
                    const endStr = dep.returnAt ? new Date(dep.returnAt).toLocaleDateString(lang === 'bs' ? 'bs-BA' : 'en-US') : '';
                    const availText = dep.available > 0 ? `${dep.available} ${c.spotsLeft}` : c.soldOut;
                    return (
                      <option key={dep.id} value={dep.id}>
                        {startStr}{endStr ? ` – ${endStr}` : ''} ({availText})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>
        )}

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
