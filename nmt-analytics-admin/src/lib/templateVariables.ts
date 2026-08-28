export type TemplateChannel = 'email' | 'sms';

export interface TemplateVariable {
  placeholder: string;
  key: string;
}

/**
 * Canonical list of supported placeholders for the editor.
 * Must stay in sync with the API-side validation in
 * nmt-analytics-api/src/lib/templatePlaceholders.ts.
 */
export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  { placeholder: '{{customerName}}', key: 'customerName' },
  { placeholder: '{{customerPhone}}', key: 'customerPhone' },
  { placeholder: '{{customerEmail}}', key: 'customerEmail' },
  { placeholder: '{{reservationId}}', key: 'reservationId' },
  { placeholder: '{{reservationStatus}}', key: 'reservationStatus' },
  { placeholder: '{{packageName}}', key: 'packageName' },
  { placeholder: '{{destination}}', key: 'destination' },
  { placeholder: '{{departureDate}}', key: 'departureDate' },
  { placeholder: '{{returnDate}}', key: 'returnDate' },
  { placeholder: '{{agencyName}}', key: 'agencyName' },
];

export const SMS_MAX_LENGTH = 320;

export const SAMPLE_VALUES: Record<string, string> = {
  customerName: 'Amina Kovačević',
  customerPhone: '+387 61 240 679',
  customerEmail: 'amina@example.com',
  reservationId: 'RSV-2026-0042',
  reservationStatus: 'Confirmed',
  packageName: 'Antalya All-Inclusive',
  destination: 'Antalya, Türkiye',
  departureDate: '2026-07-14',
  returnDate: '2026-07-21',
  agencyName: 'Travelmania d.o.o.',
};

const PLACEHOLDER_RE = /\{\{([a-zA-Z0-9_]+)\}\}/g;

/**
 * Render a template string by replacing supported placeholders with values.
 * Unknown placeholders are left untouched so the author can see them.
 */
export function renderTemplate(template: string, values: Record<string, string> = SAMPLE_VALUES): string {
  return template.replace(PLACEHOLDER_RE, (full, key: string) => {
    const value = values[key];
    return value !== undefined ? value : full;
  });
}

/**
 * Collect every `{{placeholder}}` token found in a string.
 */
export function extractPlaceholders(text: string): string[] {
  const matches = text.match(PLACEHOLDER_RE) || [];
  return matches.map((token) => token.slice(2, -2));
}

/**
 * Return true when every placeholder in `text` is in the supported set.
 */
export function hasUnsupportedPlaceholder(text: string): boolean {
  return extractPlaceholders(text).some(
    (key) => !TEMPLATE_VARIABLES.some((variable) => variable.key === key),
  );
}
