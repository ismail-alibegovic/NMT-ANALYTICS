import { useState, useEffect } from 'react';
import { Modal } from './modal';
import Button from './button/Button';
import Input from '../form/input/InputField';
import Label from '../form/Label';
import Select from '../form/Select';
import { useToast } from '../../context/ToastContext';

interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'number' | 'date' | 'textarea' | 'select' | 'checkbox';
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
  initialData = {},
  submitButtonText = 'Save',
  loading = false,
}: FormModalProps) {
  const { success, error } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>(initialData);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      setFormData(initialData);
      setFormErrors({});
    }
  }, [isOpen, initialData]);

  const validateForm = () => {
    const errors: Record<string, string> = {};

    fields.forEach((field) => {
      // For checkboxes,required probably doesn't make sense in many cases unless it's a "Must Agree" type
      if (field.required && field.type !== 'checkbox' && !formData[field.name]) {
        errors[field.name] = `${field.label} is required`;
      }

      if (field.type === 'email' && formData[field.name]) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData[field.name])) {
          errors[field.name] = 'Invalid email address';
        }
      }
    });

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(formData);
      success('Operation completed successfully');
      onClose();
    } catch (err: any) {
      console.error('Form submission error:', err);
      // Let the parent component handle specific errors if needed, but show generic error here if not handled
      error(err.message || 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInputChange = (name: string, value: any) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const renderField = (field: FormField) => {
    const fieldError = formErrors[field.name];

    switch (field.type) {
      case 'select':
        return (
          <div key={field.name} className="mb-4">
            <Label htmlFor={field.name}>{field.label}</Label>
            <Select
              options={field.options || []}
              placeholder={field.placeholder}
              defaultValue={formData[field.name] || ''}
              onChange={(value) => handleInputChange(field.name, value)}
            />
            {fieldError && <p className="mt-1 text-sm text-red-600">{fieldError}</p>}
          </div>
        );

      case 'textarea':
        return (
          <div key={field.name} className="mb-4">
            <Label htmlFor={field.name}>{field.label}</Label>
            <textarea
              id={field.name}
              placeholder={field.placeholder}
              value={formData[field.name] || ''}
              onChange={(e) => handleInputChange(field.name, e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
              rows={4}
            />
            {fieldError && <p className="mt-1 text-sm text-red-600">{fieldError}</p>}
          </div>
        );

      case 'checkbox':
        return (
          <div key={field.name} className="mb-4 flex items-center gap-3">
            <input
              type="checkbox"
              id={field.name}
              checked={!!formData[field.name]}
              onChange={(e) => handleInputChange(field.name, e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900"
            />
            <Label htmlFor={field.name} className="mb-0">{field.label}</Label>
            {fieldError && <p className="ml-2 text-sm text-red-600">{fieldError}</p>}
          </div>
        );

      default:
        return (
          <div key={field.name} className="mb-4">
            <Label htmlFor={field.name}>{field.label}</Label>
            <Input
              type={field.type}
              id={field.name}
              placeholder={field.placeholder}
              value={formData[field.name] || ''}
              onChange={(e) => handleInputChange(field.name, e.target.value)}
              error={!!fieldError}
            />
            {fieldError && <p className="mt-1 text-sm text-red-600">{fieldError}</p>}
          </div>
        );
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-2xl">
      <div className="p-6">
        <h2 className="mb-6 text-xl font-semibold text-gray-800 dark:text-white/90">
          {title}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map(renderField)}

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || loading}
            >
              {submitting ? 'Saving...' : submitButtonText}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
