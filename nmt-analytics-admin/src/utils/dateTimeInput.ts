/** Format an instant for a browser datetime-local control, in the user's timezone. */
export function toDateTimeInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Serialize the local wall time with an explicit offset before crossing the API boundary. */
export function fromDateTimeInput(value: string): string {
  const date = new Date(value);
  // Preserve invalid/empty values for the existing API validation/error path.
  return Number.isFinite(date.getTime()) ? date.toISOString() : value;
}
