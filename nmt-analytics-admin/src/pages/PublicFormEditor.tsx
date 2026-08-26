import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useT } from "../lib/i18n/context";
import { useToast } from "../context/ToastContext";
import {
  getForm, createForm, updateForm, getDepartures,
  type FormField,
} from "../api/forms";
import { getPackages } from "../api/packages";
import PageToolbar from "../components/ui/PageToolbar";
import Button from "../components/ui/button/Button";
import Badge from "../components/ui/badge/Badge";
import InputField from "../components/form/input/InputField";
import Label from "../components/form/Label";

const FIELD_TEMPLATE: FormField = {
  id: "",
  type: "short_text",
  label: "",
  required: false,
};

const NEXT_ID = (() => { let n = 1; return () => `field_${n++}`; })();

export default function PublicFormEditor() {
  const { t } = useT();
  const c = (t as any).publicForms || {};
  const { success, error: showError } = useToast();
  const nav = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [active, setActive] = useState(true);
  const [thankYouMessage, setThankYouMessage] = useState("");
  const [packageId, setPackageId] = useState("");
  const [departureId, setDepartureId] = useState("");
  const [fields, setFields] = useState<FormField[]>([{ ...FIELD_TEMPLATE, id: "full_name", label: "Full name", type: "short_text", required: true }]);
  const [packages, setPackages] = useState<any[]>([]);
  const [departures, setDepartures] = useState<any[]>([]);

  useEffect(() => {
    getPackages().then((res: any) => setPackages(res.data || res || [])).catch(() => {});
    getDepartures().then((res: any) => setDepartures(res.data || res || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const form = await getForm(id);
        setTitle(form.title);
        setDescription(form.description || "");
        setSlug(form.slug);
        setActive(form.active);
        setThankYouMessage(form.thankYouMessage || "");
        setPackageId(form.packageId || "");
        setDepartureId(form.departureId || "");
        setFields(form.fields.length ? form.fields : [{ ...FIELD_TEMPLATE, id: "full_name", label: "Full name", type: "short_text", required: true }]);
      } catch (err: any) { showError(err?.message || "Not found"); }
      finally { setLoading(false); }
    })();
  }, [id]);

  const addField = useCallback(() => {
    setFields((prev) => [...prev, { ...FIELD_TEMPLATE, id: NEXT_ID() }]);
  }, []);

  const removeField = useCallback((idx: number) => {
    setFields((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updateField = useCallback((idx: number, patch: Partial<FormField>) => {
    setFields((prev) => prev.map((f, i) => i === idx ? { ...f, ...patch } : f));
  }, []);

  const filteredDepartures = packageId
    ? departures.filter((d: any) => d.packageId === packageId || d.package_id === packageId)
    : departures;

  const handleSave = async () => {
    if (!title.trim()) return showError(c.titleRequired || "Title required");
    if (!slug.trim()) return showError(c.slugRequired || "Slug required");
    for (const f of fields) {
      if (!f.id.trim()) return showError("Field key is required");
      if (!f.label.trim()) return showError("Field label is required");
    }
    setSaving(true);
    try {
      const payload = {
        title, description: description || null,
        slug, active,
        fields: fields.map(({ id, type, label, required, options, mapTo }) => ({ id, type, label, required, options, mapTo: mapTo || undefined })),
        thankYouMessage: thankYouMessage || null,
        packageId: packageId || null,
        departureId: departureId || null,
      };
      if (isEdit) {
        await updateForm(id!, payload);
        success(c.saved || "Form updated");
      } else {
        const created = await createForm(payload as any);
        success(c.created || "Form created");
        nav(`/sales/forms/${created.id}`);
      }
    } catch (err: any) { showError(err?.message || "Save failed"); }
    finally { setSaving(false); }
  };

  const FIELD_TYPE_OPTIONS = [
    { value: "short_text", label: "Short text" },
    { value: "long_text", label: "Long text" },
    { value: "email", label: "Email" },
    { value: "phone", label: "Phone" },
    { value: "number", label: "Number" },
    { value: "date", label: "Date" },
    { value: "select", label: "Select" },
    { value: "multiselect", label: "Multi-select" },
    { value: "checkbox", label: "Checkbox" },
  ];

  const MAPTO_OPTIONS = [
    { value: "", label: "— None —" },
    { value: "contact_name", label: "Contact name" },
    { value: "email", label: "Email" },
    { value: "phone", label: "Phone" },
    { value: "destination", label: "Destination" },
    { value: "travel_start", label: "Travel start" },
    { value: "travel_end", label: "Travel end" },
    { value: "travelers", label: "Travelers" },
    { value: "budget", label: "Budget" },
    { value: "trip_type", label: "Trip type" },
  ];

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;

  return (
    <>
      <PageToolbar title={isEdit ? title || c.editForm || "Edit Form" : c.newForm || "New Form"} />
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>{c.title || "Title"}</Label>
            <InputField value={title} onChange={(e: any) => setTitle(e.target.value)} placeholder={c.titlePlaceholder || "Trip inquiry form"} />
          </div>
          <div>
            <Label>{c.slug || "Slug"}</Label>
            <InputField value={slug} onChange={(e: any) => setSlug(e.target.value)} placeholder="trip-inquiry" disabled={isEdit} />
            <p className="text-xs text-gray-400 mt-1">{c.slugHint || "Public URL: /public/forms/..."}</p>
          </div>
        </div>

        <div>
          <Label>{c.description || "Description"}</Label>
          <textarea
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm resize-y"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={c.descriptionPlaceholder || "Brief description shown above the form..."}
          />
        </div>

        <div>
          <Label>{c.thankYouMessage || "Thank-you message"}</Label>
          <textarea
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm resize-y"
            rows={2}
            value={thankYouMessage}
            onChange={(e) => setThankYouMessage(e.target.value)}
            placeholder={c.thankYouPlaceholder || "Thank you! We'll get back to you soon."}
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="rounded" />
            {c.active || "Active"}
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>{c.packageLabel || "Package (optional)"}</Label>
            <select
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
              value={packageId} onChange={(e) => { setPackageId(e.target.value); setDepartureId(""); }}
            >
              <option value="">— {c.none || "None"} —</option>
              {packages.map((p: any) => <option key={p.id} value={p.id}>{p.title || p.name}</option>)}
            </select>
          </div>
          <div>
            <Label>{c.departureLabel || "Departure (optional)"}</Label>
            <select
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
              value={departureId} onChange={(e) => setDepartureId(e.target.value)}
            >
              <option value="">— {c.none || "None"} —</option>
              {filteredDepartures.map((d: any) => <option key={d.id} value={d.id}>{d.title || d.id}</option>)}
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <Label className="!mb-0">{c.fields || "Fields"}</Label>
            <Button variant="outline" size="sm" onClick={addField}>+ {c.addField || "Add field"}</Button>
          </div>
          <div className="space-y-3">
            {fields.map((field, idx) => (
              <div key={`${field.id}-${idx}`} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="light" color="gray">{field.id}</Badge>
                  <button onClick={() => removeField(idx)} className="text-red-500 hover:text-red-700 text-sm">✕</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label>{c.fieldKey || "Key"} <span className="text-red-500">*</span></Label>
                    <InputField
                      value={field.id}
                      onChange={(e: any) => updateField(idx, { id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                      placeholder="contact_name"
                    />
                  </div>
                  <div>
                    <Label>{c.fieldLabel || "Label"} <span className="text-red-500">*</span></Label>
                    <InputField
                      value={field.label}
                      onChange={(e: any) => updateField(idx, { label: e.target.value })}
                      placeholder="Full name"
                    />
                  </div>
                  <div>
                    <Label>{c.fieldType || "Type"}</Label>
                    <select
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                      value={field.type} onChange={(e) => updateField(idx, { type: e.target.value as any, options: undefined })}
                    >
                      {FIELD_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={field.required} onChange={(e) => updateField(idx, { required: e.target.checked })} className="rounded" />
                    {c.required || "Required"}
                  </label>
                  <div className="flex items-center gap-2">
                    <Label className="!mb-0 text-xs">{c.mapTo || "Map to"}</Label>
                    <select
                      className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs"
                      value={field.mapTo || ""} onChange={(e) => updateField(idx, { mapTo: e.target.value || undefined })}
                    >
                      {MAPTO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                {(field.type === "select" || field.type === "multiselect") && (
                  <div>
                    <Label>{c.options || "Options (comma-separated)"}</Label>
                    <InputField
                      value={(field.options || []).join(", ")}
                      onChange={(e: any) => updateField(idx, { options: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })}
                      placeholder="Option 1, Option 2, Option 3"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button onClick={handleSave} disabled={saving}>{saving ? (c.saving || "Saving...") : (isEdit ? c.save || "Save" : c.create || "Create")}</Button>
          <Button variant="outline" onClick={() => nav(-1)}>{c.cancel || "Cancel"}</Button>
        </div>
      </div>
    </>
  );
}
