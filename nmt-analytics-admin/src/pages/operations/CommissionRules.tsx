import { useState, useEffect, useRef, useCallback } from "react";
import PageMeta from "../../components/common/PageMeta";
import PageToolbar from "../../components/ui/PageToolbar";
import Button from "../../components/ui/button/Button";
import Badge from "../../components/ui/badge/Badge";
import { DataTable, Column } from "../../components/ui/DataTable";
import { Modal } from "../../components/ui/modal";
import { EmptyState } from "../../components/ui/EmptyState";
import { useToast } from "../../context/ToastContext";
import { useApp } from "../../context/AppContext";
import { useT } from "../../lib/i18n/context";
import { formatCurrency } from "../../utils/business";
import {
  getCommissionRules,
  createCommissionRule,
  updateCommissionRule,
  deleteCommissionRule,
  previewCommission,
  CommissionRule,
} from "../../api/operations";

const PT_COLOR: Record<string, string> = {
  bronze: "neutral", silver: "info", gold: "warning", platinum: "primary",
};

const emptyForm = {
  partnerType: "bronze" as "bronze" | "silver" | "gold" | "platinum",
  serviceType: "",
  commissionPct: 0,
  markupPct: 0,
  isActive: true,
  priority: 100,
};

export default function CommissionRules() {
  const { success: showSuccess, error: showError } = useToast();
  const { user, loading: authLoading } = useApp();
  const { t, lang } = useT();
  const tr = t.operations.commissionRules;
  const locale = lang === "bs" ? "bs-BA" : "en-GB";
  const showErrorRef = useRef(showError);
  showErrorRef.current = showError;
  const trRef = useRef(tr);
  trRef.current = tr;
  const requestVersion = useRef(0);
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [preview, setPreview] = useState({ partnerType: "bronze", bookingAmount: 1000, serviceType: "" });
  const [previewResult, setPreviewResult] = useState<{ matchedRule: CommissionRule | null; commissionAmount: number; finalAmount: number; breakdown: any } | null>(null);
  const userId = user?.id;

  const partnerTypes = [
    { value: "bronze", label: tr.tiers.bronze },
    { value: "silver", label: tr.tiers.silver },
    { value: "gold", label: tr.tiers.gold },
    { value: "platinum", label: tr.tiers.platinum },
  ] as const;

  const serviceTypes = [
    { value: "", label: tr.serviceAllLong },
    { value: "hotel", label: tr.serviceTypes.hotel },
    { value: "transport", label: tr.serviceTypes.transport },
    { value: "tour", label: tr.serviceTypes.tour },
    { value: "insurance", label: tr.serviceTypes.insurance },
    { value: "extra", label: tr.serviceTypes.extra },
  ] as const;

  const serviceLabels: Record<string, string> = tr.serviceLabels;

  const fetchRules = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getCommissionRules();
      if (version === requestVersion.current) {
        setRules(data);
      }
    } catch {
      if (version === requestVersion.current) {
        setLoadError(true);
        showErrorRef.current(trRef.current.loadError);
      }
    } finally {
      if (version === requestVersion.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (userId && !authLoading) {
      void fetchRules();
    } else if (!authLoading) {
      setLoading(false);
    }
    return () => {
      requestVersion.current += 1;
    };
  }, [userId, authLoading, fetchRules]);

  const runPreview = async () => {
    try {
      const result = await previewCommission(preview.partnerType, preview.bookingAmount, preview.serviceType || undefined);
      setPreviewResult(result);
    } catch {
      showError(tr.previewError);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        partnerType: form.partnerType,
        serviceType: form.serviceType || null,
        commissionPct: Number(form.commissionPct),
        markupPct: Number(form.markupPct),
        isActive: form.isActive,
        priority: Number(form.priority),
      };
      if (editingId) {
        await updateCommissionRule(editingId, payload);
        showSuccess(tr.updated);
      } else {
        await createCommissionRule(payload);
        showSuccess(tr.created);
      }
      setIsModalOpen(false);
      void fetchRules();
    } catch {
      showError(tr.saveError);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rule: CommissionRule) => {
    const tierLabel = tr.tiers[rule.partnerType] || rule.partnerType;
    if (!confirm(tr.deleteConfirm.replace("{partnerType}", tierLabel))) return;
    try {
      await deleteCommissionRule(rule.id);
      showSuccess(tr.deleted);
      void fetchRules();
    } catch {
      showError(tr.deleteError);
    }
  };

  const openEdit = (rule: CommissionRule) => {
    setEditingId(rule.id);
    setForm({
      partnerType: rule.partnerType,
      serviceType: rule.serviceType || "",
      commissionPct: rule.commissionPct,
      markupPct: rule.markupPct,
      isActive: rule.isActive,
      priority: rule.priority,
    });
    setIsModalOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setIsModalOpen(true);
  };

  const columns: Column<CommissionRule>[] = [
    {
      key: "partnerType", header: tr.partnerType,
      render: (_v, r) => <Badge color={(PT_COLOR[r.partnerType] || "neutral") as any} variant="light">{tr.tiers[r.partnerType] || r.partnerType}</Badge>,
    },
    {
      key: "serviceType", header: tr.serviceColumn,
      render: (_v, r) => <span className="text-sm text-gray-600 dark:text-gray-400">{r.serviceType ? serviceLabels[r.serviceType] || r.serviceType : tr.serviceAllShort}</span>,
    },
    {
      key: "commissionPct", header: tr.commissionPctColumn,
      render: (_v, r) => <span className="font-mono font-medium text-[#d8a657]">{r.commissionPct}%</span>,
    },
    {
      key: "markupPct", header: tr.markupPctColumn,
      render: (_v, r) => <span className="font-mono font-medium">{r.markupPct}%</span>,
    },
    { key: "priority", header: tr.priority, render: (_v, r) => <span className="text-sm">{r.priority}</span> },
    {
      key: "isActive", header: tr.status,
      render: (_v, r) => r.isActive
        ? <Badge color="success" variant="light">{tr.active}</Badge>
        : <Badge color="error" variant="light">{tr.inactive}</Badge>,
    },
    {
      key: "actions", header: "",
      render: (_v, r) => (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => openEdit(r)}>{t.common.edit}</Button>
          <Button variant="outline" size="sm" onClick={() => handleDelete(r)} className="!text-red-500">{t.common.delete}</Button>
        </div>
      ),
    },
  ];

  if (authLoading || (loading && !rules.length && !loadError)) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-10 w-10 border-2 border-gray-300 border-t-transparent rounded-full animate-spin dark:border-gray-700"></div>
      </div>
    );
  }

  return (
    <>
      <PageMeta title={`${tr.title} | Travline`} description={tr.description} />
      <PageToolbar
        title={tr.title}
        description={tr.descriptionLong}
        createButton={{ label: tr.add, onClick: openCreate }}
      />

      {/* Live preview panel */}
      <div className="mx-6 mb-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
          <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
          <label htmlFor="commission-preview-partner" className="text-sm text-gray-600 dark:text-gray-400">{tr.partnerLabel}</label>
          <select
            id="commission-preview-partner"
            value={preview.partnerType}
            onChange={(e) => setPreview({ ...preview, partnerType: e.target.value })}
            className="max-w-full bg-transparent text-sm outline-none dark:bg-gray-800"
          >
            {partnerTypes.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          </div>
          <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
          <label htmlFor="commission-preview-service" className="text-sm text-gray-600 dark:text-gray-400">{tr.serviceColumn}</label>
          <select
            id="commission-preview-service"
            value={preview.serviceType}
            onChange={(e) => setPreview({ ...preview, serviceType: e.target.value })}
            className="max-w-full bg-transparent text-sm outline-none dark:bg-gray-800"
          >
            {serviceTypes.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          </div>
          <div className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
          <label htmlFor="commission-preview-amount" className="text-sm text-gray-600 dark:text-gray-400">{tr.amountLabel}</label>
          <input
            type="number"
            id="commission-preview-amount"
            value={preview.bookingAmount}
            onChange={(e) => setPreview({ ...preview, bookingAmount: Number(e.target.value) })}
            className="w-24 bg-transparent text-sm outline-none dark:bg-gray-800"
          />
          </div>
          <Button variant="primary" size="sm" onClick={runPreview}>{tr.calculate}</Button>
        </div>

        {previewResult && (
          <div className="mt-3 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">{tr.ruleHeading}</div>
              <span className="font-medium">
                {previewResult.matchedRule
                  ? `${tr.tiers[previewResult.matchedRule.partnerType] || previewResult.matchedRule.partnerType}${previewResult.matchedRule.serviceType ? " / " + (serviceLabels[previewResult.matchedRule.serviceType] || previewResult.matchedRule.serviceType) : ""}`
                  : tr.noMatch}
              </span>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">{tr.commissionAmount}</div>
              <span className="font-mono font-medium">{formatCurrency(Number(previewResult.commissionAmount), "BAM", locale)}</span>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">{tr.finalAmount}</div>
              <span className="font-mono font-medium text-[#d8a657]">{formatCurrency(Number(previewResult.finalAmount), "BAM", locale)}</span>
            </div>
          </div>
        )}
      </div>

      {loadError ? (
        <div className="mx-6 rounded-xl border border-error-200 bg-error-50 p-6 dark:border-error-500/30 dark:bg-error-500/10">
          <p role="alert" className="mb-4 text-sm text-error-700 dark:text-error-300">{tr.loadError}</p>
          <Button variant="outline" onClick={() => void fetchRules()}>{tr.retryLoad}</Button>
        </div>
      ) : rules.length === 0 ? (
        <EmptyState
          title={tr.noRules}
          description={tr.emptyDescription}
          action={{ label: tr.add, onClick: openCreate }}
        />
      ) : (
        <div className="mx-6">
          <DataTable data={rules} columns={columns} />
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} className="max-w-md" title={editingId ? tr.editTitle : tr.newTitle}>
        <div className="space-y-4 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {editingId ? tr.editTitle : tr.newTitle}
          </h3>

          <div>
            <label htmlFor="commission-rule-partner" className="text-sm font-medium text-gray-700 dark:text-gray-300">{tr.partnerType}</label>
            <select
              id="commission-rule-partner"
              value={form.partnerType}
              onChange={(e) => setForm({ ...form, partnerType: e.target.value as "bronze" | "silver" | "gold" | "platinum" })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
            >
              {partnerTypes.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="commission-rule-service" className="text-sm font-medium text-gray-700 dark:text-gray-300">{tr.serviceOptionalLabel}</label>
            <select
              id="commission-rule-service"
              value={form.serviceType}
              onChange={(e) => setForm({ ...form, serviceType: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
            >
              {serviceTypes.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="commission-rule-pct" className="text-sm font-medium text-gray-700 dark:text-gray-300">{tr.commissionPctColumn}</label>
              <input
                id="commission-rule-pct"
                type="number" step="0.5" min="0" max="100"
                value={form.commissionPct}
                onChange={(e) => setForm({ ...form, commissionPct: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
              />
            </div>
            <div>
              <label htmlFor="commission-rule-markup" className="text-sm font-medium text-gray-700 dark:text-gray-300">{tr.markupPctColumn}</label>
              <input
                id="commission-rule-markup"
                type="number" step="0.5" min="0" max="100"
                value={form.markupPct}
                onChange={(e) => setForm({ ...form, markupPct: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
              />
            </div>
          </div>

          <div>
            <label htmlFor="commission-rule-priority" className="text-sm font-medium text-gray-700 dark:text-gray-300">{tr.priorityHelp}</label>
            <input
              id="commission-rule-priority"
              type="number" min="0" max="1000"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
            />
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox" checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">{tr.active}</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>{tr.cancel}</Button>
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? t.common.saving : editingId ? tr.save : t.common.create}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
