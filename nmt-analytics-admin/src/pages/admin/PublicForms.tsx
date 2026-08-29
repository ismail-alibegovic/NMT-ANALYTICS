import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import PageMeta from '../../components/common/PageMeta';
import PageToolbar from '../../components/ui/PageToolbar';
import Button from '../../components/ui/button/Button';
import Badge from '../../components/ui/badge/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Modal } from '../../components/ui/modal';
import Input from '../../components/form/input/InputField';
import Label from '../../components/form/Label';
import { useToast } from '../../context/ToastContext';
import { useT } from '../../lib/i18n/context';
import { useApp } from '../../context/AppContext';
import { hasAccess } from '../../types/roles';
import {
  createForm,
  deleteForm,
  getFormSubmissions,
  getForms,
  updateForm,
  type FormField,
  type FormSubmission,
  type PublicForm,
  type PublicFormMapTo,
} from '../../api/forms';
import { getPackages, type Package } from '../../api/packages';
import { getDepartures, type Departure } from '../../api/departures';
import { CopyIcon, EyeIcon, PencilIcon, PlusIcon, TrashBinIcon } from '../../icons';

type FieldType = FormField['type'];

type FormDraft = {
  title: string;
  description: string;
  slug: string;
  active: boolean;
  thankYouMessage: string;
  packageId: string;
  departureId: string;
  fields: FormField[];
};

const FIELD_TYPES: FieldType[] = ['short_text', 'long_text', 'email', 'phone', 'number', 'date', 'select', 'multiselect', 'checkbox'];
const MAP_TO_OPTIONS: Array<{ value: '' | PublicFormMapTo; labelKey: string }> = [
  { value: '', labelKey: 'none' },
  { value: 'contact_name', labelKey: 'contactName' },
  { value: 'email', labelKey: 'email' },
  { value: 'phone', labelKey: 'phone' },
  { value: 'destination', labelKey: 'destination' },
  { value: 'travel_start', labelKey: 'travelStart' },
  { value: 'travel_end', labelKey: 'travelEnd' },
  { value: 'travelers', labelKey: 'travelers' },
  { value: 'budget', labelKey: 'budget' },
  { value: 'trip_type', labelKey: 'tripType' },
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function fieldIdFromLabel(label: string) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

function createEmptyField(index: number): FormField {
  return {
    id: `field_${index + 1}`,
    type: 'short_text',
    label: '',
    required: false,
    options: [],
  };
}

function formToDraft(form?: PublicForm | null): FormDraft {
  if (!form) {
    return {
      title: '',
      description: '',
      slug: '',
      active: true,
      thankYouMessage: '',
      packageId: '',
      departureId: '',
      fields: [],
    };
  }

  return {
    title: form.title,
    description: form.description || '',
    slug: form.slug,
    active: form.active,
    thankYouMessage: form.thankYouMessage || '',
    packageId: form.packageId || '',
    departureId: form.departureId || '',
    fields: (form.fields || []).map((field) => ({ ...field, options: field.options || [] })),
  };
}

export default function PublicForms() {
  const { t, lang } = useT();
  const c = t.publicForms;
  const common = t.common;
  const { success, error: showError } = useToast();
  const { userContext } = useApp();
  const canWrite = hasAccess('manager', userContext?.role);

  const [forms, setForms] = useState<PublicForm[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [loading, setLoading] = useState(true);
  const [packagesError, setPackagesError] = useState(false);
  const [departuresError, setDeparturesError] = useState(false);
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PublicForm | null>(null);
  const [draft, setDraft] = useState<FormDraft>(formToDraft(null));
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PublicForm | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [submissionsTarget, setSubmissionsTarget] = useState<PublicForm | null>(null);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const formsData = await getForms();
      setForms(formsData || []);
    } catch (err: any) {
      showError(err?.message || c.loadError);
      setLoading(false);
      return;
    }
    setLoading(false);

    // Optional context — loaded independently so a failure in packages or
    // departures never makes the forms management page unusable.
    getPackages({ page: 1, limit: 200 })
      .then((packagesData) => {
        setPackages(packagesData.data || []);
        setPackagesError(false);
      })
      .catch(() => {
        setPackages([]);
        setPackagesError(true);
      });

    getDepartures({ page: 1, limit: 200 })
      .then((departuresData) => {
        setDepartures(departuresData.data || []);
        setDeparturesError(false);
      })
      .catch(() => {
        setDepartures([]);
        setDeparturesError(true);
      });
  }, [c.loadError, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!submissionsTarget) return;
    setSubmissionsLoading(true);
    getFormSubmissions(submissionsTarget.id)
      .then((rows) => setSubmissions(rows || []))
      .catch((err: any) => showError(err?.message || c.submissions.loadError))
      .finally(() => setSubmissionsLoading(false));
  }, [submissionsTarget, c.submissions.loadError, showError]);

  const filteredForms = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return forms;
    return forms.filter((form) =>
      [form.title, form.slug, form.description || ''].some((value) => value.toLowerCase().includes(query)),
    );
  }, [forms, search]);

  const departuresForPackage = useMemo(() => {
    if (!draft.packageId) return departures;
    return departures.filter((departure) => departure.package_id === draft.packageId);
  }, [departures, draft.packageId]);

  const contextError = packagesError ? c.packagesLoadError : departuresError ? c.departuresLoadError : null;

  const publicBase = typeof window !== 'undefined' ? window.location.origin : '';

  const columns: Column<PublicForm>[] = [
    {
      key: 'title',
      header: c.table.form,
      render: (_value, form) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-gray-900 dark:text-white">{form.title}</div>
          <div className="truncate text-xs text-gray-500 dark:text-gray-400">/{form.slug}</div>
        </div>
      ),
    },
    {
      key: 'active',
      header: c.table.status,
      render: (value) => (
        <Badge size="sm" color={value ? 'success' : 'light'} variant="light">
          {value ? c.statusActive : c.statusInactive}
        </Badge>
      ),
    },
    {
      key: 'packageId',
      header: c.table.context,
      render: (_value, form) => {
        if (form.departureId) {
          const departure = departures.find((item) => item.id === form.departureId);
          return departure?.packageName || c.context.departure;
        }
        if (form.packageId) {
          const pkg = packages.find((item) => item.id === form.packageId);
          return pkg?.name || c.context.package;
        }
        return c.context.none;
      },
    },
    {
      key: 'fields',
      header: c.table.fields,
      render: (value) => <span>{Array.isArray(value) ? value.length : 0}</span>,
    },
    {
      key: 'updatedAt',
      header: c.table.updated,
      render: (value) =>
        value ? new Date(String(value)).toLocaleString(lang === 'bs' ? 'bs-BA' : 'en-US') : '—',
    },
    {
      key: 'actions',
      header: common.actions,
      render: (_value, form) => {
        const publicLink = `${publicBase}/public/forms/${form.slug}`;
        return (
          <div className="flex flex-wrap gap-2">
            {canWrite && (
              <>
                <Button size="sm" variant="outline" onClick={() => openEdit(form)} title={c.edit}>
                  <PencilIcon className="size-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => void handleDuplicate(form)} title={c.duplicate}>
                  <CopyIcon className="size-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => void handleToggle(form)}>
                  {form.active ? c.deactivate : c.activate}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDeleteTarget(form)} title={common.delete}>
                  <TrashBinIcon className="size-4" />
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" onClick={() => void copyPublicLink(publicLink)} title={c.copyLink}>
              <CopyIcon className="size-4" />
            </Button>
            <Link to={`/public/forms/${form.slug}`} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline" title={c.preview}>
                <EyeIcon className="size-4" />
              </Button>
            </Link>
            <Button size="sm" variant="outline" onClick={() => setSubmissionsTarget(form)}>
              {c.viewSubmissions}
            </Button>
          </div>
        );
      },
    },
  ];

  function openCreate() {
    setEditTarget(null);
    setDraft(formToDraft(null));
    setFieldErrors({});
    setEditorOpen(true);
  }

  function openEdit(form: PublicForm) {
    setEditTarget(form);
    setDraft(formToDraft(form));
    setFieldErrors({});
    setEditorOpen(true);
  }

  function updateField(index: number, patch: Partial<FormField>) {
    setDraft((current) => {
      const fields = [...current.fields];
      const existing = fields[index];
      if (!existing) return current;
      fields[index] = { ...existing, ...patch };
      if (patch.type !== undefined && patch.type !== 'select' && patch.type !== 'multiselect') {
        fields[index].options = [];
      }
      return { ...current, fields };
    });
  }

  function addField() {
    setDraft((current) => ({ ...current, fields: [...current.fields, createEmptyField(current.fields.length)] }));
  }

  function deleteField(index: number) {
    setDraft((current) => ({ ...current, fields: current.fields.filter((_, fieldIndex) => fieldIndex !== index) }));
  }

  function moveField(index: number, direction: -1 | 1) {
    setDraft((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.fields.length) return current;
      const fields = [...current.fields];
      [fields[index], fields[nextIndex]] = [fields[nextIndex], fields[index]];
      return { ...current, fields };
    });
  }

  function validateDraft() {
    const nextErrors: Record<string, string> = {};
    const ids = new Set<string>();

    if (!draft.title.trim()) nextErrors.title = c.validation.titleRequired;
    if (!draft.slug.trim()) nextErrors.slug = c.validation.slugRequired;

    draft.fields.forEach((field, index) => {
      const prefix = `field_${index}`;
      const normalizedId = field.id.trim();
      if (!field.label.trim()) nextErrors[`${prefix}_label`] = c.validation.labelRequired;
      if (!normalizedId) nextErrors[`${prefix}_id`] = c.validation.fieldIdRequired;
      else if (!/^[a-z0-9_]+$/.test(normalizedId)) nextErrors[`${prefix}_id`] = c.validation.fieldIdInvalid;
      else if (ids.has(normalizedId)) nextErrors[`${prefix}_id`] = c.validation.fieldIdDuplicate;
      else ids.add(normalizedId);

      if (field.type === 'select' || field.type === 'multiselect') {
        const options = (field.options || []).map((option) => option.trim()).filter(Boolean);
        if (options.length === 0) nextErrors[`${prefix}_options`] = c.validation.optionsRequired;
        else if (new Set(options).size !== options.length) nextErrors[`${prefix}_options`] = c.validation.optionsDuplicate;
      }
    });

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSave() {
    if (!validateDraft()) return;
    setSaving(true);
    try {
      const payload = {
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        slug: slugify(draft.slug),
        active: draft.active,
        thankYouMessage: draft.thankYouMessage.trim() || null,
        packageId: draft.packageId || null,
        departureId: draft.departureId || null,
        fields: draft.fields.map((field) => ({
          ...field,
          id: field.id.trim(),
          label: field.label.trim(),
          options: field.type === 'select' || field.type === 'multiselect'
            ? (field.options || []).map((option) => option.trim()).filter(Boolean)
            : undefined,
          mapTo: field.mapTo || undefined,
        })),
      };

      if (editTarget) {
        await updateForm(editTarget.id, payload);
        success(c.updated);
      } else {
        await createForm(payload);
        success(c.created);
      }

      setEditorOpen(false);
      setEditTarget(null);
      setDraft(formToDraft(null));
      await load();
    } catch (err: any) {
      showError(err?.message || c.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate(form: PublicForm) {
    try {
      const existingSlugs = new Set(forms.map((item) => item.slug));
      let nextSlug = `${form.slug}-copy`;
      let index = 2;
      while (existingSlugs.has(nextSlug)) {
        nextSlug = `${form.slug}-copy-${index}`;
        index += 1;
      }
      await createForm({
        title: `${form.title} ${c.copySuffix}`,
        description: form.description,
        slug: nextSlug,
        active: false,
        thankYouMessage: form.thankYouMessage,
        packageId: form.packageId,
        departureId: form.departureId,
        fields: form.fields,
      });
      success(c.duplicated);
      await load();
    } catch (err: any) {
      showError(err?.message || c.saveError);
    }
  }

  async function handleToggle(form: PublicForm) {
    try {
      await updateForm(form.id, { active: !form.active });
      success(form.active ? c.deactivated : c.activated);
      await load();
    } catch (err: any) {
      showError(err?.message || c.saveError);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteForm(deleteTarget.id);
      success(c.deleted);
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      showError(err?.message || c.deleteError);
    } finally {
      setDeleting(false);
    }
  }

  async function copyPublicLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      success(c.linkCopied);
    } catch {
      showError(c.linkCopyError);
    }
  }

  return (
    <>
      <PageMeta title={`${c.title} | Travline`} description={c.description} />
      <PageToolbar
        title={c.title}
        description={c.description}
        searchPlaceholder={c.searchPlaceholder}
        searchValue={search}
        onSearchChange={setSearch}
        createButton={canWrite ? { label: c.newForm, onClick: openCreate } : undefined}
      />

      {!canWrite && !loading && (
        <div className="mb-4 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800 dark:border-warning-800 dark:bg-warning-900/20 dark:text-warning-200">
          {c.readOnlyNotice}
        </div>
      )}
      {contextError && (
        <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300">
          {contextError}
        </div>
      )}

      {loading ? (
        <DataTable data={[]} columns={columns} loading emptyMessage={c.emptyDescription} />
      ) : filteredForms.length === 0 ? (
        <EmptyState
          title={search.trim() ? c.emptyFilteredTitle : c.emptyTitle}
          description={search.trim() ? c.emptyFilteredDescription : c.emptyDescription}
          action={search.trim() || !canWrite ? undefined : { label: c.newForm, onClick: openCreate }}
        />
      ) : (
        <DataTable data={filteredForms} columns={columns} emptyMessage={c.emptyDescription} />
      )}

      <Modal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        className="m-4 max-w-6xl"
        title={editTarget ? c.editTitle : c.createTitle}
      >
        <div className="grid max-h-[85vh] gap-6 overflow-y-auto p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label htmlFor="public-form-title">{c.fields.title}</Label>
                <Input
                  id="public-form-title"
                  value={draft.title}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDraft((current) => ({
                      ...current,
                      title: value,
                      slug: current.slug || slugify(value),
                    }));
                  }}
                  placeholder={c.placeholders.title}
                />
                {fieldErrors.title && <p className="mt-1 text-xs text-red-500">{fieldErrors.title}</p>}
              </div>
              <div>
                <Label htmlFor="public-form-slug">{c.fields.slug}</Label>
                <Input
                  id="public-form-slug"
                  value={draft.slug}
                  onChange={(event) => setDraft((current) => ({ ...current, slug: slugify(event.target.value) }))}
                  placeholder={c.placeholders.slug}
                />
                {fieldErrors.slug && <p className="mt-1 text-xs text-red-500">{fieldErrors.slug}</p>}
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-2 text-sm dark:border-gray-700">
                  <input
                    type="checkbox"
                    checked={draft.active}
                    onChange={(event) => setDraft((current) => ({ ...current, active: event.target.checked }))}
                  />
                  {c.fields.active}
                </label>
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="public-form-description">{c.fields.description}</Label>
                <textarea
                  id="public-form-description"
                  value={draft.description}
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                  placeholder={c.placeholders.description}
                  className="min-h-24 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:text-white"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="public-form-thank-you">{c.fields.thankYouMessage}</Label>
                <textarea
                  id="public-form-thank-you"
                  value={draft.thankYouMessage}
                  onChange={(event) => setDraft((current) => ({ ...current, thankYouMessage: event.target.value }))}
                  placeholder={c.placeholders.thankYouMessage}
                  className="min-h-24 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:text-white"
                />
              </div>
            </div>

            <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">{c.context.title}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{c.context.description}</p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="public-form-package">{c.context.package}</Label>
                  <select
                    id="public-form-package"
                    value={draft.packageId}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        packageId: event.target.value,
                        departureId: current.departureId && departures.some((item) => item.id === current.departureId && item.package_id === event.target.value)
                          ? current.departureId
                          : '',
                      }))
                    }
                    className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700"
                  >
                    <option value="">{c.context.none}</option>
                    {packages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>{pkg.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="public-form-departure">{c.context.departure}</Label>
                  <select
                    id="public-form-departure"
                    value={draft.departureId}
                    onChange={(event) =>
                      setDraft((current) => {
                        const departureId = event.target.value;
                        const departure = departures.find((item) => item.id === departureId);
                        return {
                          ...current,
                          departureId,
                          packageId: departure?.package_id || current.packageId,
                        };
                      })
                    }
                    className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700"
                  >
                    <option value="">{c.context.none}</option>
                    {departuresForPackage.map((departure) => (
                      <option key={departure.id} value={departure.id}>
                        {departure.packageName} — {new Date(departure.depart_at).toLocaleDateString(lang === 'bs' ? 'bs-BA' : 'en-US')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">{c.builder.title}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{c.builder.description}</p>
                </div>
                <Button size="sm" variant="outline" onClick={addField}>
                  <PlusIcon className="mr-2 size-4" />
                  {c.builder.addField}
                </Button>
              </div>

              <div className="space-y-4">
                {draft.fields.length === 0 ? (
                  <EmptyState title={c.builder.emptyTitle} description={c.builder.emptyDescription} />
                ) : draft.fields.map((field, index) => {
                  const prefix = `field_${index}`;
                  const showOptions = field.type === 'select' || field.type === 'multiselect';
                  return (
                    <div key={`${field.id}-${index}`} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {c.builder.fieldLabel.replace('{index}', String(index + 1))}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => moveField(index, -1)} disabled={index === 0}>
                            {c.builder.moveUp}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => moveField(index, 1)} disabled={index === draft.fields.length - 1}>
                            {c.builder.moveDown}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => deleteField(index)}>
                            {common.delete}
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label htmlFor={`${prefix}_label`}>{c.builder.label}</Label>
                          <Input
                            id={`${prefix}_label`}
                            value={field.label}
                            onChange={(event) => {
                              const label = event.target.value;
                              updateField(index, {
                                label,
                                id: field.id.startsWith('field_') || field.id === fieldIdFromLabel(field.label) ? fieldIdFromLabel(label) : field.id,
                              });
                            }}
                            placeholder={c.builder.labelPlaceholder}
                          />
                          {fieldErrors[`${prefix}_label`] && <p className="mt-1 text-xs text-red-500">{fieldErrors[`${prefix}_label`]}</p>}
                        </div>
                        <div>
                          <Label htmlFor={`${prefix}_id`}>{c.builder.fieldId}</Label>
                          <Input
                            id={`${prefix}_id`}
                            value={field.id}
                            onChange={(event) => updateField(index, { id: fieldIdFromLabel(event.target.value) })}
                            placeholder={c.builder.fieldIdPlaceholder}
                          />
                          {fieldErrors[`${prefix}_id`] && <p className="mt-1 text-xs text-red-500">{fieldErrors[`${prefix}_id`]}</p>}
                        </div>
                        <div>
                          <Label htmlFor={`${prefix}_type`}>{c.builder.type}</Label>
                          <select
                            id={`${prefix}_type`}
                            value={field.type}
                            onChange={(event) => updateField(index, { type: event.target.value as FieldType })}
                            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700"
                          >
                            {FIELD_TYPES.map((type) => (
                              <option key={type} value={type}>{c.fieldTypes[type]}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <Label htmlFor={`${prefix}_mapto`}>{c.builder.mapTo}</Label>
                          <select
                            id={`${prefix}_mapto`}
                            value={field.mapTo || ''}
                            onChange={(event) => updateField(index, { mapTo: (event.target.value || undefined) as PublicFormMapTo | undefined })}
                            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-700"
                          >
                            {MAP_TO_OPTIONS.map((option) => (
                              <option key={option.value || 'none'} value={option.value}>{c.crmMappings[option.labelKey]}</option>
                            ))}
                          </select>
                        </div>
                        <div className="md:col-span-2">
                          <label className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                            <input
                              type="checkbox"
                              checked={field.required}
                              onChange={(event) => updateField(index, { required: event.target.checked })}
                            />
                            {c.builder.required}
                          </label>
                        </div>
                        {showOptions && (
                          <div className="md:col-span-2">
                            <Label htmlFor={`${prefix}_options`}>{c.builder.options}</Label>
                            <textarea
                              id={`${prefix}_options`}
                              value={(field.options || []).join('\n')}
                              onChange={(event) => updateField(index, { options: event.target.value.split('\n') })}
                              placeholder={c.builder.optionsPlaceholder}
                              className="min-h-24 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:text-white"
                            />
                            {fieldErrors[`${prefix}_options`] && <p className="mt-1 text-xs text-red-500">{fieldErrors[`${prefix}_options`]}</p>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
              <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">{c.previewCard.title}</h3>
              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <div><span className="font-medium">{c.previewCard.slug}</span> /public/forms/{draft.slug || c.previewCard.slugPlaceholder}</div>
                <div><span className="font-medium">{c.previewCard.fields}</span> {draft.fields.length}</div>
                <div><span className="font-medium">{c.previewCard.status}</span> {draft.active ? c.statusActive : c.statusInactive}</div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? common.saving : editTarget ? c.save : c.create}
                </Button>
                <Button variant="outline" onClick={() => setEditorOpen(false)}>
                  {common.cancel}
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </Modal>

      <Modal
        isOpen={!!submissionsTarget}
        onClose={() => setSubmissionsTarget(null)}
        className="m-4 max-w-5xl"
        title={c.submissions.title.replace('{name}', submissionsTarget?.title || '')}
      >
        <div className="max-h-[80vh] overflow-y-auto p-6">
          {submissionsLoading ? (
            <DataTable data={[]} columns={[]} loading emptyMessage={c.submissions.emptyDescription} />
          ) : submissions.length === 0 ? (
            <EmptyState title={c.submissions.emptyTitle} description={c.submissions.emptyDescription} />
          ) : (
            <div className="space-y-4">
              {submissions.map((submission) => (
                <div key={submission.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      {new Date(submission.submittedAt).toLocaleString(lang === 'bs' ? 'bs-BA' : 'en-US')}
                    </div>
                    {submission.inquiryId ? (
                      <Link to={`/inquiries?search=${encodeURIComponent(submission.inquiryId)}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
                        {c.submissions.openInquiry}
                      </Link>
                    ) : (
                      <span className="text-xs text-gray-500 dark:text-gray-400">{c.submissions.noInquiry}</span>
                    )}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {Object.entries(submission.answers || {}).map(([key, value]) => (
                      <div key={key} className="rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-white/[0.03]">
                        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{key}</div>
                        <div className="mt-1 break-words text-gray-900 dark:text-white">
                          {Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? (value ? common.yes : common.no) : String(value ?? '—')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        className="m-4 max-w-md"
        title={c.deleteTitle}
      >
        <div className="space-y-4 p-6">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {c.deleteDescription.replace('{name}', deleteTarget?.title || '')}
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{common.cancel}</Button>
            <Button variant="primary" onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? common.deleting : common.delete}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
