export const SUPPORTED_PLACEHOLDERS = [
  'customerName',
  'customerPhone',
  'customerEmail',
  'reservationId',
  'reservationStatus',
  'packageName',
  'destination',
  'departureDate',
  'returnDate',
  'agencyName',
] as const;

export type SupportedPlaceholder = typeof SUPPORTED_PLACEHOLDERS[number];

const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;

export function extractPlaceholders(text: string): string[] {
  const names = new Set<string>();
  let match;
  while ((match = PLACEHOLDER_RE.exec(text)) !== null) {
    names.add(match[1]);
  }
  return Array.from(names);
}

export function validatePlaceholders(text: string, subject?: string | null): string[] {
  const allText = subject ? `${subject}\n${text}` : text;
  const names = extractPlaceholders(allText);
  const unsupported = names.filter((n) => !SUPPORTED_PLACEHOLDERS.includes(n as SupportedPlaceholder));
  return unsupported;
}

export const SAMPLE_VALUES: Record<SupportedPlaceholder, string> = {
  customerName: 'Jan de Vries',
  customerPhone: '+31 6 12345678',
  customerEmail: 'jan@example.com',
  reservationId: 'RES-2026-0042',
  reservationStatus: 'Confirmed',
  packageName: 'Venetië Classics',
  destination: 'Amsterdam',
  departureDate: '15.09.2026',
  returnDate: '22.09.2026',
  agencyName: 'Travelmania',
};

export function renderPreview(text: string, subject?: string | null, values?: Partial<Record<SupportedPlaceholder, string>>): { renderedSubject: string | null; renderedBody: string } {
  const merged = { ...SAMPLE_VALUES, ...values };
  const renderedBody = text.replace(PLACEHOLDER_RE, (_, name) => name in merged ? merged[name as SupportedPlaceholder] : `{{${name}}}`);
  const renderedSubject = subject ? subject.replace(PLACEHOLDER_RE, (_, name) => name in merged ? merged[name as SupportedPlaceholder] : `{{${name}}}`) : null;
  return { renderedSubject, renderedBody };
}
