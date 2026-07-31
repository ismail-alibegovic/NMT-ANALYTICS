import { useState, useEffect } from "react";
import PageMeta from "../../components/common/PageMeta";
import PageShell from "../../components/common/PageShell";
import Button from "../../components/ui/button/Button";
import Badge from "../../components/ui/badge/Badge";
import { DataTable, Column } from "../../components/ui/DataTable";
import { Modal } from "../../components/ui/modal";
import { EmptyState } from "../../components/ui/EmptyState";
import { useToast } from "../../context/ToastContext";
import { useApp } from "../../context/AppContext";
import {
  getCommissionRules,
  createCommissionRule,
  updateCommissionRule,
  deleteCommissionRule,
  previewCommission,
  CommissionRule,
} from "../../api/operations";

const PARTNER_TYPES = [
  { value: "bronze", label: "Bronze" },
  { value: "silver", label: "Silver" },
  { value: "gold", label: "Gold" },
  { value: "platinum", label: "Platinum" },
] as const;

const SERVICE_TYPES = [
  { value: "", label: "Sve usluge (nije specifično)" },
  { value: "hotel", label: "Hotel" },
  { value: "transport", label: "Transport" },
  { value: "tour", label: "Tura / izlet" },
  { value: "insurance", label: "Osiguranje" },
  { value: "extra", label: "Dodatna usluga" },
] as const;

const PT_COLOR: Record<string, string> = {
  bronze: "neutral", silver: "info", gold: "warning", platinum: "primary",
};
const ST_LABEL: Record<string, string> = {
  hotel: "Hotel", transport: "Transport", tour: "Tura", insurance: "Osiguranje", extra: "Dodatno",
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
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [preview, setPreview] = useState({ partnerType: "bronze", bookingAmount: 1000, serviceType: "" });
  const [previewResult, setPreviewResult] = useState<{ matchedRule: CommissionRule | null; commissionAmount: number; finalAmount: number; breakdown: any } | null>(null);

  const fetchRules = async () => {
    try {
      setLoading(true);
      const data = await getCommissionRules();
      setRules(data);
    } catch (err: any) {
      showError(err.message || "Greška pri učitavanju pravila");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && !authLoading) fetchRules();
    else if (!authLoading) setLoading(false);
  }, [user, authLoading]);

  const runPreview = async () => {
    try {
      const result = await previewCommission(preview.partnerType, preview.bookingAmount, preview.serviceType || undefined);
      setPreviewResult(result);
    } catch (err: any) {
      showError(err.message || "Greška pri preview-u");
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
        showSuccess("Pravilo ažurirano");
      } else {
        await createCommissionRule(payload);
        showSuccess("Pravilo kreirano");
      }
      setIsModalOpen(false);
      fetchRules();
    } catch (err: any) {
      showError(err.message || "Greška pri snimanju");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rule: CommissionRule) => {
    if (!confirm(`Obrisati pravilo za ${rule.partnerType}?`)) return;
    try {
      await deleteCommissionRule(rule.id);
      showSuccess("Pravilo obrisano");
      fetchRules();
    } catch (err: any) {
      showError(err.message || "Greška pri brisanju");
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
      key: "partnerType", header: "Tip partnera",
      render: (_v, r) => <Badge color={(PT_COLOR[r.partnerType] || "neutral") as any} variant="light">{r.partnerType}</Badge>,
    },
    {
      key: "serviceType", header: "Usluga",
      render: (_v, r) => <span className="text-sm text-gray-600 dark:text-gray-400">{r.serviceType ? ST_LABEL[r.serviceType] || r.serviceType : "Sve"}</span>,
    },
    {
      key: "commissionPct", header: "Provizija %",
      render: (_v, r) => <span className="font-mono font-medium text-[#d8a657]">{r.commissionPct}%</span>,
    },
    {
      key: "markupPct", header: "Markup %",
      render: (_v, r) => <span className="font-mono font-medium">{r.markupPct}%</span>,
    },
    { key: "priority", header: "Prioritet", render: (_v, r) => <span className="text-sm">{r.priority}</span> },
    {
      key: "isActive", header: "Status",
      render: (_v, r) => r.isActive
        ? <Badge color="success" variant="light">Aktivno</Badge>
        : <Badge color="error" variant="light">Neaktivno</Badge>,
    },
    {
      key: "actions", header: "",
      render: (_v, r) => (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => openEdit(r)}>Uredi</Button>
          <Button variant="outline" size="sm" onClick={() => handleDelete(r)} className="!text-red-500">Obriši</Button>
        </div>
      ),
    },
  ];

  if (authLoading || (loading && !rules.length)) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-10 w-10 border-2 border-gray-300 border-t-transparent rounded-full animate-spin dark:border-gray-700"></div>
      </div>
    );
  }

  return (
    <>
      <PageMeta title="Pravila provizije | Travline" description="Automatska provizija i markup po tipu partnera" />
      <PageShell
        title="Pravila provizije"
        subtitle="Automatska provizija i markup po tipu partnera — pravila se primjenjuju pri generisanju prodaje subagenta"
        actions={<Button variant="primary" onClick={openCreate}>+ Novo pravilo</Button>}
      >

      {/* Live preview panel */}
      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
          <span className="text-sm text-gray-600 dark:text-gray-400">Partner</span>
          <select
            value={preview.partnerType}
            onChange={(e) => setPreview({ ...preview, partnerType: e.target.value })}
            className="bg-transparent text-sm outline-none dark:bg-gray-800"
          >
            {PARTNER_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <span className="text-sm text-gray-600 dark:text-gray-400">Usluga</span>
          <select
            value={preview.serviceType}
            onChange={(e) => setPreview({ ...preview, serviceType: e.target.value })}
            className="bg-transparent text-sm outline-none dark:bg-gray-800"
          >
            {SERVICE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <span className="text-sm text-gray-600 dark:text-gray-400">Iznos</span>
          <input
            type="number"
            value={preview.bookingAmount}
            onChange={(e) => setPreview({ ...preview, bookingAmount: Number(e.target.value) })}
            className="w-24 bg-transparent text-sm outline-none dark:bg-gray-800"
          />
          <Button variant="primary" size="sm" onClick={runPreview}>Izračunaj</Button>
        </div>

        {previewResult && (
          <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Pravilo</div>
              <span className="font-medium">{previewResult.matchedRule ? `${previewResult.matchedRule.partnerType}${previewResult.matchedRule.serviceType ? " / " + ST_LABEL[previewResult.matchedRule.serviceType] : ""}` : "Bez pravila"}</span>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Provizija</div>
              <span className="font-mono font-medium">{Number(previewResult.commissionAmount).toFixed(2)} BAM</span>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Finalni iznos</div>
              <span className="font-mono font-medium text-[#d8a657]">{Number(previewResult.finalAmount).toFixed(2)} BAM</span>
            </div>
          </div>
        )}
      </div>

      {rules.length === 0 ? (
        <EmptyState
          title="Nema pravila provizije"
          description="Kreirajte pravilo za automatsku proviziju i markup po tipu partnera."
          action={{ label: "+ Novo pravilo", onClick: openCreate }}
        />
      ) : (
        <DataTable data={rules} columns={columns} />
      )}

      </PageShell>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} className="max-w-md">
        <div className="space-y-4 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {editingId ? "Uredi pravilo" : "Novo pravilo provizije"}
          </h3>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tip partnera</label>
            <select
              value={form.partnerType}
              onChange={(e) => setForm({ ...form, partnerType: e.target.value as "bronze" | "silver" | "gold" | "platinum" })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
            >
              {PARTNER_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Usluga (prazno = sve)</label>
            <select
              value={form.serviceType}
              onChange={(e) => setForm({ ...form, serviceType: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
            >
              {SERVICE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Provizija %</label>
              <input
                type="number" step="0.5" min="0" max="100"
                value={form.commissionPct}
                onChange={(e) => setForm({ ...form, commissionPct: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Markup %</label>
              <input
                type="number" step="0.5" min="0" max="100"
                value={form.markupPct}
                onChange={(e) => setForm({ ...form, markupPct: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Prioritet (manji = važniji)</label>
            <input
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
            <span className="text-sm text-gray-700 dark:text-gray-300">Aktivno</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Otkaži</Button>
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? "Snimanje…" : editingId ? "Sačuvaj" : "Kreiraj"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
