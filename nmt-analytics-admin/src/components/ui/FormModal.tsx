import { useState, useEffect, useRef, useId, useMemo } from 'react';
import { Modal } from './modal';
import Button from './button/Button';
import Input from '../form/input/InputField';
import Label from '../form/Label';
import Select from '../form/Select';
import { useToast } from '../../context/ToastContext';
import { useT } from '../../lib/i18n/context';

const EMPTY_DATA: Record<string, unknown> = {};

interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'number' | 'date' | 'datetime-local' | 'textarea' | 'select' | 'checkbox';
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
}

interface FormModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  fields: FormField[];
  onSubmit: (data: any) => Promise<void>;
  initialData?: Record<string, any>;
  submitButtonText?: string;
  loading?: boolean;
}

export function FormModal({
  isOpen,
  onClose,
  title,
  fields,
  onSubmit,
  initialData = EMPTY_DATA,
  submitButtonText = 'Save',
  loading = false,
}: FormModalProps) {
  const { success, error } = useToast();
  const { t } = useT();
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const [submissionError, setSubmissionError] = useState('');
  const formId = useId();
  const closeForm = () => { if (!submitLock.current && !loading) onClose(); };
  const [formData, setFormData] = useState<Record<string, any>>(initialData);
  // Parents frequently pass inline initialData objects. Equal values must not
  // reset an active draft when a parent changes its loading state.
  const initialSignature = JSON.stringify(initialData);
  const initialValues = useMemo(() => JSON.parse(initialSignature), [initialSignature]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      setFormData(initialValues);
      setFormErrors({});
      setSubmissionError('');
    }
  }, [isOpen, initialValues]);

  const validateField = (field: FormField, value: any): string => {
    if (field.required && (field.type === 'checkbox' ? value !== true : value == null || String(value).trim() === '')) {
      return `${field.label} ${t.common.isRequired}`;
    }
    if (field.type === 'email' && value) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return t.publicForms.public.invalidEmail;
      }
    }
    return '';
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    fields.forEach((field) => {
      const err = validateField(field, formData[field.name]);
      if (err) errors[field.name] = err;
    });
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleBlur = (field: FormField) => {
    const err = validateField(field, formData[field.name]);
    setFormErrors((prev) => ({ ...prev, [field.name]: err }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (submitLock.current || loading) return;
    if (!validateForm()) {
      return;
    }

    submitLock.current = true;
    setSubmissionError('');
    setSubmitting(true);
    try {
      await onSubmit(formData);
      success(t.common.success);
      onClose();
    } catch (err: any) {
      setSubmissionError(err.message || t.common.error);
      // Let the parent component handle specific errors if needed, but show generic error here if not handled
      error(err.message || t.common.error);
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const handleInputChange = (name: string, value: any) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    setSubmissionError('');
    // Clear error when user starts typing
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const renderField = (field: FormField) => {
    const fieldError = formErrors[field.name];
    const fieldId = `${formId}-${field.name}`;
    const errorId = `${fieldId}-error`;

    switch (field.type) {
      case 'select':
        return (
          <div key={field.name}>
            <Label htmlFor={fieldId}>
              {field.label}
              {field.required && <span className="ml-0.5 text-error-500">*</span>}
            </Label>
            <Select
              id={fieldId}
              name={field.name}
              aria-describedby={fieldError ? errorId : undefined}
              options={field.options || []}
              placeholder={field.placeholder}
              value={formData[field.name] ?? ''}
              onChange={(value) => handleInputChange(field.name, value)}
              error={!!fieldError}
            />
            {fieldError && <p id={errorId} role="alert" className="mt-1.5 text-xs text-error-500">{fieldError}</p>}
          </div>
        );

      case 'textarea':
        return (
          <div key={field.name}>
            <Label htmlFor={fieldId}>
              {field.label}
              {field.required && <span className="ml-0.5 text-error-500">*</span>}
            </Label>
            <textarea
              id={fieldId}
              aria-invalid={!!fieldError}
              aria-describedby={fieldError ? errorId : undefined}
              placeholder={field.placeholder}
              value={formData[field.name] ?? ''}
              onChange={(e) => {
                handleInputChange(field.name, e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 240)}px`;
              }}
              onBlur={() => handleBlur(field)}
              className={`min-h-[96px] w-full resize-none overflow-hidden rounded-lg border bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs transition-colors placeholder:text-gray-400 focus:outline-hidden focus:ring-2 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 ${
                fieldError
                  ? 'border-error-500 focus:border-error-300 focus:ring-error-500/15 dark:border-error-500'
                  : 'border-gray-300 focus:border-brand-400 focus:ring-brand-500/15 dark:border-gray-700 dark:focus:border-brand-500'
              }`}
              rows={4}
            />
            {fieldError && <p id={errorId} role="alert" className="mt-1.5 text-xs text-error-500">{fieldError}</p>}
          </div>
        );

      case 'checkbox':
        return (
          <div key={field.name}>
            <label
              htmlFor={fieldId}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"
            >
              <input
                type="checkbox"
                id={fieldId}
                checked={!!formData[field.name]}
                onChange={(e) => handleInputChange(field.name, e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-900"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{field.label}</span>
            </label>
            {fieldError && <p id={errorId} role="alert" className="mt-1.5 text-xs text-error-500">{fieldError}</p>}
          </div>
        );

      default:
        return (
          <div key={field.name}>
            <Label htmlFor={fieldId}>
              {field.label}
              {field.required && <span className="ml-0.5 text-error-500">*</span>}
            </Label>
            <Input
              name={field.name}
              aria-describedby={fieldError ? errorId : undefined}
              type={field.type}
              id={fieldId}
              placeholder={field.placeholder}
              value={formData[field.name] ?? ''}
              onChange={(e) => handleInputChange(field.name, e.target.value)}
              onBlur={() => handleBlur(field)}
              error={!!fieldError}
            />
            {fieldError && <p id={errorId} role="alert" className="mt-1.5 text-xs text-error-500">{fieldError}</p>}
          </div>
        );
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={closeForm} className="max-w-2xl" scrollable title={title} closeLabel={t.common.close}>
      <div className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset disabled={submitting || loading} className="min-w-0 space-y-4">{fields.map(renderField)}</fieldset>

          {submissionError && <p role="alert" className="rounded-lg bg-error-50 p-3 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-400">{submissionError}</p>}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={closeForm}
              disabled={submitting}
            >
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              disabled={submitting || loading}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t.common.saving}
                </span>
              ) : (
                submitButtonText
              )}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
