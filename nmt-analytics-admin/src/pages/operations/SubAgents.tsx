import { useState, useEffect } from "react";
import PageMeta from "../../components/common/PageMeta";
import PageToolbar from "../../components/ui/PageToolbar";
import Button from "../../components/ui/button/Button";
import Badge from "../../components/ui/badge/Badge";
import { DataTable, Column } from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import { Modal } from "../../components/ui/modal";
import { BoltIcon, TrashBinIcon, PlusIcon } from "../../icons";
import { useToast } from "../../context/ToastContext";
import { useApp } from "../../context/AppContext";
import { useT } from "../../lib/i18n/context";
import {
  getSubAgents, createSubAgent, deleteSubAgent, generateSubAgentSale,
  SubAgent,
} from "../../api/operations";

export default function SubAgents() {
  const { success: showSuccess, error: showError } = useToast();
  const { user, loading: authLoading } = useApp();
  const { t } = useT();
  const tr = t.operations.subagents;
  const [subAgents, setSubAgents] = useState<SubAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formCommission, setFormCommission] = useState(5);

  const fetchSubAgents = async () => {
    setLoading(true);
    try {
      const data = await getSubAgents();
      setSubAgents(data);
      setLoading(false);
    } catch (err: any) {
      showError(err.message || "Failed to load sub-agents");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && !authLoading) fetchSubAgents();
    else if (!authLoading) setLoading(false);
  }, [user, authLoading]);

  const handleCreate = async () => {
    try {
      await createSubAgent({
        name: formName, phone: formPhone, email: formEmail, commissionRate: formCommission,
      });
      showSuccess("Sub-agent created");
      setIsModalOpen(false);
      fetchSubAgents();
    } catch (err: any) {
      showError(err.message || "Failed to create sub-agent");
    }
  };

  const handleDelete = async (sa: SubAgent) => {
    if (!confirm(`Delete sub-agent ${sa.name}?`)) return;
    try {
      await deleteSubAgent(sa.id);
      showSuccess("Sub-agent deleted");
      fetchSubAgents();
    } catch (err: any) {
      showError(err.message || "Failed to delete");
    }
  };

  const handleGenerateSale = async (sa: SubAgent) => {
    setGenerating(sa.id);
    try {
      const blob = await generateSubAgentSale(sa.id, {});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `subagent_${sa.name}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      showSuccess("Document bundle generated");
    } catch (err: any) {
      showError(err.message || "Failed to generate sale");
    } finally { setGenerating(null); }
  };

  const columns: Column<SubAgent>[] = [
    { key: "name", header: "Name", render: (v) => <span className="font-medium">{v as string}</span> },
    { key: "phone", header: "Phone" },
    { key: "email", header: "Email" },
    {
      key: "commissionRate", header: "Commission",
      render: (_v, sa) => <Badge color="info" variant="light">{(sa.commissionRate || 0)}%</Badge>,
    },
    {
      key: "isActive", header: "Status",
      render: (_v, sa) => sa.isActive
        ? <Badge color="success" variant="light">Active</Badge>
        : <Badge color="error" variant="light">Inactive</Badge>,
    },
    {
      key: "actions", header: "Actions",
      render: (_, sa) => (
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={() => handleGenerateSale(sa as SubAgent)} disabled={generating === (sa as SubAgent).id} title="Generate sale bundle" className="flex items-center gap-1.5 text-sm">
            {generating === (sa as SubAgent).id ? (
              <span className="flex items-center gap-1.5">
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Generating…
              </span>
            ) : (
              <>
                <BoltIcon className="w-4 h-4" /> Generate Sale
              </>
            )}
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleDelete(sa as SubAgent)} title="Delete sub-agent" className="p-2 text-red-600">
            <TrashBinIcon className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  if (!authLoading && !user) return null;

  return (
    <>
      <PageMeta title={`${tr.title} | Travline`} description={tr.description} />
      <PageToolbar
        title={tr.title}
        description={tr.description}
        hideSearch
        actions={
          <Button variant="primary" onClick={() => setIsModalOpen(true)} className="flex items-center gap-2">
            <PlusIcon className="w-4 h-4" /> {tr.add}
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center p-20">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : subAgents.length === 0 ? (
        <EmptyState title={tr.noSubAgents} description={tr.description} action={{ label: tr.add, onClick: () => setIsModalOpen(true) }} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Total</div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{subAgents.length}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Active</div>
              <div className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{subAgents.filter(s => s.isActive).length}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Avg commission</div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {subAgents.length > 0
                  ? (subAgents.reduce((sum, s) => sum + (s.commissionRate || 0), 0) / subAgents.length).toFixed(1)
                  : 0}%
              </div>
            </div>
          </div>
          <DataTable data={subAgents} columns={columns} />
        </>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} className="max-w-md">
        <div className="space-y-4">
          <h3 className="font-bold">Add Sub-agent</h3>
          <input placeholder="Name" value={formName} onChange={e => setFormName(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          <input placeholder="Phone" value={formPhone} onChange={e => setFormPhone(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          <input placeholder="Email" value={formEmail} onChange={e => setFormEmail(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          <input type="number" placeholder="Commission %" value={formCommission} onChange={e => setFormCommission(+e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate}>Create</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}