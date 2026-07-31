import { useState, useEffect } from "react";
import PageMeta from "../../components/common/PageMeta";
import PageToolbar from "../../components/ui/PageToolbar";
import Button from "../../components/ui/button/Button";
import Badge from "../../components/ui/badge/Badge";
import { DataTable, Column } from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import { Modal } from "../../components/ui/modal";
import { BoltIcon, TrashBinIcon, PlusIcon, CopyIcon } from "../../icons";
import { useToast } from "../../context/ToastContext";
import { useApp } from "../../context/AppContext";
import { useT } from "../../lib/i18n/context";
import {
  getSubAgents, createSubAgent, deleteSubAgent, generateSubAgentSale,
  issueSubAgentPortalToken, revokeSubAgentPortalToken,
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
  const [formPartnerType, setFormPartnerType] = useState<"bronze" | "silver" | "gold" | "platinum">("bronze");
  const [portalModalAgent, setPortalModalAgent] = useState<SubAgent | null>(null);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

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
        name: formName, phone: formPhone, email: formEmail, commissionRate: formCommission, partnerType: formPartnerType,
      });
      showSuccess("Sub-agent created");
      setIsModalOpen(false);
      setFormName(""); setFormPhone(""); setFormEmail(""); setFormCommission(5); setFormPartnerType("bronze");
      fetchSubAgents();
    } catch (err: any) {
      showError(err.message || "Failed to create sub-agent");
    }
  };

  const handleIssuePortalToken = async (sa: SubAgent) => {
    setPortalLoading(true);
    try {
      const res = await issueSubAgentPortalToken(sa.id);
      const origin = window.location.origin.replace(/:\d+$/, "");
      setPortalUrl(`${origin}/portal/subagent?t=${res.token}`);
      setPortalModalAgent(sa);
    } catch (err: any) {
      showError(err.message || "Failed to issue portal token");
    } finally { setPortalLoading(false); }
  };

  const handleRevokePortalToken = async (sa: SubAgent) => {
    if (!confirm(`Revoke portal access for ${sa.name}?`)) return;
    try {
      await revokeSubAgentPortalToken(sa.id);
      showSuccess("Portal access revoked");
      fetchSubAgents();
    } catch (err: any) {
      showError(err.message || "Failed to revoke portal token");
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
      key: "partnerType", header: "Type",
      render: (_v, sa) => {
        const colors: Record<string, string> = { bronze: "neutral", silver: "info", gold: "warning", platinum: "primary" };
        return <Badge color={(colors[sa.partnerType] || "neutral") as any} variant="light">{(sa.partnerType || "bronze").charAt(0).toUpperCase() + (sa.partnerType || "bronze").slice(1)}</Badge>;
      },
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
          <Button size="sm" variant="outline" onClick={() => handleIssuePortalToken(sa as SubAgent)} disabled={portalLoading} title="Issue portal access link" className="p-2">
            <CopyIcon className="w-4 h-4" />
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
          <select value={formPartnerType} onChange={e => setFormPartnerType(e.target.value as any)} className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
            <option value="bronze">Bronze</option>
            <option value="silver">Silver</option>
            <option value="gold">Gold</option>
            <option value="platinum">Platinum</option>
          </select>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate}>Create</Button>
          </div>
        </div>
      </Modal>

      {portalModalAgent && (
        <Modal isOpen={!!portalModalAgent} onClose={() => { setPortalModalAgent(null); setPortalUrl(null); }} className="max-w-lg">
          <div className="space-y-4">
            <h3 className="font-bold text-lg">Sub-agent portal — {portalModalAgent.name}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Generate a secure link the sub-agent can use to view their own sales history and download generated documents.
              The link expires in 30 days and can be revoked anytime.
            </p>
            {portalUrl ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex items-center gap-2">
                    <input readOnly value={portalUrl} className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs font-mono dark:bg-gray-900 dark:border-gray-700" />
                    <Button size="sm" variant="primary" onClick={() => { navigator.clipboard?.writeText(portalUrl); showSuccess("Link copied"); }}>Copy</Button>
                  </div>
                </div>
                <p className="text-xs text-gray-500">Share this link directly with {portalModalAgent.name}. They do not need a login — the token in the URL is their credential.</p>
              </div>
            ) : (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {portalModalAgent.portalTokenExpiresAt
                  ? <>Active link expires {new Date(portalModalAgent.portalTokenExpiresAt).toLocaleDateString()}. Generate a new one to replace it.</>
                  : "No active portal link. Generate one to enable sub-agent self-serve access."}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setPortalModalAgent(null); setPortalUrl(null); }}>Close</Button>
              {portalModalAgent.portalTokenExpiresAt && (
                <Button variant="outline" className="!text-red-600" onClick={() => handleRevokePortalToken(portalModalAgent)}>Revoke</Button>
              )}
              <Button variant="primary" onClick={() => handleIssuePortalToken(portalModalAgent)} disabled={!!portalLoading}>Generate link</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}