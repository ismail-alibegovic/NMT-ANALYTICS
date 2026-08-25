import { useState, useEffect } from "react";
import { useParams } from "react-router";
import { get, post } from "../api/client";

interface Field {
  id: string;
  type: string;
  label: string;
  required: boolean;
  options?: string[];
  mapTo?: string;
}

interface FormData {
  title: string;
  description: string | null;
  fields: Field[];
  thankYouMessage: string | null;
}

export default function PublicFormRenderer() {
  const { slug } = useParams<{ slug: string }>();
  const [form, setForm] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    get(`/public/forms/${slug}`)
      .then((res: any) => {
        if (res?.data) {
          setForm(res.data);
          setError(null);
        } else {
          setError("Form not found");
        }
      })
      .catch((e: any) => {
        if (e?.response?.status === 404) setError("Form not found");
        else setError("Failed to load form");
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const validate = (): boolean => {
    if (!form) return false;
    const newErrors: Record<string, string> = {};
    for (const field of form.fields) {
      const value = answers[field.id];
      if (field.required && (value === undefined || value === null || (typeof value === "string" && value.trim() === ""))) {
        newErrors[field.id] = `${field.label} is required`;
      }
      if (value !== undefined && value !== null && value !== "") {
        if (field.type === "email" && typeof value === "string") {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            newErrors[field.id] = "Invalid email address";
          }
        }
        if (field.type === "phone" && typeof value === "string") {
          if (value.length < 6) {
            newErrors[field.id] = "Phone number too short";
          }
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await post(`/public/forms/${slug}`, answers);
      setSubmitted(true);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || "Submission failed";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const updateAnswer = (id: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    if (errors[id]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const renderField = (field: Field) => {
    const value = answers[field.id] ?? "";
    const fieldError = errors[field.id];

    const baseInput = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none";
    const errorInput = "border-red-500 focus:border-red-500 focus:ring-red-500";

    switch (field.type) {
      case "long_text":
        return (
          <textarea
            id={field.id}
            rows={4}
            className={`${baseInput} ${fieldError ? errorInput : ""}`}
            value={value}
            onChange={(e) => updateAnswer(field.id, e.target.value)}
            placeholder={field.label}
          />
        );
      case "email":
        return (
          <input
            id={field.id}
            type="email"
            className={`${baseInput} ${fieldError ? errorInput : ""}`}
            value={value}
            onChange={(e) => updateAnswer(field.id, e.target.value)}
            placeholder={field.label}
          />
        );
      case "phone":
        return (
          <input
            id={field.id}
            type="tel"
            className={`${baseInput} ${fieldError ? errorInput : ""}`}
            value={value}
            onChange={(e) => updateAnswer(field.id, e.target.value)}
            placeholder={field.label}
          />
        );
      case "number":
        return (
          <input
            id={field.id}
            type="number"
            className={`${baseInput} ${fieldError ? errorInput : ""}`}
            value={value}
            onChange={(e) => updateAnswer(field.id, parseFloat(e.target.value) || 0)}
            placeholder={field.label}
          />
        );
      case "date":
        return (
          <input
            id={field.id}
            type="date"
            className={`${baseInput} ${fieldError ? errorInput : ""}`}
            value={value}
            onChange={(e) => updateAnswer(field.id, e.target.value)}
          />
        );
      case "select":
        return (
          <select
            id={field.id}
            className={`${baseInput} ${fieldError ? errorInput : ""}`}
            value={value}
            onChange={(e) => updateAnswer(field.id, e.target.value)}
          >
            <option value="">-- Select --</option>
            {(field.options || []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
      case "multiselect":
        return (
          <div className="space-y-1">
            {(field.options || []).map((opt) => {
              const selected = Array.isArray(answers[field.id]) ? answers[field.id].includes(opt) : false;
              return (
                <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => {
                      const current = Array.isArray(answers[field.id]) ? [...answers[field.id]] : [];
                      const next = current.includes(opt)
                        ? current.filter((v: string) => v !== opt)
                        : [...current, opt];
                      updateAnswer(field.id, next);
                    }}
                    className="rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                  />
                  {opt}
                </label>
              );
            })}
          </div>
        );
      case "checkbox":
        return (
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
            <input
              id={field.id}
              type="checkbox"
              checked={!!value}
              onChange={(e) => updateAnswer(field.id, e.target.checked)}
              className="rounded border-gray-300 text-brand-500 focus:ring-brand-500"
            />
            {field.label}
          </label>
        );
      case "short_text":
      default:
        return (
          <input
            id={field.id}
            type="text"
            className={`${baseInput} ${fieldError ? errorInput : ""}`}
            value={value}
            onChange={(e) => updateAnswer(field.id, e.target.value)}
            placeholder={field.label}
          />
        );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 p-6">
        <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-8 text-center">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Form Unavailable</h1>
          <p className="text-gray-500 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 p-6">
        <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-8 text-center">
          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Thank You</h1>
          <p className="text-gray-500 dark:text-gray-400">
            {form?.thankYouMessage || "Your submission has been received."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-start justify-center bg-gray-50 dark:bg-gray-950 p-4 pt-12 sm:p-8 sm:pt-16">
      <div className="max-w-lg w-full bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1">{form?.title}</h1>
        {form?.description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{form.description}</p>
        )}

        {submitError && (
          <div className="mb-6 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {(form?.fields || []).map((field) => (
            <div key={field.id}>
              <label htmlFor={field.id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {field.label}
                {field.required && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              {renderField(field)}
              {errors[field.id] && (
                <p className="mt-1 text-xs text-red-500">{errors[field.id]}</p>
              )}
            </div>
          ))}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 px-4 transition-colors"
          >
            {submitting ? "Submitting..." : "Submit"}
          </button>
        </form>
      </div>
    </div>
  );
}
