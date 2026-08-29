import { get, post, patch, del } from './client';

export interface FormField {
  id: string;
  type: 'short_text' | 'long_text' | 'email' | 'phone' | 'number' | 'date' | 'select' | 'multiselect' | 'checkbox';
  label: string;
  required: boolean;
  options?: string[];
  mapTo?: string;
}

export type PublicFormMapTo =
  | 'contact_name'
  | 'email'
  | 'phone'
  | 'destination'
  | 'travel_start'
  | 'travel_end'
  | 'travelers'
  | 'budget'
  | 'trip_type';

export interface PublicForm {
  id: string;
  orgId: string;
  title: string;
  description: string | null;
  slug: string;
  active: boolean;
  fields: FormField[];
  thankYouMessage: string | null;
  packageId: string | null;
  departureId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FormSubmission {
  id: string;
  formId: string;
  inquiryId: string | null;
  answers: Record<string, unknown>;
  submittedAt: string;
}

export async function getForms(): Promise<PublicForm[]> {
  const res = await get('/forms');
  const payload = res.data as { data?: PublicForm[] } | PublicForm[];
  return (Array.isArray(payload) ? payload : payload?.data || []) as PublicForm[];
}

export async function getForm(id: string): Promise<PublicForm> {
  const res = await get(`/forms/${id}`);
  return res.data as PublicForm;
}

export async function createForm(data: Partial<PublicForm> & { title: string; slug: string }): Promise<PublicForm> {
  const res = await post('/forms', data);
  return res.data as PublicForm;
}

export async function updateForm(id: string, data: Partial<PublicForm>): Promise<PublicForm> {
  const res = await patch(`/forms/${id}`, data);
  return res.data as PublicForm;
}

export async function deleteForm(id: string): Promise<void> {
  await del(`/forms/${id}`);
}

export async function getFormSubmissions(formId: string): Promise<FormSubmission[]> {
  const res = await get(`/forms/${formId}/submissions`);
  const payload = res.data as { data?: FormSubmission[] } | FormSubmission[];
  return (Array.isArray(payload) ? payload : payload?.data || []) as FormSubmission[];
}
